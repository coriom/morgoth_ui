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
const LABEL_MIN_DEGREE = 8;

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
              linkColor={() => "#2a2a3a"}
              linkWidth={0.6}
              cooldownTicks={200}
              onNodeClick={handleNodeClick}
              nodeLabel={(n) => {
                const node = n as GraphNode;
                return `${node.title}  ·  ${node.section}  ·  deg ${node.degree}`;
              }}
              nodeCanvasObject={(n, ctx, scale) => {
                const node = n as GraphNode;
                const r = nodeRadius(node.degree);
                const x = node.x ?? 0;
                const y = node.y ?? 0;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, 2 * Math.PI);
                ctx.fillStyle = colorForSection(node.section);
                ctx.fill();
                // Persistent label for hub nodes only.
                if (node.degree >= LABEL_MIN_DEGREE) {
                  const label = node.title;
                  const fontSize = Math.max(10 / scale, 10);
                  ctx.font = `${fontSize}px sans-serif`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "bottom";
                  ctx.fillStyle = "#f1f5f9";
                  ctx.fillText(label, x, y - r - 2);
                }
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
