/**
 * repos.ts — Multi-repo CRUD + graph + upload + conflicts + AI explain
 */
import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import multer from "multer";
import JSZip from "jszip";
import { db } from "@workspace/db";
import {
  repositories,
  commits,
  commitFiles,
  workingFiles,
  conflicts,
} from "@workspace/db/schema";
import { optionalAuth, strictAuth, type JwtPayload } from "../lib/auth";
import { djb2Hash } from "../lib/mygitFs";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const WORKSPACES_ROOT =
  process.env.MYGIT_WORKSPACES_ROOT ?? "/home/runner/workspace/mygit-workspaces";

type AuthReq = { user?: JwtPayload };

// ── GET /api/repos — public list ──────────────────────────────────────────────
router.get("/repos", optionalAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: repositories.id,
        name: repositories.name,
        description: repositories.description,
        language: repositories.language,
        framework: repositories.framework,
        isPublic: repositories.isPublic,
        headHash: repositories.headHash,
        branch: repositories.branch,
        initializedAt: repositories.initializedAt,
        userId: repositories.userId,
      })
      .from(repositories)
      .where(eq(repositories.isPublic, true))
      .orderBy(desc(repositories.initializedAt));
    return res.json({ repos: rows });
  } catch (err) {
    req.log.error({ err }, "List repos failed");
    return res.status(500).json({ error: "Failed to list repos" });
  }
});

// ── POST /api/repos — create (protected) ─────────────────────────────────────
router.post("/repos", strictAuth, async (req, res) => {
  const user = (req as typeof req & AuthReq).user!;
  const { name, description = "", isPublic = true } = req.body as {
    name?: string;
    description?: string;
    isPublic?: boolean;
  };
  if (!name) return res.status(400).json({ error: "name required" });

  const repoPath = path.join(WORKSPACES_ROOT, `${user.userId}-${name}`);
  try {
    // Init filesystem
    await fs.mkdir(path.join(repoPath, ".mygit/commits"), { recursive: true });
    await fs.mkdir(path.join(repoPath, ".mygit/refs/heads"), { recursive: true });
    await fs.writeFile(path.join(repoPath, ".mygit/HEAD"), "ref: refs/heads/main\n");
    await fs.writeFile(path.join(repoPath, ".mygit/index"), "");

    const [repo] = await db
      .insert(repositories)
      .values({ userId: user.userId, name, description, repoPath, isPublic, branch: "main", headHash: "none" })
      .returning();

    return res.json({ repo });
  } catch (err) {
    req.log.error({ err }, "Create repo failed");
    return res.status(500).json({ error: "Failed to create repo" });
  }
});

// ── GET /api/repos/:id — public ───────────────────────────────────────────────
router.get("/repos/:id", optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Repo not found" });
  const repo = rows[0];
  if (!repo.isPublic) return res.status(403).json({ error: "Private repo" });

  // Commit count
  const commitRows = await db
    .select({ id: commits.id })
    .from(commits)
    .where(eq(commits.repoId, id));
  return res.json({ repo, commitCount: commitRows.length });
});

// ── GET /api/repos/:id/files — public file tree ────────────────────────────
router.get("/repos/:id/files", optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { commitHash } = req.query as { commitHash?: string };

  if (commitHash && commitHash !== "none") {
    // Files at a specific commit (from DB)
    const commitRow = await db
      .select()
      .from(commits)
      .where(and(eq(commits.repoId, id), eq(commits.hash, commitHash)))
      .limit(1);
    if (!commitRow[0]) return res.status(404).json({ error: "Commit not found" });

    const files = await db
      .select()
      .from(commitFiles)
      .where(eq(commitFiles.commitId, commitRow[0].id));
    return res.json({ files });
  }

  // Working directory files from DB
  const files = await db.select().from(workingFiles).where(eq(workingFiles.repoId, id));
  return res.json({ files: files.map((f) => ({ path: f.path, content: f.content })) });
});

// ── GET /api/repos/:id/commits — public ──────────────────────────────────────
router.get("/repos/:id/commits", optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(commits)
    .where(eq(commits.repoId, id))
    .orderBy(desc(commits.createdAt));
  return res.json({ commits: rows });
});

