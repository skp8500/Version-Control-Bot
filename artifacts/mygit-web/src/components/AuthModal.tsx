import { useState } from "react";
import { X, Loader2, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { AuthUser } from "@/hooks/useAuth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (user: AuthUser, token: string) => void;
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = tab === "login" ? { username, password } : { username, email, password };

      const res = await fetch(`${BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };

      if (!res.ok) {
        toast({ title: data.error ?? "Authentication failed", variant: "destructive" });
        return;
      }
      onSuccess(data.user!, data.token!);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-card border border-border rounded-xl shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <GitBranch className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg font-mono">mygit</span>
        </div>

        {/* Tabs */}
        <div className="flex border border-border rounded-lg mb-5 p-0.5">
          {(["login", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              required
              autoFocus
              placeholder="your-username"
              data-testid="input-username"
            />
          </div>

          {tab === "signup" && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                required
                placeholder="you@example.com"
                data-testid="input-email"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              required
              minLength={6}
              placeholder="••••••••"
              data-testid="input-password"
            />
          </div>

          <Button type="submit" className="w-full mt-1" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {tab === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Browse repos freely — login only needed for write actions.
        </p>
      </div>
    </div>
  );
}
