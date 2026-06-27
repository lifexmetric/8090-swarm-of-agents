"use client";

import * as React from "react";
import { X, Copy, Check, ArrowRight, AlertTriangle } from "lucide-react";
import {
  EDGE_KIND_META,
  linkContextMarkdown,
  linkEndpoints,
  NODE_KIND_META,
  type GraphLink,
} from "@/lib/data";
import { EDGE_ICON, NODE_ICON } from "./icons";
import { CodeBlock, ConfidenceBadge, RiskRow, SectionLabel, Tag } from "./ui";

function CritBar({ value }: { value: number }) {
  const color = value >= 4 ? "#ef4444" : value >= 3 ? "#f59e0b" : "#3b82f6";
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="h-1 w-5"
            style={{ backgroundColor: i <= value ? color : "#2a2a2a" }}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] text-[#555]">{value}/5</span>
    </div>
  );
}

export function LinkPanel({
  link, onClose, onSelectNode,
}: {
  link: GraphLink; onClose: () => void; onSelectNode: (id: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const { source, target } = linkEndpoints(link);
  const meta = EDGE_KIND_META[link.kind];
  const Icon = EDGE_ICON[link.kind];
  const SourceIcon = source ? NODE_ICON[source.kind] : null;
  const TargetIcon = target ? NODE_ICON[target.kind] : null;

  async function copy() {
    await navigator.clipboard.writeText(linkContextMarkdown(link));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[#2a2a2a] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center border"
              style={{ borderColor: `${meta.color}44`, backgroundColor: `${meta.color}10` }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
            </span>
            <Tag color={meta.color}>{meta.label}</Tag>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer p-1 text-[#555] transition-colors duration-150 hover:text-[#ededed]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Source → Target */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => source && onSelectNode(source.id)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border border-[#2a2a2a] bg-[#0a0a0a] px-2.5 py-2 text-left transition-colors duration-150 hover:border-[#3a3a3a]"
          >
            {source && SourceIcon && (
              <SourceIcon className="h-3.5 w-3.5 shrink-0" style={{ color: NODE_KIND_META[source.kind].color }} />
            )}
            <span className="truncate font-mono text-[12.5px] text-[#ededed]">{source?.label}</span>
          </button>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#555]" />
          <button
            onClick={() => target && onSelectNode(target.id)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border border-[#2a2a2a] bg-[#0a0a0a] px-2.5 py-2 text-left transition-colors duration-150 hover:border-[#3a3a3a]"
          >
            {target && TargetIcon && (
              <TargetIcon className="h-3.5 w-3.5 shrink-0" style={{ color: NODE_KIND_META[target.kind].color }} />
            )}
            <span className="truncate font-mono text-[12.5px] text-[#ededed]">{target?.label}</span>
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <ConfidenceBadge value={link.confidence} />
          <CritBar value={link.criticality} />
        </div>
      </div>

      {/* Body */}
      <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <SectionLabel>Summary</SectionLabel>
          <p className="text-[13px] leading-relaxed text-[#888]">{link.summary}</p>
        </div>
        <div>
          <SectionLabel>Code</SectionLabel>
          <CodeBlock code={link.code} caption={link.codePath} />
        </div>
        <div>
          <SectionLabel>Contract</SectionLabel>
          <pre className="scroll-thin overflow-x-auto border border-[#2a2a2a] bg-[#0a0a0a] p-3 font-mono text-[12px] leading-relaxed text-[#3b82f6]">
            {link.contract}
          </pre>
        </div>
        <div>
          <SectionLabel>Failure behavior</SectionLabel>
          <p className="text-[13px] leading-relaxed text-[#888]">{link.failure}</p>
        </div>
        {link.risks.length > 0 && (
          <div>
            <SectionLabel>Known risks</SectionLabel>
            <ul className="space-y-1.5">
              {link.risks.map((r) => <RiskRow key={r} text={r} />)}
            </ul>
          </div>
        )}
        {link.beforeYouChange && (
          <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-3.5">
            <div className="mb-1.5 flex items-center gap-2 font-mono text-[12px] font-semibold text-[#f59e0b]">
              <AlertTriangle className="h-3.5 w-3.5" />
              Before you change this
            </div>
            <p className="text-[13px] leading-relaxed text-[#888]">{link.beforeYouChange}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[#2a2a2a] p-3">
        <button
          onClick={copy}
          className="flex w-full cursor-pointer items-center justify-center gap-2 bg-[#ededed] py-2 text-[13px] font-semibold text-black transition-colors duration-150 hover:bg-white"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied context file" : "Copy context file"}
        </button>
      </div>
    </div>
  );
}
