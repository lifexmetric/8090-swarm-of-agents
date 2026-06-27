'use strict';

function buildPrompt(evidence, sourceFiles = []) {
  const { calmCtx, logs, logsNote, commits, codeGraph } = evidence;
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

  // ── Code structure graph ────────────────────────────────────────────────────
  if (codeGraph && codeGraph.nodes && codeGraph.nodes.length > 0) {
    lines.push('## Code Structure (tree-sitter extracted)');
    lines.push('This is the code-level graph for this service. Use it to understand which');
    lines.push('functions and classes are involved, and their call relationships.');
    lines.push('');

    // List files with their functions and classes
    const files = codeGraph.nodes.filter(n => n.type === 'file');
    const contains = (codeGraph.edges || []).filter(e => e.type === 'contains');
    const calls = (codeGraph.edges || []).filter(e => e.type === 'calls');

    for (const file of files) {
      const children = contains
        .filter(e => e.source === file.id)
        .map(e => codeGraph.nodes.find(n => n.id === e.target))
        .filter(Boolean);
      const fns = children.filter(c => c.type === 'function');
      const cls = children.filter(c => c.type === 'class');
      if (fns.length === 0 && cls.length === 0) continue;

      lines.push(`### ${file.path || file.name} (${file.language})`);
      for (const c of cls) {
        lines.push(`  class ${c.name} (L${c.line}-${c.endLine})`);
      }
      for (const f of fns) {
        const callsOut = calls.filter(e => e.source === f.id).map(e => {
          const target = codeGraph.nodes.find(n => n.id === e.target);
          return target ? target.name : null;
        }).filter(Boolean);
        const callsStr = callsOut.length > 0 ? ` → calls: ${callsOut.join(', ')}` : '';
        lines.push(`  fn ${f.name} (L${f.line}-${f.endLine})${callsStr}`);
      }
      lines.push('');
    }
  } else {
    lines.push('## Code Structure');
    lines.push('Repo has not been embedded with the scan engine. Embedding it would provide');
    lines.push('function-level call graph context for a more precise diagnosis.');
    lines.push('');
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
4. Code structure — function/class call graph extracted by tree-sitter (if embedded)
5. Current source files — the actual code on disk right now

Walk through the evidence systematically in your thinking:
- Examine each commit diff — what changed, what looks suspicious
- Cross-reference with the logs — do the errors match the code changes
- Use the code structure to trace call paths — which function calls which
- Check the source files — is the current code consistent with what the diffs show
- Quote specific lines, function names, and variable names from the evidence

Then write a short summary of your findings as plain text, and call submit_diagnosis with:
- root_cause: one clear paragraph explaining what broke and why, referencing specific evidence
- file_path: the exact repository-relative path of the file to fix
- fixed_content: the complete corrected file content (not a diff — the full file)
- explanation: one sentence describing what the fix changes

Do not guess. If the commits clearly show a bad change, that is the root cause. If logs are unavailable, diagnose from commits and source code.`;

module.exports = { buildPrompt, SYSTEM_PROMPT };