// ── GET /api/repos/:id/graph — public, for D3 ────────────────────────────────
// Never returns 401. Always returns { commitGraph, fileGraph } even when empty.
router.get("/repos/:id/graph", optionalAuth, async (req, res) => {
  const id = Number(req.params.id);

  const repoRows = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
  if (!repoRows[0]) {
    return res.status(404).json({ error: "Repo not found" });
  }
  const repo = repoRows[0];

  // ── Commit graph ─────────────────────────────────────────────────────────
  const commitRows = await db
    .select()
    .from(commits)
    .where(eq(commits.repoId, id))
    .orderBy(commits.createdAt);

  const head = repo.headHash;

  const commitNodes = commitRows.map((c) => ({
    id: c.hash,
    hash: c.hash,
    message: c.message,
    author: c.author,
    timestamp: c.createdAt,
    isHead: c.hash === head,
    hasConflict: false,
  }));

  // Edges: child → parent (chronological forward direction for arrowheads)
  const commitEdges = commitRows
    .filter((c) => c.parentHash !== "none")
    .map((c) => ({ source: c.hash, target: c.parentHash, isMerge: false }));

  // ── File graph ────────────────────────────────────────────────────────────
  // Built from the working files of the repo (HEAD state)
  const wfRows = await db
    .select({ path: workingFiles.path, content: workingFiles.content })
    .from(workingFiles)
    .where(eq(workingFiles.repoId, id));

  const fileNodeMap = new Map<string, { id: string; path: string; type: "file" | "folder"; language: string }>();
  const fileEdges: { source: string; target: string }[] = [];

  for (const f of wfRows) {
    const parts = f.path.split("/");
    // Add file node
    const fileId = `file:${f.path}`;
    const ext = f.path.split(".").pop() ?? "";
    const langMap: Record<string, string> = { ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", py: "Python", cpp: "C++", h: "C++", go: "Go", rs: "Rust", md: "Markdown" };
    fileNodeMap.set(fileId, { id: fileId, path: f.path, type: "file", language: langMap[ext] ?? ext });

    // Add folder nodes and edges for each segment
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join("/");
      const folderId = `folder:${folderPath}`;
      if (!fileNodeMap.has(folderId)) {
        fileNodeMap.set(folderId, { id: folderId, path: folderPath, type: "folder", language: "" });
      }
      // Edge: folder → child
      const childId = i === parts.length - 2 ? fileId : `folder:${parts.slice(0, i + 2).join("/")}`;
      if (!fileEdges.some((e) => e.source === folderId && e.target === childId)) {
        fileEdges.push({ source: folderId, target: childId });
      }
    }
  }

  return res.json({
    commitGraph: {
      nodes: commitNodes,
      edges: commitEdges,
      head,
    },
    fileGraph: {
      nodes: Array.from(fileNodeMap.values()),
      edges: fileEdges,
    },
  });
});

// ── GET /api/repos/:id/diff/:commitHash — public ─────────────────────────────
router.get("/repos/:id/diff/:commitHash", optionalAuth, async (req, res) => {
  const repoId = Number(req.params.id);
  const commitHash = String(req.params.commitHash);

  const commitRow = await db
    .select()
    .from(commits)
    .where(and(eq(commits.repoId, repoId), eq(commits.hash, commitHash)))
    .limit(1);
  if (!commitRow[0]) return res.status(404).json({ error: "Commit not found" });

  const thisFiles = await db
    .select()
    .from(commitFiles)
    .where(eq(commitFiles.commitId, commitRow[0].id));

  let parentFiles: typeof thisFiles = [];
  if (commitRow[0].parentHash !== "none") {
    const parentRow = await db
      .select()
      .from(commits)
      .where(and(eq(commits.repoId, repoId), eq(commits.hash, commitRow[0].parentHash)))
      .limit(1);
    if (parentRow[0]) {
      parentFiles = await db
        .select()
        .from(commitFiles)
        .where(eq(commitFiles.commitId, parentRow[0].id));
    }
  }

  const allPaths = new Set([...thisFiles.map((f) => f.path), ...parentFiles.map((f) => f.path)]);
  const diffs = Array.from(allPaths).map((p) => {
    const before = parentFiles.find((f) => f.path === p)?.content ?? "";
    const after = thisFiles.find((f) => f.path === p)?.content ?? "";
    const status = !before ? "added" : !after ? "deleted" : before !== after ? "modified" : "unchanged";
    return { path: p, before, after, status };
  });

  return res.json({ commitId: commitHash, parentId: commitRow[0].parentHash, diffs, commit: commitRow[0] });
});

