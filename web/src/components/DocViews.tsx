"use client";

import * as React from "react";
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  Code,
  FileSearch,
  GitBranch,
  ShieldAlert,
  Zap,
} from "lucide-react";
import {
  CONFIDENCE_META,
  EDGE_KIND_META,
  NODE_KIND_META,
  dependenciesOf,
  dependentsOf,
  linkEndpoints,
  nodeById,
  type Confidence,
  type Evidence,
  type GraphData,
  type GraphLink,
  type GraphNode,
} from "@/lib/data";
import { SubGraph } from "./SubGraph";
import { CodeBlock, cn, colorAlpha } from "./ui";

// ── Shared helpers ───────────────────────────────────────────────────────────

const GROUP_COLOR: Record<string, string> = {
  Internal: "var(--color-node-service)",
  Infrastructure: "var(--color-node-infra)",
  External: "var(--color-node-external)",
  Config: "var(--color-node-neutral)",
};

function confidenceNote(c: Confidence): string {
  return c === "confirmed"
    ? "Explicit in the code — high trust."
    : c === "inferred"
      ? "Inferred from code patterns — spot-check before relying on it."
      : "Partially inferred — verify directly against the code.";
}

function critColor(c: number): string {
  return c >= 5 ? "var(--color-err)" : c >= 4 ? "var(--color-warn)" : "var(--color-node-infra)";
}

function critNote(c: number): string {
  if (c >= 5) return "Critical path — failures are user-visible.";
  if (c >= 4) return "High impact — ripples to other services.";
  if (c >= 3) return "Moderate — degrades a feature.";
  if (c >= 2) return "Limited — mostly contained.";
  return "Peripheral — low blast radius.";
}

// ── Chart primitives ─────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
      {icon}
      {children}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-bg px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className="mt-1 font-mono text-[20px] font-semibold leading-none text-ink" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {sub && <p className="mt-1 truncate font-mono text-[10px] text-faint">{sub}</p>}
    </div>
  );
}

