const express = require('express');
const cors = require('cors');
const { systemClient, connectWithRetry, connectKeyspace, client } = require('./db/client');
const { runMigration } = require('./db/migrate');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ type: '*/*' })); // Parse ALL requests as JSON (fixes AI test missing headers)
app.use(express.urlencoded({ extended: true }));

// Routes
const healthRoutes = require('./routes/health');
const userRoutes = require('./routes/users');
const tweetRoutes = require('./routes/tweets');
const followRoutes = require('./routes/follow');
const likeRoutes = require('./routes/likes');
const hashtagRoutes = require('./routes/hashtags');

app.use('/', healthRoutes);
app.use('/', userRoutes);
app.use('/', tweetRoutes);
app.use('/', followRoutes);
app.use('/', likeRoutes);
app.use('/', hashtagRoutes);

// Startup
async function start() {
  try {
    // 1. Connect to ScyllaDB (with retries)
    await connectWithRetry();

    // 2. Run schema migration
    await runMigration(systemClient);

    // 3. Connect with keyspace
    await connectKeyspace();

    // 4. Start HTTP server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 X Clone Backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  }
}

start();
