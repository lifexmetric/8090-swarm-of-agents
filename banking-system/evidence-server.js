'use strict';

const express = require('./evidence-deps/node_modules/express');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3001;
const REPO_ROOT = path.join(__dirname, '..');

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

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
      resolve((stdout || '') + (stderr || ''));
    });
  });
}

// GET /health
app.get('/health', (_req, res) => res.json({ status: 'ok', port: PORT }));

// GET /logs/:serviceId — last 150 lines from docker with timestamps
app.get('/logs/:serviceId', async (req, res) => {
  const svc = SERVICE_MAP[req.params.serviceId];
  if (!svc) return res.status(404).json({ error: 'Unknown service', known: Object.keys(SERVICE_MAP) });

  const output = await run(
    `docker logs ${svc.container} --tail=150 --timestamps 2>&1`,
    __dirname
  );
  res.json({ serviceId: req.params.serviceId, container: svc.container, logs: output });
});

// GET /commits/:serviceId — last 10 commits with diffs for the service folder
app.get('/commits/:serviceId', async (req, res) => {
  const svc = SERVICE_MAP[req.params.serviceId];
  if (!svc) return res.status(404).json({ error: 'Unknown service', known: Object.keys(SERVICE_MAP) });

  const folder = `banking-system/${svc.folder}/`;

  const [logRaw, diffRaw] = await Promise.all([
    run(`git log --patch -10 -- ${folder}`, REPO_ROOT),
    run(`git diff HEAD -- ${folder}`, REPO_ROOT),
  ]);

  const commits = parseGitLog(logRaw);

  if (diffRaw.trim()) {
    commits.unshift({
      hash: 'WORKING',
      shortHash: 'working',
      author: 'Local (uncommitted)',
      date: new Date().toISOString(),
      message: '⚠ Uncommitted local changes',
      diff: diffRaw,
    });
  }

  res.json({ serviceId: req.params.serviceId, folder, commits });
});

function parseGitLog(raw) {
  if (!raw.trim()) return [];

  const blocks = raw.split(/^commit ([0-9a-f]{40})/m).filter(Boolean);
  const commits = [];

  for (let i = 0; i < blocks.length - 1; i += 2) {
    const hash = blocks[i].trim();
    const body = blocks[i + 1];
    const lines = body.split('\n');

    let author = '';
    let date = '';
    let messageLines = [];
    let diffStart = -1;
    let inMessage = false;

    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      if (line.startsWith('Author:')) { author = line.replace('Author:', '').trim(); continue; }
      if (line.startsWith('Date:'))   { date = line.replace('Date:', '').trim(); continue; }
      if (line.startsWith('diff --git')) { diffStart = j; break; }
      if (!inMessage && line === '') { inMessage = true; continue; }
      if (inMessage && line.trim()) messageLines.push(line.trim());
    }

    commits.push({
      hash,
      shortHash: hash.substring(0, 8),
      author,
      date,
      message: messageLines.join(' ').trim(),
      diff: diffStart >= 0 ? lines.slice(diffStart).join('\n') : '',
    });
  }

  return commits;
}

app.listen(PORT, () => {
  console.log(`evidence-server on http://localhost:${PORT}`);
  console.log(`  repo root : ${REPO_ROOT}`);
  console.log(`  endpoints : GET /logs/:serviceId  GET /commits/:serviceId`);
});