// ── POST /api/repos/:id/commit — protected ────────────────────────────────────
router.post("/repos/:id/commit", strictAuth, async (req, res) => {
  const user = (req as typeof req & AuthReq).user!;
  const repoId = Number(req.params.id);
  const { message, files } = req.body as {
    message?: string;
    files?: { path: string; content: string }[];
  };
  if (!message || !files?.length) {
    return res.status(400).json({ error: "message and files required" });
  }

  const repo = await db.select().from(repositories).where(eq(repositories.id, repoId)).limit(1);
  if (!repo[0]) return res.status(404).json({ error: "Repo not found" });

  // Conflict detection: compare with HEAD files
  const headHash = repo[0].headHash;
  let headFiles: { path: string; content: string }[] = [];
  if (headHash !== "none") {
    const headCommit = await db
      .select()
      .from(commits)
      .where(and(eq(commits.repoId, repoId), eq(commits.hash, headHash)))
      .limit(1);
    if (headCommit[0]) {
      headFiles = await db
        .select({ path: commitFiles.path, content: commitFiles.content })
        .from(commitFiles)
        .where(eq(commitFiles.commitId, headCommit[0].id));
    }
  }

  // Detect conflicts (files changed by someone else between base and new push)
  const conflictingFiles: { path: string; ours: string; theirs: string; base: string }[] = [];
  for (const file of files) {
    const headFile = headFiles.find((f) => f.path === file.path);
    if (headFile && headFile.content !== file.content) {
      // Simple: check if it diverged from what the user had (server-side optimistic lock)
      // For now, just flag if content differs from head — real conflict resolution is done in UI
      const { baseContent } = req.body as { baseContent?: Record<string, string> };
      const base = baseContent?.[file.path] ?? headFile.content;
      if (base !== headFile.content) {
        conflictingFiles.push({ path: file.path, ours: file.content, theirs: headFile.content, base });
      }
    }
  }

  if (conflictingFiles.length > 0) {
    // Store conflicts in DB
    for (const c of conflictingFiles) {
      await db.insert(conflicts).values({
        repoId,
        filePath: c.path,
        baseContent: c.base,
        ours: c.ours,
        theirs: c.theirs,
      });
    }
    return res.status(409).json({
      error: "Conflicts detected",
      conflicts: conflictingFiles,
    });
  }

  // Create the commit
  const hashInput = files.map((f) => f.path + ":" + f.content).join("\n") + message + Date.now();
  const hash = djb2Hash(hashInput);

  const [commitRow] = await db
    .insert(commits)
    .values({ repoId, hash, message, parentHash: headHash, author: user.username })
    .returning();

  for (const file of files) {
    const existing = headFiles.find((f) => f.path === file.path);
    const status = !existing ? "added" : existing.content !== file.content ? "modified" : "unchanged";
    await db.insert(commitFiles).values({ commitId: commitRow.id, path: file.path, content: file.content, status });

    // Update working files
    const wf = await db
      .select()
      .from(workingFiles)
      .where(and(eq(workingFiles.repoId, repoId), eq(workingFiles.path, file.path)))
      .limit(1);
    if (wf.length > 0) {
      await db.update(workingFiles).set({ content: file.content, updatedAt: new Date() }).where(eq(workingFiles.id, wf[0].id));
    } else {
      await db.insert(workingFiles).values({ repoId, path: file.path, content: file.content });
    }
  }

  await db.update(repositories).set({ headHash: hash }).where(eq(repositories.id, repoId));

  return res.json({ commitId: hash, message: `[${hash.substring(0, 8)}] ${message}` });
});

// ── POST /api/repos/:id/upload — upload zip/files ─────────────────────────────
router.post("/repos/:id/upload", strictAuth, upload.single("archive"), async (req, res) => {
  const user = (req as typeof req & AuthReq).user!;
  const repoId = Number(req.params.id);
  const { message = "Initial upload" } = req.body as { message?: string };

  const repo = await db.select().from(repositories).where(eq(repositories.id, repoId)).limit(1);
  if (!repo[0]) return res.status(404).json({ error: "Repo not found" });

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  let extractedFiles: { path: string; content: string }[] = [];

  if (req.file.mimetype === "application/zip" || req.file.originalname.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(req.file.buffer);
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      try {
        const content = await file.async("string");
        // Strip top-level folder if all files share one
        const cleanPath = name.includes("/") ? name.split("/").slice(1).join("/") : name;
        if (cleanPath) extractedFiles.push({ path: cleanPath, content });
      } catch {
        // Skip binary files
      }
    }
  } else {
    // Single file upload
    extractedFiles = [{ path: req.file.originalname, content: req.file.buffer.toString("utf-8") }];
  }

  if (extractedFiles.length === 0) {
    return res.status(400).json({ error: "No text files found in upload" });
  }

  // Auto-detect language and framework
  const { language, framework } = detectLangFramework(extractedFiles.map((f) => f.path), extractedFiles);

  // Create commit
  const hashInput = extractedFiles.map((f) => f.path + ":" + f.content).join("\n") + message + Date.now();
  const hash = djb2Hash(hashInput);

  const [commitRow] = await db
    .insert(commits)
    .values({ repoId, hash, message, parentHash: repo[0].headHash, author: user.username })
    .returning();

  for (const file of extractedFiles) {
    await db.insert(commitFiles).values({ commitId: commitRow.id, path: file.path, content: file.content, status: "added" });
    const wf = await db.select().from(workingFiles).where(and(eq(workingFiles.repoId, repoId), eq(workingFiles.path, file.path))).limit(1);
    if (wf.length > 0) {
      await db.update(workingFiles).set({ content: file.content, updatedAt: new Date() }).where(eq(workingFiles.id, wf[0].id));
    } else {
      await db.insert(workingFiles).values({ repoId, path: file.path, content: file.content });
    }
  }

  await db.update(repositories)
    .set({ headHash: hash, language, framework })
    .where(eq(repositories.id, repoId));

  return res.json({
    commitId: hash,
    filesUploaded: extractedFiles.length,
    language,
    framework,
    summary: `Detected: ${language}${framework ? " / " + framework : ""}, ${extractedFiles.length} files`,
  });
});

