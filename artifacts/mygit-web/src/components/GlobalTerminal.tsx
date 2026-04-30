import { useState, useEffect, useRef, useCallback } from "react";
import { TerminalSquare, X, Minus, ChevronUp } from "lucide-react";
import { API_BASE } from "@/lib/api";

type LineType = "cmd" | "out" | "err" | "info";

interface Line {
  id: number;
  type: LineType;
  text: string;
}

let lineId = 0;
function nextId() { return ++lineId; }

const WELCOME: Line[] = [
  { id: nextId(), type: "info", text: "mygit terminal  —  type /help to see all commands" },
  { id: nextId(), type: "info", text: "─".repeat(52) },
];

export default function GlobalTerminal() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [lines, setLines] = useState<Line[]>(WELCOME);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Ctrl+` toggles terminal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setOpen((o) => !o);
        setMinimized(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  // Focus input when opened
  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, minimized]);

  const addLines = useCallback((newLines: { type: LineType; text: string }[]) => {
    setLines((prev) => [...prev, ...newLines.map((l) => ({ ...l, id: nextId() }))]);
  }, []);

  const run = useCallback(async (cmd: string) => {
    if (!cmd.trim()) return;
    if (running) return;

    setHistory((h) => [cmd, ...h.slice(0, 99)]);
    setHistIdx(-1);
    setInput("");

    if (cmd.trim() === "clear" || cmd.trim() === "/clear") {
      setLines(WELCOME);
      return;
    }

    addLines([{ type: "cmd", text: `$ ${cmd}` }]);
    setRunning(true);

    try {
      const res = await fetch(`${API_BASE}/api/terminal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = (await res.json()) as { output: string; success: boolean };

      if (data.output === "__CLEAR__") {
        setLines(WELCOME);
      } else {
        const outLines = data.output.split("\n").map((text) => ({
          type: (data.success ? "out" : "err") as LineType,
          text,
        }));
        addLines(outLines);
      }
    } catch {
      addLines([{ type: "err", text: "Network error — could not reach API server." }]);
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [running, addLines]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      run(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      setInput(history[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx - 1;
      setHistIdx(next);
      setInput(next < 0 ? "" : (history[next] ?? ""));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const lineColor = (type: LineType) => {
    switch (type) {
      case "cmd":  return "text-blue-400 font-semibold";
      case "err":  return "text-red-400";
      case "info": return "text-zinc-500";
      default:     return "text-green-300";
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => { setOpen((o) => !o); setMinimized(false); }}
        title="Toggle terminal (Ctrl+`)"
        className={`
          fixed bottom-5 right-5 z-50
          flex items-center gap-2 px-3 py-2
          rounded-lg border shadow-lg text-sm font-mono
          transition-all duration-200
          ${open
            ? "bg-zinc-800 border-zinc-600 text-green-400 hover:bg-zinc-700"
            : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-green-500 hover:text-green-400"
          }
        `}
      >
        <TerminalSquare className="h-4 w-4" />
        <span className="hidden sm:inline">Terminal</span>
        {!open && <ChevronUp className="h-3 w-3 opacity-60" />}
      </button>

      {/* Terminal panel */}
      {open && (
        <div
          className={`
            fixed bottom-16 right-5 z-50
            w-[min(680px,calc(100vw-2.5rem))]
            flex flex-col
            rounded-xl border border-zinc-700 shadow-2xl
            bg-zinc-950 font-mono text-sm
            transition-all duration-200
            ${minimized ? "h-10" : "h-[min(420px,60vh)]"}
          `}
        >
          {/* Title bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0 rounded-t-xl bg-zinc-900">
            <div className="flex items-center gap-2 text-zinc-400">
              <TerminalSquare className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-zinc-400">mygit terminal</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimized((m) => !m)}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors"
                title={minimized ? "Restore" : "Minimize"}
              >
                <Minus className="h-3 w-3" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors"
                title="Close"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Output area */}
          {!minimized && (
            <>
              <div
                className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 cursor-text"
                onClick={() => inputRef.current?.focus()}
              >
                {lines.map((line) => (
                  <div key={line.id} className={`leading-5 whitespace-pre-wrap break-all ${lineColor(line.type)}`}>
                    {line.text}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input row */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800 shrink-0 rounded-b-xl">
                <span className="text-green-500 shrink-0 select-none">
                  {running ? <span className="animate-pulse">…</span> : "$"}
                </span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={running}
                  placeholder={running ? "running…" : "mygit help  /  mygit status  /  mygit log"}
                  spellCheck={false}
                  autoComplete="off"
                  className="
                    flex-1 bg-transparent outline-none border-none
                    text-zinc-100 placeholder:text-zinc-600
                    disabled:opacity-50 caret-green-400
                  "
                />
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
