import { db, proxiesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "./logger";
import http from "http";

const CHECK_TIMEOUT = 20000;

const CHECK_TARGETS: Array<{ host: string; path: string; port: number }> = [
  { host: "httpbin.org", path: "/ip", port: 80 },
  { host: "ip-api.com", path: "/json", port: 80 },
  { host: "ifconfig.me", path: "/ip", port: 80 },
];

const IP_PATTERN = /(\d{1,3}\.){3}\d{1,3}/;

function tryCheckWithTarget(
  proxyIp: string,
  proxyPort: number,
  target: { host: string; path: string; port: number }
): Promise<{ working: boolean; latency: number | null }> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: { working: boolean; latency: number | null }) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const start = Date.now();

    const options: http.RequestOptions = {
      host: proxyIp,
      port: proxyPort,
      method: "GET",
      path: `http://${target.host}${target.path}`,
      headers: {
        Host: target.host,
        "User-Agent": "ProxyChecker/1.0",
        "Proxy-Connection": "Keep-Alive",
      },
      timeout: CHECK_TIMEOUT,
    };

    const req = http.request(options, (res) => {
      const latency = Date.now() - start;
      let body = "";

      res.setEncoding("utf8");

      res.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > 2048) {
          res.destroy();
        }
      });

      res.on("end", () => {
        const statusOk = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400;
        const hasIp = IP_PATTERN.test(body);
        if (statusOk && hasIp) {
          settle({ working: true, latency });
        } else {
          settle({ working: false, latency: null });
        }
      });

      res.on("close", () => {
        settle({ working: false, latency: null });
      });

      res.on("error", () => {
        settle({ working: false, latency: null });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      settle({ working: false, latency: null });
    });

    req.on("error", () => {
      settle({ working: false, latency: null });
    });

    req.on("close", () => {
      settle({ working: false, latency: null });
    });

    req.end();
  });
}

export async function checkProxy(
  ip: string,
  port: number
): Promise<{ working: boolean; latency: number | null }> {
  const results = await Promise.all(
    CHECK_TARGETS.map((target) => tryCheckWithTarget(ip, port, target))
  );
  for (const result of results) {
    if (result.working) return result;
  }
  return { working: false, latency: null };
}

const BATCH_SIZE = 200;

async function checkProxiesList(proxies: { id: number; ip: string; port: number }[], label: string): Promise<number> {
  logger.info({ count: proxies.length, label }, "Starting proxy health check");

  for (let i = 0; i < proxies.length; i += BATCH_SIZE) {
    const batch = proxies.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (proxy) => {
        try {
          const result = await checkProxy(proxy.ip, proxy.port);
          await db
            .update(proxiesTable)
            .set({
              status: result.working ? "working" : "failed",
              latency: result.latency,
              lastChecked: new Date(),
            })
            .where(eq(proxiesTable.id, proxy.id));
        } catch (err) {
          logger.warn({ err, proxyId: proxy.id }, "Error checking proxy");
        }
      })
    );
  }

  logger.info({ count: proxies.length, label }, "Proxy health check complete");
  return proxies.length;
}

let isCheckingActive = false;
let isCheckingFailed = false;

export async function checkActiveProxies(): Promise<number> {
  const proxies = await db
    .select({ id: proxiesTable.id, ip: proxiesTable.ip, port: proxiesTable.port })
    .from(proxiesTable)
    .where(or(eq(proxiesTable.status, "working"), eq(proxiesTable.status, "unchecked")));

  const count = await checkProxiesList(proxies, "active+unchecked");
  isCheckingActive = false;
  return count;
}

export async function checkFailedProxies(): Promise<number> {
  const proxies = await db
    .select({ id: proxiesTable.id, ip: proxiesTable.ip, port: proxiesTable.port })
    .from(proxiesTable)
    .where(eq(proxiesTable.status, "failed"));

  const count = await checkProxiesList(proxies, "failed");
  isCheckingFailed = false;
  return count;
}

export async function checkWorkingProxies(): Promise<number> {
  const proxies = await db
    .select({ id: proxiesTable.id, ip: proxiesTable.ip, port: proxiesTable.port })
    .from(proxiesTable)
    .where(eq(proxiesTable.status, "working"));

  return checkProxiesList(proxies, "working");
}