// ── POST /api/repos/:id/resolve — resolve conflict ────────────────────────────
router.post("/repos/:id/resolve", strictAuth, async (req, res) => {
  const user = (req as typeof req & AuthReq).user!;
  const repoId = Number(req.params.id);
  const { filePath, resolution } = req.body as {
    filePath?: string;
    resolution?: string;
  };
  if (!filePath || !resolution) return res.status(400).json({ error: "filePath and resolution required" });

  await db
    .update(conflicts)
    .set({ resolved: true, theirs: resolution })
    .where(and(eq(conflicts.repoId, repoId), eq(conflicts.filePath, filePath)));

  return res.json({ success: true });
});

// ── GET /api/repos/:id/conflicts ──────────────────────────────────────────────
router.get("/repos/:id/conflicts", optionalAuth, async (req, res) => {
  const repoId = Number(req.params.id);
  const rows = await db
    .select()
    .from(conflicts)
    .where(and(eq(conflicts.repoId, repoId), eq(conflicts.resolved, false)));
  return res.json({ conflicts: rows });
});

// ── POST /api/explain — AI explanation (public) ───────────────────────────────
router.post("/explain", optionalAuth, async (req, res) => {
  const { context, prompt } = req.body as { context?: string; prompt?: string };
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI not configured" });

  const models = ["llama-3.3-70b-versatile", "qwen/qwen3-32b"];
  const model = models[Math.floor(Math.random() * models.length)];

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are mygit-bot, an expert in version control systems embedded in a web platform. Explain things in 3-5 concise sentences. Focus on what happened internally and why it matters. Use code formatting for commands.`,
          },
          { role: "user", content: (context ? `Context:\n${context}\n\n` : "") + prompt },
        ],
        max_tokens: 400,
        temperature: 0.4,
      }),
    });
    const data = (await groqRes.json()) as { choices?: { message: { content: string } }[] };
    return res.json({ explanation: data.choices?.[0]?.message.content ?? "No response.", model });
  } catch (err) {
    req.log.error({ err }, "AI explain failed");
    return res.status(500).json({ error: "AI unavailable" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function detectLangFramework(
  paths: string[],
  files: { path: string; content: string }[],
): { language: string; framework: string } {
  const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";
  const exts = paths.map(ext);

  const count = (e: string) => exts.filter((x) => x === e).length;
  const has = (name: string) => paths.some((p) => p.endsWith(name));

  let language = "Unknown";
  let framework = "";

  const maxExt = ["cpp", "ts", "js", "py", "go", "rs", "java"].sort((a, b) => count(b) - count(a))[0];
  const langMap: Record<string, string> = { cpp: "C++", ts: "TypeScript", js: "JavaScript", py: "Python", go: "Go", rs: "Rust", java: "Java" };
  language = langMap[maxExt] ?? "Unknown";

  if (has("package.json")) {
    const pkg = files.find((f) => f.path.endsWith("package.json"));
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg.content);
        const deps = { ...parsed.dependencies, ...parsed.devDependencies };
        if (deps.react) framework = "React";
        else if (deps.vue) framework = "Vue";
        else if (deps.express) framework = "Express";
        else if (deps.next) framework = "Next.js";
      } catch { /* */ }
    }
    if (!framework) framework = "Node.js";
  } else if (has("CMakeLists.txt") || has("Makefile")) {
    framework = "CMake";
  } else if (has("requirements.txt") || has("setup.py")) {
    framework = "Python";
  } else if (has("go.mod")) {
    framework = "Go Modules";
  } else if (has("Cargo.toml")) {
    framework = "Cargo";
  }

  return { language, framework };
}

export default router;
