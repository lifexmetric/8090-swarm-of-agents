'use strict';

const { Router } = require('express');
const db = require('../db');
const { encrypt, decrypt } = require('../crypto');

const router = Router();

const KEYS = ['anthropic_key', 'github_pat', 'github_repo']; // owner/repo

router.get('/', (_req, res) => {
  const out = {};
  for (const key of KEYS) {
    const row = db.config.get.get(key);
    out[key] = row ? '••••••••' : null; // never return raw values
  }
  res.json({ keys: out });
});

router.post('/', (req, res) => {
  const updates = req.body ?? {};
  const saved = [];
  for (const key of KEYS) {
    if (updates[key] !== undefined && updates[key] !== '') {
      db.config.set.run(key, encrypt(String(updates[key])));
      saved.push(key);
    }
  }
  res.json({ saved });
});

// Internal helper used by other modules
function getKey(key) {
  const row = db.config.get.get(key);
  if (!row) return null;
  try { return decrypt(row.value); } catch { return null; }
}

module.exports = { router, getKey };
