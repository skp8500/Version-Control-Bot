import { useState, useRef } from "react";
import { Upload, FileCode, Loader2, Check, X, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStoredToken } from "@/hooks/useAuth";

import { API_BASE } from "@/lib/api";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DetectionResult {
  language: string;
  framework: string;
  filesUploaded: number;
  summary: string;
}

interface UploadDetectorProps {
  repoId: number;
  onUploadComplete: (result: DetectionResult) => void;
}

export default function UploadDetector({ repoId, onUploadComplete }: UploadDetectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ name: string; size: number } | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("Initial upload");

  const handleFile = (file: File) => {
    setPreview({ name: file.name, size: file.size });
    setResult(null);
    setError(null);
  };

  const doUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const token = getStoredToken();
      const form = new FormData();
      form.append("archive", file);
      form.append("message", commitMsg);

      const res = await fetch(`${API_BASE}/api/repos/${repoId}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body: form,
      });
      const data = (await res.json()) as DetectionResult & { error?: string };
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }

      setResult(data);
      onUploadComplete(data);
    } catch {
      setError("Upload failed — network error");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="p-4 space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <FolderOpen className={`h-8 w-8 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-sm font-medium">Drop your .zip file here</p>
        <p className="text-xs text-muted-foreground">or click to browse — auto-detect language & framework</p>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {/* Preview card */}
      {preview && !result && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm font-bold">{preview.name}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {(preview.size / 1024).toFixed(1)} KB
            </span>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Commit message</label>
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 gap-1.5"
              disabled={uploading}
              onClick={() => {
                const input = inputRef.current;
                if (!input?.files?.[0]) return;
                doUpload(input.files[0]);
              }}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading..." : "Confirm Upload"}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setPreview(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Success card */}
      {result && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-400">
            <Check className="h-4 w-4" />
            <span className="text-sm font-bold">Upload successful</span>
          </div>
          <p className="text-xs text-muted-foreground">{result.summary}</p>
          <div className="flex gap-3 text-[11px]">
            {result.language && (
              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                {result.language}
              </span>
            )}
            {result.framework && (
              <span className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                {result.framework}
              </span>
            )}
            <span className="text-muted-foreground">{result.filesUploaded} files</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <X className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
