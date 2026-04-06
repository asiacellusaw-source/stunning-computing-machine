import { Router, type IRouter } from "express";
import { db, proxiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import http from "http";
import https from "https";
import tls from "tls";
import net from "net";
import { getRandomWorkingProxy } from "../lib/proxyChecker";
import { logger } from "../lib/logger";
import { recordRequest } from "../lib/requestStats";
import { getTcpProxyPort } from "../lib/tcpProxyServer";

const router: IRouter = Router();

const GATEWAY_HOST = process.env["REPLIT_DEV_DOMAIN"] ?? "localhost";
const INTERNAL_PORT = parseInt(process.env["PORT"] ?? "8080", 10);
const GATEWAY_EXTERNAL_PORT = 443;
const GATEWAY_USER = process.env["GATEWAY_USER"] ?? "admin";
const GATEWAY_PASS = process.env["GATEWAY_PASSWORD"] ?? "proxypass123";

const REPLIT_NODE_PORT = INTERNAL_PORT;
const FETCH_TIMEOUT_MS = 30000;
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

let cachedEgressIp: string | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getEgressIp(): Promise<string> {
  const now = Date.now();
  if (cachedEgressIp && now < cacheExpiresAt) return cachedEgressIp;
  const res = await fetch("https://api.ipify.org?format=json", {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`IP fetch failed: ${res.status}`);
  const { ip } = (await res.json()) as { ip: string };
  cachedEgressIp = ip;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return ip;
}

router.get("/info", async (req, res) => {
  try {
    const workingProxies = await db
      .select({ id: proxiesTable.id })
      .from(proxiesTable)
      .where(eq(proxiesTable.status, "working"));

    const address = `${GATEWAY_HOST}:${GATEWAY_EXTERNAL_PORT}:${GATEWAY_USER}:${GATEWAY_PASS}`;
    const tcpPort = getTcpProxyPort();
    const tcpAddress = `${GATEWAY_HOST}:${tcpPort}:${GATEWAY_USER}:${GATEWAY_PASS}`;

    res.json({
      address,
      host: GATEWAY_HOST,
      port: GATEWAY_EXTERNAL_PORT,
      username: GATEWAY_USER,
      workingProxies: workingProxies.length,
      tcpPort,
      tcpAddress,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting gateway info");
    res.status(500).json({ error: "Failed to get gateway info" });
  }
});

router.get("/replit-node", async (req, res) => {
  try {
    const ip = await getEgressIp();

    const existing = await db
      .select()
      .from(proxiesTable)
      .where(
        and(eq(proxiesTable.ip, ip), eq(proxiesTable.port, REPLIT_NODE_PORT)),
      );

    if (existing.length > 0) {
      const proxy = existing[0]!;
      return res.json({
        exists: true,
        ip,
        port: REPLIT_NODE_PORT,
        proxy: {
          id: proxy.id,
          ip: proxy.ip,
          port: proxy.port,
          status: proxy.status,
          latency: proxy.latency,
          lastChecked: proxy.lastChecked,
          createdAt: proxy.createdAt,
        },
      });
    }

    return res.json({ exists: false, ip, port: REPLIT_NODE_PORT, proxy: null });
  } catch (err) {
    req.log.error({ err }, "Error checking Replit node status");
    res.status(500).json({ error: "Failed to check Replit node status" });
  }
});

router.post("/add-node", async (req, res) => {
  try {
    const ip = await getEgressIp();

    const existing = await db
      .select()
      .from(proxiesTable)
      .where(
        and(eq(proxiesTable.ip, ip), eq(proxiesTable.port, REPLIT_NODE_PORT)),
      );

    if (existing.length > 0) {
      const proxy = existing[0]!;
      return res.json({
        added: false,
        proxy: {
          id: proxy.id,
          ip: proxy.ip,
          port: proxy.port,
          status: proxy.status,
          latency: proxy.latency,
          lastChecked: proxy.lastChecked,
          createdAt: proxy.createdAt,
        },
        message: `Replit node ${ip}:${REPLIT_NODE_PORT} is already registered.`,
      });
    }

    const inserted = await db
      .insert(proxiesTable)
      .values({
        ip,
        port: REPLIT_NODE_PORT,
        status: "unchecked",
        latency: null,
        lastChecked: null,
      })
      .returning();

    const proxy = inserted[0]!;
    req.log.info({ ip, port: REPLIT_NODE_PORT }, "Replit node added");

    return res.json({
      added: true,
      proxy: {
        id: proxy.id,
        ip: proxy.ip,
        port: proxy.port,
        status: proxy.status,
        latency: proxy.latency,
        lastChecked: proxy.lastChecked,
        createdAt: proxy.createdAt,
      },
      message: `Replit node ${ip}:${REPLIT_NODE_PORT} added successfully.`,
    });
  } catch (err) {
    req.log.error({ err }, "Error adding Replit node");
    res.status(500).json({ error: "Failed to add Replit node" });
  }
});

function makeRequestThroughProxy(
  upstream: { ip: string; port: number },
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  body: string | null
): Promise<{ status: number; headers: Record<string, string>; body: string; proxyUsed: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === "https:";
    const targetHost = parsed.hostname;
    const targetPort = parseInt(parsed.port || (isHttps ? "443" : "80"), 10);

    if (isHttps) {
      const connectReq = http.request({
        host: upstream.ip,
        port: upstream.port,
        method: "CONNECT",
        path: `${targetHost}:${targetPort}`,
        timeout: FETCH_TIMEOUT_MS,
      });

      connectReq.on("connect", (_res, socket) => {
        const tlsSocket = tls.connect(
          { host: targetHost, socket, servername: targetHost },
          () => {
            const reqLine = `${method} ${parsed.pathname}${parsed.search || ""} HTTP/1.1\r\n`;
            const hdrs: Record<string, string> = {
              Host: targetHost,
              Connection: "close",
              ...headers,
            };
            if (body) hdrs["Content-Length"] = Buffer.byteLength(body).toString();

            let raw = reqLine;
            for (const [k, v] of Object.entries(hdrs)) {
              raw += `${k}: ${v}\r\n`;
            }
            raw += "\r\n";
            tlsSocket.write(raw);
            if (body) tlsSocket.write(body);

            let responseData = "";
            let responseSize = 0;
            tlsSocket.on("data", (chunk: Buffer) => {
              responseSize += chunk.length;
              if (responseSize > MAX_RESPONSE_SIZE) {
                tlsSocket.destroy();
                reject(new Error("Response too large"));
                return;
              }
              responseData += chunk.toString();
            });
            tlsSocket.on("end", () => {
              const headerEnd = responseData.indexOf("\r\n\r\n");
              if (headerEnd === -1) {
                reject(new Error("Invalid response from upstream"));
                return;
              }
              const headerSection = responseData.slice(0, headerEnd);
              const responseBody = responseData.slice(headerEnd + 4);
              const lines = headerSection.split("\r\n");
              const statusLine = lines[0] ?? "";
              const statusCode = parseInt(statusLine.split(" ")[1] ?? "0", 10);
              const respHeaders: Record<string, string> = {};
              for (let i = 1; i < lines.length; i++) {
                const colonIdx = (lines[i] ?? "").indexOf(":");
                if (colonIdx > 0) {
                  const key = (lines[i] ?? "").slice(0, colonIdx).trim().toLowerCase();
                  const val = (lines[i] ?? "").slice(colonIdx + 1).trim();
                  respHeaders[key] = val;
                }
              }
              resolve({
                status: statusCode,
                headers: respHeaders,
                body: responseBody,
                proxyUsed: `${upstream.ip}:${upstream.port}`,
              });
            });
            tlsSocket.on("error", (err: Error) => reject(err));
          }
        );
        tlsSocket.on("error", (err: Error) => reject(err));
      });

      connectReq.on("error", (err) => reject(err));
      connectReq.on("timeout", () => {
        connectReq.destroy();
        reject(new Error("CONNECT timeout"));
      });
      connectReq.end();
    } else {
      const proxyReq = http.request(
        {
          host: upstream.ip,
          port: upstream.port,
          method,
          path: targetUrl,
          headers: { Host: targetHost, Connection: "close", ...headers },
          timeout: FETCH_TIMEOUT_MS,
        },
        (proxyRes) => {
          let responseBody = "";
          let respSize = 0;
          proxyRes.on("data", (chunk: Buffer) => {
            respSize += chunk.length;
            if (respSize > MAX_RESPONSE_SIZE) {
              proxyRes.destroy();
              reject(new Error("Response too large"));
              return;
            }
            responseBody += chunk.toString();
          });
          proxyRes.on("end", () => {
            const respHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(proxyRes.headers)) {
              if (typeof v === "string") respHeaders[k] = v;
            }
            resolve({
              status: proxyRes.statusCode ?? 0,
              headers: respHeaders,
              body: responseBody,
              proxyUsed: `${upstream.ip}:${upstream.port}`,
            });
          });
          proxyRes.on("error", (err) => reject(err));
        }
      );
      proxyReq.on("error", (err) => reject(err));
      proxyReq.on("timeout", () => {
        proxyReq.destroy();
        reject(new Error("Request timeout"));
      });
      if (body) proxyReq.write(body);
      proxyReq.end();
    }
  });
}

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]);
const HEADER_VALUE_RE = /^[\x20-\x7E]*$/;

