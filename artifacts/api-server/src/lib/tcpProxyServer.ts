import net from "net";
import http, { type IncomingMessage, type ServerResponse } from "http";
import { getRandomWorkingProxy } from "./proxyChecker";
import { logger } from "./logger";
import { recordRequest } from "./requestStats";

const GATEWAY_USER = process.env["GATEWAY_USER"] ?? "admin";
const GATEWAY_PASS = process.env["GATEWAY_PASSWORD"] ?? "proxypass123";
const TCP_PORT = parseInt(process.env["TCP_PROXY_PORT"] ?? "1080", 10);

const CONNECT_TIMEOUT_MS = 15000;
const HTTP_TIMEOUT_MS = 20000;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function validateProxyAuth(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const match = /^Basic (.+)$/i.exec(authHeader);
  if (!match?.[1]) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return false;
  }
  const colonIdx = decoded.indexOf(":");
  if (colonIdx < 0) return false;
  const user = decoded.slice(0, colonIdx);
  const pass = decoded.slice(colonIdx + 1);
  return user === GATEWAY_USER && pass === GATEWAY_PASS;
}

function rejectSocket(socket: net.Socket, statusCode: number, statusText: string, wwwAuth?: string): void {
  const authHeader = wwwAuth ? `Proxy-Authenticate: Basic realm="NexusGateway"\r\n` : "";
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      authHeader +
      `Content-Length: 0\r\nConnection: close\r\n\r\n`
  );
  socket.destroy();
}

function handleTcpConnect(req: IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
  const authHeader = req.headers["proxy-authorization"] as string | undefined;
  if (!validateProxyAuth(authHeader)) {
    logger.warn({ url: req.url }, "TCP CONNECT: auth failed");
    rejectSocket(clientSocket, 407, "Proxy Authentication Required", "true");
    return;
  }

  const targetUrl = req.url ?? "";
  const lastColon = targetUrl.lastIndexOf(":");
  const targetHost = lastColon >= 0 ? targetUrl.slice(0, lastColon) : targetUrl;
  const targetPort = lastColon >= 0 ? parseInt(targetUrl.slice(lastColon + 1), 10) || 443 : 443;

  if (!targetHost) {
    rejectSocket(clientSocket, 400, "Bad Request");
    return;
  }

  const connectStart = Date.now();

  getRandomWorkingProxy()
    .then((upstream) => {
      if (!upstream) {
        logger.warn({ targetUrl }, "TCP CONNECT: no working proxy in pool");
        recordRequest({
          targetUrl: `https://${targetUrl}`,
          method: "CONNECT",
          latency: null,
          success: false,
          proxyUsed: "none",
        });
        rejectSocket(clientSocket, 503, "Service Unavailable");
        return;
      }

      let settled = false;
      const settle = () => { settled = true; };

      const upstreamSocket = net.createConnection(upstream.port, upstream.ip);

      const connectTimeout = setTimeout(() => {
        if (!settled) {
          settle();
          upstreamSocket.destroy();
          recordRequest({
            targetUrl: `https://${targetUrl}`,
            method: "CONNECT",
            latency: Date.now() - connectStart,
            success: false,
            proxyUsed: `${upstream.ip}:${upstream.port}`,
          });
          rejectSocket(clientSocket, 504, "Gateway Timeout");
        }
      }, CONNECT_TIMEOUT_MS);

      upstreamSocket.on("connect", () => {
        upstreamSocket.write(
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`
        );

        let responseBuffer = "";

        const onUpstreamData = (chunk: Buffer) => {
          responseBuffer += chunk.toString("binary");
          const headerEnd = responseBuffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) return;

          clearTimeout(connectTimeout);
          upstreamSocket.removeListener("data", onUpstreamData);

          const statusLine = responseBuffer.split("\r\n")[0] ?? "";
          const statusCode = parseInt(statusLine.split(" ")[1] ?? "", 10);
          if (statusCode !== 200) {
            if (!settled) {
              settle();
              recordRequest({
                targetUrl: `https://${targetUrl}`,
                method: "CONNECT",
                latency: Date.now() - connectStart,
                success: false,
                proxyUsed: `${upstream.ip}:${upstream.port}`,
              });
              rejectSocket(clientSocket, 502, "Bad Gateway");
              upstreamSocket.destroy();
            }
            return;
          }

          if (!settled) {
            settle();
          } else {
            return;
          }

          clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          const connectElapsed = Date.now() - connectStart;
          logger.info(
            { method: "CONNECT", target: targetUrl, upstream: `${upstream.ip}:${upstream.port}`, responseTimeMs: connectElapsed },
            "TCP proxy tunnel established"
          );
          recordRequest({
            targetUrl: `https://${targetUrl}`,
            method: "CONNECT",
            latency: connectElapsed,
            success: true,
            proxyUsed: `${upstream.ip}:${upstream.port}`,
          });

          const remaining = responseBuffer.slice(headerEnd + 4);
          if (remaining.length > 0) {
            clientSocket.write(Buffer.from(remaining, "binary"));
          }
          if (head.length > 0) {
            upstreamSocket.write(head);
          }

          clientSocket.pipe(upstreamSocket);
          upstreamSocket.pipe(clientSocket);

          clientSocket.on("error", (err) => {
            logger.debug({ err }, "TCP CONNECT: client socket error");
            upstreamSocket.destroy();
          });
          upstreamSocket.on("error", (err) => {
            logger.debug({ err }, "TCP CONNECT: upstream socket error");
            clientSocket.destroy();
          });
          clientSocket.on("close", () => upstreamSocket.destroy());
          upstreamSocket.on("close", () => clientSocket.destroy());
        };

        upstreamSocket.on("data", onUpstreamData);
      });

      upstreamSocket.on("error", (err) => {
        clearTimeout(connectTimeout);
        if (!settled) {
          settle();
          logger.warn({ err, upstream }, "TCP CONNECT: upstream connection error");
          recordRequest({
            targetUrl: `https://${targetUrl}`,
            method: "CONNECT",
            latency: Date.now() - connectStart,
            success: false,
            proxyUsed: `${upstream.ip}:${upstream.port}`,
          });
          rejectSocket(clientSocket, 502, "Bad Gateway");
        }
      });

      clientSocket.on("error", (err) => {
        logger.debug({ err }, "TCP CONNECT: client socket error during setup");
        upstreamSocket.destroy();
      });
    })
    .catch((err) => {
      logger.error({ err }, "TCP CONNECT: error getting upstream proxy");
      rejectSocket(clientSocket, 503, "Service Unavailable");
    });
}

