"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { WikiHeader } from "@/components/wiki/WikiHeader";
import { api, type WikiGraph, type WikiGraphNode } from "@/lib/api";

// react-force-graph-2d needs `window` + canvas — SSR-disable.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-sm text-textMuted">
      loading graph engine…
    </div>
  ),
});

// The lib's Node/Link types are loose; extend WikiGraphNode with the
// mutation fields the layout engine writes back onto each object
// (x, y, vx, vy). We never read them for logic — only for the click
// hit-test via the lib itself.
interface GraphNode extends WikiGraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  // Written by onNodeDragEnd to PIN the node in place. Cleared (set to
  // undefined) by right-click. When set, the layout engine treats the
  // node as fixed. Matches react-force-graph-2d's own NodeObject shape.
  fx?: number;
  fy?: number;
}

// Section → design-token color. Missing pages are dimmed so a dangling
// link is visible as absence-of-content, not noise.
const SECTION_COLOR: Record<string, string> = {
  entities: "#7c3aed",       // primary — the 42-thesis / hub territory
  system:   "#f59e0b",       // system accent — tools + infra
  root:     "#94a3b8",       // muted — top-level indexes
  missing:  "#47556955",     // textMuted at ~33% alpha
};

// Persist labels only above this degree to avoid a wall of text on the
// dense center. Hover always shows the label regardless.
// Was 8; dropped to 5 per the polish brief — the vault post-fix (86
// nodes) has fewer hubs and more headroom for standing labels.
const LABEL_MIN_DEGREE = 5;

// Hover behaviour: focus node scales +40%, its edges + direct neighbours
// render at full opacity, everything else dims to the ratio below.
const DIM_OPACITY = 0.15;

// Force-graph tuning.
const CHARGE_STRENGTH = -300;   // repulsion between all nodes
const LINK_DISTANCE = 40;        // base spring rest length
const LINK_DISTANCE_CROSS_SECTION = 90;  // longer between different sections
const COLLISION_PAD = 4;         // node radius + this = collision radius

function colorForSection(section: string): string {
  return SECTION_COLOR[section] ?? SECTION_COLOR.root;
}

function nodeRadius(degree: number): number {
  // Sqrt scaling — the 55-degree hub stays readable next to degree-1
  // leaves without overwhelming the canvas.
  return 3 + Math.sqrt(degree) * 1.4;
}

