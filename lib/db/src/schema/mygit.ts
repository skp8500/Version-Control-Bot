import { pgTable, serial, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── repositories ──────────────────────────────────────────────────────────────
export const repositories = pgTable("repositories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("default"),
  repoPath: text("repo_path").notNull().unique(),
  branch: text("branch").notNull().default("main"),
  headHash: text("head_hash").notNull().default("none"),
  initializedAt: timestamp("initialized_at").defaultNow().notNull(),
});

// ── commits ───────────────────────────────────────────────────────────────────
export const commits = pgTable("commits", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  hash: text("hash").notNull(),
  message: text("message").notNull(),
  parentHash: text("parent_hash").notNull().default("none"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── commit_files ──────────────────────────────────────────────────────────────
export const commitFiles = pgTable("commit_files", {
  id: serial("id").primaryKey(),
  commitId: integer("commit_id").notNull().references(() => commits.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull().default(""),
  status: text("status").notNull().default("added"), // added | modified | deleted
});

// ── working_files ─────────────────────────────────────────────────────────────
export const workingFiles = pgTable("working_files", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── staged_files ──────────────────────────────────────────────────────────────
export const stagedFiles = pgTable("staged_files", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
});

// ── terminal_history ──────────────────────────────────────────────────────────
export const terminalHistory = pgTable("terminal_history", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").references(() => repositories.id, { onDelete: "set null" }),
  command: text("command").notNull(),
  output: text("output").notNull().default(""),
  success: boolean("success").notNull().default(true),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
});

// ── ai_messages ───────────────────────────────────────────────────────────────
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").references(() => repositories.id, { onDelete: "set null" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── relations ─────────────────────────────────────────────────────────────────
export const repositoriesRelations = relations(repositories, ({ many }) => ({
  commits: many(commits),
  workingFiles: many(workingFiles),
  stagedFiles: many(stagedFiles),
  terminalHistory: many(terminalHistory),
  aiMessages: many(aiMessages),
}));

export const commitsRelations = relations(commits, ({ one, many }) => ({
  repo: one(repositories, { fields: [commits.repoId], references: [repositories.id] }),
  files: many(commitFiles),
}));

export const commitFilesRelations = relations(commitFiles, ({ one }) => ({
  commit: one(commits, { fields: [commitFiles.commitId], references: [commits.id] }),
}));
