'use strict';

const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'visualizer-platform', port: PORT })
);

app.use('/config',   require('./src/routes/config').router);
app.use('/evidence', require('./src/routes/evidence'));
app.use('/sessions', require('./src/routes/sessions'));
app.use('/sessions', require('./src/routes/agent'));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`visualizer-platform on http://localhost:${PORT}`);
  console.log(`  POST /config              — set anthropic_key, github_pat, github_repo`);
  console.log(`  GET  /evidence/logs/:id   — docker logs (graceful if unavailable)`);
  console.log(`  GET  /evidence/commits/:id — git log with diffs`);
  console.log(`  POST /sessions            — create session + fetch evidence`);
  console.log(`  POST /sessions/:id/diagnose — stream Claude diagnosis (SSE)`);
  console.log(`  POST /sessions/:id/pr     — create GitHub PR`);
});
