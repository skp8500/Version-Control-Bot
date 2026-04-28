/**
 * terminal.ts — Executes mygit commands typed in the web terminal.
 * Commands are parsed server-side; the same logic as mygitDb is used.
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

// ── Command dispatcher ────────────────────────────────────────────────────────
async function executeCommand(cmd: string): Promise<string> {
  const parts = cmd.split(/\s+/).filter(Boolean);
  const base = parts[0];

  // Allow "mygit <cmd>" or just "<cmd>"
  const args = base === "mygit" ? parts.slice(1) : parts;
  const sub = args[0] ?? "";

  if (base !== "mygit" && base !== "help" && sub !== "help") {
    // Generic shell-like commands
    if (cmd === "clear") return "__CLEAR__";
    if (cmd === "ls") {
      const files = await listFilesDb();
      return files.map((f) => f.path).join("  ") || "(no files)";
    }
    if (cmd.startsWith("cat ")) {
      const path = cmd.slice(4).trim();
      return await getFileDb(path);
    }
    if (cmd.startsWith("echo ")) return cmd.slice(5);
    return `Unknown command: ${cmd}\nType 'mygit help' or 'help' to see available commands.`;
  }

  switch (sub) {
    case "":
    case "help":
      return `mygit — a minimal version control system

Commands:
  mygit init             Initialize a new repository
  mygit status           Show repository status
  mygit add <file>       Stage a file
  mygit add .            Stage all working files
  mygit commit -m <msg>  Create a commit
  mygit log              Show commit history
  mygit checkout <hash>  Restore working directory to a commit
  mygit diff <hash>      Show changes in a commit

Other:
  ls                     List working directory files
  cat <file>             Show file contents
  clear                  Clear terminal`;

    case "init": {
      const alreadyInit = await isInitializedDb();
      if (alreadyInit) return "Already initialized: repository exists at .mygit/";
      await initRepoDb();
      return "Initialized empty mygit repository in .mygit/";
    }

    case "status": {
      const status = await getStatusDb();
      if (!status.initialized) {
        return "Error: not a mygit repository. Run 'mygit init' first.";
      }
      const lines = [
        `On branch ${status.branch}`,
        `HEAD: ${status.head === "none" ? "no commits yet" : status.head}`,
        "",
        `Changes staged for commit (${status.staged.length}):`,
        ...status.staged.map((f) => `  + ${f}`),
        status.staged.length === 0 ? "  (nothing staged)" : "",
        "",
        `Working tree (${status.files.length} files):`,
        ...status.files.map((f) => `  ${status.staged.includes(f) ? "M" : " "} ${f}`),
      ];
      return lines.join("\n").trim();
    }

    case "add": {
      const target = args[1];
      if (!target) return "Usage: mygit add <file> or mygit add .";
      if (target === ".") {
        const files = await listFilesDb();
        if (files.length === 0) return "Nothing to stage.";
        const results: string[] = [];
        for (const f of files) {
          await stageFileDb(f.path);
          results.push(`staged: ${f.path}`);
        }
        return results.join("\n");
      }
      await stageFileDb(target);
      return `staged: ${target}`;
    }

    case "commit": {
      // Parse: mygit commit -m "message" or mygit commit -m message
      const mIdx = args.indexOf("-m");
      if (mIdx === -1 || !args[mIdx + 1]) {
        return "Usage: mygit commit -m <message>";
      }
      // Join remaining args after -m as the message (handles unquoted messages)
      const message = args.slice(mIdx + 1).join(" ").replace(/^["']|["']$/g, "");
      const hash = await createCommitDb(message);
      return `[${hash.substring(0, 8)}] ${message}`;
    }

    case "log": {
      const { commits: log } = await getLogDb();
      if (log.length === 0) return "No commits yet.";
      return log
        .map((c) => {
          const ts = new Date(c.timestamp).toLocaleString();
          return `commit ${c.hash}\nDate:    ${ts}\n\n    ${c.message}\n`;
        })
        .join("\n");
    }

    case "checkout": {
      const hash = args[1];
      if (!hash) return "Usage: mygit checkout <commit-hash>";
      await checkoutCommitDb(hash);
      return `HEAD is now at ${hash.substring(0, 8)}`;
    }

    case "diff": {
      const hash = args[1];
      if (!hash) return "Usage: mygit diff <commit-hash>";
      const diff = await getCommitDiff(hash);
      const lines: string[] = [`diff for commit ${hash.substring(0, 8)}`, ""];
      for (const d of diff.diffs) {
        lines.push(`--- ${d.path} (${d.status})`);
        if (d.status !== "unchanged") {
          lines.push(`-before: ${d.before.substring(0, 200) || "(empty)"}`);
          lines.push(`+after:  ${d.after.substring(0, 200) || "(empty)"}`);
        }
        lines.push("");
      }
      return lines.join("\n").trim();
    }

    default:
      return `Unknown mygit command: ${sub}\nRun 'mygit help' to see available commands.`;
  }
}

export default router;
