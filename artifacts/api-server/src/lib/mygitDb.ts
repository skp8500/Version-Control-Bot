/**
 * mygitDb.ts — DB-backed layer on top of mygitFs.
 * All mygit operations now persist to PostgreSQL (via Drizzle) in addition
 * to the filesystem so the full history is queryable.
 */
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  repositories,
  commits,
  commitFiles,
  workingFiles,
  stagedFiles,
  terminalHistory,
  aiMessages,
} from "@workspace/db/schema";
import {
  initRepo as fsInitRepo,
  isInitialized as fsIsInitialized,
  readHead,
  readBranch,
  readIndex,
  stageFile as fsStageFile,
  listWorkingFiles,
  readWorkingFile,
  writeWorkingFile as fsWriteWorkingFile,
  createCommit as fsCreateCommit,
  getLog as fsGetLog,
  checkoutCommit as fsCheckoutCommit,
  getCommitDiff,
  REPO_ROOT,
  djb2Hash,
} from "./mygitFs";

// ── Repo helpers ──────────────────────────────────────────────────────────────

async function ensureRepo() {
  const existing = await db
    .select()
    .from(repositories)
    .where(eq(repositories.repoPath, REPO_ROOT))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [repo] = await db
    .insert(repositories)
    .values({ name: "default", repoPath: REPO_ROOT, branch: "main", headHash: "none" })
    .returning();
  return repo;
}

async function getRepo() {
  const rows = await db
    .select()
    .from(repositories)
    .where(eq(repositories.repoPath, REPO_ROOT))
    .limit(1);
  return rows[0] ?? null;
}

async function syncRepoHead() {
  const [head, branch] = await Promise.all([readHead(), readBranch()]);
  const repo = await getRepo();
  if (repo) {
    await db
      .update(repositories)
      .set({ headHash: head, branch })
      .where(eq(repositories.id, repo.id));
  }
  return { head, branch };
}

// ── Init ─────────────────────────────────────────────────────────────────────
export async function initRepoDb(): Promise<void> {
  await fsInitRepo();
  await ensureRepo();
}

export async function isInitializedDb(): Promise<boolean> {
  return fsIsInitialized();
}

// ── Status ────────────────────────────────────────────────────────────────────
export async function getStatusDb() {
  const initialized = await fsIsInitialized();
  if (!initialized) {
    return { initialized: false, head: "none", branch: "main", staged: [], files: [] };
  }
  const [head, branch, staged, files] = await Promise.all([
    readHead(),
    readBranch(),
    readIndex(),
    listWorkingFiles(),
  ]);
  return { initialized, head, branch, staged, files };
}

// ── Working files ─────────────────────────────────────────────────────────────
export async function listFilesDb() {
  const filenames = await listWorkingFiles();
  const files = await Promise.all(
    filenames.map(async (name) => {
      const content = await readWorkingFile(name).catch(() => "");
      return { path: name, content, size: Buffer.byteLength(content, "utf-8") };
    }),
  );
  return files;
}

export async function getFileDb(filePath: string) {
  return readWorkingFile(filePath);
}

export async function saveFileDb(filePath: string, content: string): Promise<void> {
  await fsWriteWorkingFile(filePath, content);

  // Sync to DB for queryability
  const repo = await getRepo();
  if (repo) {
    const existing = await db
      .select()
      .from(workingFiles)
      .where(and(eq(workingFiles.repoId, repo.id), eq(workingFiles.path, filePath)))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(workingFiles)
        .set({ content, updatedAt: new Date() })
        .where(eq(workingFiles.id, existing[0].id));
    } else {
      await db.insert(workingFiles).values({ repoId: repo.id, path: filePath, content });
    }
  }
}

// ── Staging ───────────────────────────────────────────────────────────────────
export async function stageFileDb(filename: string): Promise<void> {
  await fsStageFile(filename);

  const repo = await getRepo();
  if (repo) {
    const existing = await db
      .select()
      .from(stagedFiles)
      .where(and(eq(stagedFiles.repoId, repo.id), eq(stagedFiles.path, filename)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(stagedFiles).values({ repoId: repo.id, path: filename });
    }
  }
}

// ── Commit ────────────────────────────────────────────────────────────────────
export async function createCommitDb(message: string): Promise<string> {
  const staged = await readIndex();
  if (staged.length === 0) throw new Error("Nothing staged to commit.");

  const commitHash = await fsCreateCommit(message);

  const repo = await ensureRepo();
  const parentHash = (await readHead()) ?? "none";

  // Persist commit
  const [commitRow] = await db
    .insert(commits)
    .values({ repoId: repo.id, hash: commitHash, message, parentHash })
    .returning();

  // Persist each committed file snapshot
  for (const path of staged) {
    const content = await readWorkingFile(path).catch(() => "");
    await db.insert(commitFiles).values({
      commitId: commitRow.id,
      path,
      content,
      status: "added",
    });
  }

  // Clear staged files in DB
  await db.delete(stagedFiles).where(eq(stagedFiles.repoId, repo.id));

  // Update HEAD
  await syncRepoHead();

  return commitHash;
}

// ── Log ───────────────────────────────────────────────────────────────────────
export async function getLogDb() {
  // Primary source: filesystem (canonical); DB is secondary
  const commits_ = await fsGetLog();
  const head = await readHead();
  return { commits: commits_, head };
}

// ── Checkout ─────────────────────────────────────────────────────────────────
export async function checkoutCommitDb(commitId: string): Promise<void> {
  await fsCheckoutCommit(commitId);
  await syncRepoHead();
}

// ── Diff ─────────────────────────────────────────────────────────────────────
export { getCommitDiff };

// ── Terminal history ──────────────────────────────────────────────────────────
export async function logTerminalCommand(
  command: string,
  output: string,
  success: boolean,
): Promise<void> {
  const repo = await getRepo();
  await db.insert(terminalHistory).values({
    repoId: repo?.id ?? null,
    command,
    output,
    success,
  });
}

export async function getTerminalHistory(limit = 50) {
  const repo = await getRepo();
  if (!repo) return [];
  return db
    .select()
    .from(terminalHistory)
    .where(eq(terminalHistory.repoId, repo.id))
    .orderBy(desc(terminalHistory.executedAt))
    .limit(limit);
}

// ── AI messages ───────────────────────────────────────────────────────────────
export async function saveAiMessage(role: "user" | "assistant", content: string) {
  const repo = await getRepo();
  await db.insert(aiMessages).values({ repoId: repo?.id ?? null, role, content });
}

export async function getAiHistory(limit = 30) {
  const repo = await getRepo();
  if (!repo) return [];
  return db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.repoId, repo.id))
    .orderBy(aiMessages.createdAt)
    .limit(limit);
}
