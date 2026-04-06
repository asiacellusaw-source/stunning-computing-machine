import { Router, type IRouter } from "express";
import { db, proxiesTable } from "@workspace/db";
import { getRequestStats } from "../lib/requestStats";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const allProxies = await db.select().from(proxiesTable);

    const total = allProxies.length;
    const working = allProxies.filter((p) => p.status === "working").length;
    const failed = allProxies.filter((p) => p.status === "failed").length;
    const unchecked = allProxies.filter((p) => p.status === "unchecked").length;

    const workingProxies = allProxies.filter((p) => p.status === "working" && p.latency != null);
    const avgLatency =
      workingProxies.length > 0
        ? workingProxies.reduce((sum, p) => sum + (p.latency ?? 0), 0) / workingProxies.length
        : null;

    res.json({
      total,
      working,
      failed,
      unchecked,
      avgLatency: avgLatency !== null ? Math.round(avgLatency) : null,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting stats");
    res.status(500).json({ error: "Failed to get stats" });
  }
});

router.get("/requests", async (_req, res) => {
  try {
    const stats = getRequestStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Failed to get request stats" });
  }
});

export default router;
