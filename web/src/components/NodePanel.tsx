"use client";

import * as React from "react";
import { X, Crosshair, Copy, Check, ArrowRight, GitBranch, Info, ChevronLeft, Code } from "lucide-react";
import {
  dependenciesOf,
  dependentsOf,
  EDGE_KIND_META,
  NODE_KIND_META,
  nodeById,
  nodeContextMarkdown,
  type GraphData,
  type GraphLink,
  type GraphNode,
} from "@/lib/data";
import { NODE_ICON } from "./icons";
import { SubGraph } from "./SubGraph";
import { ConfidenceBadge, RiskRow, SectionLabel, Tag, CodeBlock, cn, colorAlpha } from "./ui";

type PanelView = "overview" | "subgraph";

function ConnRow({
  label, kindLabel, color, onClick, arrow,
}: {
  label: string; kindLabel: string; color: string; onClick: () => void; arrow: "out" | "in";
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 border border-line bg-bg px-3 py-2 text-left transition-colors duration-150 hover:border-line-2 hover:bg-surface"
    >
      <ArrowRight
        className={cn("h-3.5 w-3.5 shrink-0", arrow === "in" && "rotate-180")}
        style={{ color }}
      />
      <span className="flex-1 truncate font-mono text-[12.5px] text-ink">{label}</span>
      <span className="shrink-0 font-mono text-[11px] text-faint">{kindLabel}</span>
    </button>
  );
}

