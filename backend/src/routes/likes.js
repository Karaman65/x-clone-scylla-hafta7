const express = require('express');
const router = express.Router();
const { client } = require('../db/client');
const cassandra = require('cassandra-driver');

// POST /tweets/:tweet_id/like — Tweet beğen (COUNTER)
router.post('/tweets/:tweet_id/like', async (req, res) => {
  try {
    const tweetId = cassandra.types.TimeUuid.fromString(req.params.tweet_id);

    await client.execute(
      'UPDATE tweet_likes SET like_count = like_count + 1 WHERE tweet_id = ?',
      [tweetId],
      { prepare: true }
    );

    res.json({ message: 'Liked', tweet_id: tweetId.toString() });
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /tweets/:tweet_id/likes — Like sayısını getir
router.get('/tweets/:tweet_id/likes', async (req, res) => {
  try {
    const tweetId = cassandra.types.TimeUuid.fromString(req.params.tweet_id);

    const result = await client.execute(
      'SELECT like_count FROM tweet_likes WHERE tweet_id = ?',
      [tweetId],
      { prepare: true }
    );

    const likeCount = result.rowLength > 0 
      ? (result.rows[0].like_count ? result.rows[0].like_count.toNumber() : 0)
      : 0;

    res.json({ tweet_id: tweetId.toString(), like_count: likeCount });
  } catch (err) {
    console.error('Get likes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
