import { db, proxiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { triggerCheckAllAsync } from "./proxyChecker";

const IP_PORT_RE = /\b(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})\b/g;

const PROXY_SOURCES = [
  // --- Classic web lists ---
  "https://www.sslproxies.org/",
  "https://free-proxy-list.net/",
  "https://www.us-proxy.org/",
  "https://www.socks-proxy.net/",
  "https://www.proxy-list.download/HTTP",
  "https://www.proxy-list.download/HTTPS",
  "https://www.proxy-list.download/SOCKS4",
  "https://www.proxy-list.download/SOCKS5",

  // --- ProxyScrape API ---
  "https://api.proxyscrape.com/v4/free-proxy-list/get?protocol=http&timeout=10000&country=all&ssl=all&anonymity=all&limit=2000&request=getproxies",
  "https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all",
  "https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks4&timeout=10000&country=all",
  "https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks5&timeout=10000&country=all",

  // --- GeoNode API ---
  "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=http,https",
  "https://proxylist.geonode.com/api/proxy-list?limit=500&page=2&sort_by=lastChecked&sort_type=desc&protocols=http,https",

  // --- OpenProxy.space ---
  "https://openproxy.space/list/http",
  "https://openproxy.space/list/socks4",
  "https://openproxy.space/list/socks5",

  // --- GitHub: TheSpeedX ---
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt",
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",

  // --- GitHub: monosans ---
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt",

  // --- GitHub: clarketm ---
  "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",

  // --- GitHub: ShiftyTR ---
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt",

  // --- GitHub: jetkai ---
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-https.txt",
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt",
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt",

  // --- GitHub: roosterkid ---
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt",

  // --- GitHub: hookzof ---
  "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt",

  // --- GitHub: mmpx12 ---
  "https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt",
  "https://raw.githubusercontent.com/mmpx12/proxy-list/master/https.txt",
  "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks4.txt",
  "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks5.txt",

  // --- GitHub: sunny9577 ---
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt",

  // --- GitHub: HyperBeats ---
  "https://raw.githubusercontent.com/HyperBeats/proxy-list/main/http.txt",
  "https://raw.githubusercontent.com/HyperBeats/proxy-list/main/socks4.txt",
  "https://raw.githubusercontent.com/HyperBeats/proxy-list/main/socks5.txt",
];

const PROXIFLY_URL =
  "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json";

interface ScrapeSourceResult {
  source: string;
  count: number;
  success: boolean;
  error?: string;
}

function extractIpPort(text: string): string[] {
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(IP_PORT_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    const ip = m[1]!;
    const port = parseInt(m[2]!, 10);
    if (port >= 1 && port <= 65535) {
      const octets = ip.split(".");
      if (octets.every((o) => parseInt(o, 10) <= 255)) {
        matches.add(`${ip}:${port}`);
      }
    }
  }
  return Array.from(matches);
}

async function fetchSource(
  url: string,
  retries = 3
): Promise<string[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      return extractIpPort(text);
    } catch (err: any) {
      logger.warn(
        { url, attempt, err: err?.message },
        "Proxy source fetch failed"
      );
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return [];
}

async function fetchProxifly(): Promise<string[]> {
  try {
    const resp = await fetch(PROXIFLY_URL, {
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as Array<{
      protocol: string;
      ip: string;
      port: number;
    }>;
    return data
      .filter((p) => p.protocol === "http" || p.protocol === "https")
      .map((p) => `${p.ip}:${p.port}`);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Proxifly fetch failed");
    return [];
  }
}

let isScraping = false;

export interface ScrapeResult {
  totalFetched: number;
  added: number;
  skipped: number;
  sources: ScrapeSourceResult[];
  checkTriggered: boolean;
}

export async function scrapeAndImportProxies(): Promise<ScrapeResult> {
  if (isScraping) {
    throw new Error("Scraping already in progress");
  }
  isScraping = true;

  const sources: ScrapeSourceResult[] = [];
  const allProxies = new Set<string>();

  try {
    const fetchPromises = PROXY_SOURCES.map(async (url) => {
      try {
        const proxies = await fetchSource(url);
        sources.push({
          source: url,
          count: proxies.length,
          success: proxies.length > 0,
          error: proxies.length === 0 ? "No proxies found" : undefined,
        });
        for (const p of proxies) allProxies.add(p);
      } catch (err: any) {
        sources.push({
          source: url,
          count: 0,
          success: false,
          error: err?.message,
        });
      }
    });

    const proxiflyPromise = (async () => {
      try {
        const proxies = await fetchProxifly();
        sources.push({
          source: "proxifly (cdn.jsdelivr)",
          count: proxies.length,
          success: proxies.length > 0,
          error: proxies.length === 0 ? "No proxies found" : undefined,
        });
        for (const p of proxies) allProxies.add(p);
      } catch (err: any) {
        sources.push({
          source: "proxifly (cdn.jsdelivr)",
          count: 0,
          success: false,
          error: err?.message,
        });
      }
    })();

    await Promise.all([...fetchPromises, proxiflyPromise]);

    logger.info(
      { totalUnique: allProxies.size, sourceCount: sources.length },
      "Proxy scraping complete, importing..."
    );

    let added = 0;
    let skipped = 0;
    const BATCH_SIZE = 50;
    const proxyArray = Array.from(allProxies);

    for (let i = 0; i < proxyArray.length; i += BATCH_SIZE) {
      const batch = proxyArray.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (proxyStr) => {
          const [ip, portStr] = proxyStr.split(":");
          const port = parseInt(portStr!, 10);
          if (!ip || isNaN(port)) {
            skipped++;
            return;
          }

          try {
            const existing = await db
              .select({ id: proxiesTable.id })
              .from(proxiesTable)
              .where(and(eq(proxiesTable.ip, ip), eq(proxiesTable.port, port)))
              .limit(1);

            if (existing.length > 0) {
              skipped++;
              return;
            }

            await db.insert(proxiesTable).values({
              ip,
              port,
              status: "unchecked",
              latency: null,
              lastChecked: null,
            });
            added++;
          } catch {
            skipped++;
          }
        })
      );
    }

    let checkTriggered = false;
    if (added > 0) {
      triggerCheckAllAsync().catch((err) =>
        logger.error({ err }, "Error triggering post-scrape proxy check")
      );
      checkTriggered = true;
    }

    logger.info(
      { totalFetched: allProxies.size, added, skipped },
      "Proxy import complete"
    );

    return {
      totalFetched: allProxies.size,
      added,
      skipped,
      sources: sources.sort((a, b) => b.count - a.count),
      checkTriggered,
    };
  } finally {
    isScraping = false;
  }
}

export function isScrapingInProgress(): boolean {
  return isScraping;
}

let scrapeInterval: NodeJS.Timeout | null = null;

export function startAutoScraper(intervalMs = 10 * 60 * 1000) {
  if (scrapeInterval) return;
  scrapeInterval = setInterval(async () => {
    try {
      logger.info("Auto-scraper: starting scheduled proxy fetch");
      const result = await scrapeAndImportProxies();
      logger.info(
        { added: result.added, totalFetched: result.totalFetched },
        "Auto-scraper: scheduled proxy fetch complete"
      );
    } catch (err) {
      logger.error({ err }, "Auto-scraper: scheduled proxy fetch failed");
    }
  }, intervalMs);
  logger.info({ intervalMs }, "Auto proxy scraper started");
}

export function stopAutoScraper() {
  if (scrapeInterval) {
    clearInterval(scrapeInterval);
    scrapeInterval = null;
  }
}
