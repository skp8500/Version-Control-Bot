/**
 * terminal.ts — Executes mygit commands typed in the web terminal.
 */
import { Router } from "express";
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
  mergeCommitDb,
  resetStagedDb,
  logTerminalCommand,
  getTerminalHistory,
} from "../lib/mygitDb";

const router = Router();

// POST /api/terminal — execute a command
router.post("/terminal", async (req, res) => {
  const { command } = req.body as { command?: string };
  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "command required" });
  }

  const cmd = command.trim();
  let output = "";
  let success = true;

  try {
    output = await executeCommand(cmd);
  } catch (err) {
    output = `Error: ${err instanceof Error ? err.message : String(err)}`;
    success = false;
  }

  await logTerminalCommand(cmd, output, success).catch(() => {});
  return res.json({ command: cmd, output, success });
});

// GET /api/terminal/history — past commands
router.get("/terminal/history", async (req, res) => {
  try {
    const history = await getTerminalHistory(100);
    return res.json({ history });
  } catch (err) {
    req.log.error({ err }, "Failed to get terminal history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Help text ─────────────────────────────────────────────────────────────────
const HELP_TEXT = `mygit — a minimal version control system

CORE COMMANDS
  mygit init               Initialize a new repository
  mygit status             Show staged files and working tree
  mygit add <file>         Stage a file for commit
  mygit add .              Stage all working files
  mygit commit -m <msg>    Create a commit with a message
  mygit log                Show full commit history
  mygit diff <hash>        Show file changes in a commit
  mygit checkout <hash>    Restore working directory to a commit
  mygit merge <hash>       Merge files from a commit into working tree
  mygit reset              Unstage all staged files
  mygit branch             Show current branch and recent commits

SHELL UTILITIES
  ls                       List all working files
  cat <file>               Print file contents
  echo <text>              Print text
  clear                    Clear the terminal
  history                  Show last 20 commands

SHORTCUTS
  /help                    Show this help
  /status                  Alias for mygit status
  /log                     Alias for mygit log
  /clear                   Clear the terminal

TIP: You can omit 'mygit ' — e.g. just type 'status' or 'log'.`;

// ── Command dispatcher ────────────────────────────────────────────────────────
async function executeCommand(cmd: string): Promise<string> {
  // Handle /slash shortcuts
  if (cmd.startsWith("/")) {
    const slashCmd = cmd.slice(1).trim();
    switch (slashCmd) {
      case "help": return HELP_TEXT;
      case "status": return executeCommand("mygit status");
      case "log": return executeCommand("mygit log");
      case "clear": return "__CLEAR__";
      default: return `Unknown slash command: ${cmd}\nType /help for available commands.`;
    }
  }

  const parts = cmd.split(/\s+/).filter(Boolean);
  const base = parts[0]?.toLowerCase() ?? "";

  // Allow "mygit <cmd>" or just "<cmd>" (bare sub-command)
  const isMygit = base === "mygit";
  const args = isMygit ? parts.slice(1) : parts;
  const sub = (args[0] ?? "").toLowerCase();

  // Shell utilities (not mygit sub-commands)
  if (!isMygit) {
    switch (base) {
      case "clear": return "__CLEAR__";
      case "ls": {
        const files = await listFilesDb();
        return files.length > 0 ? files.map((f) => f.path).join("  ") : "(no files in working tree)";
      }
      case "cat": {
        const path = parts.slice(1).join(" ").trim();
        if (!path) return "Usage: cat <file>";
        return await getFileDb(path);
      }
      case "echo": return parts.slice(1).join(" ");
      case "history": {
        const hist = await getTerminalHistory(20);
        if (hist.length === 0) return "(no history)";
        return hist
          .reverse()
          .map((h, i) => `  ${String(i + 1).padStart(3)}  ${h.command}`)
          .join("\n");
      }
      // Bare mygit sub-commands (without the 'mygit' prefix)
      case "help":
        return HELP_TEXT;
      case "init":
      case "status":
      case "add":
      case "commit":
      case "log":
      case "diff":
      case "checkout":
      case "merge":
      case "reset":
      case "branch":
        // Re-dispatch as mygit command
        return executeCommand(`mygit ${cmd}`);
      default:
        return `Unknown command: ${cmd}\nType 'help' or '/help' to see available commands.`;
    }
  }

  // mygit sub-commands
  switch (sub) {
    case "":
    case "help":
      return HELP_TEXT;

    case "init": {
      const alreadyInit = await isInitializedDb();
      if (alreadyInit) return "Already initialized: repository exists at .mygit/";
      await initRepoDb();
      return "Initialized empty mygit repository in .mygit/\nRun 'mygit status' to see the current state.";
    }

    case "status": {
      const status = await getStatusDb();
      if (!status.initialized) {
        return "fatal: not a mygit repository\nRun 'mygit init' to create one.";
      }
      const staged = status.staged;
      const files = status.files;
      const unstaged = files.filter((f) => !staged.includes(f));
      const lines = [
        `On branch ${status.branch}`,
        `HEAD: ${status.head === "none" ? "no commits yet" : status.head.slice(0, 8)}`,
        "",
      ];
      if (staged.length > 0) {
        lines.push(`Changes staged for commit (${staged.length}):`);
        staged.forEach((f) => lines.push(`  \x1b[32m+ ${f}\x1b[0m`));
        lines.push("");
      } else {
        lines.push("  (nothing staged — use 'mygit add <file>' to stage)");
        lines.push("");
      }
      if (unstaged.length > 0) {
        lines.push(`Untracked / modified files (${unstaged.length}):`);
        unstaged.forEach((f) => lines.push(`    ${f}`));
      }
      return lines.join("\n").trim();
    }

    case "add": {
      const initialized = await isInitializedDb();
      if (!initialized) return "fatal: not a mygit repository\nRun 'mygit init' first.";
      const target = args[1];
      if (!target) return "Usage: mygit add <file>\n       mygit add .";
      if (target === ".") {
        const files = await listFilesDb();
        if (files.length === 0) return "Nothing to stage — working tree is empty.";
        const results: string[] = [];
        for (const f of files) {
          await stageFileDb(f.path);
          results.push(`  staged: ${f.path}`);
        }
        return `Staged ${files.length} file(s):\n${results.join("\n")}`;
      }
      await stageFileDb(target);
      return `staged: ${target}`;
    }

    case "commit": {
      const mIdx = args.indexOf("-m");
      if (mIdx === -1 || !args[mIdx + 1]) {
        return "Usage: mygit commit -m <message>\nExample: mygit commit -m \"Initial commit\"";
      }
      const message = args.slice(mIdx + 1).join(" ").replace(/^["']|["']$/g, "");
      const hash = await createCommitDb(message);
      return `[${hash.slice(0, 8)}] ${message}\nCommit created successfully.`;
    }

    case "log": {
      const { commits: log } = await getLogDb();
      if (log.length === 0) return "No commits yet.\nMake some changes and run 'mygit commit -m <message>'.";
      return log
        .map((c) => {
          const ts = new Date(c.timestamp).toLocaleString();
          return `commit ${c.hash}\nDate:    ${ts}\n\n    ${c.message}\n`;
        })
        .join("\n");
    }

    case "diff": {
      const hash = args[1];
      if (!hash) return "Usage: mygit diff <commit-hash>\nTip: use 'mygit log' to see commit hashes.";
      const diff = await getCommitDiff(hash);
      const lines: string[] = [`diff for commit ${hash.slice(0, 8)}`, "─".repeat(48), ""];
      for (const d of diff.diffs) {
        lines.push(`  ${d.path}  (${d.status})`);
        if (d.status !== "unchanged") {
          if (d.before) lines.push(`  - ${d.before.slice(0, 200)}`);
          if (d.after)  lines.push(`  + ${d.after.slice(0, 200)}`);
        }
        lines.push("");
      }
      return lines.join("\n").trim();
    }

    case "checkout": {
      const hash = args[1];
      if (!hash) return "Usage: mygit checkout <commit-hash>\nTip: use 'mygit log' to see commit hashes.";
      await checkoutCommitDb(hash);
      return `HEAD is now at ${hash.slice(0, 8)}\nWorking tree restored to that commit.`;
    }

    case "merge": {
      const hash = args[1];
      if (!hash) return "Usage: mygit merge <commit-hash>\nTip: use 'mygit log' to see available commit hashes.";
      const result = await mergeCommitDb(hash);
      return result.message;
    }

    case "reset": {
      const flag = args[1];
      if (flag && flag !== "--soft" && flag !== "--hard" && flag !== "HEAD") {
        return `Unknown reset flag: ${flag}\nUsage: mygit reset  (unstages all staged files)`;
      }
      const count = await resetStagedDb();
      return count > 0
        ? `Unstaged ${count} file(s). Working tree unchanged.`
        : "Nothing was staged — staging area is already empty.";
    }

    case "branch": {
      const status = await getStatusDb();
      if (!status.initialized) return "fatal: not a mygit repository\nRun 'mygit init' first.";
      const { commits: log } = await getLogDb();
      const recent = log.slice(0, 3).map((c) => `  ${c.hash.slice(0, 8)}  ${c.message}`).join("\n");
      return [
        `* ${status.branch}  (HEAD → ${status.head === "none" ? "no commits" : status.head.slice(0, 8)})`,
        "",
        recent ? `Recent commits:\n${recent}` : "  (no commits yet)",
      ].join("\n");
    }

    case "stash":
      return "mygit stash: not yet implemented.\nTip: stage your files with 'mygit add .' and commit them first.";

    case "pull":
      return "mygit pull: this is a single-repo system — no remote to pull from.\nUse the web UI to upload files or collaborate.";

    case "push":
      return "mygit push: use the 'Push Commit' button in the web UI to push changes to a remote repo.";

    case "rebase":
      return "mygit rebase: not yet implemented.";

    default:
      return `mygit: '${sub}' is not a known command.\nRun 'mygit help' or type '/help' for a list of commands.`;
  }
}

export default router;
