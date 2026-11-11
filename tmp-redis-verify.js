process.env.UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
require('dotenv').config({ path: '.env.local' });
const { createUpstashRestClient } = require('./lib/agent/redis-rest.ts');