function sanitizeHeaders(raw: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.replace(/[\r\n]/g, "").trim();
    const val = String(v).replace(/[\r\n]/g, "").trim();
    if (key && HEADER_VALUE_RE.test(key) && HEADER_VALUE_RE.test(val)) {
      safe[key] = val;
    }
  }
  return safe;
}

router.post("/fetch", async (req, res) => {
  try {
    const { url, method: rawMethod = "GET", headers: rawHeaders = {}, body = null } = req.body as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string | null;
    };

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing required field: url" });
    }

    const method = String(rawMethod).toUpperCase().replace(/[^A-Z]/g, "");
    if (!ALLOWED_METHODS.has(method)) {
      return res.status(400).json({ error: `Invalid method: ${rawMethod}` });
    }

    const headers = typeof rawHeaders === "object" && rawHeaders ? sanitizeHeaders(rawHeaders) : {};

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ error: "Only http and https URLs are supported" });
    }

    const upstream = await getRandomWorkingProxy();
    if (!upstream) {
      return res.status(503).json({ error: "No working proxies available in pool" });
    }

    const startMs = Date.now();
    const result = await makeRequestThroughProxy(
      upstream,
      url,
      method,
      headers,
      body ?? null
    );
    const elapsed = Date.now() - startMs;

    logger.info(
      { url, method, upstream: result.proxyUsed, status: result.status, elapsed },
      "gateway fetch completed"
    );

    recordRequest({
      targetUrl: url,
      method,
      latency: elapsed,
      success: result.status >= 200 && result.status < 400,
      proxyUsed: result.proxyUsed,
    });

    res.json({
      status: result.status,
      headers: result.headers,
      body: result.body,
      proxyUsed: result.proxyUsed,
      latency: elapsed,
    });
  } catch (err: any) {
    logger.error({ err }, "Gateway fetch error");
    const { url: failedUrl, method: failedMethod = "GET" } = req.body as { url?: string; method?: string };
    if (failedUrl) {
      recordRequest({
        targetUrl: failedUrl,
        method: String(failedMethod).toUpperCase(),
        latency: null,
        success: false,
        proxyUsed: "none",
      });
    }
    res.status(502).json({
      error: "Proxy request failed",
      details: err?.message ?? "Unknown error",
    });
  }
});