export async function checkUncheckedProxies(): Promise<number> {
  const proxies = await db
    .select({ id: proxiesTable.id, ip: proxiesTable.ip, port: proxiesTable.port })
    .from(proxiesTable)
    .where(eq(proxiesTable.status, "unchecked"));

  return checkProxiesList(proxies, "unchecked");
}

let isCheckingUnchecked = false;

export async function triggerCheckUncheckedAsync(): Promise<{ count: number; alreadyRunning: boolean }> {
  const proxies = await db
    .select({ id: proxiesTable.id })
    .from(proxiesTable)
    .where(eq(proxiesTable.status, "unchecked"));
  const count = proxies.length;

  if (isCheckingUnchecked) {
    return { count, alreadyRunning: true };
  }

  isCheckingUnchecked = true;
  setImmediate(() => {
    checkUncheckedProxies().then(() => { isCheckingUnchecked = false; }).catch((err) => {
      logger.error({ err }, "Async unchecked proxy check failed");
      isCheckingUnchecked = false;
    });
  });

  return { count, alreadyRunning: false };
}

export async function checkAllProxies(): Promise<number> {
  const proxies = await db
    .select({ id: proxiesTable.id, ip: proxiesTable.ip, port: proxiesTable.port })
    .from(proxiesTable);

  const count = await checkProxiesList(proxies, "all");
  isCheckingActive = false;
  return count;
}

export async function triggerCheckActiveAsync(): Promise<{ count: number; alreadyRunning: boolean }> {
  const proxies = await db
    .select({ id: proxiesTable.id })
    .from(proxiesTable)
    .where(or(eq(proxiesTable.status, "working"), eq(proxiesTable.status, "unchecked")));
  const count = proxies.length;

  if (isCheckingActive) {
    return { count, alreadyRunning: true };
  }

  isCheckingActive = true;
  setImmediate(() => {
    checkActiveProxies().catch((err) => {
      logger.error({ err }, "Async active proxy check failed");
      isCheckingActive = false;
    });
  });

  return { count, alreadyRunning: false };
}

export async function triggerCheckFailedAsync(): Promise<{ count: number; alreadyRunning: boolean }> {
  const proxies = await db
    .select({ id: proxiesTable.id })
    .from(proxiesTable)
    .where(eq(proxiesTable.status, "failed"));
  const count = proxies.length;

  if (isCheckingFailed) {
    return { count, alreadyRunning: true };
  }

  isCheckingFailed = true;
  setImmediate(() => {
    checkFailedProxies().catch((err) => {
      logger.error({ err }, "Async failed proxy check failed");
      isCheckingFailed = false;
    });
  });

  return { count, alreadyRunning: false };
}

export async function triggerCheckAllAsync(): Promise<{ count: number; alreadyRunning: boolean }> {
  const proxies = await db.select({ id: proxiesTable.id }).from(proxiesTable);
  const count = proxies.length;

  if (isCheckingActive) {
    return { count, alreadyRunning: true };
  }

  isCheckingActive = true;
  setImmediate(() => {
    checkAllProxies().catch((err) => {
      logger.error({ err }, "Async proxy check failed");
      isCheckingActive = false;
    });
  });

  return { count, alreadyRunning: false };
}


let checkInterval: NodeJS.Timeout | null = null;

export function startBackgroundChecker(intervalMs = 60 * 60 * 1000) {
  if (checkInterval) return;
  checkInterval = setInterval(async () => {
    try {
      await checkUncheckedProxies();
    } catch (err) {
      logger.error({ err }, "Background proxy check failed");
    }
  }, intervalMs);
  logger.info({ intervalMs }, "Background proxy checker started (unchecked only)");
}

export function stopBackgroundChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

export async function getRandomWorkingProxy(): Promise<{ ip: string; port: number } | null> {
  const workingProxies = await db
    .select({ ip: proxiesTable.ip, port: proxiesTable.port })
    .from(proxiesTable)
    .where(eq(proxiesTable.status, "working"));

  if (workingProxies.length === 0) return null;

  const idx = Math.floor(Math.random() * workingProxies.length);
  return workingProxies[idx]!;
}
