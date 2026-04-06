import { logger } from "./logger";

interface RequestRecord {
  targetDomain: string;
  method: string;
  timestamp: number;
  latency: number | null;
  success: boolean;
  proxyUsed: string;
}

const MAX_RECORDS = 10000;
const requestLog: RequestRecord[] = [];

let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
const domainCounts: Map<string, number> = new Map();

export function recordRequest(opts: {
  targetUrl: string;
  method: string;
  latency: number | null;
  success: boolean;
  proxyUsed: string;
}) {
  let domain = "unknown";
  try {
    domain = new URL(opts.targetUrl).hostname;
  } catch {}

  const record: RequestRecord = {
    targetDomain: domain,
    method: opts.method,
    timestamp: Date.now(),
    latency: opts.latency,
    success: opts.success,
    proxyUsed: opts.proxyUsed,
  };

  if (requestLog.length >= MAX_RECORDS) {
    const removed = requestLog.shift();
    if (removed) {
      const oldCount = domainCounts.get(removed.targetDomain) ?? 0;
      if (oldCount <= 1) {
        domainCounts.delete(removed.targetDomain);
      } else {
        domainCounts.set(removed.targetDomain, oldCount - 1);
      }
    }
  }

  requestLog.push(record);
  totalRequests++;
  if (opts.success) successfulRequests++;
  else failedRequests++;
  domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
}

export function getRequestStats() {
  const topDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  const recentRequests = requestLog
    .slice(-20)
    .reverse()
    .map((r) => ({
      targetDomain: r.targetDomain,
      method: r.method,
      timestamp: r.timestamp,
      latency: r.latency,
      success: r.success,
      proxyUsed: r.proxyUsed,
    }));

  const avgLatency =
    requestLog.filter((r) => r.latency != null).length > 0
      ? Math.round(
          requestLog
            .filter((r) => r.latency != null)
            .reduce((sum, r) => sum + (r.latency ?? 0), 0) /
            requestLog.filter((r) => r.latency != null).length
        )
      : null;

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    uniqueDomains: domainCounts.size,
    avgLatency,
    topDomains,
    recentRequests,
  };
}
