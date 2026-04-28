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
  initRepo,
  isInitialized,
  readHead,
  readBranch,
  readIndex,
  stageFile,
  listWorkingFiles,
  readWorkingFile,
  writeWorkingFile,
  createCommit,
  getLog,
  checkoutCommit,
  getCommitDiff,
} from "../lib/mygitFs";

const router = Router();

// GET /api/mygit/status
router.get("/mygit/status", async (req, res) => {
  try {
    const initialized = await isInitialized();
    if (!initialized) {
      return res.json({
        initialized: false,
        head: "none",
        branch: "main",
        staged: [],
        files: [],
      });
    }
    const [head, branch, staged, files] = await Promise.all([
      readHead(),
      readBranch(),
      readIndex(),
      listWorkingFiles(),
    ]);
    return res.json({ initialized, head, branch, staged, files });
  } catch (err) {
    req.log.error({ err }, "Failed to get repo status");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mygit/init
router.post("/mygit/init", async (req, res) => {
  try {
    const initialized = await isInitialized();
    if (initialized) {
      return res.json({
        success: false,
        message: "Repository already initialized.",
      });
    }
    await initRepo();
    return res.json({
      success: true,
      message: "Initialized empty mygit repository.",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to init repo");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/mygit/files
router.get("/mygit/files", async (req, res) => {
  try {
    const filenames = await listWorkingFiles();
    const files = await Promise.all(
      filenames.map(async (name) => {
        const content = await readWorkingFile(name).catch(() => "");
        return { path: name, content, size: Buffer.byteLength(content, "utf-8") };
      }),
    );
    return res.json({ files });
  } catch (err) {
    req.log.error({ err }, "Failed to list files");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/mygit/file?path=...
router.get("/mygit/file", async (req, res) => {
  const parsed = GetFileQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "path query param required" });
  }
  try {
    const content = await readWorkingFile(parsed.data.path);
    return res.json({ path: parsed.data.path, content });
  } catch {
    return res.status(404).json({ error: "File not found" });
  }
});

// PUT /api/mygit/file
router.put("/mygit/file", async (req, res) => {
  const parsed = SaveFileBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "path and content required" });
  }
  try {
    await writeWorkingFile(parsed.data.path, parsed.data.content);
    return res.json({ success: true, message: `Saved ${parsed.data.path}` });
  } catch (err) {
    req.log.error({ err }, "Failed to save file");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mygit/add
router.post("/mygit/add", async (req, res) => {
  const parsed = AddFileBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "filename required" });
  }
  try {
    await stageFile(parsed.data.filename);
    return res.json({
      success: true,
      message: `Staged: ${parsed.data.filename}`,
    });
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
  if (!parsed.success) {
    return res.status(400).json({ error: "message required" });
  }
  try {
    const commitId = await createCommit(parsed.data.message);
    return res.json({
      success: true,
      commitId,
      message: `[${commitId.slice(0, 8)}] ${parsed.data.message}`,
    });
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
    const commits = await getLog();
    const head = await readHead();
    return res.json({ commits, head });
  } catch (err) {
    req.log.error({ err }, "Failed to get log");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mygit/checkout
router.post("/mygit/checkout", async (req, res) => {
  const parsed = CheckoutCommitBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "commitId required" });
  }
  try {
    await checkoutCommit(parsed.data.commitId);
    return res.json({
      success: true,
      message: `Checked out commit ${parsed.data.commitId.slice(0, 8)}`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to checkout");
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Checkout failed",
    });
  }
});

// GET /api/mygit/diff/:commitId
router.get("/mygit/diff/:commitId", async (req, res) => {
  const parsed = GetCommitDiffParams.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ error: "commitId required" });
  }
  try {
    const diff = await getCommitDiff(parsed.data.commitId);
    return res.json(diff);
  } catch (err) {
    req.log.error({ err }, "Failed to get diff");
    return res.status(404).json({ error: "Commit not found" });
  }
});

export default router;
