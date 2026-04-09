const fs = require('fs');
const path = require('path');

async function runMigration(systemClient) {
  const keyspace = process.env.SCYLLA_KEYSPACE || 'xclone';

  console.log('🔄 Running schema migration...');

  // Step 1: Create keyspace
  try {
    await systemClient.execute(`
      CREATE KEYSPACE IF NOT EXISTS ${keyspace}
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    `);
    console.log('✅ Keyspace created/verified');
  } catch (err) {
    console.error('❌ Keyspace creation failed:', err.message);
    throw err;
  }

  // Step 2: Create tables using USE keyspace
  await systemClient.execute(`USE ${keyspace}`);

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      user_id UUID PRIMARY KEY,
      username TEXT,
      password TEXT,
      display_name TEXT,
      bio TEXT,
      avatar_url TEXT,
      created_at TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS users_by_username (
      username TEXT PRIMARY KEY,
      user_id UUID
    )`,
    `CREATE TABLE IF NOT EXISTS tweets_by_user (
      user_id UUID,
      tweet_id TIMEUUID,
      content TEXT,
      PRIMARY KEY ((user_id), tweet_id)
    ) WITH CLUSTERING ORDER BY (tweet_id DESC)`,
    `CREATE TABLE IF NOT EXISTS home_timeline (
      user_id UUID,
      tweet_id TIMEUUID,
      author_id UUID,
      author_username TEXT,
      author_avatar TEXT,
      content TEXT,
      PRIMARY KEY ((user_id), tweet_id)
    ) WITH CLUSTERING ORDER BY (tweet_id DESC)`,
    `CREATE TABLE IF NOT EXISTS following (
      user_id UUID,
      followee_id UUID,
      followed_at TIMESTAMP,
      PRIMARY KEY ((user_id), followee_id)
    )`,
    `CREATE TABLE IF NOT EXISTS followers (
      user_id UUID,
      follower_id UUID,
      followed_at TIMESTAMP,
      PRIMARY KEY ((user_id), follower_id)
    )`,
    `CREATE TABLE IF NOT EXISTS tweets_by_hashtag (
      hashtag TEXT,
      bucket DATE,
      tweet_id TIMEUUID,
      user_id UUID,
      username TEXT,
      content TEXT,
      PRIMARY KEY ((hashtag, bucket), tweet_id)
    ) WITH CLUSTERING ORDER BY (tweet_id DESC)`,
    `CREATE TABLE IF NOT EXISTS tweet_likes (
      tweet_id TIMEUUID PRIMARY KEY,
      like_count COUNTER
    )`
  ];

  for (let i = 0; i < tables.length; i++) {
    try {
      await systemClient.execute(tables[i]);
      console.log(`✅ Table ${i + 1}/${tables.length} created/verified`);
    } catch (err) {
      console.error(`⚠️ Table ${i + 1} error: ${err.message}`);
    }
  }

  console.log('✅ Schema migration complete');
}

module.exports = { runMigration };
