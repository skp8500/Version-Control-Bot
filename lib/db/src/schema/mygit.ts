import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── users ─────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── repositories ──────────────────────────────────────────────────────────────
export const repositories = pgTable("repositories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull().default("default"),
  description: text("description").notNull().default(""),
  repoPath: text("repo_path").notNull().unique(),
  branch: text("branch").notNull().default("main"),
  headHash: text("head_hash").notNull().default("none"),
  isPublic: boolean("is_public").notNull().default(true),
  language: text("language").notNull().default(""),
  framework: text("framework").notNull().default(""),
  initializedAt: timestamp("initialized_at").defaultNow().notNull(),
});

// ── commits ───────────────────────────────────────────────────────────────────
export const commits = pgTable("commits", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  hash: text("hash").notNull(),
  message: text("message").notNull(),
  parentHash: text("parent_hash").notNull().default("none"),
  author: text("author").notNull().default("anonymous"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── commit_files ──────────────────────────────────────────────────────────────
export const commitFiles = pgTable("commit_files", {
  id: serial("id").primaryKey(),
  commitId: integer("commit_id")
    .notNull()
    .references(() => commits.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull().default(""),
  status: text("status").notNull().default("added"),
});

// ── working_files ─────────────────────────────────────────────────────────────
export const workingFiles = pgTable("working_files", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── staged_files ──────────────────────────────────────────────────────────────
export const stagedFiles = pgTable("staged_files", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
});

// ── conflicts ─────────────────────────────────────────────────────────────────
export const conflicts = pgTable("conflicts", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  baseContent: text("base_content").notNull().default(""),
  ours: text("ours").notNull().default(""),
  theirs: text("theirs").notNull().default(""),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── terminal_history ──────────────────────────────────────────────────────────
export const terminalHistory = pgTable("terminal_history", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").references(() => repositories.id, {
    onDelete: "set null",
  }),
  command: text("command").notNull(),
  output: text("output").notNull().default(""),
  success: boolean("success").notNull().default(true),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
});

// ── ai_messages ───────────────────────────────────────────────────────────────
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").references(() => repositories.id, {
    onDelete: "set null",
  }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── relations ─────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  repositories: many(repositories),
}));

export const repositoriesRelations = relations(
  repositories,
  ({ one, many }) => ({
    user: one(users, {
      fields: [repositories.userId],
      references: [users.id],
    }),
    commits: many(commits),
    workingFiles: many(workingFiles),
    stagedFiles: many(stagedFiles),
    conflicts: many(conflicts),
    terminalHistory: many(terminalHistory),
    aiMessages: many(aiMessages),
  }),
);

export const commitsRelations = relations(commits, ({ one, many }) => ({
  repo: one(repositories, {
    fields: [commits.repoId],
    references: [repositories.id],
  }),
  files: many(commitFiles),
}));

export const commitFilesRelations = relations(commitFiles, ({ one }) => ({
  commit: one(commits, {
    fields: [commitFiles.commitId],
    references: [commits.id],
  }),
}));
