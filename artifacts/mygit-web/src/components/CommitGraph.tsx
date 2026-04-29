import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface GraphNode {
  id: string;
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  isHead: boolean;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  head: string;
}

interface NodeDiff {
  diffs: { path: string; before: string; after: string; status: string }[];
  commit: { hash: string; message: string; author: string; createdAt: string };
}

interface CommitGraphProps {
  repoId: number;
  onNodeClick?: (hash: string) => void;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function CommitGraph({ repoId, onNodeClick }: CommitGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [popup, setPopup] = useState<{ node: GraphNode; diff: NodeDiff | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [nodes, setNodes] = useState<GraphNode[]>([]);

  useEffect(() => {
    if (!svgRef.current) return;

    fetch(`${BASE}/api/repos/${repoId}/graph`)
      .then((r) => r.json())
      .then((data: GraphData) => {
        setLoading(false);
        if (!data.nodes?.length) return;
        setNodes(data.nodes);
        buildGraph(data);
      })
      .catch(() => setLoading(false));
  }, [repoId]);

  function buildGraph(data: GraphData) {
    const svg = d3.select(svgRef.current!);
    svg.selectAll("*").remove();

    const width = svgRef.current!.clientWidth || 600;
    const height = svgRef.current!.clientHeight || 400;

    const g = svg.append("g");

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on("zoom", (e) => {
      g.attr("transform", e.transform);
    });
    svg.call(zoom);

    // Arrow markers
    svg.append("defs").append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "#4b5563");

    // Simulation
    const simulation = d3
      .forceSimulation<GraphNode>(data.nodes as GraphNode[])
      .force("link", d3.forceLink<GraphNode, GraphLink>(data.links).id((d) => d.id).distance(80).strength(1))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(40));

    // Links
    const link = g.append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(data.links)
      .join("line")
      .attr("stroke", "#374151")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    // Nodes
    const node = g.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(data.nodes as GraphNode[])
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on("end", (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }),
      );

    node.append("circle")
      .attr("r", 14)
      .attr("fill", (d) =>
        d.isHead ? "#22c55e" : "#3b82f6",
      )
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 2);

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .attr("fill", "white")
      .text((d) => d.hash.substring(0, 6));

    node.append("title").text((d) => `${d.hash.substring(0, 8)}: ${d.message}`);

    // Click → popup
    node.on("click", async (_, d) => {
      onNodeClick?.(d.hash);
      try {
        const res = await fetch(`${BASE}/api/repos/${repoId}/diff/${d.hash}`);
        const diff = res.ok ? ((await res.json()) as NodeDiff) : null;
        setPopup({ node: d, diff });
      } catch {
        setPopup({ node: d, diff: null });
      }
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading graph...
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No commits yet — push some changes to see the graph.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> HEAD
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Commit
        </span>
        <span className="ml-auto text-[10px]">Drag to pan · Scroll to zoom · Click node for details</span>
      </div>

      <svg ref={svgRef} className="flex-1 w-full" />

      {/* Node popup */}
      {popup && (
        <div className="absolute top-12 right-4 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-10">
          <div className="p-3 border-b border-border">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-xs text-primary font-bold">{popup.node.hash.substring(0, 8)}</span>
                <p className="text-sm font-medium mt-0.5">{popup.node.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {popup.node.author} · {new Date(popup.node.timestamp).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => setPopup(null)} className="text-muted-foreground hover:text-foreground ml-2">
                ✕
              </button>
            </div>
          </div>

          {popup.diff && (
            <div className="max-h-60 overflow-y-auto">
              {popup.diff.diffs.map((d, i) => (
                <div key={i} className="border-b border-border last:border-0">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50">
                    <span className="font-mono text-[11px]">{d.path}</span>
                    <span
                      className={`text-[10px] font-bold uppercase px-1 rounded ${
                        d.status === "added" ? "text-green-400" : d.status === "deleted" ? "text-red-400" : "text-blue-400"
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                  {d.status !== "unchanged" && (
                    <div className="px-3 py-1.5 font-mono text-[10px] space-y-1">
                      {d.before && (
                        <pre className="text-red-400/80 whitespace-pre-wrap break-all line-through opacity-70">
                          {d.before.substring(0, 120)}
                        </pre>
                      )}
                      {d.after && (
                        <pre className="text-green-400/80 whitespace-pre-wrap break-all">
                          {d.after.substring(0, 120)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
