/**
 * Simple Redis Connection Test (without env validation)
 * 
 * Tests Redis connectivity directly
 * Run with: npx tsx scripts/test-redis-simple.ts
 */

import Redis from "ioredis";
import { config } from "dotenv";

// Load env manually
config({ path: ".env" });

async function testRedisConnection() {
  console.log("🧪 Testing Redis/Upstash Connection (Simple)\n");

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    console.log("❌ Missing Redis environment variables:");
    console.log("   - UPSTASH_REDIS_REST_URL:", redisUrl ? "✅" : "❌");
    console.log("   - UPSTASH_REDIS_REST_TOKEN:", redisToken ? "✅" : "❌");
    console.log("\n📝 Make sure these are set in your .env file");
    return;
  }

  console.log("✅ Environment variables found:");
  console.log(`   - URL: ${redisUrl}`);
  console.log(`   - Token: ${redisToken.substring(0, 20)}...`);

  try {
    // Test connection
    console.log("\n1️⃣ Connecting to Redis...");
    const redis = new Redis(redisUrl, {
      password: redisToken,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    redis.on("error", (err) => {
      console.error("❌ Redis error:", err.message);
    });

    redis.on("connect", () => {
      console.log("✅ Redis connected successfully");
    });

    // Connect
    await redis.connect();

    // Test basic operations
    console.log("\n2️⃣ Testing basic operations...");
    
    // Test PING
    const pong = await redis.ping();
    console.log(`✅ PING → ${pong}`);

    // Test SET/GET
    const testKey = "test:nomosx:redis";
    const testValue = JSON.stringify({ 
      message: "Hello NomosX!", 
      timestamp: new Date().toISOString() 
    });

    await redis.set(testKey, testValue, "EX", 60); // 60 seconds TTL
    console.log("✅ SET operation successful");

    const retrieved = await redis.get(testKey);
    if (retrieved) {
      const data = JSON.parse(retrieved);
      console.log("✅ GET operation successful:");
      console.log(`   - Message: ${data.message}`);
      console.log(`   - Timestamp: ${data.timestamp}`);
    }

    // Test database info
    console.log("\n3️⃣ Getting database info...");
    const dbSize = await redis.dbsize();
    const info = await redis.info("memory");
    const memoryMatch = info.match(/used_memory_human:(.+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1].trim() : "unknown";

    console.log(`✅ Database size: ${dbSize} keys`);
    console.log(`✅ Memory usage: ${memoryUsage}`);

    // Cleanup
    await redis.del(testKey);
    console.log("✅ Test data cleaned up");

    // Close connection
    await redis.quit();
    console.log("\n✅ ✅ ✅ REDIS CONNECTION TEST PASSED ✅ ✅ ✅\n");
    console.log("🚀 Redis/Upstash is ready for production!");

  } catch (error: any) {
    console.error("\n❌ REDIS TEST FAILED:", error.message);
    
    console.log("\n🔧 Troubleshooting:");
    console.log("1. Check UPSTASH_REDIS_REST_URL is correct");
    console.log("2. Check UPSTASH_REDIS_REST_TOKEN is valid");
    console.log("3. Verify Upstash database is active");
    console.log("4. Check network connectivity");
    console.log("5. Make sure token has proper permissions");
    
    if (error.message.includes("WRONGPASS")) {
      console.log("\n❌ Authentication failed - check your token");
    }
    
    if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
      console.log("\n❌ Connection failed - check your URL");
    }
  }
}

// Run test
testRedisConnection();
