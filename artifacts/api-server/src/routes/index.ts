import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mygitRouter from "./mygit";
import terminalRouter from "./terminal";
import aibotRouter from "./aibot";
import authRouter from "./auth";
import reposRouter from "./repos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(reposRouter);
router.use(mygitRouter);
router.use(terminalRouter);
router.use(aibotRouter);

export default router;
