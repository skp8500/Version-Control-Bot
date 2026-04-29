import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  GitBranch,
  FileCode,
  GitCommit,
  Upload,
  Send,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Bot,
  GitGraph,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import AuthModal from "@/components/AuthModal";
import CommitGraph from "@/components/CommitGraph";
import ConflictResolver from "@/components/ConflictResolver";
import { useAuth } from "@/hooks/useAuth";
import { getStoredToken } from "@/hooks/useAuth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface RepoInfo {
  id: number;
  name: string;
  description: string;
  language: string;
  framework: string;
  branch: string;
  headHash: string;
  isPublic: boolean;
}

interface WorkingFile {
  path: string;
  content: string;
}

interface Conflict {
  id: number;
  filePath: string;
  baseContent: string;
  ours: string;
  theirs: string;
}

interface CommitRow {
  id: number;
  hash: string;
  message: string;
  author: string;
  createdAt: string;
}

export default function RepoView({ params }: { params: { id: string } }) {
  const repoId = Number(params.id);
  const { user, requireAuth, showModal, setShowModal, onLoginSuccess } = useAuth();
  const { toast } = useToast();

  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [files, setFiles] = useState<WorkingFile[]>([]);
  const [commits, setCommits] = useState<CommitRow[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"files" | "graph" | "conflicts">("files");
  const [activeFile, setActiveFile] = useState<WorkingFile | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editedFiles, setEditedFiles] = useState<Record<string, string>>({});
  const [commitMsg, setCommitMsg] = useState("");
  const [pushing, setPushing] = useState(false);

  // AI Bot
  const [botOpen, setBotOpen] = useState(false);
  const [botMsg, setBotMsg] = useState("");
  const [botReply, setBotReply] = useState("");
  const [botLoading, setBotLoading] = useState(false);

  useEffect(() => {
    loadRepo();
  }, [repoId]);

  const loadRepo = async () => {
    setLoading(true);
    try {
      const [repoRes, filesRes, commitsRes, conflictsRes] = await Promise.all([
        fetch(`${BASE}/api/repos/${repoId}`),
        fetch(`${BASE}/api/repos/${repoId}/files`),
        fetch(`${BASE}/api/repos/${repoId}/commits`),
        fetch(`${BASE}/api/repos/${repoId}/conflicts`),
      ]);
      const repoData = (await repoRes.json()) as { repo: RepoInfo };
      const filesData = (await filesRes.json()) as { files: WorkingFile[] };
      const commitsData = (await commitsRes.json()) as { commits: CommitRow[] };
      const conflictsData = (await conflictsRes.json()) as { conflicts: Conflict[] };

      setRepo(repoData.repo);
      setFiles(filesData.files ?? []);
      setCommits(commitsData.commits ?? []);
      setConflicts(conflictsData.conflicts ?? []);

      if (conflictsData.conflicts?.length > 0) setActiveTab("conflicts");
    } catch {
      toast({ title: "Failed to load repo", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openFile = (file: WorkingFile) => {
    setActiveFile(file);
    setEditContent(editedFiles[file.path] ?? file.content);
  };

  const markEdited = () => {
    if (!activeFile) return;
    setEditedFiles((prev) => ({ ...prev, [activeFile.path]: editContent }));
    toast({ title: "Changes staged locally", description: activeFile.path });
  };

  const handlePush = async () => {
    if (!commitMsg.trim()) { toast({ title: "Enter a commit message", variant: "destructive" }); return; }
    const changedFiles = Object.entries(editedFiles).map(([path, content]) => ({ path, content }));
    if (!changedFiles.length) { toast({ title: "No changes to push", variant: "destructive" }); return; }

    setPushing(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${BASE}/api/repos/${repoId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ message: commitMsg, files: changedFiles }),
      });
      const data = (await res.json()) as { commitId?: string; error?: string; conflicts?: Conflict[] };

      if (res.status === 409) {
        setConflicts(data.conflicts ?? []);
        setActiveTab("conflicts");
        toast({ title: "Merge conflicts detected", variant: "destructive" });
        return;
      }
      if (!res.ok) { toast({ title: data.error ?? "Push failed", variant: "destructive" }); return; }

      setEditedFiles({});
      setCommitMsg("");
      toast({ title: `Committed ${data.commitId?.substring(0, 8)}` });
      loadRepo();

      // AI explanation
      askBot(`Just pushed a commit: "${commitMsg}" with ${changedFiles.length} file(s) changed. What happened internally?`);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  const askBot = async (question: string) => {
    setBotOpen(true);
    setBotLoading(true);
    try {
      const res = await fetch(`${BASE}/api/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: `Repo: ${repo?.name}, branch: ${repo?.branch}, HEAD: ${repo?.headHash?.substring(0, 8)}`,
          prompt: question,
        }),
      });
      const data = (await res.json()) as { explanation?: string };
      setBotReply(data.explanation ?? "No response.");
    } catch {
      setBotReply("AI unavailable.");
    } finally {
      setBotLoading(false);
    }
  };

  const changedCount = Object.keys(editedFiles).length;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-muted-foreground">
        Repository not found.
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Navbar */}
      <header className="border-b border-border bg-card/50 flex-shrink-0">
        <div className="px-4 h-11 flex items-center gap-3">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <GitBranch className="h-4 w-4 text-primary" />
          <span className="font-mono font-bold text-primary">{repo.name}</span>
          {repo.language && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
              {repo.language}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {repo.branch} · {repo.headHash === "none" ? "no commits" : repo.headHash.substring(0, 8)}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setBotOpen((o) => !o)}
            >
              <Bot className="h-3.5 w-3.5" /> AI Bot
            </Button>
            {!user && (
              <Button size="sm" className="h-7 text-xs" onClick={() => setShowModal(true)}>
                Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-0 border-t border-border">
          {([
            { id: "files", icon: FileCode, label: "Files" },
            { id: "graph", icon: GitGraph, label: "Graph" },
            { id: "conflicts", icon: AlertTriangle, label: `Conflicts${conflicts.length ? ` (${conflicts.length})` : ""}` },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === "files" && (
          <>
            {/* File sidebar */}
            <div className="w-52 border-r border-border flex flex-col flex-shrink-0 bg-card">
              <div className="p-2 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Files ({files.length})
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {files.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    <FolderOpen className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    <p className="text-center">No files yet.</p>
                    {user && (
                      <p className="text-center mt-1">Upload a zip to add files.</p>
                    )}
                  </div>
                ) : (
                  files.map((f) => {
                    const isEdited = f.path in editedFiles;
                    return (
                      <button
                        key={f.path}
                        onClick={() => openFile(f)}
                        className={`w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono hover:bg-muted/60 ${
                          activeFile?.path === f.path ? "bg-muted text-primary" : "text-foreground"
                        }`}
                      >
                        <FileCode className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate">{f.path}</span>
                        {isEdited && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Push panel */}
              {user && (
                <div className="border-t border-border p-2 space-y-2">
                  <textarea
                    value={commitMsg}
                    onChange={(e) => setCommitMsg(e.target.value)}
                    placeholder="Commit message..."
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
                  />
                  <Button
                    className="w-full h-7 text-[11px] gap-1"
                    onClick={() => requireAuth(handlePush)}
                    disabled={pushing || changedCount === 0 || !commitMsg.trim()}
                  >
                    {pushing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3" />}
                    Push {changedCount > 0 ? `(${changedCount})` : ""}
                  </Button>
                </div>
              )}

              {/* Recent commits */}
              <div className="border-t border-border">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  History
                </div>
                <div className="max-h-36 overflow-y-auto">
                  {commits.slice(0, 10).map((c) => (
                    <div key={c.id} className="px-2 py-1.5 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-1.5">
                        <GitCommit className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="font-mono text-[10px] text-primary">{c.hash.substring(0, 8)}</span>
                      </div>
                      <p className="text-[10px] text-foreground/70 truncate ml-4">{c.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* File editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeFile ? (
                <>
                  <div className="h-9 border-b border-border flex items-center justify-between px-3 bg-card/50 flex-shrink-0">
                    <span className="font-mono text-xs">{activeFile.path}</span>
                    {user && (
                      <Button
                        size="sm"
                        className="h-6 text-[11px] px-2"
                        onClick={() => requireAuth(markEdited)}
                      >
                        Stage Changes
                      </Button>
                    )}
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                      if (!user) requireAuth(() => {});
                    }}
                    className="flex-1 bg-background text-foreground font-mono text-xs p-4 resize-none focus:outline-none border-none"
                    spellCheck={false}
                    readOnly={!user}
                    onClick={() => !user && requireAuth(() => {})}
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  <div className="text-center">
                    <FileCode className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>Select a file to view</p>
                    {!user && (
                      <p className="text-xs mt-1">
                        <button onClick={() => setShowModal(true)} className="text-primary hover:underline">Sign in</button> to edit files
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "graph" && (
          <CommitGraph repoId={repoId} />
        )}

        {activeTab === "conflicts" && conflicts.length > 0 && (
          <ConflictResolver
            repoId={repoId}
            conflicts={conflicts}
            onResolved={() => { loadRepo(); setActiveTab("files"); }}
          />
        )}

        {activeTab === "conflicts" && conflicts.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            No conflicts detected.
          </div>
        )}
      </div>

      {/* AI Bot floating panel */}
      {botOpen && (
        <div className="absolute bottom-4 right-4 w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-20">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Bot className="h-4 w-4 text-primary" /> mygit-bot
            </div>
            <button onClick={() => setBotOpen(false)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>

          {botReply && (
            <div className="p-3 max-h-40 overflow-y-auto">
              <p className="text-[11px] text-foreground/90 leading-relaxed whitespace-pre-wrap">{botReply}</p>
            </div>
          )}

          {botLoading && (
            <div className="px-3 py-2 text-xs text-muted-foreground animate-pulse">Thinking...</div>
          )}

          <div className="border-t border-border p-2 flex gap-1">
            <input
              value={botMsg}
              onChange={(e) => setBotMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { askBot(botMsg); setBotMsg(""); } }}
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Ask about this repo..."
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { if (botMsg.trim()) { askBot(botMsg); setBotMsg(""); } }}
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {showModal && (
        <AuthModal onClose={() => setShowModal(false)} onSuccess={onLoginSuccess} />
      )}
    </div>
  );
}
