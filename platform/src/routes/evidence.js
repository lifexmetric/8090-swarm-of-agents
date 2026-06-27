'use strict';

const { Router } = require('express');
const evidence = require('../evidence');

const router = Router();

router.get('/logs/:serviceId', async (req, res) => {
  const result = await evidence.getLogs(req.params.serviceId);
  res.json(result);
});

router.get('/commits/:serviceId', async (req, res) => {
  const { systemId = 'banking-system' } = req.query;
  const commits = await evidence.getCommits(req.params.serviceId, systemId);
  res.json({ commits });
});

module.exports = router;
