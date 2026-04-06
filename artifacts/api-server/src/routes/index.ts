import { Router, type IRouter } from "express";
import healthRouter from "./health";
import proxiesRouter from "./proxies";
import statsRouter from "./stats";
import gatewayRouter from "./gateway";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/proxies", proxiesRouter);
router.use("/stats", statsRouter);
router.use("/gateway", gatewayRouter);

export default router;
