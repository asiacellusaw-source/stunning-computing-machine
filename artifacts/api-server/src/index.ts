import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { startBackgroundChecker, checkUncheckedProxies } from "./lib/proxyChecker";
import { handleConnect, handleHttpProxy } from "./lib/proxyServer";
import { startAutoScraper, scrapeAndImportProxies } from "./lib/proxyScraper";
import { startTcpProxyServer } from "./lib/tcpProxyServer";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("http://")) {
    handleHttpProxy(req, res);
  } else {
    (app as (req: typeof req, res: typeof res) => void)(req, res);
  }
});

server.on("connect", handleConnect);

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  const tcpPort = startTcpProxyServer();
  logger.info({ tcpPort }, "TCP proxy server started");
  startBackgroundChecker(60 * 60 * 1000);
  checkUncheckedProxies().catch((err) => logger.error({ err }, "Startup proxy check failed"));
  startAutoScraper(10 * 60 * 1000);
  scrapeAndImportProxies().catch((err) => logger.error({ err }, "Startup proxy scrape failed"));
});
