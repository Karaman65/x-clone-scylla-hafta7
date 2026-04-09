-- Keyspace
CREATE KEYSPACE IF NOT EXISTS xclone
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

USE xclone;

-- 1. Kullanıcılar (kullanıcı bilgileri)
CREATE TABLE IF NOT EXISTS users (
  user_id      UUID PRIMARY KEY,
  username     TEXT,
  display_name TEXT,
  password     TEXT,
  bio          TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMP
);

-- Username --> user_id lookup (unique username kontrolü için)
CREATE TABLE IF NOT EXISTS users_by_username (
  username TEXT PRIMARY KEY,
  user_id  UUID
);

-- 2. User Timeline (bir kullanıcının kendi tweet'leri)
CREATE TABLE IF NOT EXISTS tweets_by_user (
  user_id   UUID,
  tweet_id  TIMEUUID,
  content   TEXT,
  PRIMARY KEY ((user_id), tweet_id)
) WITH CLUSTERING ORDER BY (tweet_id DESC);

-- 3. Home Timeline (takip edilen kullanıcıların tweet'leri)
-- Fanout-on-write: Yeni tweet, tüm takipçilerin home timeline'ına yazılır
CREATE TABLE IF NOT EXISTS home_timeline (
  user_id        UUID,
  tweet_id       TIMEUUID,
  author_id      UUID,
  author_username TEXT,
  author_avatar  TEXT,
  content        TEXT,
  PRIMARY KEY ((user_id), tweet_id)
) WITH CLUSTERING ORDER BY (tweet_id DESC);

-- 4. Takip İlişkileri (kim kimi takip ediyor)
CREATE TABLE IF NOT EXISTS following (
  user_id      UUID,
  followee_id  UUID,
  followed_at  TIMESTAMP,
  PRIMARY KEY ((user_id), followee_id)
);

-- 5. Takipçiler (ters ilişki — fanout için)
CREATE TABLE IF NOT EXISTS followers (
  user_id      UUID,
  follower_id  UUID,
  followed_at  TIMESTAMP,
  PRIMARY KEY ((user_id), follower_id)
);

-- 6. Hashtag Akışı (BUCKETING ile hot partition önleme)
CREATE TABLE IF NOT EXISTS tweets_by_hashtag (
  hashtag   TEXT,
  bucket    DATE,
  tweet_id  TIMEUUID,
  user_id   UUID,
  username  TEXT,
  content   TEXT,
  PRIMARY KEY ((hashtag, bucket), tweet_id)
) WITH CLUSTERING ORDER BY (tweet_id DESC);

-- 7. Like Sayacı (COUNTER tablo — ayrı olmak ZORUNDA)
CREATE TABLE IF NOT EXISTS tweet_likes (
  tweet_id   TIMEUUID PRIMARY KEY,
  like_count COUNTER
);