router.post("/test-rotate", async (req, res) => {
  try {
    const selfHost = "127.0.0.1";
    const selfPort = getTcpProxyPort();
    const authString = Buffer.from(`${GATEWAY_USER}:${GATEWAY_PASS}`).toString("base64");
    const testUrl = "http://httpbin.org/ip";
    const startMs = Date.now();

    const result = await new Promise<{ success: boolean; originIp: string; proxyUsed: string; latency: number; error?: string }>((resolve, reject) => {
      const proxyReq = http.request(
        {
          host: selfHost,
          port: selfPort,
          method: "GET",
          path: testUrl,
          headers: {
            Host: "httpbin.org",
            "Proxy-Authorization": `Basic ${authString}`,
            Connection: "close",
          },
          timeout: FETCH_TIMEOUT_MS,
        },
        (proxyRes) => {
          let body = "";
          proxyRes.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          proxyRes.on("end", () => {
            const elapsed = Date.now() - startMs;
            const ok = (proxyRes.statusCode ?? 0) >= 200 && (proxyRes.statusCode ?? 0) < 400;
            let originIp = "";
            try {
              const parsed = JSON.parse(body);
              originIp = parsed.origin ?? body.trim();
            } catch {
              originIp = body.trim();
            }
            const viaHeader = proxyRes.headers["x-proxy-used"] as string | undefined;
            resolve({
              success: ok,
              originIp: ok ? originIp : "",
              proxyUsed: viaHeader ?? "unknown",
              latency: elapsed,
              error: ok ? undefined : `Upstream returned ${proxyRes.statusCode}`,
            });
          });
          proxyRes.on("error", (err) => reject(err));
        }
      );
      proxyReq.on("error", (err) => reject(err));
      proxyReq.on("timeout", () => {
        proxyReq.destroy();
        reject(new Error("Rotate proxy test timed out"));
      });
      proxyReq.end();
    });

    logger.info(
      { originIp: result.originIp, proxyUsed: result.proxyUsed, latency: result.latency },
      "rotate proxy test completed"
    );

    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "Rotate proxy test error");
    res.status(502).json({
      success: false,
      originIp: "",
      proxyUsed: "none",
      latency: 0,
      error: err?.message ?? "Rotate proxy test failed",
    });
  }
});

