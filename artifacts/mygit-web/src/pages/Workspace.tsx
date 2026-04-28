import { useState, useEffect } from "react";
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
    if (fileContentData && fileContentData.content !== undefined) {
      setEditorContent(fileContentData.content);
    } else {
      setEditorContent("");
    }
  }, [fileContentData, activeFile]);

  const handleInit = () => {
    initRepoMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetRepoStatusQueryKey(),
        });
        toast({ title: "Repository initialized" });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Unknown error";
        toast({
          title: "Failed to initialize repo",
          description: msg,
          variant: "destructive",
        });
      },
    });
  };

  const handleSaveFile = () => {
    if (!activeFile) return;
    saveFileMutation.mutate(
      { data: { path: activeFile, content: editorContent } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetFileQueryKey({ path: activeFile }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetRepoStatusQueryKey(),
          });
          toast({ title: "File saved", description: activeFile });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Unknown error";
          toast({
            title: "Failed to save file",
            description: msg,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleStageFile = (filename: string) => {
    addFileMutation.mutate(
      { data: { filename } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetRepoStatusQueryKey(),
          });
          toast({ title: "File staged", description: filename });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Unknown error";
          toast({
            title: "Failed to stage file",
            description: msg,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleCommit = () => {
    if (!commitMessage) return;
    createCommitMutation.mutate(
      { data: { message: commitMessage } },
      {
        onSuccess: () => {
          setCommitMessage("");
          queryClient.invalidateQueries({
            queryKey: getGetRepoStatusQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: getGetLogQueryKey() });
          toast({ title: "Committed changes" });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Unknown error";
          toast({
            title: "Commit failed",
            description: msg,
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
          queryClient.invalidateQueries({
            queryKey: getGetRepoStatusQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLogQueryKey() });
          toast({ title: `Checked out ${commitId.substring(0, 8)}` });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Unknown error";
          toast({
            title: "Checkout failed",
            description: msg,
            variant: "destructive",
          });
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
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background text-foreground font-mono">
        <TerminalSquare className="h-16 w-16 mb-4 text-primary" />
        <h1 className="text-2xl font-bold mb-2">Not a mygit repository</h1>
        <p className="text-muted-foreground mb-8">
          Initialize a new repository to get started.
        </p>
        <Button
          onClick={handleInit}
          size="lg"
          disabled={initRepoMutation.isPending}
        >
          {initRepoMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          mygit init
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-64 border-r border-border flex flex-col flex-shrink-0 bg-card">
        {/* Branch / HEAD info */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center space-x-2 font-mono text-sm">
            <GitBranch className="h-4 w-4 text-primary" />
            <span className="font-semibold text-primary">{status.branch}</span>
          </div>
          <div className="flex items-center space-x-2 mt-1 font-mono text-xs text-muted-foreground">
            <GitCommit className="h-3 w-3" />
            <span>
              HEAD:{" "}
              {status.head === "none"
                ? "no commits"
                : status.head.substring(0, 8)}
            </span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {/* Staged files */}
          <div className="p-3">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center justify-between">
              <span>Staged</span>
              <span className="bg-primary/20 text-primary px-1.5 rounded-sm font-mono">
                {status.staged.length}
              </span>
            </h3>
            {status.staged.length === 0 ? (
              <p className="text-xs text-muted-foreground italic pl-2">
                Nothing staged
              </p>
            ) : (
              <ul className="space-y-1">
                {status.staged.map((file) => (
                  <li
                    key={`staged-${file}`}
                    className="flex items-center space-x-2 text-xs text-green-400 pl-2"
                  >
                    <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                    <span className="font-mono truncate">{file}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Working directory */}
          <div className="p-3 pt-0">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center justify-between">
              <span>Working Tree</span>
              <span className="bg-muted text-muted-foreground px-1.5 rounded-sm font-mono">
                {filesData?.files.length ?? 0}
              </span>
            </h3>
            {(filesData?.files.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground italic pl-2">
                No files
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filesData?.files.map((file) => {
                  const isStaged = status.staged.includes(file.path);
                  return (
                    <li
                      key={`file-${file.path}`}
                      data-testid={`file-item-${file.path}`}
                      className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer ${
                        activeFile === file.path
                          ? "bg-muted text-primary"
                          : "hover:bg-muted/60 text-foreground"
                      }`}
                      onClick={() => {
                        setActiveFile(file.path);
                        setActiveCommit(null);
                      }}
                    >
                      <div className="flex items-center space-x-2 overflow-hidden min-w-0">
                        <FileCode className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="font-mono text-xs truncate">
                          {file.path}
                        </span>
                      </div>
                      {!isStaged && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:bg-primary/20 hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStageFile(file.path);
                          }}
                          title="Stage file"
                          data-testid={`button-stage-${file.path}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Commit history */}
          <div className="p-3 pt-0">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center space-x-1">
              <History className="h-3 w-3" />
              <span>History</span>
            </h3>
            {(logData?.commits.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground italic pl-2">
                No commits yet
              </p>
            ) : (
              <ul className="space-y-2">
                {logData?.commits.map((commit) => (
                  <li
                    key={commit.hash}
                    data-testid={`commit-item-${commit.hash}`}
                    className={`text-xs p-2 rounded border cursor-pointer transition-colors ${
                      activeCommit === commit.hash
                        ? "bg-muted border-primary/50"
                        : "border-transparent hover:border-border hover:bg-muted/40"
                    }`}
                    onClick={() => {
                      setActiveCommit(commit.hash);
                      setActiveFile(null);
                    }}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-mono text-primary font-bold">
                        {commit.hash.substring(0, 8)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(commit.timestamp), "MMM d, HH:mm")}
                      </span>
                    </div>
                    <p className="text-foreground truncate mb-2">
                      {commit.message}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] px-2 w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCheckout(commit.hash);
                      }}
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

      {/* Main Panel */}
      <div className="flex-1 flex flex-col bg-background h-full overflow-hidden">
        {activeFile ? (
          <div className="flex-1 flex flex-col h-full">
            {/* File toolbar */}
            <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-card/50 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <FileCode className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-sm font-medium">
                  {activeFile}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleStageFile(activeFile)}
                  disabled={
                    addFileMutation.isPending ||
                    status.staged.includes(activeFile)
                  }
                  data-testid="button-stage-active"
                >
                  {status.staged.includes(activeFile) ? "Staged" : "Stage"}
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSaveFile}
                  disabled={saveFileMutation.isPending}
                  data-testid="button-save"
                >
                  {saveFileMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Save className="h-3 w-3 mr-1" />
                  )}
                  Save
                </Button>
              </div>
            </div>

            {/* Editor */}
            <div className="flex-1 relative overflow-hidden">
              {isFileLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="absolute inset-0 w-full h-full bg-background text-foreground font-mono text-sm p-4 resize-none focus:outline-none border-none"
                  spellCheck={false}
                  data-testid="editor-textarea"
                />
              )}
            </div>
          </div>
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
  status: {
    staged: string[];
    head: string;
    branch: string;
    initialized: boolean;
    files: string[];
  };
  commitMessage: string;
  setCommitMessage: (v: string) => void;
  handleCommit: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="h-10 border-b border-border flex items-center px-4 bg-card/50 flex-shrink-0">
        <GitCommit className="h-4 w-4 mr-2 text-muted-foreground" />
        <span className="font-mono text-sm font-medium">Commit</span>
      </div>
      <div className="flex-1 p-6 flex flex-col max-w-2xl mx-auto w-full">
        <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-widest">
              Staged files ({status.staged.length})
            </p>
            <div className="bg-background border border-border rounded p-2 max-h-36 overflow-y-auto">
              {status.staged.length === 0 ? (
                <span className="text-sm text-muted-foreground italic">
                  No files staged. Click + next to a file to stage it.
                </span>
              ) : (
                <ul className="space-y-1">
                  {status.staged.map((f) => (
                    <li
                      key={f}
                      className="text-sm font-mono text-green-400 flex items-center"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-2 flex-shrink-0" />
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
            className="min-h-[100px] font-sans resize-none text-sm"
            data-testid="input-commit-message"
          />
          <Button
            className="w-full"
            onClick={handleCommit}
            disabled={
              isPending || status.staged.length === 0 || !commitMessage.trim()
            }
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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Failed to load diff
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold">
              {commit?.message ?? "Commit Details"}
            </h2>
            <div className="flex items-center space-x-2 mt-1 text-xs font-mono text-muted-foreground">
              <span className="text-primary font-bold">
                {commitId.substring(0, 8)}
              </span>
              <span>·</span>
              <span>
                {commit
                  ? format(new Date(commit.timestamp), "MMM d, yyyy HH:mm")
                  : ""}
              </span>
              <span>·</span>
              <span>{diff.diffs.length} file(s)</span>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 max-w-5xl">
          {diff.diffs.map((fileDiff, idx) => (
            <div
              key={idx}
              className="border border-border rounded-lg overflow-hidden bg-card"
            >
              <div className="bg-muted px-4 py-1.5 border-b border-border flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">
                  {fileDiff.path}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
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
              <div className="font-mono text-xs overflow-x-auto bg-[#0d0d0f]">
                {fileDiff.before !== fileDiff.after ? (
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <div className="p-3">
                      <div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-widest">
                        Before
                      </div>
                      <pre className="text-red-400/80 whitespace-pre-wrap break-all">
                        {fileDiff.before || "(empty)"}
                      </pre>
                    </div>
                    <div className="p-3">
                      <div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-widest">
                        After
                      </div>
                      <pre className="text-green-400/80 whitespace-pre-wrap break-all">
                        {fileDiff.after || "(empty)"}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="p-3">
                    <pre className="text-muted-foreground whitespace-pre-wrap break-all">
                      {fileDiff.after}
                    </pre>
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
