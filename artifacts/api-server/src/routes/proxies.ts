import { Router, type IRouter } from "express";
import { db, proxiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  UploadProxiesBody,
  UpdateProxyBody,
  ListProxiesQueryParams,
} from "@workspace/api-zod";
import { triggerCheckAllAsync, triggerCheckActiveAsync, triggerCheckFailedAsync, triggerCheckUncheckedAsync } from "../lib/proxyChecker";
import { scrapeAndImportProxies, isScrapingInProgress } from "../lib/proxyScraper";

const router: IRouter = Router();

const VALID_FILTERS = ["all", "working", "failed", "unchecked"] as const;
type BulkFilter = (typeof VALID_FILTERS)[number];

router.get("/", async (req, res) => {
  try {
    const query = ListProxiesQueryParams.parse(req.query);

    let allProxies = await db.select().from(proxiesTable);

    if (query.status) {
      allProxies = allProxies.filter((p) => p.status === query.status);
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      allProxies = allProxies.filter((p) => p.ip.toLowerCase().includes(search));
    }

    const totalCount = allProxies.length;
    const rawPage = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const page = Math.min(rawPage, totalPages);
    const offset = (page - 1) * limit;
    const paginatedProxies = allProxies.slice(offset, offset + limit);

    const formatted = paginatedProxies.map((p) => ({
      id: p.id,
      ip: p.ip,
      port: p.port,
      status: p.status,
      latency: p.latency ?? null,
      lastChecked: p.lastChecked ? p.lastChecked.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
    }));

    res.json({
      data: formatted,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error listing proxies");
    res.status(500).json({ error: "Failed to list proxies" });
  }
});

router.get("/export", async (req, res) => {
  try {
    const status = req.query["status"] as string | undefined;
    const format = (req.query["format"] as string) ?? "txt";

    let proxies = await db.select().from(proxiesTable);

    if (status && status !== "all") {
      proxies = proxies.filter((p) => p.status === status);
    }

    if (format === "json") {
      const data = proxies.map((p) => ({
        ip: p.ip,
        port: p.port,
        status: p.status,
        latency: p.latency ?? null,
      }));
      res.setHeader("Content-Disposition", "attachment; filename=proxies.json");
      res.setHeader("Content-Type", "application/json");
      res.send(JSON.stringify(data, null, 2));
    } else if (format === "csv") {
      const header = "ip,port,status,latency";
      const rows = proxies.map((p) => `${p.ip},${p.port},${p.status},${p.latency ?? ""}`);
      res.setHeader("Content-Disposition", "attachment; filename=proxies.csv");
      res.setHeader("Content-Type", "text/csv");
      res.send([header, ...rows].join("\n"));
    } else {
      const lines = proxies.map((p) => `${p.ip}:${p.port}`);
      res.setHeader("Content-Disposition", "attachment; filename=proxies.txt");
      res.setHeader("Content-Type", "text/plain");
      res.send(lines.join("\n"));
    }
  } catch (err) {
    req.log.error({ err }, "Error exporting proxies");
    res.status(500).json({ error: "Failed to export proxies" });
  }
});

router.post("/check-all", async (req, res) => {
  try {
    const { count, alreadyRunning } = await triggerCheckAllAsync();
    if (alreadyRunning) {
      res.json({ message: "Health check already in progress", count });
    } else {
      res.json({ message: `Health check started for ${count} proxies`, count });
    }
  } catch (err) {
    req.log.error({ err }, "Error triggering proxy check");
    res.status(500).json({ error: "Failed to trigger proxy check" });
  }
});

router.post("/check-active", async (req, res) => {
  try {
    const { count, alreadyRunning } = await triggerCheckActiveAsync();
    if (alreadyRunning) {
      res.json({ message: "Active check already in progress", count });
    } else {
      res.json({ message: `Health check started for ${count} working/unchecked proxies`, count });
    }
  } catch (err) {
    req.log.error({ err }, "Error triggering active proxy check");
    res.status(500).json({ error: "Failed to trigger active proxy check" });
  }
});

router.post("/check-unchecked", async (req, res) => {
  try {
    const { count, alreadyRunning } = await triggerCheckUncheckedAsync();
    if (alreadyRunning) {
      res.json({ message: "Unchecked proxy check already in progress", count });
    } else {
      res.json({ message: `Checking ${count} unchecked proxies`, count });
    }
  } catch (err) {
    req.log.error({ err }, "Error triggering unchecked proxy check");
    res.status(500).json({ error: "Failed to trigger unchecked proxy check" });
  }
});

router.post("/check-failed", async (req, res) => {
  try {
    const { count, alreadyRunning } = await triggerCheckFailedAsync();
    if (alreadyRunning) {
      res.json({ message: "Failed proxy re-check already in progress", count });
    } else {
      res.json({ message: `Re-checking ${count} failed proxies`, count });
    }
  } catch (err) {
    req.log.error({ err }, "Error triggering failed proxy check");
    res.status(500).json({ error: "Failed to trigger failed proxy check" });
  }
});

router.post("/scrape", async (req, res) => {
  try {
    if (isScrapingInProgress()) {
      return res.json({
        message: "Scraping already in progress",
        totalFetched: 0,
        added: 0,
        skipped: 0,
        sources: [],
        checkTriggered: false,
      });
    }

    const result = await scrapeAndImportProxies();
    res.json({
      message: `Fetched ${result.totalFetched} proxies, added ${result.added} new, skipped ${result.skipped}`,
      ...result,
    });
  } catch (err) {
    req.log.error({ err }, "Error scraping proxies");
    res.status(500).json({ error: "Failed to scrape proxies" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = UploadProxiesBody.parse(req.body);

    const lines = body.proxies
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let added = 0;
    let skipped = 0;

    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length < 2) {
        skipped++;
        continue;
      }
      const ip = parts[0]!.trim();
      const port = parseInt(parts[1]!.trim(), 10);
      if (!ip || isNaN(port) || port < 1 || port > 65535) {
        skipped++;
        continue;
      }

      const existing = await db
        .select({ id: proxiesTable.id })
        .from(proxiesTable)
        .where(and(eq(proxiesTable.ip, ip), eq(proxiesTable.port, port)))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(proxiesTable).values({
        ip,
        port,
        status: "unchecked",
        latency: null,
        lastChecked: null,
      });
      added++;
    }

    res.json({
      added,
      skipped,
      total: added + skipped,
      message: `Added ${added} proxies, skipped ${skipped} duplicates/invalid`,
    });

    if (added > 0) {
      triggerCheckAllAsync().catch((err) =>
        req.log.error({ err }, "Error triggering post-import proxy check"),
      );
    }
  } catch (err) {
    req.log.error({ err }, "Error uploading proxies");
    res.status(500).json({ error: "Failed to upload proxies" });
  }
});

router.delete("/", async (req, res) => {
  try {
    const filter = req.query["filter"] as string | undefined;

    if (!filter || !VALID_FILTERS.includes(filter as BulkFilter)) {
      res.status(400).json({
        error: `Invalid filter. Must be one of: ${VALID_FILTERS.join(", ")}`,
      });
      return;
    }

    const typedFilter = filter as BulkFilter;

    const conditions =
      typedFilter === "all"
        ? undefined
        : eq(proxiesTable.status, typedFilter);

    const deleted = await db
      .delete(proxiesTable)
      .where(conditions)
      .returning({ id: proxiesTable.id });

    res.json({
      deleted: deleted.length,
      message: `Deleted ${deleted.length} ${typedFilter === "all" ? "" : typedFilter + " "}proxies`,
    });
  } catch (err) {
    req.log.error({ err }, "Error bulk deleting proxies");
    res.status(500).json({ error: "Failed to bulk delete proxies" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"]!, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid proxy ID" });
      return;
    }

    const existing = await db
      .select({ id: proxiesTable.id })
      .from(proxiesTable)
      .where(eq(proxiesTable.id, id))
      .limit(1);

    if (existing.length === 0) {
      res.status(404).json({ error: "Proxy not found" });
      return;
    }

    await db.delete(proxiesTable).where(eq(proxiesTable.id, id));
    res.json({ success: true, message: "Proxy deleted successfully" });
  } catch (err) {
    req.log.error({ err }, "Error deleting proxy");
    res.status(500).json({ error: "Failed to delete proxy" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"]!, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid proxy ID" });
      return;
    }

    const body = UpdateProxyBody.parse(req.body);

    const existing = await db
      .select()
      .from(proxiesTable)
      .where(eq(proxiesTable.id, id))
      .limit(1);

    if (existing.length === 0) {
      res.status(404).json({ error: "Proxy not found" });
      return;
    }

    const updateData: Partial<typeof proxiesTable.$inferInsert> = {};
    if (body.ip !== undefined) updateData.ip = body.ip;
    if (body.port !== undefined) updateData.port = body.port;
    if (body.status !== undefined) updateData.status = body.status;

    const updated = await db
      .update(proxiesTable)
      .set(updateData)
      .where(eq(proxiesTable.id, id))
      .returning();

    const p = updated[0]!;
    res.json({
      id: p.id,
      ip: p.ip,
      port: p.port,
      status: p.status,
      latency: p.latency ?? null,
      lastChecked: p.lastChecked ? p.lastChecked.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating proxy");
    res.status(500).json({ error: "Failed to update proxy" });
  }
});

export default router;
