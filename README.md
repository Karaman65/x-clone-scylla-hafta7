# X Clone with ScyllaDB

**Öğrenci:** Ahmet Karaman  
**Okul No:** 2021039795352

---

## 📖 Proje Açıklaması

Bu proje, ScyllaDB (wide-column store) kullanarak geliştirilmiş bir X (Twitter) clone backend'idir. Query-driven design, denormalizasyon, bucketing ve counter tabloları gibi NoSQL konseptlerini gerçek dünya senaryosunda uygular.

**Kullanılan Teknolojiler:**
- **Backend:** Node.js + Express.js
- **Veritabanı:** ScyllaDB (Cassandra uyumlu)
- **Frontend:** HTML + Vanilla CSS + JavaScript (X/Twitter dark theme)
- **Altyapı:** Docker Compose

---

## 🚀 Hızlı Başlangıç

```bash
# 1. Repo'yu klonla
git clone <repo-url>
cd x-clone-scylla

# 2. Docker ile başlat (ScyllaDB + Backend + Frontend)
docker compose up -d --build

# 3. ScyllaDB'nin hazır olmasını bekle (~30-40 saniye)
# Healthcheck otomatik kontrol eder

# 4. Sağlık kontrolü
curl http://localhost:3000/health

# 5. Frontend'e eriş
# http://localhost:8080
```

---

## 📡 API Endpoint Listesi

### Sağlık Kontrolü
```bash
GET /health
# Response: { "status": "ok", "scylla": "connected" }
```

### Kullanıcı İşlemleri
```bash
# Kayıt ol
POST /register
Content-Type: application/json
{"username": "alice", "display_name": "Alice", "bio": "Hello!"}
# Response: 201 { "user_id": "uuid..." }

# Profil görüntüle
GET /users/alice
# Response: { "user_id": "...", "username": "alice", "display_name": "Alice", ... }
```

### Tweet İşlemleri
```bash
# Tweet at
POST /tweets
Content-Type: application/json
{"user_id": "uuid...", "content": "Merhaba dünya! #scylladb"}
# Response: 201 { "tweet_id": "timeuuid..." }

# Kullanıcının tweet'leri
GET /users/alice/tweets
GET /users/alice/tweets?cursor=<tweet_id>&limit=10

# Home timeline (takip edilenlerin tweet'leri)
GET /timeline/:user_id
GET /timeline/:user_id?cursor=<tweet_id>&limit=20
```

### Takip İşlemleri
```bash
# Takip et
POST /follow
Content-Type: application/json
{"follower_id": "uuid...", "followee_id": "uuid..."}
# Response: 201
```

### Beğeni İşlemleri
```bash
# Tweet beğen
POST /tweets/:tweet_id/like
# Response: 200

# Beğeni sayısını gör
GET /tweets/:tweet_id/likes
# Response: { "tweet_id": "...", "like_count": 5 }
```

### Hashtag İşlemleri
```bash
# Bugünün hashtag tweet'leri
GET /hashtags/scylladb

# Belirli bir günün tweet'leri
GET /hashtags/scylladb?date=2026-04-09
```

---

## 🗄 ScyllaDB Şema Açıklaması

| Tablo | Partition Key | Clustering Key | Açıklama |
|-------|--------------|----------------|----------|
| `users` | `user_id (UUID)` | — | Kullanıcı profil bilgileri |
| `users_by_username` | `username (TEXT)` | — | Username → user_id lookup (unique kontrolü) |
| `tweets_by_user` | `user_id` | `tweet_id DESC` | Kullanıcının kendi tweet'leri (user timeline) |
| `home_timeline` | `user_id` | `tweet_id DESC` | Takip edilenlerin tweet'leri (fanout-on-write) |
| `following` | `user_id` | `followee_id` | Kim kimi takip ediyor |
| `followers` | `user_id` | `follower_id` | Kimin takipçileri (fanout için) |
| `tweets_by_hashtag` | `(hashtag, bucket)` | `tweet_id DESC` | Hashtag akışı — günlük bucketing |
| `tweet_likes` | `tweet_id` | — | COUNTER tablo — atomik beğeni sayacı |

### Tasarım Kararları

- **Query-driven:** Her sorgu için ayrı tablo — JOIN yok
- **Denormalizasyon:** `home_timeline`'da yazar bilgisi (username, avatar) tekrar saklanır
- **TIMEUUID:** Tweet ID olarak kronolojik sıralı UUID kullanılır
- **Bucketing:** Hashtag tablosunda `(hashtag, gün)` compound partition key — hot partition önler
- **COUNTER:** Like sayacı ayrı tabloda — ScyllaDB/Cassandra kuralı gereği diğer tiplerle karışamaz

---

## 🏗 Mimari

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Backend (API)   │────▶│   ScyllaDB      │
│   Port: 8080    │     │  Port: 3000      │     │   Port: 9042    │
│   Nginx + SPA   │     │  Node.js/Express │     │   Single Node   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 📁 Proje Yapısı

```
├── README.md
├── docker-compose.yml
├── schema.cql
├── .gitignore
├── .env.example
├── requests.http
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── db/
│       │   ├── client.js
│       │   └── migrate.js
│       └── routes/
│           ├── health.js
│           ├── users.js
│           ├── tweets.js
│           ├── follow.js
│           ├── likes.js
│           └── hashtags.js
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── index.html
```