export default function WikiGraphPage() {
  const router = useRouter();

  const manifestQuery = useQuery({
    queryKey: ["wiki", "manifest"],
    queryFn: api.wiki.manifest,
    staleTime: 30_000,
  });

  const graphQuery = useQuery({
    queryKey: ["wiki", "graph"],
    queryFn: api.wiki.graph,
    staleTime: 30_000,
    retry: false,
  });

  // Fit-to-canvas after the layout settles.
  const graphRef = useRef<unknown>(null);

  useEffect(() => {
    if (!graphQuery.data) return;
    const t = window.setTimeout(() => {
      const g = graphRef.current as
        | { zoomToFit?: (dur: number, pad: number) => void }
        | null;
      g?.zoomToFit?.(400, 60);
    }, 500);
    return () => window.clearTimeout(t);
  }, [graphQuery.data]);

  // Wrap the canvas so we can measure it once mounted.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const handleNodeClick = useCallback(
    (n: unknown) => {
      const node = n as GraphNode;
      if (!node?.id) return;
      // Missing nodes have no page — they're synthetic. Skip nav.
      if (node.section === "missing") return;
      router.push(`/wiki/${node.id}`);
    },
    [router],
  );

  // Hover state: which node the cursor is over; its neighbours (ids reached
  // via any edge). Everything else dims. Computed once per graph payload.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const neighbourMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!graphQuery.data) return m;
    for (const e of graphQuery.data.edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [graphQuery.data]);

  const isFocused = useCallback(
    (id: string): boolean => {
      if (!hoveredId) return true;
      if (id === hoveredId) return true;
      return neighbourMap.get(hoveredId)?.has(id) ?? false;
    },
    [hoveredId, neighbourMap],
  );

  // Drag → pin: onNodeDragEnd sets fx/fy so the layout engine holds the
  // node in place. Right-click (react-force-graph's onNodeRightClick)
  // releases (clears fx/fy) so the node rejoins the simulation.
  // (react-force-graph-2d doesn't expose onNodeDoubleClick; right-click
  //  is the standard release gesture for this lib.)
  const handleNodeDragEnd = useCallback((n: unknown) => {
    const node = n as GraphNode;
    if (typeof node.x === "number") node.fx = node.x;
    if (typeof node.y === "number") node.fy = node.y;
  }, []);
  const handleDoubleClick = useCallback((n: unknown) => {
    const node = n as GraphNode;
    node.fx = undefined;
    node.fy = undefined;
  }, []);

  // Apply d3-force tuning once the graph engine is mounted. The lib
  // exposes .d3Force(name, obj) — we can only tweak strengths on the
  // built-in charge/link forces, plus attach a collision force sized
  // by node degree.
  useEffect(() => {
    const g = graphRef.current as {
      d3Force?: (name: string, force?: unknown) => unknown;
    } | null;
    if (!g?.d3Force) return;
    // d3-force is a transitive dep of react-force-graph-2d — dynamic
    // string import so tsc doesn't require type declarations.
    (import(/* webpackIgnore: true */ "d3-force" as string) as Promise<{
      forceCollide: (r: (n: unknown) => number) => unknown;
    }>).then((d3) => {
      const charge = g.d3Force?.("charge") as
        | { strength?: (v: number) => void }
        | undefined;
      charge?.strength?.(CHARGE_STRENGTH);
      const link = g.d3Force?.("link") as
        | { distance?: (fn: (l: { source: GraphNode; target: GraphNode }) => number) => void }
        | undefined;
      link?.distance?.((l) =>
        l.source.section === l.target.section ? LINK_DISTANCE : LINK_DISTANCE_CROSS_SECTION,
      );
      g.d3Force?.(
        "collision",
        d3.forceCollide((n: unknown) => nodeRadius((n as GraphNode).degree) + COLLISION_PAD),
      );
    }).catch(() => {
      // Import failure → we lose collision but the graph still renders.
    });
  }, [graphQuery.data]);

  // Force-graph mutates the array — pass a fresh shallow copy each time.
  const graphData = useMemo(() => {
    if (!graphQuery.data) return { nodes: [], links: [] };
    return {
      nodes: graphQuery.data.nodes.map((n) => ({ ...n })) as GraphNode[],
      links: graphQuery.data.edges.map((e) => ({
        source: e.source,
        target: e.target,
      })),
    };
  }, [graphQuery.data]);

  return (
    <PageWrapper className="space-y-4">
      <WikiHeader
        compiledAt={manifestQuery.data?.compiled_at ?? null}
        view="graph"
      />

      <div
        ref={wrapRef}
        className="relative h-[calc(100vh-12rem)] w-full overflow-hidden rounded-lg border border-border bg-surface"
      >
        {graphQuery.isLoading ? (
          <GraphSkeleton />
        ) : graphQuery.isError ? (
          <GraphErrorPanel
            message={
              graphQuery.error instanceof Error
                ? graphQuery.error.message
                : "unknown error"
            }
          />
        ) : graphQuery.data && graphQuery.data.nodes.length === 0 ? (
          <GraphEmptyPanel />
        ) : graphQuery.data ? (
          <>
            <ForceGraph2D
              ref={graphRef as never}
              graphData={graphData}
              width={dims.w}
              height={dims.h}
              backgroundColor="rgba(0,0,0,0)"
              nodeRelSize={4}
              linkColor={(l) => {
                const src = (l as { source: GraphNode }).source;
                const tgt = (l as { target: GraphNode }).target;
                const focused = isFocused(src.id) && isFocused(tgt.id);
                return focused ? "#4a4a6a" : "#2a2a3a20";
              }}
              linkWidth={(l) => {
                const src = (l as { source: GraphNode }).source;
                const tgt = (l as { target: GraphNode }).target;
                return isFocused(src.id) && isFocused(tgt.id) ? 1.2 : 0.4;
              }}
              cooldownTicks={200}
              onNodeClick={handleNodeClick}
              onNodeHover={(n) => setHoveredId(n ? (n as GraphNode).id : null)}
              onNodeDragEnd={handleNodeDragEnd}
              onNodeRightClick={handleDoubleClick}
              nodeLabel={(n) => {
                const node = n as GraphNode;
                return `${node.title}  ·  ${node.section}  ·  deg ${node.degree}`;
              }}
              nodeCanvasObject={(n, ctx, scale) => {
                const node = n as GraphNode;
                const focused = isFocused(node.id);
                const focus_scale = node.id === hoveredId ? 1.4 : 1.0;
                // Missing nodes render smaller — they're absence markers.
                const baseR = nodeRadius(node.degree) * (node.section === "missing" ? 0.7 : 1);
                const r = baseR * focus_scale;
                const x = node.x ?? 0;
                const y = node.y ?? 0;
                // Global alpha applied per-node so hovered neighbourhood stays crisp.
                const prev = ctx.globalAlpha;
                ctx.globalAlpha = focused ? 1.0 : DIM_OPACITY;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, 2 * Math.PI);
                ctx.fillStyle = colorForSection(node.section);
                ctx.fill();
                // Pinned-node ring (subtle) so the operator sees which nodes
                // they've dragged into place.
                if (node.fx != null || node.fy != null) {
                  ctx.strokeStyle = "#f1f5f9";
                  ctx.lineWidth = 1 / scale;
                  ctx.stroke();
                }
                // Label policy: hub nodes always; hovered node always;
                // missing nodes never (they carry no title worth reading).
                const isHoverThis = node.id === hoveredId;
                const showLabel =
                  node.section !== "missing" &&
                  (node.degree >= LABEL_MIN_DEGREE || isHoverThis);
                if (showLabel) {
                  const label = node.title;
                  const fontSize = Math.max(10 / scale, 10);
                  ctx.font = `${isHoverThis ? "bold " : ""}${fontSize}px sans-serif`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "bottom";
                  ctx.fillStyle = "#f1f5f9";
                  ctx.fillText(label, x, y - r - 2);
                }
                ctx.globalAlpha = prev;
              }}
              nodeCanvasObjectMode={() => "replace"}
            />
            <GraphLegend
              counts={countBySection(graphQuery.data)}
              edges={graphQuery.data.edges.length}
            />
          </>
        ) : null}
      </div>
    </PageWrapper>
  );
}

