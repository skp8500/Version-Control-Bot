/**
 * mygitFs.ts — TypeScript port of the mygit filesystem logic.
 * All .mygit/ operations live here. No database — pure filesystem.
 */
import fs from "fs/promises";
import path from "path";

// ── Repo root ─────────────────────────────────────────────────────────────────
// Configurable via env var; defaults to a `mygit-workspace/` folder created
// next to the running process (works on Replit, local laptops, CI, etc.).
export const REPO_ROOT =
  process.env.MYGIT_REPO_PATH ??
  path.resolve(process.cwd(), "mygit-workspace");

const MYGIT_DIR = () => path.join(REPO_ROOT, ".mygit");
const COMMITS_DIR = () => path.join(MYGIT_DIR(), "commits");
const INDEX_FILE = () => path.join(MYGIT_DIR(), "index");
const HEAD_FILE = () => path.join(MYGIT_DIR(), "HEAD");
const REFS_DIR = () => path.join(MYGIT_DIR(), "refs", "heads");

// ── djb2 hash (matches C++ implementation exactly) ────────────────────────────
export function djb2Hash(content: string): string {
  let hash = 5381n;
  for (let i = 0; i < content.length; i++) {
    const c = BigInt(content.charCodeAt(i));
    hash = ((hash << 5n) + hash + c) & 0xffffffffffffffffn;
  }
  return hash.toString(16);
}

// ── Init ─────────────────────────────────────────────────────────────────────
export async function initRepo(): Promise<void> {
  await fs.mkdir(COMMITS_DIR(), { recursive: true });
  await fs.mkdir(REFS_DIR(), { recursive: true });
  await fs.mkdir(REPO_ROOT, { recursive: true });

  // HEAD → symbolic ref to main (branch doesn't exist yet — that's normal)
  await fs.writeFile(HEAD_FILE(), "ref: refs/heads/main\n");
  // Empty index
  await fs.writeFile(INDEX_FILE(), "");
}

export async function isInitialized(): Promise<boolean> {
  try {
    await fs.access(MYGIT_DIR());
    return true;
  } catch {
    return false;
  }
}

// ── HEAD / branch helpers ─────────────────────────────────────────────────────
export async function readHead(): Promise<string> {
  try {
    const raw = (await fs.readFile(HEAD_FILE(), "utf-8")).trim();
    if (raw.startsWith("ref: ")) {
      const refPath = raw.slice(5);
      try {
        return (
          await fs.readFile(path.join(MYGIT_DIR(), refPath), "utf-8")
        ).trim();
      } catch {
        return "none"; // branch exists but has no commits yet
      }
    }
    return raw;
  } catch {
    return "none";
  }
}

export async function readBranch(): Promise<string> {
  try {
    const raw = (await fs.readFile(HEAD_FILE(), "utf-8")).trim();
    if (raw.startsWith("ref: refs/heads/")) return raw.slice(16);
    return "detached";
  } catch {
    return "main";
  }
}

async function writeHead(hash: string): Promise<void> {
  // If currently pointing at a branch ref, update that ref file instead
  try {
    const raw = (await fs.readFile(HEAD_FILE(), "utf-8")).trim();
    if (raw.startsWith("ref: ")) {
      const refPath = raw.slice(5);
      const refFile = path.join(MYGIT_DIR(), refPath);
      await fs.mkdir(path.dirname(refFile), { recursive: true });
      await fs.writeFile(refFile, hash + "\n");
      return;
    }
  } catch {
    // fall through
  }
  await fs.writeFile(HEAD_FILE(), hash + "\n");
}

