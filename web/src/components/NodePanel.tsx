"use client";

import * as React from "react";
import { X, Crosshair, Copy, Check, ArrowRight, GitBranch, Info, ChevronLeft, Code } from "lucide-react";
import {
  dependenciesOf,
  dependenciesOfIn,
  dependentsOf,
  dependentsOfIn,
  EDGE_KIND_META,
  GRAPH,
  type GraphData,
  NODE_KIND_META,
  nodeById,
  nodeByIdIn,
  nodeContextMarkdown,
  type GraphNode,
} from "@/lib/data";
import { NODE_ICON } from "./icons";
import { SubGraph } from "./SubGraph";
import { ConfidenceBadge, RiskRow, SectionLabel, Tag, CodeBlock, cn } from "./ui";

type PanelView = "overview" | "subgraph";

function ConnRow({
  label, kindLabel, color, onClick, arrow,
}: {
  label: string; kindLabel: string; color: string; onClick: () => void; arrow: "out" | "in";
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-left transition-colors duration-150 hover:border-[#3a3a3a] hover:bg-[#111]"
    >
      <ArrowRight
        className={cn("h-3.5 w-3.5 shrink-0", arrow === "in" && "rotate-180")}
        style={{ color }}
      />
      <span className="flex-1 truncate font-mono text-[12.5px] text-[#ededed]">{label}</span>
      <span className="shrink-0 font-mono text-[11px] text-[#555]">{kindLabel}</span>
    </button>
  );
}

export function NodePanel({
  node,
  graph = GRAPH,
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
  graph?: GraphData;
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
  const isMockGraph = graph === GRAPH;
  const deps = isMockGraph ? dependenciesOf(node.id) : dependenciesOfIn(graph, node.id);
  const dependents = isMockGraph ? dependentsOf(node.id) : dependentsOfIn(graph, node.id);
  const hasConnections = deps.length > 0 || dependents.length > 0;
  const lookupNode = React.useCallback(
    (id: string) => (isMockGraph ? nodeById(id) : nodeByIdIn(graph, id)),
    [graph, isMockGraph],
  );

  async function copy() {
    await navigator.clipboard.writeText(nodeContextMarkdown(node));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Breadcrumb trail ── */}
      {nodeHistory.length > 0 && (
        <div className="flex items-center gap-1 border-b border-[#1e2028] bg-[#0c0d10] px-3 py-1.5">
          <button
            onClick={onGoBack}
            className="flex cursor-pointer items-center gap-1 text-[11px] text-[#5c5e6a] transition-colors duration-150 hover:text-[#8b8d98]"
          >
            <ChevronLeft className="h-3 w-3" />
            Back
          </button>
          <div className="mx-1.5 h-3 w-px bg-[#2a2c36]" />
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {nodeHistory.map((h, i) => (
              <React.Fragment key={h.id}>
                <span className="shrink-0 font-mono text-[10px] text-[#3a3c48]">{h.label}</span>
                {i < nodeHistory.length - 1 && (
                  <span className="shrink-0 text-[10px] text-[#2a2c36]">›</span>
                )}
              </React.Fragment>
            ))}
            <span className="shrink-0 text-[10px] text-[#3a3c48]">›</span>
            <span className="shrink-0 font-mono text-[10px] font-semibold text-[#5c5e6a]">
              {node.label}
            </span>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="border-b border-[#2a2a2a] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center border"
              style={{ borderColor: `${meta.color}44`, backgroundColor: `${meta.color}10` }}
            >
              <Icon className="h-4 w-4" style={{ color: meta.color }} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-[13px] font-semibold text-[#ededed]">{node.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Tag color={meta.color}>{meta.group}</Tag>
                <span className="font-mono text-[11px] text-[#555]">{node.domain}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer p-1 text-[#555] transition-colors duration-150 hover:text-[#ededed]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ConfidenceBadge value={node.confidence} />
          {node.path && (
            <span className="font-mono text-[11px] text-[#555]">{node.path}</span>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-[#2a2a2a] bg-[#0c0d10]">
        <button
          onClick={() => onViewChange("overview")}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-colors duration-150",
            view === "overview"
              ? "border-b-2 border-[#818cf8] text-[#ededed]"
              : "text-[#5c5e6a] hover:text-[#8b8d98]",
          )}
          style={{ borderColor: view === "overview" ? "#818cf8" : "transparent" }}
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
              ? "border-b-2 border-[#818cf8] text-[#ededed]"
              : "text-[#5c5e6a] hover:text-[#8b8d98]",
          )}
          style={{ borderColor: view === "subgraph" ? "#818cf8" : "transparent" }}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Sub-graph
          {hasConnections && (
            <span className="rounded-full bg-[#1e2028] px-1.5 py-0.5 font-mono text-[10px] text-[#5c5e6a]">
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
              <p className="text-[13px] leading-relaxed text-[#888]">{node.whatItIs}</p>
            </div>
            <div>
              <SectionLabel>Why it exists</SectionLabel>
              <p className="text-[13px] leading-relaxed text-[#888]">{node.whyItExists}</p>
            </div>
            {node.owns.length > 0 && (
              <div>
                <SectionLabel>Owns</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {node.owns.map((o) => (
                    <span
                      key={o}
                      className="border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-0.5 font-mono text-[12px] text-[#888]"
                    >
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dependency rows — clicking opens link panel */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Depends on · {deps.length}</SectionLabel>
                {deps.length > 0 && (
                  <button
                    onClick={() => onViewChange("subgraph")}
                    className="flex cursor-pointer items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-0.5 font-mono text-[10px] text-[#5c5e6a] transition-colors duration-150 hover:border-[#3a3a3a] hover:text-[#8b8d98]"
                  >
                    <GitBranch className="h-2.5 w-2.5" />
                    Explore
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {deps.length === 0 && (
                  <p className="text-[13px] text-[#555]">None.</p>
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
                  <p className="text-[13px] text-[#555]">Nothing.</p>
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

            {/* Drill-down prompt when connections exist */}
            {hasConnections && (
              <button
                onClick={() => onViewChange("subgraph")}
                className="flex w-full cursor-pointer items-center justify-center gap-2 border border-dashed border-[#2a2a2a] py-3 text-[12px] text-[#5c5e6a] transition-colors duration-150 hover:border-[#3a3a3a] hover:text-[#8b8d98]"
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
            <div className="flex items-center justify-between border-b border-[#1e2028] bg-[#0a0a0e] px-4 py-2">
              <p className="font-mono text-[10px] text-[#3a3c48]">
                Click any node to drill deeper
              </p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-[#3a3c48]">
                  {deps.length} out · {dependents.length} in
                </span>
              </div>
            </div>

            <div className="px-2 pt-4 pb-2">
              <SubGraph node={node} graph={graph} onSelectNode={onDrillDown} />
            </div>

            {/* Code snippets for outgoing dependencies */}
            {deps.some((l) => l.code) && (
              <div className="border-t border-[#1e2028] px-4 pt-4 pb-4">
                <SectionLabel>Code · how this node calls its deps</SectionLabel>
                <div className="space-y-3">
                  {deps
                    .filter((l) => l.code)
                    .map((l) => {
                      const target = lookupNode(l.target);
                      return (
                        <div key={l.id}>
                          <div className="mb-1.5 flex items-center gap-2">
                            <Code className="h-3 w-3 text-[#5c5e6a]" />
                            <span className="font-mono text-[11px] text-[#5c5e6a]">
                              → {target?.label ?? l.target}
                            </span>
                            <span className="ml-auto font-mono text-[10px] text-[#3a3c48]">
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
      <div className="flex items-center gap-2 border-t border-[#2a2a2a] p-3">
        <button
          onClick={onFocus}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 border border-[#2a2a2a] bg-[#0a0a0a] py-2 text-[13px] text-[#888] transition-colors duration-150 hover:border-[#3a3a3a] hover:text-[#ededed]"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Focus
        </button>
        <button
          onClick={copy}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 bg-[#ededed] py-2 text-[13px] font-semibold text-black transition-colors duration-150 hover:bg-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy context"}
        </button>
      </div>
    </div>
  );
}