function countBySection(g: WikiGraph): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of g.nodes) {
    counts[n.section] = (counts[n.section] ?? 0) + 1;
  }
  return counts;
}

function GraphSkeleton() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-4 w-40 animate-pulse rounded bg-surface2/50" />
        <div className="h-3 w-24 animate-pulse rounded bg-surface2/50" />
      </div>
    </div>
  );
}

function GraphEmptyPanel() {
  return (
    <div className="grid h-full place-items-center">
      <div className="text-center">
        <p className="text-sm text-textSecondary">
          Vault is empty — nothing to graph.
        </p>
        <p className="mt-1 text-xs text-textMuted">
          Compile the vault first (button above).
        </p>
      </div>
    </div>
  );
}

function GraphErrorPanel({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
        Failed to load wiki graph: {message}
      </div>
    </div>
  );
}

function GraphLegend({
  counts,
  edges,
}: {
  counts: Record<string, number>;
  edges: number;
}) {
  const sections = ["entities", "system", "root", "missing"].filter(
    (s) => counts[s],
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-md border border-border bg-background/80 px-3 py-2 text-xs text-textSecondary backdrop-blur">
      <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
        {total} nodes · {edges} edges
      </div>
      {sections.map((s) => (
        <div key={s} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: colorForSection(s) }}
          />
          <span className="capitalize">{s}</span>
          <span className="text-textMuted">· {counts[s]}</span>
        </div>
      ))}
    </div>
  );
}