router.post("/test", async (req, res) => {
  try {
    const upstream = await getRandomWorkingProxy();
    if (!upstream) {
      return res.status(503).json({
        success: false,
        error: "No working proxies available in pool",
      });
    }

    const startMs = Date.now();
    const result = await makeRequestThroughProxy(
      upstream,
      "http://httpbin.org/ip",
      "GET",
      {},
      null
    );
    const elapsed = Date.now() - startMs;

    let originIp = "";
    try {
      const parsed = JSON.parse(result.body);
      originIp = parsed.origin ?? result.body.trim();
    } catch {
      originIp = result.body.trim();
    }

    logger.info(
      { upstream: result.proxyUsed, originIp, elapsed },
      "gateway test completed"
    );

    recordRequest({
      targetUrl: "http://httpbin.org/ip",
      method: "GET",
      latency: elapsed,
      success: result.status >= 200 && result.status < 400,
      proxyUsed: result.proxyUsed,
    });

    res.json({
      success: result.status >= 200 && result.status < 400,
      originIp,
      proxyUsed: result.proxyUsed,
      latency: elapsed,
      status: result.status,
    });
  } catch (err: any) {
    logger.error({ err }, "Gateway test error");
    recordRequest({
      targetUrl: "http://httpbin.org/ip",
      method: "GET",
      latency: null,
      success: false,
      proxyUsed: "none",
    });
    res.status(502).json({
      success: false,
      error: err?.message ?? "Proxy request failed",
    });
  }
});

export default router;
