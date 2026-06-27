'use strict';

function buildPrompt(evidence, sourceFiles = []) {
  const { calmCtx, logs, logsNote, commits } = evidence;
  const node = calmCtx?.node ?? {};

  const lines = [];

  // ── Architecture context ───────────────────────────────────────────────────
  lines.push('## Affected Service');
  lines.push(`Node: ${node.name} (${node.nodeType})`);
  if (node.description) lines.push(`Description: ${node.description}`);
  if (node.technology)  lines.push(`Technology: ${node.technology}`);
  if (node.language)    lines.push(`Language: ${node.language}`);
  if (node.criticality) lines.push(`Criticality: ${node.criticality}`);
  lines.push('');

  if (calmCtx?.outbound?.length) {
    lines.push('Calls:');
    for (const e of calmCtx.outbound) {
      lines.push(`  → ${e.targetName} via ${e.protocol} (${e.criticality}) ${e.description ? '— ' + e.description : ''}`);
    }
    lines.push('');
  }
  if (calmCtx?.inbound?.length) {
    lines.push('Called by:');
    for (const e of calmCtx.inbound) {
      lines.push(`  ← ${e.sourceName} via ${e.protocol}`);
    }
    lines.push('');
  }

  // ── Commits ────────────────────────────────────────────────────────────────
  lines.push('## Recent Git Commits (newest first)');
  if (!commits?.length) {
    lines.push('No commits found.');
  } else {
    for (const c of commits.slice(0, 10)) {
      lines.push(`### ${c.shortHash} — ${c.message}`);
      lines.push(`Author: ${c.author}  Date: ${c.date}`);
      if (c.diff) {
        lines.push('```diff');
        lines.push(c.diff.slice(0, 8000));
        lines.push('```');
      }
      lines.push('');
    }
  }

  // ── Logs ───────────────────────────────────────────────────────────────────
  lines.push('## Service Logs');
  if (logs) {
    lines.push('```');
    // last 100 lines
    const logLines = logs.split('\n');
    lines.push(logLines.slice(-100).join('\n'));
    lines.push('```');
  } else {
    lines.push(`Logs not available. ${logsNote ?? ''}`);
    lines.push('Diagnose from commits and architecture context only.');
  }

  // ── Source files ────────────────────────────────────────────────────────────
  if (sourceFiles.length > 0) {
    lines.push('## Current Source Files');
    lines.push('These are the actual files in the repo right now. Use them to write fixed_content.');
    lines.push('');
    for (const f of sourceFiles) {
      const ext = f.path.split('.').pop();
      lines.push(`### ${f.path}`);
      lines.push('```' + ext);
      lines.push(f.content);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are a senior software engineer diagnosing a production incident in a microservices system.

You will be given:
1. Architecture context — which service is broken, what it connects to, and how
2. Recent git commits with diffs — the code changes closest to the incident
3. Service logs — live output from the failing container (may not be available)

First, write your reasoning in plain text: walk through what you see in the commits and logs, identify what changed, and explain why it caused the incident. Be specific — quote the exact lines.

Then call submit_diagnosis with:
- root_cause: one clear paragraph explaining what broke and why
- file_path: the exact repository-relative path of the file to fix
- fixed_content: the complete corrected file content (not a diff — the full file)
- explanation: one sentence describing what the fix changes

Do not guess. If the commits clearly show a bad change, that is the root cause.`;

module.exports = { buildPrompt, SYSTEM_PROMPT };
