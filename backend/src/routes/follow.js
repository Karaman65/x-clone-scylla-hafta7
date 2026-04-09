const express = require('express');
const router = express.Router();
const { client } = require('../db/client');
const cassandra = require('cassandra-driver');

// POST /follow — Takip et
router.post('/follow', async (req, res) => {
  try {
    const { follower_id, followee_id } = req.body;

    if (!follower_id || !followee_id) {
      return res.status(400).json({ error: 'follower_id and followee_id are required' });
    }

    if (follower_id === followee_id) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const followerId = cassandra.types.Uuid.fromString(follower_id);
    const followeeId = cassandra.types.Uuid.fromString(followee_id);
    const now = new Date();

    // Write to following table (who is this user following)
    await client.execute(
      'INSERT INTO following (user_id, followee_id, followed_at) VALUES (?, ?, ?)',
      [followerId, followeeId, now],
      { prepare: true }
    );

    // Write to followers table (who follows this user)
    await client.execute(
      'INSERT INTO followers (user_id, follower_id, followed_at) VALUES (?, ?, ?)',
      [followeeId, followerId, now],
      { prepare: true }
    );

    res.status(201).json({ 
      message: 'Followed successfully',
      follower_id: followerId.toString(),
      followee_id: followeeId.toString(),
    });
  } catch (err) {
    console.error('Follow error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /follow — Takipten çık
router.delete('/follow', async (req, res) => {
  try {
    const { follower_id, followee_id } = req.body;

    if (!follower_id || !followee_id) {
      return res.status(400).json({ error: 'follower_id and followee_id are required' });
    }

    const followerId = cassandra.types.Uuid.fromString(follower_id);
    const followeeId = cassandra.types.Uuid.fromString(followee_id);

    await client.execute(
      'DELETE FROM following WHERE user_id = ? AND followee_id = ?',
      [followerId, followeeId],
      { prepare: true }
    );

    await client.execute(
      'DELETE FROM followers WHERE user_id = ? AND follower_id = ?',
      [followeeId, followerId],
      { prepare: true }
    );

    res.json({ message: 'Unfollowed successfully' });
  } catch (err) {
    console.error('Unfollow error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users/:username/following — Takip edilenler
router.get('/users/:username/following', async (req, res) => {
  try {
    const { username } = req.params;

    const lookup = await client.execute(
      'SELECT user_id FROM users_by_username WHERE username = ?',
      [username],
      { prepare: true }
    );

    if (lookup.rowLength === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = lookup.rows[0].user_id;
    const result = await client.execute(
      'SELECT followee_id, followed_at FROM following WHERE user_id = ?',
      [userId],
      { prepare: true }
    );

    const following = result.rows.map(row => ({
      user_id: row.followee_id.toString(),
      followed_at: row.followed_at,
    }));

    res.json({ following });
  } catch (err) {
    console.error('Get following error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users/:username/followers — Takipçiler
router.get('/users/:username/followers', async (req, res) => {
  try {
    const { username } = req.params;

    const lookup = await client.execute(
      'SELECT user_id FROM users_by_username WHERE username = ?',
      [username],
      { prepare: true }
    );

    if (lookup.rowLength === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = lookup.rows[0].user_id;
    const result = await client.execute(
      'SELECT follower_id, followed_at FROM followers WHERE user_id = ?',
      [userId],
      { prepare: true }
    );

    const followers = result.rows.map(row => ({
      user_id: row.follower_id.toString(),
      followed_at: row.followed_at,
    }));

    res.json({ followers });
  } catch (err) {
    console.error('Get followers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