/** Compact label/value cell used in the "At a glance" facts grid. */
function Fact({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-surface px-2.5 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">{label}</p>
      <p
        className="mt-0.5 truncate font-mono text-[12px] text-ink"
        style={accent ? { color: accent } : undefined}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

type Conn = { link: GraphLink; peer: GraphNode | undefined; direction: "out" | "in" };

export function NodePanel({
  node,
  graphData,
  onClose,
  onFocus,
  onSelectLink,
  onDrillDown,
  nodeHistory,
  onGoBack,
  view,
  onViewChange,
}: {
  node: GraphNode;
  graphData: GraphData;
  onClose: () => void;
  onFocus: () => void;
  onSelectLink: (id: string) => void;
  onDrillDown: (id: string) => void;
  nodeHistory: GraphNode[];
  onGoBack: () => void;
  view: PanelView;
  onViewChange: (v: PanelView) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const meta = NODE_KIND_META[node.kind];
  const Icon = NODE_ICON[node.kind];
  const deps = dependenciesOf(node.id, graphData);
  const dependents = dependentsOf(node.id, graphData);
  const hasConnections = deps.length > 0 || dependents.length > 0;
  const lookupNode = React.useCallback(
    (id: string) => nodeById(id, graphData),
    [graphData],
  );

  // Developer-focused derived insight (works for demo + real scan data alike).
  const connections = React.useMemo<Conn[]>(
    () => [
      ...deps.map((link) => ({ link, peer: nodeById(link.target, graphData), direction: "out" as const })),
      ...dependents.map((link) => ({ link, peer: nodeById(link.source, graphData), direction: "in" as const })),
    ],
    [deps, dependents, graphData],
  );
  const maxCriticality = connections.reduce((m, c) => Math.max(m, c.link.criticality), 0);
  const onCriticalPath = maxCriticality >= 4;
  const contracts = connections.filter(
    (c) =>
      c.peer &&
      c.link.contract &&
      c.link.contract.trim() &&
      c.link.contract !== "No contract inferred yet.",
  );
  const headsUp = connections.filter((c) => c.link.beforeYouChange);

  async function copy() {
    await navigator.clipboard.writeText(nodeContextMarkdown(node, graphData));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Breadcrumb trail ── */}
      {nodeHistory.length > 0 && (
        <div className="flex items-center gap-1 border-b border-line bg-bg px-3 py-1.5">
          <button
            onClick={onGoBack}
            className="flex cursor-pointer items-center gap-1 text-[11px] text-faint transition-colors duration-150 hover:text-muted"
          >
            <ChevronLeft className="h-3 w-3" />
            Back
          </button>
          <div className="mx-1.5 h-3 w-px bg-line" />
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {nodeHistory.map((h, i) => (
              <React.Fragment key={h.id}>
                <span className="shrink-0 font-mono text-[10px] text-faint">{h.label}</span>
                {i < nodeHistory.length - 1 && (
                  <span className="shrink-0 text-[10px] text-line">›</span>
                )}
              </React.Fragment>
            ))}
            <span className="shrink-0 text-[10px] text-faint">›</span>
            <span className="shrink-0 font-mono text-[10px] font-semibold text-faint">
              {node.label}
            </span>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center border"
              style={{ borderColor: colorAlpha(meta.color, 27), backgroundColor: colorAlpha(meta.color, 6) }}
            >
              <Icon className="h-4 w-4" style={{ color: meta.color }} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-[13px] font-semibold text-ink">{node.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Tag color={meta.color}>{meta.group}</Tag>
                <span className="font-mono text-[11px] text-faint">{node.domain}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer p-1 text-faint transition-colors duration-150 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ConfidenceBadge value={node.confidence} />
          {node.path && (
            <span className="font-mono text-[11px] text-faint">{node.path}</span>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-line bg-bg">
        <button
          onClick={() => onViewChange("overview")}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-colors duration-150",
            view === "overview"
              ? "border-b-2 border-accent text-ink"
              : "text-faint hover:text-muted",
          )}
          style={{ borderColor: view === "overview" ? "var(--color-accent)" : "transparent" }}
        >
          <Info className="h-3.5 w-3.5" />
          Overview
        </button>
        <button
          onClick={() => onViewChange("subgraph")}
          disabled={!hasConnections}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
            view === "subgraph"
              ? "border-b-2 border-accent text-ink"
              : "text-faint hover:text-muted",
          )}
          style={{ borderColor: view === "subgraph" ? "var(--color-accent)" : "transparent" }}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Sub-graph
          {hasConnections && (
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-faint">
              {deps.length + dependents.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="scroll-thin flex-1 overflow-y-auto">
        {view === "overview" && (
          <div className="space-y-5 p-4">
            <div>
              <SectionLabel>What it is</SectionLabel>
              <p className="text-[13px] leading-relaxed text-muted">{node.whatItIs}</p>
            </div>

            {/* At a glance — quick facts for impact analysis */}
            <div>
              <SectionLabel>At a glance</SectionLabel>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
                <Fact label="Type" value={meta.label} accent={meta.color} />
                <Fact label="Domain" value={node.domain} />
                <Fact label="Fan-out" value={`${deps.length} ${deps.length === 1 ? "dependency" : "dependencies"}`} />
                <Fact
                  label="Blast radius"
                  value={`${dependents.length} ${dependents.length === 1 ? "dependent" : "dependents"}`}
                />
                <Fact label="Confidence" value={node.confidence} />
                <Fact label="Max criticality" value={maxCriticality ? `${maxCriticality}/5` : "—"} />
              </div>
              {node.path && (
                <p className="mt-1.5 font-mono text-[11px] text-faint">Location: {node.path}</p>
              )}
              {onCriticalPath && (
                <p
                  className="mt-1.5 rounded-md border px-2.5 py-1.5 text-[12px] leading-snug text-muted"
                  style={{
                    borderColor: colorAlpha("var(--color-warn)", 27),
                    backgroundColor: colorAlpha("var(--color-warn)", 6),
                  }}
                >
                  On a critical path — a connection here is criticality {maxCriticality}/5. Changes can ripple system-wide.
                </p>
              )}
            </div>

            <div>
              <SectionLabel>Why it exists</SectionLabel>
              <p className="text-[13px] leading-relaxed text-muted">{node.whyItExists}</p>
            </div>
            {node.owns.length > 0 && (
              <div>
                <SectionLabel>Owns / responsibilities</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {node.owns.map((o) => (
                    <span
                      key={o}
                      className="border border-line bg-bg px-2 py-0.5 font-mono text-[12px] text-muted"
                    >
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Interfaces & contracts — the actual signatures a dev needs */}
            {contracts.length > 0 && (
              <div>
                <SectionLabel>Interfaces &amp; contracts · {contracts.length}</SectionLabel>
                <div className="space-y-2">
                  {contracts.map((c) => {
                    const ek = EDGE_KIND_META[c.link.kind];
                    return (
                      <div key={c.link.id} className="overflow-hidden rounded-md border border-line">
                        <button
                          onClick={() => onSelectLink(c.link.id)}
                          className="flex w-full cursor-pointer items-center gap-1.5 border-b border-line bg-bg px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface"
                        >
                          <span className="shrink-0 font-mono text-[12px]" style={{ color: ek.color }}>
                            {c.direction === "out" ? "→" : "←"}
                          </span>
                          <span className="truncate font-mono text-[11.5px] text-muted">
                            {c.direction === "out" ? "calls " : "called by "}
                            <span className="text-ink">{c.peer?.label}</span>
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">
                            {ek.label} · {c.link.criticality}/5
                          </span>
                        </button>
                        <pre className="scroll-thin overflow-x-auto bg-code-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-code">
                          {c.link.contract}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Heads up — institutional knowledge before editing */}
            {headsUp.length > 0 && (
              <div>
                <SectionLabel>Heads up before you change</SectionLabel>
                <ul className="space-y-2">
                  {headsUp.map((c) => (
                    <li
                      key={c.link.id}
                      className="rounded-md border px-3 py-2 text-[12.5px] leading-relaxed text-muted"
                      style={{
                        borderColor: colorAlpha("var(--color-warn)", 27),
                        backgroundColor: colorAlpha("var(--color-warn)", 6),
                      }}
                    >
                      <span className="font-mono text-[10.5px] text-faint">
                        {c.direction === "out" ? `${node.label} → ${c.peer?.label}` : `${c.peer?.label} → ${node.label}`}
                      </span>
                      <p className="mt-1">{c.link.beforeYouChange}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Dependency rows — clicking opens link panel */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Depends on · {deps.length}</SectionLabel>
                {deps.length > 0 && (
                  <button
                    onClick={() => onViewChange("subgraph")}
                    className="flex cursor-pointer items-center gap-1 rounded-md border border-line bg-bg px-2 py-0.5 font-mono text-[10px] text-faint transition-colors duration-150 hover:border-line-2 hover:text-muted"
                  >
                    <GitBranch className="h-2.5 w-2.5" />
                    Explore
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {deps.length === 0 && (
                  <p className="text-[13px] text-faint">None.</p>
                )}
                {deps.map((l) => (
                  <ConnRow
                    key={l.id}
                    arrow="out"
                    label={lookupNode(l.target)?.label ?? l.target}
                    kindLabel={EDGE_KIND_META[l.kind].label}
                    color={EDGE_KIND_META[l.kind].color}
                    onClick={() => onSelectLink(l.id)}
                  />
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>Depended on by · {dependents.length}</SectionLabel>
              <div className="space-y-1">
                {dependents.length === 0 && (
                  <p className="text-[13px] text-faint">Nothing.</p>
                )}
                {dependents.map((l) => (
                  <ConnRow
                    key={l.id}
                    arrow="in"
                    label={lookupNode(l.source)?.label ?? l.source}
                    kindLabel={EDGE_KIND_META[l.kind].label}
                    color={EDGE_KIND_META[l.kind].color}
                    onClick={() => onSelectLink(l.id)}
                  />
                ))}
              </div>
            </div>

            {node.risks.length > 0 && (
              <div>
                <SectionLabel>Risk flags</SectionLabel>
                <ul className="space-y-1.5">
                  {node.risks.map((r) => (
                    <RiskRow key={r} text={r} />
                  ))}
                </ul>
              </div>
            )}

            {/* Evidence — where this node was detected, so claims are verifiable */}
            {node.evidence && node.evidence.length > 0 && (
              <div>
                <SectionLabel>Evidence · {node.evidence.length}</SectionLabel>
                <div className="space-y-1">
                  {node.evidence.map((e, i) => {
                    const range =
                      e.lineEnd && e.lineEnd !== e.lineStart
                        ? `L${e.lineStart}-L${e.lineEnd}`
                        : `L${e.lineStart}`;
                    return (
                      <div
                        key={e.id ?? `${e.filePath}-${e.lineStart}-${i}`}
                        className="flex items-center gap-2 border border-line bg-bg px-2.5 py-1.5"
                        title={e.confidenceReason}
                      >
                        <span className="truncate font-mono text-[11.5px] text-muted">
                          {e.filePath}:{range}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">{e.detector}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Drill-down prompt when connections exist */}
            {hasConnections && (
              <button
                onClick={() => onViewChange("subgraph")}
                className="flex w-full cursor-pointer items-center justify-center gap-2 border border-dashed border-line py-3 text-[12px] text-faint transition-colors duration-150 hover:border-line-2 hover:text-muted"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Explore connections as sub-graph
              </button>
            )}
          </div>
        )}

        {view === "subgraph" && (
          <div>
            {/* Sub-graph hint */}
            <div className="flex items-center justify-between border-b border-line bg-bg px-4 py-2">
              <p className="font-mono text-[10px] text-faint">
                Click any node to drill deeper
              </p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-faint">
                  {deps.length} out · {dependents.length} in
                </span>
              </div>
            </div>

            <div className="px-2 pt-4 pb-2">
              <SubGraph node={node} graphData={graphData} onSelectNode={onDrillDown} />
            </div>

            {/* Code snippets for outgoing dependencies */}
            {deps.some((l) => l.code) && (
              <div className="border-t border-line px-4 pt-4 pb-4">
                <SectionLabel>Code · how this node calls its deps</SectionLabel>
                <div className="space-y-3">
                  {deps
                    .filter((l) => l.code)
                    .map((l) => {
                      const target = lookupNode(l.target);
                      return (
                        <div key={l.id}>
                          <div className="mb-1.5 flex items-center gap-2">
                            <Code className="h-3 w-3 text-faint" />
                            <span className="font-mono text-[11px] text-faint">
                              → {target?.label ?? l.target}
                            </span>
                            <span className="ml-auto font-mono text-[10px] text-faint">
                              {l.codePath}
                            </span>
                          </div>
                          <CodeBlock code={l.code} />
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center gap-2 border-t border-line p-3">
        <button
          onClick={onFocus}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 border border-line bg-bg py-2 text-[13px] text-muted transition-colors duration-150 hover:border-line-2 hover:text-ink"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Focus
        </button>
        <button
          onClick={copy}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 bg-inverse py-2 text-[13px] font-semibold text-inverse-fg transition-opacity duration-150 hover:opacity-90"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy context"}
        </button>
      </div>
    </div>
  );
}
