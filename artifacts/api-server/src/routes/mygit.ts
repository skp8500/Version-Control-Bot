import { Router } from "express";
import {
  GetFileQueryParams,
  SaveFileBody,
  AddFileBody,
  CreateCommitBody,
  CheckoutCommitBody,
  GetCommitDiffParams,
} from "@workspace/api-zod";
import {
  initRepoDb,
  isInitializedDb,
  getStatusDb,
  listFilesDb,
  getFileDb,
  saveFileDb,
  stageFileDb,
  createCommitDb,
  getLogDb,
  checkoutCommitDb,
  getCommitDiff,
} from "../lib/mygitDb";

const router = Router();

// GET /api/mygit/status
router.get("/mygit/status", async (req, res) => {
  try {
    const status = await getStatusDb();
    return res.json(status);
  } catch (err) {
    req.log.error({ err }, "Failed to get repo status");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mygit/init
router.post("/mygit/init", async (req, res) => {
  try {
    const initialized = await isInitializedDb();
    if (initialized) {
      return res.json({ success: false, message: "Repository already initialized." });
    }
    await initRepoDb();
    return res.json({ success: true, message: "Initialized empty mygit repository." });
  } catch (err) {
    req.log.error({ err }, "Failed to init repo");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/mygit/files
router.get("/mygit/files", async (req, res) => {
  try {
    const files = await listFilesDb();
    return res.json({ files });
  } catch (err) {
    req.log.error({ err }, "Failed to list files");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/mygit/file?path=...
router.get("/mygit/file", async (req, res) => {
  const parsed = GetFileQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "path query param required" });
  try {
    const content = await getFileDb(parsed.data.path);
    return res.json({ path: parsed.data.path, content });
  } catch {
    return res.status(404).json({ error: "File not found" });
  }
});

// PUT /api/mygit/file
router.put("/mygit/file", async (req, res) => {
  const parsed = SaveFileBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "path and content required" });
  try {
    await saveFileDb(parsed.data.path, parsed.data.content);
    return res.json({ success: true, message: `Saved ${parsed.data.path}` });
  } catch (err) {
    req.log.error({ err }, "Failed to save file");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mygit/add
router.post("/mygit/add", async (req, res) => {
  const parsed = AddFileBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "filename required" });
  try {
    await stageFileDb(parsed.data.filename);
    return res.json({ success: true, message: `Staged: ${parsed.data.filename}` });
  } catch (err) {
    req.log.error({ err }, "Failed to stage file");
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to stage file",
    });
  }
});

// POST /api/mygit/commit
router.post("/mygit/commit", async (req, res) => {
  const parsed = CreateCommitBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "message required" });
  try {
    const commitId = await createCommitDb(parsed.data.message);
    return res.json({ success: true, commitId, message: `[${commitId.slice(0, 8)}] ${parsed.data.message}` });
  } catch (err) {
    req.log.error({ err }, "Failed to create commit");
    return res.status(400).json({
      success: false,
      commitId: "",
      message: err instanceof Error ? err.message : "Commit failed",
    });
  }
});

// GET /api/mygit/log
router.get("/mygit/log", async (req, res) => {
  try {
    const result = await getLogDb();
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get log");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mygit/checkout
router.post("/mygit/checkout", async (req, res) => {
  const parsed = CheckoutCommitBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "commitId required" });
  try {
    await checkoutCommitDb(parsed.data.commitId);
    return res.json({ success: true, message: `Checked out ${parsed.data.commitId.slice(0, 8)}` });
  } catch (err) {
    req.log.error({ err }, "Failed to checkout");
    return res.status(400).json({ error: err instanceof Error ? err.message : "Checkout failed" });
  }
});

// GET /api/mygit/diff/:commitId
router.get("/mygit/diff/:commitId", async (req, res) => {
  const parsed = GetCommitDiffParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "commitId required" });
  try {
    const diff = await getCommitDiff(parsed.data.commitId);
    return res.json(diff);
  } catch (err) {
    req.log.error({ err }, "Failed to get diff");
    return res.status(404).json({ error: "Commit not found" });
  }
});

export default router;
