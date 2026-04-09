const express = require('express');
const router = express.Router();
const { client } = require('../db/client');
const cassandra = require('cassandra-driver');

// GET /hashtags/:tag — Hashtag tweet'leri (bucketing)
router.get('/hashtags/:tag', async (req, res) => {
  try {
    const tag = req.params.tag.toLowerCase();
    const dateParam = req.query.date;
    const limit = parseInt(req.query.limit) || 50;
    const cursor = req.query.cursor;

    // Use today's date if no date specified
    let bucket;
    if (dateParam) {
      bucket = cassandra.types.LocalDate.fromString(dateParam);
    } else {
      bucket = cassandra.types.LocalDate.fromDate(new Date());
    }

    let query, params;
    if (cursor) {
      const cursorId = cassandra.types.TimeUuid.fromString(cursor);
      query = 'SELECT * FROM tweets_by_hashtag WHERE hashtag = ? AND bucket = ? AND tweet_id < ? LIMIT ?';
      params = [tag, bucket, cursorId, limit];
    } else {
      query = 'SELECT * FROM tweets_by_hashtag WHERE hashtag = ? AND bucket = ? LIMIT ?';
      params = [tag, bucket, limit];
    }

    const result = await client.execute(query, params, { prepare: true });

    const tweets = result.rows.map(row => ({
      tweet_id: row.tweet_id.toString(),
      user_id: row.user_id.toString(),
      username: row.username,
      content: row.content,
      hashtag: row.hashtag,
      bucket: row.bucket.toString(),
      created_at: row.tweet_id.getDate().toISOString(),
    }));

    const nextCursor = tweets.length === limit ? tweets[tweets.length - 1].tweet_id : null;

    res.json({
      hashtag: tag,
      date: bucket.toString(),
      tweets,
      next_cursor: nextCursor,
    });
  } catch (err) {
    console.error('Get hashtag tweets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
