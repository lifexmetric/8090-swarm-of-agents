"use client";

import * as React from "react";
import { X, Crosshair, Copy, Check, ArrowRight } from "lucide-react";
import {
  dependenciesOf,
  dependentsOf,
  EDGE_KIND_META,
  NODE_KIND_META,
  nodeById,
  nodeContextMarkdown,
  type GraphNode,
} from "@/lib/data";
import { NODE_ICON } from "./icons";
import { ConfidenceBadge, RiskRow, SectionLabel, Tag, cn } from "./ui";

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
  node, onClose, onFocus, onSelectLink,
}: {
  node: GraphNode; onClose: () => void; onFocus: () => void; onSelectLink: (id: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const meta = NODE_KIND_META[node.kind];
  const Icon = NODE_ICON[node.kind];
  const deps = dependenciesOf(node.id);
  const dependents = dependentsOf(node.id);

  async function copy() {
    await navigator.clipboard.writeText(nodeContextMarkdown(node));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
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
        <div className="mt-3">
          <ConfidenceBadge value={node.confidence} />
          {node.path && <span className="ml-3 font-mono text-[11px] text-[#555]">{node.path}</span>}
        </div>
      </div>

      {/* Body */}
      <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
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
                <span key={o} className="border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-0.5 font-mono text-[12px] text-[#888]">{o}</span>
              ))}
            </div>
          </div>
        )}
        <div>
          <SectionLabel>Depends on · {deps.length}</SectionLabel>
          <div className="space-y-1">
            {deps.length === 0 && <p className="text-[13px] text-[#555]">None.</p>}
            {deps.map((l) => (
              <ConnRow
                key={l.id}
                arrow="out"
                label={nodeById(l.target)?.label ?? l.target}
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
            {dependents.length === 0 && <p className="text-[13px] text-[#555]">Nothing.</p>}
            {dependents.map((l) => (
              <ConnRow
                key={l.id}
                arrow="in"
                label={nodeById(l.source)?.label ?? l.source}
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
              {node.risks.map((r) => <RiskRow key={r} text={r} />)}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
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