function handleTcpHttpProxy(req: IncomingMessage, res: ServerResponse): void {
  const proxyStart = Date.now();

  const authHeader = req.headers["proxy-authorization"] as string | undefined;
  if (!validateProxyAuth(authHeader)) {
    logger.warn({ url: req.url }, "TCP HTTP proxy: auth failed");
    res.writeHead(407, {
      "Proxy-Authenticate": 'Basic realm="NexusGateway"',
      "Content-Length": "0",
    });
    res.end();
    return;
  }

  getRandomWorkingProxy()
    .then((upstream) => {
      if (!upstream) {
        logger.warn({ url: req.url }, "TCP HTTP proxy: no working proxy in pool");
        recordRequest({
          targetUrl: req.url ?? "unknown",
          method: req.method ?? "GET",
          latency: null,
          success: false,
          proxyUsed: "none",
        });
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("No working proxy available");
        return;
      }

      let targetHost: string;
      try {
        const parsed = new URL(req.url ?? "");
        targetHost = parsed.host;
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad Request");
        return;
      }

      const forwardHeaders: Record<string, string | string[] | undefined> = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (!HOP_BY_HOP.has(key.toLowerCase())) {
          forwardHeaders[key] = val;
        }
      }
      forwardHeaders["host"] = targetHost;

      const proxyReq = http.request(
        {
          host: upstream.ip,
          port: upstream.port,
          method: req.method,
          path: req.url,
          headers: forwardHeaders as http.OutgoingHttpHeaders,
          timeout: HTTP_TIMEOUT_MS,
        },
        (proxyRes) => {
          const responseHeaders: Record<string, string | string[] | undefined> = {};
          for (const [key, val] of Object.entries(proxyRes.headers)) {
            if (!HOP_BY_HOP.has(key.toLowerCase())) {
              responseHeaders[key] = val;
            }
          }
          const httpElapsed = Date.now() - proxyStart;
          logger.info(
            { method: req.method, url: req.url, upstream: `${upstream.ip}:${upstream.port}`, statusCode: proxyRes.statusCode, responseTimeMs: httpElapsed },
            "TCP proxy request forwarded"
          );
          recordRequest({
            targetUrl: req.url ?? "unknown",
            method: req.method ?? "GET",
            latency: httpElapsed,
            success: (proxyRes.statusCode ?? 0) >= 200 && (proxyRes.statusCode ?? 0) < 400,
            proxyUsed: `${upstream.ip}:${upstream.port}`,
          });
          responseHeaders["x-proxy-used"] = `${upstream.ip}:${upstream.port}`;
          res.writeHead(proxyRes.statusCode ?? 200, responseHeaders);
          proxyRes.pipe(res);
          proxyRes.on("error", () => {
            if (!res.writableEnded) res.destroy();
          });
        }
      );

      proxyReq.on("timeout", () => {
        proxyReq.destroy();
        recordRequest({
          targetUrl: req.url ?? "unknown",
          method: req.method ?? "GET",
          latency: Date.now() - proxyStart,
          success: false,
          proxyUsed: `${upstream.ip}:${upstream.port}`,
        });
        if (!res.headersSent) {
          res.writeHead(504, { "Content-Type": "text/plain" });
          res.end("Gateway Timeout");
        }
      });

      proxyReq.on("error", (err) => {
        logger.warn({ err, upstream, url: req.url }, "TCP HTTP proxy: upstream request error");
        recordRequest({
          targetUrl: req.url ?? "unknown",
          method: req.method ?? "GET",
          latency: Date.now() - proxyStart,
          success: false,
          proxyUsed: `${upstream.ip}:${upstream.port}`,
        });
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Bad Gateway");
        }
      });

      req.pipe(proxyReq);
    })
    .catch((err) => {
      logger.error({ err }, "TCP HTTP proxy: error getting upstream proxy");
      if (!res.headersSent) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("Service Unavailable");
      }
    });
}

let tcpServer: http.Server | null = null;

export function startTcpProxyServer(): number {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("http://")) {
      handleTcpHttpProxy(req, res);
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        service: "NexusGateway TCP Proxy",
        port: TCP_PORT,
        auth: "Basic (Proxy-Authorization header)",
        usage: "Configure as HTTP/HTTPS proxy: host:port with Proxy-Authorization",
      }));
    }
  });

  server.on("connect", handleTcpConnect);

  server.on("error", (err) => {
    logger.error({ err, port: TCP_PORT }, "TCP proxy server error");
  });

  server.listen(TCP_PORT, "0.0.0.0", () => {
    logger.info({ port: TCP_PORT }, "TCP proxy server listening");
  });

  tcpServer = server;
  return TCP_PORT;
}

export function getTcpProxyPort(): number {
  return TCP_PORT;
}

export function stopTcpProxyServer(): void {
  if (tcpServer) {
    tcpServer.close();
    tcpServer = null;
  }
}
