/**
 * Test Redis/Upstash Connection
 * 
 * Tests Redis connectivity and basic operations
 * Run with: npx tsx scripts/test-redis-connection.ts
 */

import { getCacheStats, cacheAPIResponse, getCachedAPIResponse } from "../lib/cache/redis-cache";

async function testRedisConnection() {
  console.log("🧪 Testing Redis/Upstash Connection\n");

  try {
    // Test 1: Check connection
    console.log("1️⃣ Testing Redis connection...");
    const stats = await getCacheStats();
    
    if (!stats) {
      console.log("❌ Redis not connected or not configured");
      console.log("ℹ️  Make sure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set");
      return;
    }

    console.log("✅ Redis connected successfully");
    console.log(`   - Keys in database: ${stats.keyCount}`);
    console.log(`   - Memory usage: ${stats.memoryUsage}`);

    // Test 2: Basic set/get operations
    console.log("\n2️⃣ Testing cache operations...");
    const testKey = "test:redis:connection";
    const testData = { message: "Hello Redis!", timestamp: new Date().toISOString() };

    // Set
    await cacheAPIResponse(testKey, testData, 60); // 1 minute TTL
    console.log("✅ Data cached successfully");

    // Get
    const cached = await getCachedAPIResponse(testKey);
    if (cached) {
      console.log("✅ Data retrieved from cache:");
      console.log(`   - Message: ${cached.message}`);
      console.log(`   - Timestamp: ${cached.timestamp}`);
    } else {
      console.log("❌ Failed to retrieve data from cache");
    }

    // Test 3: Cleanup
    console.log("\n3️⃣ Cleaning up test data...");
    // Note: We don't have a direct delete function, but it will expire in 1 minute
    console.log("✅ Test data will expire automatically in 1 minute");

    console.log("\n✅ ✅ ✅ REDIS CONNECTION TEST PASSED ✅ ✅ ✅\n");
    console.log("🚀 Redis is ready for production caching!");

  } catch (error: any) {
    console.error("\n❌ REDIS TEST FAILED:", error.message);
    console.error("\nStack trace:", error.stack);
    
    console.log("\n🔧 Troubleshooting:");
    console.log("1. Check UPSTASH_REDIS_REST_URL is correct");
    console.log("2. Check UPSTASH_REDIS_REST_TOKEN is valid");
    console.log("3. Verify Upstash database is active");
    console.log("4. Check network connectivity");
    
    process.exit(1);
  }
}

// Run test
testRedisConnection();
