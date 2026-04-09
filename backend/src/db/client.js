const cassandra = require('cassandra-driver');

const contactPoints = (process.env.SCYLLA_HOSTS || 'localhost').split(',');
const keyspace = process.env.SCYLLA_KEYSPACE || 'xclone';

// Client without keyspace (for initial migration)
const systemClient = new cassandra.Client({
  contactPoints,
  localDataCenter: 'datacenter1',
  socketOptions: {
    connectTimeout: 10000,
    readTimeout: 30000,
  },
});

// Client with keyspace (for queries)
const client = new cassandra.Client({
  contactPoints,
  localDataCenter: 'datacenter1',
  keyspace,
  socketOptions: {
    connectTimeout: 10000,
    readTimeout: 30000,
  },
});

async function connectWithRetry(maxRetries = 20, delay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await systemClient.connect();
      console.log('✅ Connected to ScyllaDB (system)');
      return;
    } catch (err) {
      console.log(`⏳ ScyllaDB not ready, retrying... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('❌ Could not connect to ScyllaDB after retries');
}

async function connectKeyspace() {
  await client.connect();
  console.log(`✅ Connected to ScyllaDB keyspace: ${keyspace}`);
}

module.exports = { client, systemClient, connectWithRetry, connectKeyspace };
