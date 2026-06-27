'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const evidence = require('../evidence');

const router = Router();

// POST /sessions — create session, fetch evidence, store
router.post('/', async (req, res) => {
  const { nodeId, nodeName, systemId = 'banking-system', calmCtx } = req.body ?? {};
  if (!nodeId || !nodeName) return res.status(400).json({ error: 'nodeId and nodeName required' });

  const id = crypto.randomUUID();
  db.sessions.insert.run(id, nodeId, nodeName, systemId);

  // Fetch evidence in parallel — both adapters are graceful
  const [logsResult, commits] = await Promise.all([
    evidence.getLogs(nodeId),
    evidence.getCommits(nodeId, systemId),
  ]);

  db.evidence.insert.run(
    id,
    calmCtx ? JSON.stringify(calmCtx) : null,
    logsResult.available ? logsResult.content : null,
    logsResult.available ? null : logsResult.note,
    JSON.stringify(commits)
  );

  res.json({ id, nodeId, nodeName, systemId, commitCount: commits.length, logsAvailable: logsResult.available });
});

// GET /sessions — recent sessions
router.get('/', (_req, res) => {
  res.json({ sessions: db.sessions.list.all() });
});

// GET /sessions/:id — session + evidence + messages + prs
router.get('/:id', (req, res) => {
  const session = db.sessions.get.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const ev  = db.evidence.get.get(req.params.id);
  const msgs = db.messages.get.all(req.params.id);
  const prs  = db.prs.get.all(req.params.id);

  res.json({
    ...session,
    evidence: ev ? {
      calmCtx:       ev.calm_ctx  ? JSON.parse(ev.calm_ctx) : null,
      logsAvailable: !!ev.logs,
      logsNote:      ev.logs_note,
      commits:       JSON.parse(ev.commits),
    } : null,
    messages: msgs,
    prs,
  });
});

module.exports = router;