// ── Index (staging area) ──────────────────────────────────────────────────────
export async function readIndex(): Promise<string[]> {
  try {
    const content = await fs.readFile(INDEX_FILE(), "utf-8");
    return content.split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

async function writeIndex(files: string[]): Promise<void> {
  await fs.writeFile(INDEX_FILE(), files.join("\n"));
}

export async function stageFile(filename: string): Promise<void> {
  // Verify the file exists in the working directory
  await fs.access(path.join(REPO_ROOT, filename));

  const current = await readIndex();
  if (!current.includes(filename)) {
    current.push(filename);
    await writeIndex(current);
  }
}

// ── Working directory files ───────────────────────────────────────────────────
export async function listWorkingFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(REPO_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export async function readWorkingFile(filename: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, filename), "utf-8");
}

export async function writeWorkingFile(
  filename: string,
  content: string,
): Promise<void> {
  const full = path.join(REPO_ROOT, filename);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

// ── Commit ────────────────────────────────────────────────────────────────────
export interface CommitEntry {
  hash: string;
  message: string;
  timestamp: string;
  parent: string;
  files: string[];
}

export async function createCommit(message: string): Promise<string> {
  const staged = await readIndex();
  if (staged.length === 0) throw new Error("Nothing staged to commit.");

  // Read all staged files and concatenate content for hashing
  const parts: string[] = [];
  for (const f of staged) {
    const content = await readWorkingFile(f);
    parts.push(f + ":" + content);
  }
  const hashInput = parts.join("\n") + message + Date.now();
  const hash = djb2Hash(hashInput);

  const commitDir = path.join(COMMITS_DIR(), hash);
  const filesDir = path.join(commitDir, "files");
  await fs.mkdir(filesDir, { recursive: true });

  // Copy each staged file into the commit snapshot
  for (const f of staged) {
    const src = path.join(REPO_ROOT, f);
    const dst = path.join(filesDir, f);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }

  const parent = await readHead();
  await fs.writeFile(path.join(commitDir, "message.txt"), message);
  await fs.writeFile(path.join(commitDir, "timestamp.txt"), new Date().toISOString());
  await fs.writeFile(path.join(commitDir, "parent.txt"), parent);
  await fs.writeFile(path.join(commitDir, "files.txt"), staged.join("\n"));

  await writeHead(hash);
  await writeIndex([]);

  return hash;
}

// ── Log ───────────────────────────────────────────────────────────────────────
async function readCommit(hash: string): Promise<CommitEntry | null> {
  if (!hash || hash === "none") return null;
  const dir = path.join(COMMITS_DIR(), hash);
  try {
    const message = (
      await fs.readFile(path.join(dir, "message.txt"), "utf-8")
    ).trim();
    const timestamp = (
      await fs.readFile(path.join(dir, "timestamp.txt"), "utf-8")
    ).trim();
    const parent = (
      await fs.readFile(path.join(dir, "parent.txt"), "utf-8")
    ).trim();
    let files: string[] = [];
    try {
      files = (await fs.readFile(path.join(dir, "files.txt"), "utf-8"))
        .split("\n")
        .filter(Boolean);
    } catch {
      // older commits without files.txt — read from files/ dir
      const entries = await fs.readdir(path.join(dir, "files")).catch(() => []);
      files = entries;
    }
    return { hash, message, timestamp, parent, files };
  } catch {
    return null;
  }
}

export async function getLog(): Promise<CommitEntry[]> {
  const commits: CommitEntry[] = [];
  let current = await readHead();

  const seen = new Set<string>();
  while (current && current !== "none") {
    if (seen.has(current)) break; // cycle guard
    seen.add(current);

    const entry = await readCommit(current);
    if (!entry) break;
    commits.push(entry);
    current = entry.parent;
  }
  return commits;
}

// ── Checkout ─────────────────────────────────────────────────────────────────
export async function checkoutCommit(commitId: string): Promise<void> {
  const commitDir = path.join(COMMITS_DIR(), commitId);
  const filesDir = path.join(commitDir, "files");

  // Verify commit exists
  await fs.access(commitDir);

  // Copy snapshot back to working directory
  const entries = await fs.readdir(filesDir).catch(() => []);
  for (const filename of entries) {
    const src = path.join(filesDir, filename);
    const dst = path.join(REPO_ROOT, filename);
    await fs.copyFile(src, dst);
  }

  // Update HEAD to detached state pointing at this commit
  await fs.writeFile(HEAD_FILE(), commitId + "\n");
  await writeIndex([]);
}

// ── Diff ─────────────────────────────────────────────────────────────────────
export interface FileDiff {
  path: string;
  before: string;
  after: string;
  status: "added" | "modified" | "deleted" | "unchanged";
}

export async function getCommitDiff(commitId: string): Promise<{
  commitId: string;
  parentId: string;
  diffs: FileDiff[];
}> {
  const commit = await readCommit(commitId);
  if (!commit) throw new Error(`Commit not found: ${commitId}`);

  const afterDir = path.join(COMMITS_DIR(), commitId, "files");
  const afterFiles = await fs.readdir(afterDir).catch(() => [] as string[]);

  let beforeFiles: string[] = [];
  let beforeDir = "";
  if (commit.parent !== "none") {
    beforeDir = path.join(COMMITS_DIR(), commit.parent, "files");
    beforeFiles = await fs.readdir(beforeDir).catch(() => []);
  }

  const allFiles = new Set([...afterFiles, ...beforeFiles]);
  const diffs: FileDiff[] = [];

  for (const file of allFiles) {
    const beforePath = beforeDir ? path.join(beforeDir, file) : null;
    const afterPath = path.join(afterDir, file);

    const beforeContent = beforePath
      ? await fs.readFile(beforePath, "utf-8").catch(() => "")
      : "";
    const afterContent = await fs
      .readFile(afterPath, "utf-8")
      .catch(() => "");

    let status: FileDiff["status"] = "unchanged";
    if (!beforeContent && afterContent) status = "added";
    else if (beforeContent && !afterContent) status = "deleted";
    else if (beforeContent !== afterContent) status = "modified";

    diffs.push({ path: file, before: beforeContent, after: afterContent, status });
  }

  return { commitId, parentId: commit.parent, diffs };
}
