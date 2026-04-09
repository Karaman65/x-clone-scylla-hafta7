const express = require('express');
const router = express.Router();
const { client } = require('../db/client');
const { v4: uuidv4 } = require('uuid');
const cassandra = require('cassandra-driver');
const crypto = require('crypto');

// Helper for simple hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// POST /register — Kullanıcı kayıt
router.post('/register', async (req, res) => {
  try {
    const { username, display_name, password, bio, avatar_url } = req.body;

    if (!username || !display_name || !password) {
      return res.status(400).json({ error: 'username, display_name, and password are required' });
    }

    // Check if username already exists
    const existing = await client.execute(
      'SELECT user_id FROM users_by_username WHERE username = ?',
      [username],
      { prepare: true }
    );

    if (existing.rowLength > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const userId = cassandra.types.Uuid.random();
    const now = new Date();
    const hashedPw = hashPassword(password);

    // Insert into users table
    await client.execute(
      'INSERT INTO users (user_id, username, display_name, password, bio, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, username, display_name, hashedPw, bio || null, avatar_url || null, now],
      { prepare: true }
    );

    // Insert into users_by_username lookup table
    await client.execute(
      'INSERT INTO users_by_username (username, user_id) VALUES (?, ?)',
      [username, userId],
      { prepare: true }
    );

    res.status(201).json({ user_id: userId.toString(), username, display_name });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /login — Kullanıcı girişi
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    // Lookup user_id by username
    const lookup = await client.execute(
      'SELECT user_id FROM users_by_username WHERE username = ?',
      [username],
      { prepare: true }
    );

    if (lookup.rowLength === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const userId = lookup.rows[0].user_id;

    // Get user profile to check password
    const user = await client.execute(
      'SELECT password, display_name, bio FROM users WHERE user_id = ?',
      [userId],
      { prepare: true }
    );

    if (user.rowLength === 0 || user.rows[0].password !== hashPassword(password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json({
      user_id: userId.toString(),
      username: username,
      display_name: user.rows[0].display_name,
      bio: user.rows[0].bio,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users/:username — Kullanıcı profili
router.get('/users/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // Lookup user_id by username
    const lookup = await client.execute(
      'SELECT user_id FROM users_by_username WHERE username = ?',
      [username],
      { prepare: true }
    );

    if (lookup.rowLength === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = lookup.rows[0].user_id;

    // Get user profile
    const user = await client.execute(
      'SELECT * FROM users WHERE user_id = ?',
      [userId],
      { prepare: true }
    );

    if (user.rowLength === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = user.rows[0];

    // Count followers
    const followersResult = await client.execute(
      'SELECT COUNT(*) as count FROM followers WHERE user_id = ?',
      [userId],
      { prepare: true }
    );

    // Count following
    const followingResult = await client.execute(
      'SELECT COUNT(*) as count FROM following WHERE user_id = ?',
      [userId],
      { prepare: true }
    );

    res.json({
      user_id: profile.user_id.toString(),
      username: profile.username,
      display_name: profile.display_name,
      bio: profile.bio,
      avatar_url: profile.avatar_url,
      created_at: profile.created_at,
      followers_count: followersResult.rows[0].count.toNumber(),
      following_count: followingResult.rows[0].count.toNumber(),
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users — Tüm kullanıcıları listele
router.get('/allusers', async (req, res) => {
  try {
    const result = await client.execute('SELECT * FROM users');
    const users = result.rows.map(row => ({
      user_id: row.user_id.toString(),
      username: row.username,
      display_name: row.display_name,
      bio: row.bio,
      avatar_url: row.avatar_url,
      created_at: row.created_at,
    }));
    res.json(users);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
