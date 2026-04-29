import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getStoredToken } from "@/hooks/useAuth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Conflict {
  id: number;
  filePath: string;
  baseContent: string;
  ours: string;
  theirs: string;
}

interface ConflictResolverProps {
  repoId: number;
  conflicts: Conflict[];
  onResolved: () => void;
}

export default function ConflictResolver({ repoId, conflicts, onResolved }: ConflictResolverProps) {
  const [idx, setIdx] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [manual, setManual] = useState("");
  const [resolving, setResolving] = useState(false);
  const { toast } = useToast();

  const conflict = conflicts[idx];
  if (!conflict) return null;

  const resolve = async (resolution: string) => {
    setResolving(true);
    try {
      const token = getStoredToken();
      await fetch(`${BASE}/api/repos/${repoId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ filePath: conflict.filePath, resolution }),
      });

      toast({ title: `Resolved: ${conflict.filePath}` });
      if (idx + 1 < conflicts.length) {
        setIdx(idx + 1);
        setEditMode(false);
        setManual("");
      } else {
        onResolved();
      }
    } catch {
      toast({ title: "Failed to resolve conflict", variant: "destructive" });
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border bg-yellow-500/10 flex items-center gap-2 flex-shrink-0">
        <AlertTriangle className="h-4 w-4 text-yellow-400" />
        <div>
          <p className="text-sm font-bold text-yellow-300">Merge Conflict</p>
          <p className="text-xs text-muted-foreground font-mono">{conflict.filePath}</p>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {idx + 1} / {conflicts.length}
        </span>
      </div>

      {editMode ? (
        <div className="flex-1 flex flex-col p-3">
          <p className="text-xs text-muted-foreground mb-2">Edit merged result:</p>
          <textarea
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            className="flex-1 bg-background border border-border rounded p-3 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => resolve(manual)} disabled={resolving}>
              <Check className="h-3 w-3 mr-1" /> Save Resolution
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Split pane */}
          <div className="flex-1 grid grid-cols-2 divide-x divide-border overflow-hidden">
            <div className="flex flex-col overflow-hidden">
              <div className="px-3 py-1.5 border-b border-border bg-green-500/10 text-xs font-semibold text-green-400">
                Yours (incoming)
              </div>
              <pre className="flex-1 p-3 font-mono text-[11px] text-green-300/90 overflow-auto whitespace-pre-wrap break-all">
                {conflict.ours || "(empty)"}
              </pre>
            </div>
            <div className="flex flex-col overflow-hidden">
              <div className="px-3 py-1.5 border-b border-border bg-red-500/10 text-xs font-semibold text-red-400">
                Theirs (HEAD)
              </div>
              <pre className="flex-1 p-3 font-mono text-[11px] text-red-300/90 overflow-auto whitespace-pre-wrap break-all">
                {conflict.theirs || "(empty)"}
              </pre>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-border p-3 flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-500"
              onClick={() => resolve(conflict.ours)}
              disabled={resolving}
            >
              Keep Mine
            </Button>
            <Button
              size="sm"
              className="bg-red-700 hover:bg-red-600"
              onClick={() => resolve(conflict.theirs)}
              disabled={resolving}
            >
              Keep Theirs
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setEditMode(true); setManual(conflict.ours); }}
            >
              Edit Manually
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
