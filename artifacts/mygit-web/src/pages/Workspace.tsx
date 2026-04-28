import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import {
  Loader2,
  FileCode,
  CheckCircle2,
  GitCommit,
  GitBranch,
  TerminalSquare,
  Save,
  History,
  Plus,
  Bot,
  X,
  Send,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRepoStatus,
  useInitRepo,
  useListFiles,
  useGetFile,
  useSaveFile,
  useAddFile,
  useCreateCommit,
  useGetLog,
  useCheckoutCommit,
  useGetCommitDiff,
  getGetFileQueryKey,
  getGetRepoStatusQueryKey,
  getListFilesQueryKey,
  getGetLogQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function apiGet(path: string) {
  const r = await fetch(`${BASE}${path}`);
  return r.json();
}

export default function Workspace() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading: isStatusLoading } = useGetRepoStatus();
  const { data: filesData } = useListFiles();
  const { data: logData } = useGetLog();

  const initRepoMutation = useInitRepo();
  const saveFileMutation = useSaveFile();
  const addFileMutation = useAddFile();
  const createCommitMutation = useCreateCommit();
  const checkoutCommitMutation = useCheckoutCommit();

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeCommit, setActiveCommit] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState<string>("");
  const [commitMessage, setCommitMessage] = useState("");

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLines, setTerminalLines] = useState<
    { id: number; type: "cmd" | "out" | "err"; text: string }[]
  >([{ id: 0, type: "out", text: "mygit terminal ready. Type 'help' to get started." }]);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);

  // AI Bot state
  const [botOpen, setBotOpen] = useState(false);
  const [botMessages, setBotMessages] = useState<
    { role: "user" | "assistant"; content: string; id: number }[]
  >([]);
  const [botInput, setBotInput] = useState("");
  const [botLoading, setBotLoading] = useState(false);
  const botEndRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(1);

  const { data: fileContentData, isLoading: isFileLoading } = useGetFile(
    { path: activeFile ?? "" },
    {
      query: {
        enabled: !!activeFile,
        queryKey: getGetFileQueryKey({ path: activeFile ?? "" }),
      },
    },
  );

  useEffect(() => {
    if (fileContentData?.content !== undefined) {
      setEditorContent(fileContentData.content);
    } else {
      setEditorContent("");
    }
  }, [fileContentData, activeFile]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLines]);

  useEffect(() => {
    botEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [botMessages]);

  // Load bot history on mount
  useEffect(() => {
    apiGet("/api/bot/history")
      .then((data) => {
        if (data.messages?.length) {
          setBotMessages(
            data.messages.map(
              (m: { role: string; content: string }, i: number) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
                id: i,
              }),
            ),
          );
        }
      })
      .catch(() => {});
  }, []);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetRepoStatusQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetLogQueryKey() });
  }, [queryClient]);

  const addTerminalLines = (lines: { type: "cmd" | "out" | "err"; text: string }[]) => {
    setTerminalLines((prev) => [
      ...prev,
      ...lines.map((l) => ({ ...l, id: lineIdRef.current++ })),
    ]);
  };

  const runTerminalCommand = async (cmd: string) => {
    if (!cmd.trim()) return;
    setCmdHistory((h) => [cmd, ...h.slice(0, 49)]);
    setHistIdx(-1);
    addTerminalLines([{ type: "cmd", text: `$ ${cmd}` }]);
    setTerminalRunning(true);

    try {
      const data = await apiPost("/api/terminal", { command: cmd });
      if (data.output === "__CLEAR__") {
        setTerminalLines([]);
      } else {
        const lines = (data.output as string).split("\n").map((l: string) => ({
          type: data.success ? ("out" as const) : ("err" as const),
          text: l,
        }));
        addTerminalLines(lines);
      }
      // Refresh repo state after any command
      invalidateAll();
    } catch {
      addTerminalLines([{ type: "err", text: "Network error — could not reach API." }]);
    } finally {
      setTerminalRunning(false);
      setTerminalInput("");
    }
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      runTerminalCommand(terminalInput);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(next);
      setTerminalInput(cmdHistory[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(histIdx - 1, -1);
      setHistIdx(next);
      setTerminalInput(next === -1 ? "" : (cmdHistory[next] ?? ""));
    }
  };

  const sendBotMessage = async () => {
    if (!botInput.trim() || botLoading) return;
    const userMsg = botInput.trim();
    setBotInput("");
    setBotMessages((m) => [...m, { role: "user", content: userMsg, id: lineIdRef.current++ }]);
    setBotLoading(true);
    try {
      const data = await apiPost("/api/bot/chat", { message: userMsg });
      setBotMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? data.error ?? "No response.", id: lineIdRef.current++ },
      ]);
    } catch {
      setBotMessages((m) => [
        ...m,
        { role: "assistant", content: "Could not reach the AI bot.", id: lineIdRef.current++ },
      ]);
    } finally {
      setBotLoading(false);
    }
  };

  // ── init mutation helpers ─────────────────────────────────────────────────
  const handleInit = () => {
    initRepoMutation.mutate(undefined, {
      onSuccess: () => {
        invalidateAll();
        toast({ title: "Repository initialized" });
      },
    });
  };

  const handleSaveFile = () => {
    if (!activeFile) return;
    saveFileMutation.mutate(
      { data: { path: activeFile, content: editorContent } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFileQueryKey({ path: activeFile }) });
          toast({ title: "Saved", description: activeFile });
        },
      },
    );
  };

  const handleStageFile = (filename: string) => {
    addFileMutation.mutate(
      { data: { filename } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRepoStatusQueryKey() });
          toast({ title: "Staged", description: filename });
        },
      },
    );
  };

  const handleCommit = () => {
    if (!commitMessage.trim()) return;
    createCommitMutation.mutate(
      { data: { message: commitMessage } },
      {
        onSuccess: () => {
          setCommitMessage("");
          invalidateAll();
          toast({ title: "Committed" });
        },
        onError: (err: unknown) => {
          toast({
            title: "Commit failed",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleCheckout = (commitId: string) => {
    checkoutCommitMutation.mutate(
      { data: { commitId } },
      {
        onSuccess: () => {
          invalidateAll();
          toast({ title: `Checked out ${commitId.substring(0, 8)}` });
        },
      },
    );
  };

  if (isStatusLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status?.initialized) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background text-foreground">
        <TerminalSquare className="h-14 w-14 mb-4 text-primary" />
        <h1 className="text-2xl font-bold mb-1 font-mono">Not a mygit repository</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Initialize a new repository to get started.
        </p>
        <div className="flex gap-3">
          <Button onClick={handleInit} size="lg" disabled={initRepoMutation.isPending}>
            {initRepoMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            mygit init
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setBotOpen(true)}
          >
            <Bot className="h-4 w-4 mr-2" />
            Ask AI Bot
          </Button>
        </div>
        {botOpen && (
          <BotPanel
            messages={botMessages}
            input={botInput}
            setInput={setBotInput}
            onSend={sendBotMessage}
            loading={botLoading}
            onClose={() => setBotOpen(false)}
            endRef={botEndRef}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      {/* ── Left Sidebar ───────────────────────────────────────────────────── */}
      <div className="w-56 border-r border-border flex flex-col flex-shrink-0 bg-card">
        <div className="p-3 border-b border-border">
          <div className="flex items-center space-x-1.5 font-mono text-sm">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-primary">{status.branch}</span>
          </div>
          <div className="flex items-center space-x-1.5 mt-1 font-mono text-[11px] text-muted-foreground">
            <GitCommit className="h-3 w-3" />
            <span>
              {status.head === "none" ? "no commits" : status.head.substring(0, 8)}
            </span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {/* Staged */}
          <div className="px-3 pt-3">
            <SectionHeader label="Staged" count={status.staged.length} />
            {status.staged.length === 0 ? (
              <EmptyNote text="Nothing staged" />
            ) : (
              <ul className="space-y-0.5 mt-1">
                {status.staged.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-[11px] text-green-400 px-1">
                    <CheckCircle2 className="h-2.5 w-2.5 flex-shrink-0" />
                    <span className="font-mono truncate">{f}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Working Tree */}
          <div className="px-3 pt-3">
            <SectionHeader label="Working Tree" count={filesData?.files.length ?? 0} />
            {(filesData?.files.length ?? 0) === 0 ? (
              <EmptyNote text="No files" />
            ) : (
              <ul className="space-y-0.5 mt-1">
                {filesData?.files.map((file) => {
                  const isStaged = status.staged.includes(file.path);
                  return (
                    <li
                      key={file.path}
                      data-testid={`file-item-${file.path}`}
                      className={`group flex items-center justify-between px-1.5 py-1 rounded cursor-pointer ${
                        activeFile === file.path
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/60 text-foreground"
                      }`}
                      onClick={() => { setActiveFile(file.path); setActiveCommit(null); }}
                    >
                      <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                        <FileCode className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="font-mono text-[11px] truncate">{file.path}</span>
                      </div>
                      {!isStaged && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:text-primary"
                          onClick={(e) => { e.stopPropagation(); handleStageFile(file.path); }}
                          data-testid={`button-stage-${file.path}`}
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* History */}
          <div className="px-3 pt-3 pb-3">
            <SectionHeader label="History" icon={<History className="h-3 w-3" />} count={logData?.commits.length ?? 0} />
            {(logData?.commits.length ?? 0) === 0 ? (
              <EmptyNote text="No commits yet" />
            ) : (
              <ul className="space-y-2 mt-1">
                {logData?.commits.map((commit) => (
                  <li
                    key={commit.hash}
                    data-testid={`commit-item-${commit.hash}`}
                    className={`text-[11px] p-2 rounded border cursor-pointer ${
                      activeCommit === commit.hash
                        ? "bg-muted border-primary/40"
                        : "border-transparent hover:border-border hover:bg-muted/40"
                    }`}
                    onClick={() => { setActiveCommit(commit.hash); setActiveFile(null); }}
                  >
                    <div className="flex justify-between mb-0.5">
                      <span className="font-mono text-primary font-bold">{commit.hash.substring(0, 8)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(commit.timestamp), "MMM d HH:mm")}
                      </span>
                    </div>
                    <p className="truncate text-foreground/80 mb-1.5">{commit.message}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] px-2 w-full"
                      onClick={(e) => { e.stopPropagation(); handleCheckout(commit.hash); }}
                      disabled={checkoutCommitMutation.isPending}
                      data-testid={`button-checkout-${commit.hash}`}
                    >
                      Checkout
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Main Area ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-9 border-b border-border flex items-center justify-between px-3 bg-card/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant={terminalOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-[11px] px-2 gap-1"
              onClick={() => setTerminalOpen((o) => !o)}
            >
              <TerminalSquare className="h-3 w-3" />
              Terminal
            </Button>
          </div>
          <Button
            variant={botOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-[11px] px-2 gap-1"
            onClick={() => setBotOpen((o) => !o)}
          >
            <Bot className="h-3 w-3" />
            AI Bot
          </Button>
        </div>

        {/* Content area + terminal below */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor / Commit / Diff */}
          <div className={`flex-1 overflow-hidden flex ${botOpen ? "pr-80" : ""}`}>
            {activeFile ? (
              <FileEditor
                activeFile={activeFile}
                editorContent={editorContent}
                setEditorContent={setEditorContent}
                isFileLoading={isFileLoading}
                isStaged={status.staged.includes(activeFile)}
                onSave={handleSaveFile}
                onStage={() => handleStageFile(activeFile)}
                saveIsPending={saveFileMutation.isPending}
                stageIsPending={addFileMutation.isPending}
              />
            ) : activeCommit ? (
              <CommitDiffViewer commitId={activeCommit} logData={logData} />
            ) : (
              <CommitPanel
                status={status}
                commitMessage={commitMessage}
                setCommitMessage={setCommitMessage}
                handleCommit={handleCommit}
                isPending={createCommitMutation.isPending}
              />
            )}
          </div>

          {/* Terminal */}
          {terminalOpen && (
            <div className="flex-shrink-0 border-t border-border bg-[#0a0a0c] flex flex-col" style={{ height: 220 }}>
              <div className="flex items-center justify-between px-3 py-1 border-b border-border/60">
                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                  Terminal
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setTerminalLines([{ id: lineIdRef.current++, type: "out", text: "Terminal cleared." }])}
                    title="Clear"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setTerminalOpen(false)}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px]">
                {terminalLines.map((line) => (
                  <div
                    key={line.id}
                    className={
                      line.type === "cmd"
                        ? "text-primary"
                        : line.type === "err"
                          ? "text-red-400"
                          : "text-muted-foreground"
                    }
                  >
                    {line.text || "\u00a0"}
                  </div>
                ))}
                {terminalRunning && (
                  <div className="text-muted-foreground animate-pulse">...</div>
                )}
                <div ref={terminalEndRef} />
              </div>

              <div className="flex items-center gap-1 px-3 py-1.5 border-t border-border/60">
                <span className="text-primary font-mono text-[12px]">$</span>
                <input
                  ref={termInputRef}
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={handleTerminalKeyDown}
                  className="flex-1 bg-transparent font-mono text-[12px] text-foreground outline-none"
                  placeholder="mygit help"
                  autoFocus
                  disabled={terminalRunning}
                  data-testid="terminal-input"
                  spellCheck={false}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 flex-shrink-0"
                  onClick={() => runTerminalCommand(terminalInput)}
                  disabled={terminalRunning || !terminalInput.trim()}
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── AI Bot Panel (right overlay) ──────────────────────────────────── */}
      {botOpen && (
        <div className="absolute top-9 right-0 bottom-0 w-80 border-l border-border bg-card flex flex-col z-10">
          <BotPanel
            messages={botMessages}
            input={botInput}
            setInput={setBotInput}
            onSend={sendBotMessage}
            loading={botLoading}
            onClose={() => setBotOpen(false)}
            endRef={botEndRef}
          />
        </div>
      )}
    </div>
  );
}

// ── BotPanel ──────────────────────────────────────────────────────────────────
function BotPanel({
  messages,
  input,
  setInput,
  onSend,
  loading,
  onClose,
  endRef,
}: {
  messages: { role: "user" | "assistant"; content: string; id: number }[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  loading: boolean;
  onClose: () => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">mygit-bot</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        {messages.length === 0 ? (
          <div className="text-center mt-8 text-muted-foreground text-xs space-y-2 px-2">
            <Bot className="h-8 w-8 mx-auto opacity-40" />
            <p>Ask me anything about mygit.</p>
            <p className="text-[10px]">I can explain commands, spot mistakes, and guide you step by step.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`text-xs rounded-lg px-3 py-2 leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary/15 text-foreground ml-4"
                    : "bg-muted text-foreground mr-4"
                }`}
              >
                <span className="block text-[10px] text-muted-foreground mb-1 font-mono uppercase tracking-wider">
                  {msg.role === "user" ? "you" : "mygit-bot"}
                </span>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
            {loading && (
              <div className="bg-muted text-muted-foreground text-xs rounded-lg px-3 py-2 mr-4 animate-pulse">
                Thinking...
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border p-2 flex gap-1 flex-shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs font-sans resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px] max-h-[100px]"
          placeholder="What does mygit add do? Why did my commit fail?"
          data-testid="bot-input"
        />
        <Button
          variant="default"
          size="icon"
          className="h-8 w-8 flex-shrink-0 self-end"
          onClick={onSend}
          disabled={loading || !input.trim()}
          data-testid="button-bot-send"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        </Button>
      </div>
    </>
  );
}

// ── FileEditor ────────────────────────────────────────────────────────────────
function FileEditor({
  activeFile,
  editorContent,
  setEditorContent,
  isFileLoading,
  isStaged,
  onSave,
  onStage,
  saveIsPending,
  stageIsPending,
}: {
  activeFile: string;
  editorContent: string;
  setEditorContent: (v: string) => void;
  isFileLoading: boolean;
  isStaged: boolean;
  onSave: () => void;
  onStage: () => void;
  saveIsPending: boolean;
  stageIsPending: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col h-full w-full">
      <div className="h-9 border-b border-border flex items-center justify-between px-3 bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-xs font-medium">{activeFile}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={onStage}
            disabled={stageIsPending || isStaged}
          >
            {isStaged ? "Staged" : "Stage"}
          </Button>
          <Button
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={onSave}
            disabled={saveIsPending}
          >
            {saveIsPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Save
          </Button>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {isFileLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            className="absolute inset-0 w-full h-full bg-background text-foreground font-mono text-xs p-4 resize-none focus:outline-none border-none"
            spellCheck={false}
            data-testid="editor-textarea"
          />
        )}
      </div>
    </div>
  );
}

// ── CommitPanel ───────────────────────────────────────────────────────────────
function CommitPanel({
  status,
  commitMessage,
  setCommitMessage,
  handleCommit,
  isPending,
}: {
  status: { staged: string[]; head: string; branch: string; initialized: boolean; files: string[] };
  commitMessage: string;
  setCommitMessage: (v: string) => void;
  handleCommit: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="h-9 border-b border-border flex items-center px-3 bg-card/50 flex-shrink-0">
        <GitCommit className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">Commit</span>
      </div>
      <div className="flex-1 p-5 flex flex-col max-w-xl mx-auto w-full">
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-widest">
              Staged ({status.staged.length})
            </p>
            <div className="bg-background border border-border rounded p-2 max-h-28 overflow-y-auto">
              {status.staged.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">
                  No files staged. Click + on a file to stage it.
                </span>
              ) : (
                <ul className="space-y-1">
                  {status.staged.map((f) => (
                    <li key={f} className="text-xs font-mono text-green-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <Textarea
            placeholder="Commit message..."
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            className="min-h-[90px] font-sans text-sm resize-none"
            data-testid="input-commit-message"
          />
          <Button
            className="w-full"
            onClick={handleCommit}
            disabled={isPending || status.staged.length === 0 || !commitMessage.trim()}
            data-testid="button-commit"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Commit Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── CommitDiffViewer ──────────────────────────────────────────────────────────
function CommitDiffViewer({
  commitId,
  logData,
}: {
  commitId: string;
  logData?: { commits: { hash: string; message: string; timestamp: string; parent: string; files: string[] }[]; head: string };
}) {
  const { data: diff, isLoading } = useGetCommitDiff(commitId);
  const commit = logData?.commits.find((c) => c.hash === commitId);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!diff) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Failed to load diff</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-border bg-card/50 flex-shrink-0">
        <p className="text-sm font-bold">{commit?.message ?? "Commit Details"}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono text-muted-foreground">
          <span className="text-primary font-bold">{commitId.substring(0, 8)}</span>
          <span>·</span>
          <span>{commit ? format(new Date(commit.timestamp), "MMM d, yyyy HH:mm") : ""}</span>
          <span>·</span>
          <span>{diff.diffs.length} file(s)</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {diff.diffs.map((fileDiff, idx) => (
            <div key={idx} className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted px-3 py-1.5 border-b border-border flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">{fileDiff.path}</span>
                <span
                  className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                    fileDiff.status === "added"
                      ? "bg-green-500/20 text-green-400"
                      : fileDiff.status === "deleted"
                        ? "bg-red-500/20 text-red-400"
                        : fileDiff.status === "modified"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-muted-foreground/20 text-muted-foreground"
                  }`}
                >
                  {fileDiff.status}
                </span>
              </div>
              <div className="font-mono text-[11px] bg-[#0d0d0f]">
                {fileDiff.before !== fileDiff.after ? (
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <div className="p-3">
                      <div className="text-muted-foreground mb-1 text-[10px] uppercase">Before</div>
                      <pre className="text-red-400/80 whitespace-pre-wrap break-all">{fileDiff.before || "(empty)"}</pre>
                    </div>
                    <div className="p-3">
                      <div className="text-muted-foreground mb-1 text-[10px] uppercase">After</div>
                      <pre className="text-green-400/80 whitespace-pre-wrap break-all">{fileDiff.after || "(empty)"}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="p-3">
                    <pre className="text-muted-foreground whitespace-pre-wrap break-all">{fileDiff.after}</pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionHeader({
  label,
  count,
  icon,
}: {
  label: string;
  count?: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-0.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        {icon}
        <span>{label}</span>
      </div>
      {count !== undefined && (
        <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1 rounded">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-[11px] text-muted-foreground italic pl-1 mt-0.5">{text}</p>;
}
