/**
 * CommitGraph.tsx
 *
 * Two-phase rendering pattern (fixes the "stuck on loading" bug):
 *   Phase 1 useEffect — fetch data, update state, always set loading=false in finally
 *   Phase 2 useEffect — build D3 after data arrives and SVG is in the DOM
 *
 * The old code put BOTH phases in one useEffect and checked svgRef.current
 * at the top. Because loading=true means the <svg> wasn't rendered yet,
 * svgRef.current was always null, the effect exited, and the fetch never ran.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommitNode extends d3.SimulationNodeDatum {
  id: string;
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  isHead: boolean;
  hasConflict?: boolean;
}

interface FileNode extends d3.SimulationNodeDatum {
  id: string;
  path: string;
  type: "file" | "folder";
  language: string;
}

interface GraphEdge {
  source: string | CommitNode | FileNode;
  target: string | CommitNode | FileNode;
  isMerge?: boolean;
}

interface GraphResponse {
  commitGraph: {
    nodes: CommitNode[];
    edges: GraphEdge[];
    head: string;
  };
  fileGraph: {
    nodes: FileNode[];
    edges: GraphEdge[];
  };
}

interface DiffData {
  diffs: { path: string; before: string; after: string; status: string }[];
  commit: { hash: string; message: string; author: string; createdAt: string };
}

interface CommitGraphProps {
  repoId: number;
  onNodeClick?: (hash: string) => void;
}

import { API_BASE } from "@/lib/api";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeColor(n: CommitNode): string {
  if (n.isHead) return "#28C840";
  if (n.hasConflict) return "#FF6B6B";
  return "#5B8DEF";
}

function fileColor(n: FileNode): string {
  if (n.type === "folder") return "#F59E0B";
  const entry = ["main.cpp", "index.js", "index.ts", "main.py", "main.go", "main.rs"];
  if (entry.some((e) => n.path.endsWith(e))) return "#28C840";
  return "#5B8DEF";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommitGraph({ repoId, onNodeClick }: CommitGraphProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<d3.SimulationNodeDatum, undefined> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);

  const [viewMode, setViewMode] = useState<"commit" | "file">("commit");
  const [zoomLevel, setZoomLevel] = useState(100);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [popup, setPopup] = useState<{ node: CommitNode; diff: DiffData | null } | null>(null);
  const [filePanel, setFilePanel] = useState<{ node: FileNode; content: string } | null>(null);

  const [stepMode, setStepMode] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const [animating, setAnimating] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // ── Phase 1: Fetch data ───────────────────────────────────────────────────
  // NOTE: No svgRef check here — SVG isn't in the DOM yet, and we don't need it.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPopup(null);
    setFilePanel(null);

    fetch(`${API_BASE}/api/repos/${repoId}/graph`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as GraphResponse;
        if (!cancelled) setGraphData(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message ?? "Failed to load graph");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [repoId]);

  // ── Phase 2: Build D3 ─────────────────────────────────────────────────────
  // Runs after data arrives. By then, loading=false AND nodes.length > 0 means
  // the <svg> element is in the DOM → svgRef.current is guaranteed non-null.
  useEffect(() => {
    if (!graphData || !svgRef.current) return;

    const nodes =
      viewMode === "commit"
        ? (graphData.commitGraph?.nodes ?? [])
        : (graphData.fileGraph?.nodes ?? []);

    if (!nodes.length) return;

    buildGraph();
  }, [graphData, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildGraph = useCallback(() => {
    if (!svgRef.current || !graphData) return;

    // Stop previous simulation
    simulationRef.current?.stop();

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const W = svgRef.current.clientWidth || 700;
    const H = svgRef.current.clientHeight || 460;

    // ── Defs: arrowhead ────────────────────────────────────────────────────
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", `arrow-${repoId}`)
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "#4b5563");

    // ── Zoom ──────────────────────────────────────────────────────────────
    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on("zoom", (e: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", e.transform.toString());
        setZoomLevel(Math.round(e.transform.k * 100));
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    // Click on SVG background → close popup
    svg.on("click", (e: MouseEvent) => {
      if (e.target === svgRef.current || (e.target as Element).tagName === "svg") {
        setPopup(null);
        setFilePanel(null);
      }
    });

    if (viewMode === "commit") {
      buildCommitGraph(g, W, H);
    } else {
      buildFileGraph(g, W, H);
    }
  }, [graphData, viewMode, repoId]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildCommitGraph(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    W: number,
    H: number,
  ) {
    if (!graphData) return;

    const rawNodes = graphData.commitGraph?.nodes ?? [];
    const rawEdges = graphData.commitGraph?.edges ?? [];

    // Deep-clone so D3 can mutate
    const nodes: CommitNode[] = rawNodes.map((n) => ({ ...n }));
    const edges: GraphEdge[] = rawEdges.map((e) => ({ ...e }));

    const sim = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(edges as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
        .id((d: d3.SimulationNodeDatum) => (d as CommitNode).id)
        .distance(120)
        .strength(1),
      )
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide(44));

    simulationRef.current = sim as unknown as d3.Simulation<d3.SimulationNodeDatum, undefined>;

    // ── Edges ────────────────────────────────────────────────────────────
    const link = g.append("g")
      .selectAll<SVGLineElement, GraphEdge>("line")
      .data(edges)
      .join("line")
      .attr("stroke", "#374151")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", (e) => e.isMerge ? "6,3" : null)
      .attr("marker-end", `url(#arrow-${repoId})`);

    // ── Nodes ────────────────────────────────────────────────────────────
    const node = g.append("g")
      .selectAll<SVGGElement, CommitNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, CommitNode>()
          .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }),
      );

    // HEAD pulsing ring
    node.filter((d) => d.isHead)
      .append("circle")
      .attr("r", 20)
      .attr("fill", "none")
      .attr("stroke", "#28C840")
      .attr("stroke-width", 2)
      .attr("opacity", 0.4)
      .attr("class", "head-ring");

    node.append("circle")
      .attr("r", 14)
      .attr("fill", (d) => nodeColor(d))
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 2);

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", "8px")
      .attr("font-family", "monospace")
      .attr("fill", "white")
      .attr("pointer-events", "none")
      .text((d) => d.hash.substring(0, 7));

    // Click
    node.on("click", async (e: MouseEvent, d: CommitNode) => {
      e.stopPropagation();
      onNodeClick?.(d.hash);
      setFilePanel(null);
      try {
        const res = await fetch(`${API_BASE}/api/repos/${repoId}/diff/${d.hash}`);
        const diff = res.ok ? ((await res.json()) as DiffData) : null;
        setPopup({ node: d, diff });
      } catch {
        setPopup({ node: d, diff: null });
      }
    });

    // Tick
    sim.on("tick", () => {
      link
        .attr("x1", (d) => ((d.source as CommitNode).x ?? 0))
        .attr("y1", (d) => ((d.source as CommitNode).y ?? 0))
        .attr("x2", (d) => ((d.target as CommitNode).x ?? 0))
        .attr("y2", (d) => ((d.target as CommitNode).y ?? 0));

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  }

  function buildFileGraph(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    W: number,
    H: number,
  ) {
    if (!graphData) return;

    const rawNodes = graphData.fileGraph?.nodes ?? [];
    const rawEdges = graphData.fileGraph?.edges ?? [];

    const nodes: FileNode[] = rawNodes.map((n) => ({ ...n }));
    const edges: GraphEdge[] = rawEdges.map((e) => ({ ...e }));

    const sim = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(edges as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
        .id((d: d3.SimulationNodeDatum) => (d as FileNode).id)
        .distance(80)
        .strength(0.8),
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide(36));

    simulationRef.current = sim as unknown as d3.Simulation<d3.SimulationNodeDatum, undefined>;

    const link = g.append("g")
      .selectAll<SVGLineElement, GraphEdge>("line")
      .data(edges)
      .join("line")
      .attr("stroke", "#374151")
      .attr("stroke-width", 1)
      .attr("marker-end", `url(#arrow-${repoId})`);

    const node = g.append("g")
      .selectAll<SVGGElement, FileNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, FileNode>()
          .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }),
      );

    node.append(d => {
      const shape = d3.select(document.createElementNS("http://www.w3.org/2000/svg", (d as FileNode).type === "folder" ? "rect" : "circle"));
      if ((d as FileNode).type === "folder") {
        shape
          .attr("x", -12).attr("y", -12)
          .attr("width", 24).attr("height", 24).attr("rx", 4)
          .attr("fill", fileColor(d as FileNode)).attr("stroke", "#0f172a").attr("stroke-width", 2);
      } else {
        shape.attr("r", 10).attr("fill", fileColor(d as FileNode)).attr("stroke", "#0f172a").attr("stroke-width", 2);
      }
      return shape.node()!;
    });

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "2em")
      .attr("font-size", "8px")
      .attr("font-family", "monospace")
      .attr("fill", "#94a3b8")
      .attr("pointer-events", "none")
      .text((d) => {
        const parts = d.path.split("/");
        return parts[parts.length - 1].substring(0, 14);
      });

    node.on("click", async (e: MouseEvent, d: FileNode) => {
      e.stopPropagation();
      setPopup(null);
      try {
        const res = await fetch(`${API_BASE}/api/repos/${repoId}/files?path=${encodeURIComponent(d.path)}`);
        const data = res.ok ? ((await res.json()) as { content: string }) : null;
        setFilePanel({ node: d, content: data?.content ?? "" });
      } catch {
        setFilePanel({ node: d, content: "" });
      }
    });

    sim.on("tick", () => {
      link
        .attr("x1", (d) => ((d.source as FileNode).x ?? 0))
        .attr("y1", (d) => ((d.source as FileNode).y ?? 0))
        .attr("x2", (d) => ((d.target as FileNode).x ?? 0))
        .attr("y2", (d) => ((d.target as FileNode).y ?? 0));
      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  }

  // ── Animate (walk commits in chronological order, amber highlight) ─────────
  const handleAnimate = useCallback(() => {
    if (!graphData || animating) return;
    const sorted = [...(graphData.commitGraph?.nodes ?? [])].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    if (!sorted.length) return;

    setAnimating(true);
    let i = 0;
    const step = () => {
      if (i >= sorted.length) { setHighlightedId(null); setAnimating(false); return; }
      setHighlightedId(sorted[i].id);
      i++;
      setTimeout(step, 650);
    };
    step();
  }, [graphData, animating]);

  // Highlight color swap for animated node
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGCircleElement, CommitNode>("circle[r='14']")
      .attr("fill", (d: CommitNode) => {
        if (d.id === highlightedId) return "#FFB547";
        return nodeColor(d);
      });
  }, [highlightedId]);

  // ── Zoom controls ─────────────────────────────────────────────────────────
  const adjustZoom = (delta: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).call(zoomRef.current.scaleBy, 1 + delta);
  };

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity);
  };

  // Cleanup simulation on unmount
  useEffect(() => () => { simulationRef.current?.stop(); }, []);

  // ── Derived data ──────────────────────────────────────────────────────────
  const commitNodes = graphData?.commitGraph?.nodes ?? [];
  const sortedCommits = [...commitNodes].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const currentStep = sortedCommits[stepIdx];

  const hasCommits = commitNodes.length > 0;
  const hasFiles = (graphData?.fileGraph?.nodes?.length ?? 0) > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm gap-2">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" />
        </svg>
        Loading graph…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
        {error}
      </div>
    );
  }

  const currentNodes = viewMode === "commit" ? commitNodes : (graphData?.fileGraph?.nodes ?? []);
  const isEmpty = currentNodes.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card/50 flex-shrink-0 flex-wrap">
        {/* View toggle */}
        <div className="flex border border-border rounded overflow-hidden text-[11px] mr-2">
          <button
            onClick={() => setViewMode("commit")}
            className={`px-2 py-1 font-medium transition-colors ${viewMode === "commit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Commit View
          </button>
          <button
            onClick={() => setViewMode("file")}
            className={`px-2 py-1 font-medium transition-colors ${viewMode === "file" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            File View
          </button>
        </div>

        {/* Legend */}
        {viewMode === "commit" ? (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#28C840] inline-block" /> HEAD</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#5B8DEF] inline-block" /> Commit</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#FF6B6B] inline-block" /> Conflict</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#F59E0B] inline-block" /> Folder</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#5B8DEF] inline-block" /> File</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#28C840] inline-block" /> Entry</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Animate */}
          {viewMode === "commit" && hasCommits && (
            <button
              onClick={handleAnimate}
              disabled={animating}
              className={`px-2 py-1 text-[11px] rounded border border-border hover:border-primary/60 transition-colors ${animating ? "text-amber-400 border-amber-500/40" : "text-muted-foreground"}`}
            >
              {animating ? "⚡ Animating…" : "Animate"}
            </button>
          )}
          {/* Steps */}
          {viewMode === "commit" && hasCommits && (
            <button
              onClick={() => { setStepMode((s) => !s); setStepIdx(0); }}
              className={`px-2 py-1 text-[11px] rounded border transition-colors ${stepMode ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/60"}`}
            >
              Steps
            </button>
          )}
          {/* Reset */}
          <button
            onClick={resetZoom}
            className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:border-primary/60 transition-colors"
          >
            Reset
          </button>
          {/* Zoom */}
          <div className="flex items-center border border-border rounded overflow-hidden text-[11px]">
            <button onClick={() => adjustZoom(-0.2)} className="px-2 py-1 text-muted-foreground hover:text-foreground">−</button>
            <span className="px-2 py-1 text-muted-foreground tabular-nums min-w-[52px] text-center">{zoomLevel}%</span>
            <button onClick={() => adjustZoom(0.2)} className="px-2 py-1 text-muted-foreground hover:text-foreground">+</button>
          </div>
        </div>
      </div>

      {/* ── Graph area ── */}
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {viewMode === "commit"
            ? "No commits yet — push your first commit to see the graph."
            : "No files yet — upload or commit files first."}
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full"
            style={{ cursor: "grab" }}
          />

          {/* ── Commit popup ── */}
          {popup && (
            <div className="absolute top-3 right-3 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-20">
              <div className="p-3 border-b border-border">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-primary font-bold">{popup.node.hash.substring(0, 7)}</span>
                    <p className="text-sm font-medium mt-0.5 truncate">{popup.node.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {popup.node.author} · {new Date(popup.node.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setPopup(null)}
                    className="text-muted-foreground hover:text-foreground ml-2 flex-shrink-0 text-sm"
                  >✕</button>
                </div>
              </div>

              {popup.diff ? (
                <div className="max-h-64 overflow-y-auto">
                  {popup.diff.diffs.filter((d) => d.status !== "unchanged").map((d, i) => (
                    <div key={i} className="border-b border-border/60 last:border-0">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40">
                        <span className="font-mono text-[10px] truncate">{d.path}</span>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ml-2 flex-shrink-0 ${
                          d.status === "added" ? "bg-green-500/20 text-green-400"
                          : d.status === "deleted" ? "bg-red-500/20 text-red-400"
                          : "bg-blue-500/20 text-blue-400"
                        }`}>{d.status}</span>
                      </div>
                      <div className="px-3 py-1.5 font-mono text-[10px] leading-relaxed">
                        {d.before.split("\n").slice(0, 5).filter(Boolean).map((line, j) => (
                          <div key={j} className="text-red-400/80 bg-red-500/5 px-1 rounded">
                            <span className="opacity-60 mr-1">−</span>{line}
                          </div>
                        ))}
                        {d.after.split("\n").slice(0, 5).filter(Boolean).map((line, j) => (
                          <div key={j} className="text-green-400/80 bg-green-500/5 px-1 rounded">
                            <span className="opacity-60 mr-1">+</span>{line}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-2 text-[11px] text-muted-foreground">No diff data available.</p>
              )}
            </div>
          )}

          {/* ── File panel ── */}
          {filePanel && (
            <div className="absolute top-3 right-3 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-20">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="font-mono text-xs text-primary truncate">{filePanel.node.path}</span>
                <button onClick={() => setFilePanel(null)} className="text-muted-foreground hover:text-foreground ml-2 text-sm">✕</button>
              </div>
              <pre className="p-3 font-mono text-[10px] text-foreground/80 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                {filePanel.content || "(empty)"}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Steps panel ── */}
      {stepMode && sortedCommits.length > 0 && (
        <div className="border-t border-border bg-card/80 p-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Step {stepIdx + 1} / {sortedCommits.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                disabled={stepIdx === 0}
                className="px-3 py-1 text-[11px] rounded border border-border text-muted-foreground disabled:opacity-30 hover:border-primary/60 transition-colors"
              >← Prev</button>
              <button
                onClick={() => setStepIdx((i) => Math.min(sortedCommits.length - 1, i + 1))}
                disabled={stepIdx === sortedCommits.length - 1}
                className="px-3 py-1 text-[11px] rounded border border-border text-muted-foreground disabled:opacity-30 hover:border-primary/60 transition-colors"
              >Next →</button>
              <button onClick={() => setStepMode(false)} className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground transition-colors">✕</button>
            </div>
          </div>
          {currentStep && (
            <div className="flex gap-4 text-[11px]">
              <span className="font-mono text-primary">{currentStep.hash.substring(0, 7)}</span>
              <span className="text-foreground/80 font-medium truncate">{currentStep.message}</span>
              <span className="text-muted-foreground ml-auto flex-shrink-0">{currentStep.author}</span>
              <span className="text-muted-foreground flex-shrink-0">{new Date(currentStep.timestamp).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
