import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  GitBranch,
  Plus,
  Search,
  Upload,
  LogOut,
  Loader2,
  FolderOpen,
  User,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import AuthModal from "@/components/AuthModal";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { getStoredToken } from "@/hooks/useAuth";

import { API_BASE } from "@/lib/api";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Repo {
  id: number;
  name: string;
  description: string;
  language: string;
  framework: string;
  isPublic: boolean;
  headHash: string;
  branch: string;
  initializedAt: string;
  userId: number | null;
}

export default function Dashboard() {
  const { user, requireAuth, showModal, setShowModal, onLoginSuccess, logout } = useAuth();
  const { toast } = useToast();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create repo modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadRepoId, setUploadRepoId] = useState<number | null>(null);

  useEffect(() => {
    fetchRepos();
  }, []);

  const fetchRepos = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/repos`);
      const data = (await res.json()) as { repos: Repo[] };
      setRepos(data.repos ?? []);
    } catch {
      toast({ title: "Failed to load repos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const createRepo = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/api/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      const data = (await res.json()) as { repo?: Repo; error?: string };
      if (!res.ok) { toast({ title: data.error ?? "Failed to create repo", variant: "destructive" }); return; }
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      toast({ title: `Repository "${data.repo!.name}" created` });
      fetchRepos();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleUpload = async (repoId: number, file: File) => {
    const token = getStoredToken();
    const form = new FormData();
    form.append("archive", file);
    form.append("message", "Initial upload");
    try {
      const res = await fetch(`${API_BASE}/api/repos/${repoId}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body: form,
      });
      const data = (await res.json()) as { summary?: string; error?: string };
      if (!res.ok) { toast({ title: data.error ?? "Upload failed", variant: "destructive" }); return; }
      toast({ title: data.summary ?? "Upload successful" });
      fetchRepos();
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
  };

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="border-b border-border bg-card/50 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-mono font-bold text-primary">
            <GitBranch className="h-5 w-5" />
            mygit
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> {user.username}
                </span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={logout}>
                  <LogOut className="h-3 w-3 mr-1" /> Sign out
                </Button>
              </>
            ) : (
              <Button size="sm" className="h-7 text-xs" onClick={() => setShowModal(true)}>
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Search + Create */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-card border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Search repositories..."
            />
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => requireAuth(() => setShowCreate(true))}
            data-testid="button-create-repo"
          >
            <Plus className="h-4 w-4" /> New Repo
          </Button>
        </div>

        {/* Repo grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {search ? `No repos matching "${search}"` : "No public repositories yet."}
            </p>
            <p className="text-xs mt-1">
              {!user && "Sign in to create and upload your own repos."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((repo) => (
              <div
                key={repo.id}
                className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors group"
              >
                <div className="flex items-start justify-between mb-2">
                  <Link
                    href={`/repos/${repo.id}`}
                    className="font-mono font-bold text-primary hover:underline truncate mr-2"
                  >
                    {repo.name}
                  </Link>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {repo.language && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                        {repo.language}
                      </span>
                    )}
                  </div>
                </div>

                {repo.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{repo.description}</p>
                )}

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" /> {repo.branch}
                    </span>
                    <span className="font-mono">
                      {repo.headHash === "none" ? "no commits" : repo.headHash.substring(0, 8)}
                    </span>
                  </div>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(repo.initializedAt).toLocaleDateString()}
                  </span>
                </div>

                {user && (
                  <div className="mt-3 pt-3 border-t border-border flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                      onClick={() =>
                        requireAuth(() => {
                          setUploadRepoId(repo.id);
                          fileInputRef.current?.click();
                        })
                      }
                    >
                      <Upload className="h-3 w-3" /> Upload files
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadRepoId !== null) {
            handleUpload(uploadRepoId, file);
            e.target.value = "";
          }
        }}
      />

      {/* Create repo modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="relative z-10 w-full max-w-sm mx-4 bg-card border border-border rounded-xl p-6 shadow-2xl">
            <h2 className="font-bold text-lg mb-4">Create Repository</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Repository name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="my-project"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && createRepo()}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Description (optional)</label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Short description"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button className="flex-1" onClick={createRepo} disabled={creating || !newName.trim()}>
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Auth modal */}
      {showModal && (
        <AuthModal
          onClose={() => setShowModal(false)}
          onSuccess={onLoginSuccess}
        />
      )}
    </div>
  );
}
