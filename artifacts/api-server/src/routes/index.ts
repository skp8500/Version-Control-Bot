import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mygitRouter from "./mygit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mygitRouter);

export default router;
