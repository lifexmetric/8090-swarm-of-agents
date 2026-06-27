'use strict';

const { exec } = require('child_process');
const path = require('path');
const fs   = require('fs');

// In Docker: REPO_ROOT env var points to the bind-mounted repo.
// Running locally: walk up three levels from platform/src/evidence/.
const REPO_ROOT = process.env.REPO_ROOT || path.join(__dirname, '..', '..', '..');

// Maps CALM node IDs → { container, folder }
// folder is relative to banking-system/ inside the repo
const SERVICE_MAP = {
  'api-gateway':             { container: 'bank-api-gateway',        folder: 'bank-api-gateway' },
  'auth-service':            { container: 'auth-service',            folder: 'auth-service' },
  'accounts-service':        { container: 'accounts-service',        folder: 'accounts-service' },
  'payments-service':        { container: 'payments-service',        folder: 'payments-service' },
  'fraud-detection-service': { container: 'fraud-detection-service', folder: 'fraud-detection-service' },
  'customer-service':        { container: 'customer-service',        folder: 'customer-service' },
  'notification-service':    { container: 'notification-service',    folder: 'notification-service' },
  'reporting-service':       { container: 'reporting-service',       folder: 'reporting-service' },
  'swift-ach-rail':          { container: 'mock-swift-rail',         folder: 'mock-swift-rail' },
};

function run(cmd, cwd) {
  return new Promise(resolve => {
    exec(cmd, { cwd, maxBuffer: 5 * 1024 * 1024 }, (_err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', error: _err });
    });
  });
}

// ── Git adapter ───────────────────────────────────────────────────────────────
async function getCommits(serviceId, systemId = 'banking-system') {
  const svc = SERVICE_MAP[serviceId];
  const folderGlob = svc
    ? `${systemId}/${svc.folder}/`
    : `${systemId}/`;

  const [logResult, diffResult] = await Promise.all([
    run(`git log --patch -15 -- ${folderGlob}`, REPO_ROOT),
    run(`git diff HEAD -- ${folderGlob}`, REPO_ROOT),
  ]);

  const commits = parseGitLog(logResult.stdout);

  if (diffResult.stdout.trim()) {
    commits.unshift({
      hash: 'WORKING',
      shortHash: 'working',
      author: 'Uncommitted',
      date: new Date().toISOString(),
      message: '⚠ Uncommitted local changes',
      diff: diffResult.stdout,
    });
  }

  return commits;
}

function parseGitLog(raw) {
  if (!raw.trim()) return [];
  const blocks = raw.split(/^commit ([0-9a-f]{40})/m).filter(Boolean);
  const commits = [];

  for (let i = 0; i < blocks.length - 1; i += 2) {
    const hash = blocks[i].trim();
    const lines = blocks[i + 1].split('\n');
    let author = '', date = '', messageLines = [], diffStart = -1, inMsg = false;

    for (let j = 0; j < lines.length; j++) {
      const l = lines[j];
      if (l.startsWith('Author:')) { author = l.replace('Author:', '').trim(); continue; }
      if (l.startsWith('Date:'))   { date   = l.replace('Date:', '').trim(); continue; }
      if (l.startsWith('diff --git')) { diffStart = j; break; }
      if (!inMsg && l === '')     { inMsg = true; continue; }
      if (inMsg && l.trim())      messageLines.push(l.trim());
    }

    commits.push({
      hash,
      shortHash: hash.slice(0, 8),
      author,
      date,
      message: messageLines.join(' ').trim(),
      diff: diffStart >= 0 ? lines.slice(diffStart).join('\n') : '',
    });
  }
  return commits;
}

// ── Docker logs adapter ───────────────────────────────────────────────────────
// Returns { available, content, note }
// Never throws — if Docker isn't reachable just returns available: false
async function getLogs(serviceId, tail = 150) {
  const svc = SERVICE_MAP[serviceId];
  if (!svc) {
    return { available: false, note: `No container mapping for service '${serviceId}'` };
  }

  const { stdout, stderr, error } = await run(
    `docker logs ${svc.container} --tail=${tail} --timestamps 2>&1`,
    REPO_ROOT
  );

  if (error && !stdout && !stderr) {
    return { available: false, note: `docker not reachable: ${error.message}` };
  }
  if ((stdout + stderr).includes('No such container')) {
    return { available: false, note: `Container '${svc.container}' not found — is the system running?` };
  }

  return { available: true, content: stdout + stderr };
}

// ── Source file reader ────────────────────────────────────────────────────────
const CODE_EXTS = new Set(['.go', '.js', '.ts', '.py', '.java', '.rb', '.rs',
                            '.yaml', '.yml', '.toml', '.env.example']);
const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', 'dist', 'build',
                            '__pycache__', 'migrations', 'bin', 'tmp']);
const MAX_FILE_CHARS  = 8000;
const MAX_FILES       = 20;

function walkSync(dir, base, results = []) {
  if (results.length >= MAX_FILES) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const e of entries) {
    if (results.length >= MAX_FILES) break;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel  = path.join(base, e.name);
    if (e.isDirectory()) {
      walkSync(full, rel, results);
    } else if (CODE_EXTS.has(path.extname(e.name))) {
      try {
        const content = fs.readFileSync(full, 'utf8');
        results.push({ path: rel, content: content.slice(0, MAX_FILE_CHARS) });
      } catch { /* skip unreadable */ }
    }
  }
  return results;
}

function readServiceFiles(serviceId) {
  const svc = SERVICE_MAP[serviceId];
  if (!svc) return [];
  const serviceDir = path.join(REPO_ROOT, 'banking-system', svc.folder);
  try {
    fs.accessSync(serviceDir);
  } catch {
    return [];
  }
  return walkSync(serviceDir, `banking-system/${svc.folder}`);
}

module.exports = { getLogs, getCommits, readServiceFiles, SERVICE_MAP };
