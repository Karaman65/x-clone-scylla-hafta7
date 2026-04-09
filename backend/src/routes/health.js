const express = require('express');
const router = express.Router();
const { client } = require('../db/client');

router.get('/health', async (req, res) => {
  try {
    await client.execute('SELECT now() FROM system.local');
    res.json({ status: 'ok', scylla: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', scylla: 'disconnected', error: err.message });
  }
});

module.exports = router;