function BarChart({ items }: { items: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate font-mono text-[11px] text-muted">{it.label}</span>
          <div className="relative h-3.5 flex-1 overflow-hidden rounded-sm bg-surface">
            <div
              className="h-full rounded-sm"
              style={{ width: `${Math.max(3, (it.value / max) * 100)}%`, backgroundColor: it.color }}
            />
          </div>
          <span className="w-7 shrink-0 text-right font-mono text-[11px] text-faint">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({
  segments,
  centerLabel,
  centerSub,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel: React.ReactNode;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 42;
  const C = 2 * Math.PI * r;
  const slices = segments.reduce<Array<{ segment: (typeof segments)[number]; len: number; offset: number }>>(
    (items, segment) => {
      const offset = items.reduce((sum, item) => sum + item.len, 0);
      return [...items, { segment, len: (segment.value / total) * C, offset }];
    },
    [],
  );
  return (
    <div className="flex items-center gap-4">
      <svg width={108} height={108} viewBox="0 0 108 108" className="shrink-0 -rotate-90">
        <circle cx={54} cy={54} r={r} fill="none" stroke="var(--color-surface)" strokeWidth={12} />
        {slices.map(({ segment, len, offset }) => (
          <circle
            key={segment.label}
            cx={54}
            cy={54}
            r={r}
            fill="none"
            stroke={segment.color}
            strokeWidth={12}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
          />
        ))}
      </svg>
      <div className="min-w-0">
        <div className="mb-2 rotate-0 font-mono">
          <span className="text-[20px] font-semibold text-ink">{centerLabel}</span>
          {centerSub && <span className="ml-1 text-[11px] text-faint">{centerSub}</span>}
        </div>
        <div className="space-y-1">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="font-mono text-[11px] text-muted">{seg.label}</span>
              <span className="ml-auto font-mono text-[11px] text-faint">
                {seg.value} · {Math.round((seg.value / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CritGauge({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-2.5 w-7" : size === "sm" ? "h-1.5 w-4" : "h-2 w-5";
  const color = critColor(value);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn("rounded-sm", dims)}
            style={{ backgroundColor: i <= value ? color : "var(--color-surface-2)" }}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] text-faint">{value}/5</span>
    </div>
  );
}

function ConfPill({ value }: { value: Confidence }) {
  const meta = CONFIDENCE_META[value];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px]"
      style={{ color: meta.color, borderColor: colorAlpha(meta.color, 33) }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

function EvidenceCards({ evidence }: { evidence?: Evidence[] }) {
  if (!evidence || evidence.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line px-3 py-2 text-[12px] text-faint">
        No direct evidence captured — treat claims as inferred and verify in code.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {evidence.map((e, i) => {
        const range = e.lineEnd && e.lineEnd !== e.lineStart ? `L${e.lineStart}-L${e.lineEnd}` : `L${e.lineStart}`;
        return (
          <div key={e.id ?? `${e.filePath}-${i}`} className="overflow-hidden rounded-md border border-line">
            <div className="flex items-center gap-1.5 border-b border-line bg-bg px-2.5 py-1.5">
              <FileSearch className="h-3 w-3 shrink-0 text-faint" />
              <span className="truncate font-mono text-[11px] text-muted">
                {e.filePath}:{range}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">{e.detector}</span>
            </div>
            {e.snippet && e.snippet.trim() && (
              <pre className="scroll-thin overflow-x-auto bg-code-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-code">
                {e.snippet.trimEnd()}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Dependency card (collapsible, used inside node docs) ──────────────────────

function DepCard({
  link,
  peer,
  direction,
  onJump,
}: {
  link: GraphLink;
  peer: GraphNode | undefined;
  direction: "out" | "in";
  onJump?: (id: string) => void;
}) {
  const isHigh = link.criticality >= 4;
  const [open, setOpen] = React.useState(isHigh);
  const meta = EDGE_KIND_META[link.kind];
  const peerMeta = peer ? NODE_KIND_META[peer.kind] : null;
  return (
    <div className={cn("overflow-hidden rounded-md border", isHigh ? "border-warn/25" : "border-line")}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="flex w-full cursor-pointer items-center gap-2.5 bg-bg px-3 py-2 text-left"
      >
        <span className="shrink-0 font-mono text-[13px]" style={{ color: meta.color }}>
          {direction === "out" ? "→" : "←"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (peer && onJump) onJump(peer.id);
          }}
          className="min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-[12.5px] font-semibold text-ink hover:underline"
        >
          {peer?.label ?? (direction === "out" ? link.target : link.source)}
          {peerMeta && <span className="ml-2 text-[10px] font-normal" style={{ color: peerMeta.color }}>{peerMeta.group}</span>}
        </button>
        <span
          className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9.5px]"
          style={{ color: meta.color, borderColor: colorAlpha(meta.color, 27) }}
        >
          {meta.label}
        </span>
        <CritGauge value={link.criticality} size="sm" />
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />}
      </div>
      {open && (
        <div className="space-y-2.5 border-t border-line px-3 py-2.5">
          <p className="text-[12.5px] leading-relaxed text-muted">{link.summary}</p>
          {link.contract && link.contract !== "No contract inferred yet." && (
            <div>
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Contract</p>
              <pre className="scroll-thin overflow-x-auto rounded border border-line bg-code-bg p-2.5 font-mono text-[11px] leading-relaxed text-code">
                {link.contract}
              </pre>
            </div>
          )}
          <div className="flex items-start gap-2 rounded border border-err/20 bg-err/5 px-2.5 py-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-err" />
            <p className="text-[11.5px] leading-relaxed text-err/80">{link.failure}</p>
          </div>
          {link.beforeYouChange && (
            <div className="rounded border border-warn/30 bg-warn/5 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-warn/90">
              ⚠️ {link.beforeYouChange}
            </div>
          )}
          {link.code && link.code !== "// No snippet available for this relationship yet." && (
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <Code className="h-3 w-3 text-faint" />
                <span className="font-mono text-[10px] text-faint">{link.codePath}</span>
              </div>
              <CodeBlock code={link.code} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── System brief: at-a-glance dashboard for the whole scan ────────────────────

export function SystemBriefView({ graph, repoLabel }: { graph: GraphData; repoLabel: string }) {
  const nodes = graph.nodes;
  const links = graph.links;
  const external = nodes.filter((n) => n.kind === "external").length;
  const confirmed = links.filter((l) => l.confidence === "confirmed").length;
  const confirmedPct = links.length ? Math.round((confirmed / links.length) * 100) : 0;

  const groups = ["Internal", "Infrastructure", "External", "Config"];
  const nodeByGroup = groups
    .map((g) => ({
      label: g,
      value: nodes.filter((n) => NODE_KIND_META[n.kind].group === g).length,
      color: GROUP_COLOR[g],
    }))
    .filter((x) => x.value > 0);

  const edgeKinds = (Object.keys(EDGE_KIND_META) as Array<keyof typeof EDGE_KIND_META>)
    .map((k) => ({
      label: EDGE_KIND_META[k].label,
      value: links.filter((l) => l.kind === k).length,
      color: EDGE_KIND_META[k].color,
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  const confSegments = (["confirmed", "inferred", "uncertain"] as Confidence[])
    .map((c) => ({ label: CONFIDENCE_META[c].label, value: links.filter((l) => l.confidence === c).length, color: CONFIDENCE_META[c].color }))
    .filter((x) => x.value > 0);

  const degree = new Map<string, number>();
  nodes.forEach((n) => degree.set(n.id, 0));
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }
  const hubs = [...nodes]
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    .slice(0, 6)
    .map((n) => ({ label: n.label, value: degree.get(n.id) ?? 0, color: NODE_KIND_META[n.kind].color }));

  const critical = links
    .filter((l) => l.criticality >= 4)
    .sort((a, b) => b.criticality - a.criticality)
    .slice(0, 6);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-mono text-[17px] font-semibold text-ink">System brief</h1>
        <p className="mt-1 font-mono text-[12px] text-faint">{repoLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Nodes" value={nodes.length} accent="var(--color-node-service)" />
        <StatTile label="Connections" value={links.length} accent="var(--color-node-infra)" />
        <StatTile label="External deps" value={external} accent="var(--color-node-external)" />
        <StatTile label="Confirmed" value={`${confirmedPct}%`} sub={`${confirmed}/${links.length} edges`} accent="var(--color-ok)" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <SectionTitle icon={<Boxes className="h-3 w-3" />}>Nodes by group</SectionTitle>
          <BarChart items={nodeByGroup} />
        </div>
        <div>
          <SectionTitle icon={<Share2Mini />}>Connections by type</SectionTitle>
          <BarChart items={edgeKinds} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <SectionTitle>Edge confidence</SectionTitle>
          <Donut segments={confSegments} centerLabel={`${confirmedPct}%`} centerSub="confirmed" />
        </div>
        <div>
          <SectionTitle icon={<Zap className="h-3 w-3" />}>Most connected (hubs)</SectionTitle>
          <BarChart items={hubs} />
        </div>
      </div>

      <div>
        <SectionTitle icon={<ShieldAlert className="h-3 w-3 text-warn" />}>Critical connections</SectionTitle>
        {critical.length === 0 ? (
          <p className="text-[12.5px] text-faint">No high-criticality connections detected.</p>
        ) : (
          <div className="space-y-1.5">
            {critical.map((l) => {
              const { source, target } = linkEndpoints(l, graph);
              return (
                <div key={l.id} className="flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                    {source?.label ?? l.source} <span className="text-faint">→</span> {target?.label ?? l.target}
                  </span>
                  <span className="shrink-0 font-mono text-[10px]" style={{ color: EDGE_KIND_META[l.kind].color }}>
                    {EDGE_KIND_META[l.kind].label}
                  </span>
                  <CritGauge value={l.criticality} size="sm" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Share2Mini() {
  return <GitBranch className="h-3 w-3" />;
}

// ── Node document ─────────────────────────────────────────────────────────────

export function NodeDocView({
  node,
  graph,
  onJumpToNode,
}: {
  node: GraphNode;
  graph: GraphData;
  onJumpToNode?: (id: string) => void;
}) {
  const meta = NODE_KIND_META[node.kind];
  const deps = dependenciesOf(node.id, graph);
  const dependents = dependentsOf(node.id, graph);
  const maxCrit = [...deps, ...dependents].reduce((m, l) => Math.max(m, l.criticality), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
            style={{ borderColor: colorAlpha(meta.color, 27), backgroundColor: colorAlpha(meta.color, 8) }}
          >
            <span className="font-mono text-[11px] font-bold" style={{ color: meta.color }}>
              {node.label.slice(0, 2).toUpperCase()}
            </span>
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-mono text-[16px] font-semibold text-ink">{node.label}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px]" style={{ color: meta.color, borderColor: colorAlpha(meta.color, 27) }}>
                {meta.group}
              </span>
              <span className="font-mono text-[11px] text-faint">{node.domain}</span>
              <ConfPill value={node.confidence} />
            </div>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Fan-out" value={deps.length} sub="depends on" />
        <StatTile label="Blast radius" value={dependents.length} sub="depended on by" />
        <StatTile label="Max criticality" value={maxCrit ? `${maxCrit}/5` : "—"} accent={maxCrit ? critColor(maxCrit) : undefined} />
        <StatTile label="Location" value={node.path ? "📁" : "—"} sub={node.path ?? "not resolved"} />
      </div>

      {maxCrit >= 4 && (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] text-muted" style={{ borderColor: colorAlpha("var(--color-warn)", 27), backgroundColor: colorAlpha("var(--color-warn)", 6) }}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warn" />
          On a critical path — a connection here is {maxCrit}/5. Changes can ripple system-wide.
        </div>
      )}

      {/* Connection diagram */}
      {(deps.length > 0 || dependents.length > 0) && (
        <div>
          <SectionTitle icon={<GitBranch className="h-3 w-3" />}>Connection map — click a node to jump</SectionTitle>
          <div className="rounded-md border border-line bg-bg py-2">
            <SubGraph node={node} graphData={graph} onSelectNode={(id) => onJumpToNode?.(id)} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <SectionTitle>What it is</SectionTitle>
          <p className="text-[13px] leading-relaxed text-muted">{node.whatItIs}</p>
        </div>
        <div>
          <SectionTitle>Why it exists</SectionTitle>
          <p className="text-[13px] leading-relaxed text-muted">{node.whyItExists}</p>
        </div>
      </div>

      {node.owns.length > 0 && (
        <div>
          <SectionTitle>Owns / responsibilities</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {node.owns.map((o) => (
              <span key={o} className="rounded border border-line bg-bg px-2 py-0.5 font-mono text-[11px] text-muted">
                {o}
              </span>
            ))}
          </div>
        </div>
      )}

      {deps.length > 0 && (
        <div>
          <SectionTitle icon={<ChevronRight className="h-3 w-3" />}>Depends on · {deps.length}</SectionTitle>
          <div className="space-y-2">
            {deps
              .slice()
              .sort((a, b) => b.criticality - a.criticality)
              .map((l) => (
                <DepCard key={l.id} link={l} peer={nodeById(l.target, graph)} direction="out" onJump={onJumpToNode} />
              ))}
          </div>
        </div>
      )}

      {dependents.length > 0 && (
        <div>
          <SectionTitle icon={<ChevronLeftMini />}>Depended on by · {dependents.length}</SectionTitle>
          <div className="space-y-2">
            {dependents
              .slice()
              .sort((a, b) => b.criticality - a.criticality)
              .map((l) => (
                <DepCard key={l.id} link={l} peer={nodeById(l.source, graph)} direction="in" onJump={onJumpToNode} />
              ))}
          </div>
        </div>
      )}

      {node.risks.length > 0 && (
        <div>
          <SectionTitle icon={<ShieldAlert className="h-3 w-3 text-warn" />}>Risk flags</SectionTitle>
          <ul className="space-y-1.5">
            {node.risks.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[13px] text-muted">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionTitle icon={<FileSearch className="h-3 w-3" />}>Evidence</SectionTitle>
        <EvidenceCards evidence={node.evidence} />
      </div>
    </div>
  );
}

function ChevronLeftMini() {
  return <ChevronRight className="h-3 w-3 rotate-180" />;
}

// ── Link document ─────────────────────────────────────────────────────────────

export function LinkDocView({
  link,
  graph,
  onJumpToNode,
}: {
  link: GraphLink;
  graph: GraphData;
  onJumpToNode?: (id: string) => void;
}) {
  const { source, target } = linkEndpoints(link, graph);
  const meta = EDGE_KIND_META[link.kind];
  const srcMeta = source ? NODE_KIND_META[source.kind] : null;
  const tgtMeta = target ? NODE_KIND_META[target.kind] : null;

  return (
    <div className="space-y-6">
      {/* Header: endpoints */}
      <div className="border-b border-line pb-4">
        <span className="rounded border px-1.5 py-0.5 font-mono text-[10px]" style={{ color: meta.color, borderColor: colorAlpha(meta.color, 33) }}>
          {meta.label}
        </span>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => source && onJumpToNode?.(source.id)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 text-left hover:border-line-2"
          >
            {srcMeta && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: srcMeta.color }} />}
            <span className="min-w-0">
              <span className="block truncate font-mono text-[12.5px] text-ink">{source?.label ?? link.source}</span>
              <span className="font-mono text-[10px] text-faint">{srcMeta?.group ?? "caller"}</span>
            </span>
          </button>
          <span className="shrink-0 font-mono text-[16px]" style={{ color: meta.color }}>→</span>
          <button
            onClick={() => target && onJumpToNode?.(target.id)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 text-left hover:border-line-2"
          >
            {tgtMeta && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tgtMeta.color }} />}
            <span className="min-w-0">
              <span className="block truncate font-mono text-[12.5px] text-ink">{target?.label ?? link.target}</span>
              <span className="font-mono text-[10px] text-faint">{tgtMeta?.group ?? "callee"}</span>
            </span>
          </button>
        </div>
      </div>

      {/* Criticality + confidence */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-bg px-3 py-2.5">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Criticality</p>
          <CritGauge value={link.criticality} size="lg" />
          <p className="mt-1.5 text-[11.5px] text-faint">{critNote(link.criticality)}</p>
        </div>
        <div className="rounded-lg border border-line bg-bg px-3 py-2.5">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Confidence</p>
          <ConfPill value={link.confidence} />
          <p className="mt-1.5 text-[11.5px] text-faint">{confidenceNote(link.confidence)}</p>
        </div>
      </div>

      <div>
        <SectionTitle>Summary</SectionTitle>
        <p className="text-[13px] leading-relaxed text-muted">{link.summary}</p>
      </div>

      {link.code && link.code !== "// No snippet available for this relationship yet." && (
        <div>
          <SectionTitle icon={<Code className="h-3 w-3" />}>How they connect</SectionTitle>
          <CodeBlock code={link.code} caption={link.codePath} />
        </div>
      )}

      {link.contract && link.contract !== "No contract inferred yet." && (
        <div>
          <SectionTitle>Contract</SectionTitle>
          <pre className="scroll-thin overflow-x-auto rounded-md border border-line bg-code-bg p-3 font-mono text-[12px] leading-relaxed text-code">
            {link.contract}
          </pre>
        </div>
      )}

      <div>
        <SectionTitle icon={<AlertTriangle className="h-3 w-3 text-err" />}>Failure behavior</SectionTitle>
        <div className="rounded-md border border-err/20 bg-err/5 px-3 py-2.5 text-[12.5px] leading-relaxed text-err/80">
          {link.failure}
        </div>
      </div>

      {link.beforeYouChange && (
        <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2.5">
          <div className="mb-1 flex items-center gap-2 font-mono text-[11px] font-semibold text-warn">
            <AlertTriangle className="h-3.5 w-3.5" /> Before you change this
          </div>
          <p className="text-[12.5px] leading-relaxed text-muted">{link.beforeYouChange}</p>
        </div>
      )}

      {link.risks.length > 0 && (
        <div>
          <SectionTitle icon={<ShieldAlert className="h-3 w-3 text-warn" />}>Risks</SectionTitle>
          <ul className="space-y-1.5">
            {link.risks.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[13px] text-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionTitle icon={<FileSearch className="h-3 w-3" />}>Evidence</SectionTitle>
        <EvidenceCards evidence={link.evidence} />
      </div>
    </div>
  );
}
