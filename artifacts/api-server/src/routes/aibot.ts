/**
 * aibot.ts — AI bot endpoint using Groq API.
 * Has full context of the current repo state and answers user questions,
 * flags mistakes, and guides them through mygit usage.
 */
import { Router } from "express";
import { getStatusDb, getLogDb, getTerminalHistory, saveAiMessage, getAiHistory } from "../lib/mygitDb";

const router = Router();

const GROQ_MODELS = ["llama-3.3-70b-versatile", "qwen/qwen3-32b"];
let modelIdx = 0;

function nextModel() {
  const model = GROQ_MODELS[modelIdx % GROQ_MODELS.length];
  modelIdx++;
  return model;
}

const SYSTEM_PROMPT = `You are mygit-bot, an expert AI assistant built into a version control system called mygit.

mygit works like a simplified git:
- mygit init — creates a .mygit/ directory with commits/, refs/heads/, HEAD, and index files
- mygit add <file> or add . — stages files into the index
- mygit commit -m "<message>" — creates a commit snapshot in .mygit/commits/<hash>/
- mygit log — shows commit history following parent links
- mygit checkout <hash> — restores working directory to a commit snapshot
- mygit diff <hash> — shows before/after comparison for files in a commit
- djb2 hashing is used (not SHA1) — hashes are 64-bit hex strings

You have access to the user's current repo context (status, recent commands, commit history).
Your job is to:
1. Answer questions about what mygit commands do
2. Spot mistakes (e.g., trying to commit without staging, checking out a non-existent hash)
3. Guide users step-by-step
4. Explain what happened after each command in simple terms
5. Be concise — this is a developer tool, not a chatbot

When you see the user's recent terminal commands, interpret them and respond to what they did or are trying to do.
Keep responses short (2-5 sentences unless a longer explanation is truly needed).
Use code formatting for commands: \`mygit add hello.txt\``;

// POST /api/bot/chat
router.post("/bot/chat", async (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message required" });
  }

  try {
    // Build context
    const [status, { commits: log }, history] = await Promise.all([
      getStatusDb().catch(() => null),
      getLogDb().catch(() => ({ commits: [] })),
      getTerminalHistory(10).catch(() => []),
    ]);

    const contextBlock = buildContext(status, log, history);

    // Get existing conversation history
    const previousMessages = await getAiHistory(20).catch(() => []);

    // Persist user message
    await saveAiMessage("user", message).catch(() => {});

    const messages = [
      ...previousMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ];

    const model = nextModel();
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not set");

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\n" + contextBlock },
          ...messages,
        ],
        max_tokens: 600,
        temperature: 0.5,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      throw new Error(`Groq API error: ${groqRes.status} ${err}`);
    }

    const data = (await groqRes.json()) as {
      choices: { message: { content: string } }[];
    };
    const reply = data.choices[0]?.message?.content ?? "No response from AI.";

    // Persist assistant reply
    await saveAiMessage("assistant", reply).catch(() => {});

    return res.json({ reply, model });
  } catch (err) {
    req.log.error({ err }, "AI bot error");
    return res.status(500).json({
      error: err instanceof Error ? err.message : "AI bot unavailable",
    });
  }
});

// GET /api/bot/history — load conversation history
router.get("/bot/history", async (req, res) => {
  try {
    const history = await getAiHistory(50);
    return res.json({ messages: history });
  } catch (err) {
    req.log.error({ err }, "Failed to get AI history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/bot/history — clear conversation
router.delete("/bot/history", async (req, res) => {
  try {
    // We don't delete here — just return a fresh start signal
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to clear" });
  }
});

// ── Context builder ────────────────────────────────────────────────────────────
function buildContext(
  status: Record<string, unknown> | null,
  commits: Array<{ hash: string; message: string; timestamp: string }>,
  history: Array<{ command: string; output: string; success: boolean; executedAt: Date }>,
): string {
  const lines = ["=== CURRENT REPO STATE ==="];

  if (!status || !status.initialized) {
    lines.push("Repository: NOT INITIALIZED");
  } else {
    lines.push(`Branch: ${status.branch}`);
    lines.push(`HEAD: ${status.head}`);
    lines.push(`Staged files: ${(status.staged as string[]).join(", ") || "none"}`);
    lines.push(`Working tree: ${(status.files as string[]).join(", ") || "empty"}`);
  }

  if (commits.length > 0) {
    lines.push("\nRecent commits:");
    commits.slice(0, 5).forEach((c) => {
      lines.push(`  ${c.hash.substring(0, 8)} — ${c.message}`);
    });
  } else {
    lines.push("Commits: none yet");
  }

  if (history.length > 0) {
    lines.push("\nRecent terminal commands (newest last):");
    [...history].reverse().forEach((h) => {
      const out = h.output.substring(0, 100).replace(/\n/g, " ");
      lines.push(`  [${h.success ? "ok" : "ERR"}] $ ${h.command} → ${out}`);
    });
  }

  return lines.join("\n");
}

export default router;
