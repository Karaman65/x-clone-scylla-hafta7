const express = require('express');
const router = express.Router();
const { client } = require('../db/client');
const cassandra = require('cassandra-driver');

// POST /tweets — Tweet at
router.post('/tweets', async (req, res) => {
  try {
    const { user_id, content } = req.body;

    if (!user_id || !content) {
      return res.status(400).json({ error: 'user_id and content are required' });
    }

    if (content.length > 280) {
      return res.status(400).json({ error: 'Tweet content must be 280 characters or less' });
    }

    const userId = cassandra.types.Uuid.fromString(user_id);
    const tweetId = cassandra.types.TimeUuid.now();

    // Get user info for denormalization
    const userResult = await client.execute(
      'SELECT username, avatar_url FROM users WHERE user_id = ?',
      [userId],
      { prepare: true }
    );

    if (userResult.rowLength === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const author = userResult.rows[0];

    // 1. Write to tweets_by_user
    await client.execute(
      'INSERT INTO tweets_by_user (user_id, tweet_id, content) VALUES (?, ?, ?)',
      [userId, tweetId, content],
      { prepare: true }
    );

    // 2. Fanout to followers' home_timeline
    const followersResult = await client.execute(
      'SELECT follower_id FROM followers WHERE user_id = ?',
      [userId],
      { prepare: true }
    );

    const fanoutPromises = followersResult.rows.map(row =>
      client.execute(
        'INSERT INTO home_timeline (user_id, tweet_id, author_id, author_username, author_avatar, content) VALUES (?, ?, ?, ?, ?, ?)',
        [row.follower_id, tweetId, userId, author.username, author.avatar_url || '', content],
        { prepare: true }
      )
    );

    // Also add to own home_timeline so user sees their own tweets
    fanoutPromises.push(
      client.execute(
        'INSERT INTO home_timeline (user_id, tweet_id, author_id, author_username, author_avatar, content) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, tweetId, userId, author.username, author.avatar_url || '', content],
        { prepare: true }
      )
    );

    // 3. Parse hashtags and write to tweets_by_hashtag
    const hashtags = parseHashtags(content);
    const today = getToday();

    const hashtagPromises = hashtags.map(tag =>
      client.execute(
        'INSERT INTO tweets_by_hashtag (hashtag, bucket, tweet_id, user_id, username, content) VALUES (?, ?, ?, ?, ?, ?)',
        [tag, today, tweetId, userId, author.username, content],
        { prepare: true }
      )
    );

    await Promise.all([...fanoutPromises, ...hashtagPromises]);

    res.status(201).json({
      tweet_id: tweetId.toString(),
      user_id: userId.toString(),
      content,
      created_at: tweetId.getDate().toISOString(),
      hashtags,
    });
  } catch (err) {
    console.error('Create tweet error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users/:username/tweets — Kullanıcının tweet'leri
router.get('/users/:username/tweets', async (req, res) => {
  try {
    const { username } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const cursor = req.query.cursor;

    // Lookup user_id
    const lookup = await client.execute(
      'SELECT user_id FROM users_by_username WHERE username = ?',
      [username],
      { prepare: true }
    );

    if (lookup.rowLength === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = lookup.rows[0].user_id;

    let query, params;
    if (cursor) {
      const cursorId = cassandra.types.TimeUuid.fromString(cursor);
      query = 'SELECT * FROM tweets_by_user WHERE user_id = ? AND tweet_id < ? LIMIT ?';
      params = [userId, cursorId, limit];
    } else {
      query = 'SELECT * FROM tweets_by_user WHERE user_id = ? LIMIT ?';
      params = [userId, limit];
    }

    const result = await client.execute(query, params, { prepare: true });

    const tweets = result.rows.map(row => ({
      tweet_id: row.tweet_id.toString(),
      user_id: row.user_id.toString(),
      username: username,
      content: row.content,
      created_at: row.tweet_id.getDate().toISOString(),
    }));

    const nextCursor = tweets.length === limit ? tweets[tweets.length - 1].tweet_id : null;

    res.json({
      tweets,
      next_cursor: nextCursor,
    });
  } catch (err) {
    console.error('Get user tweets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /timeline/:user_id — Home timeline
router.get('/timeline/:user_id', async (req, res) => {
  try {
    const userId = cassandra.types.Uuid.fromString(req.params.user_id);
    const limit = parseInt(req.query.limit) || 50;
    const cursor = req.query.cursor;

    let query, params;
    if (cursor) {
      const cursorId = cassandra.types.TimeUuid.fromString(cursor);
      query = 'SELECT * FROM home_timeline WHERE user_id = ? AND tweet_id < ? LIMIT ?';
      params = [userId, cursorId, limit];
    } else {
      query = 'SELECT * FROM home_timeline WHERE user_id = ? LIMIT ?';
      params = [userId, limit];
    }

    const result = await client.execute(query, params, { prepare: true });

    const tweets = result.rows.map(row => ({
      tweet_id: row.tweet_id.toString(),
      author_id: row.author_id.toString(),
      author_username: row.author_username,
      author_avatar: row.author_avatar,
      content: row.content,
      created_at: row.tweet_id.getDate().toISOString(),
    }));

    const nextCursor = tweets.length === limit ? tweets[tweets.length - 1].tweet_id : null;

    res.json({
      tweets,
      next_cursor: nextCursor,
    });
  } catch (err) {
    console.error('Get timeline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /global/tweets — Global Feed (All users)
router.get('/global/tweets', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Fetch all users to get their tweets (Hack for global feed in ScyllaDB without ALLOW FILTERING)
    const usersResult = await client.execute('SELECT user_id, username FROM users');

    let allTweets = [];
    for (const row of usersResult.rows) {
      const tweetsResult = await client.execute(
        'SELECT * FROM tweets_by_user WHERE user_id = ? LIMIT ?',
        [row.user_id, limit],
        { prepare: true }
      );
      
      const mapped = tweetsResult.rows.map(t => ({
        tweet_id: t.tweet_id.toString(),
        author_id: t.user_id.toString(),
        author_username: row.username,
        content: t.content,
        created_at: t.tweet_id.getDate().toISOString(),
      }));
      allTweets.push(...mapped);
    }

    // Sort by chronological order (descending)
    allTweets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    allTweets = allTweets.slice(0, limit);

    res.json({
      tweets: allTweets,
      next_cursor: null
    });
  } catch (err) {
    console.error('Get global timeline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: Parse hashtags from content
function parseHashtags(content) {
  const regex = /#(\w+)/g;
  const tags = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[1].toLowerCase());
  }
  return [...new Set(tags)]; // unique
}

// Helper: Get today's date as LocalDate
function getToday() {
  const now = new Date();
  return cassandra.types.LocalDate.fromDate(now);
}

module.exports = router;
