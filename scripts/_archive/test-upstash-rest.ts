/**
 * Upstash REST API Test (Direct HTTP)
 * 
 * Tests Upstash using REST API (not ioredis)
 * Run with: npx tsx scripts/test-upstash-rest.ts
 */

import { config } from "dotenv";

// Load env manually
config({ path: ".env" });

async function testUpstashRest() {
  console.log("🧪 Testing Upstash REST API\n");

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
    // Test basic REST API operations
    console.log("\n1️⃣ Testing PING command...");
    
    const pingResponse = await fetch(`${redisUrl}/ping`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!pingResponse.ok) {
      const error = await pingResponse.text();
      throw new Error(`PING failed: ${error}`);
    }

    const pingResult = await pingResponse.json();
    console.log("✅ PING successful:", pingResult.result);

    // Test SET command
    console.log("\n2️⃣ Testing SET command...");
    const testKey = "test:nomosx:upstash";
    const testValue = JSON.stringify({ 
      message: "Hello Upstash!", 
      timestamp: new Date().toISOString() 
    });

    const setResponse = await fetch(`${redisUrl}/set/${testKey}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value: testValue,
        ex: 60, // 60 seconds TTL
      }),
    });

    if (!setResponse.ok) {
      const error = await setResponse.text();
      throw new Error(`SET failed: ${error}`);
    }

    const setResult = await setResponse.json();
    console.log("✅ SET successful:", setResult.result);

    // Test GET command
    console.log("\n3️⃣ Testing GET command...");
    const getResponse = await fetch(`${redisUrl}/get/${testKey}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${redisToken}`,
      },
    });

    if (!getResponse.ok) {
      const error = await getResponse.text();
      throw new Error(`GET failed: ${error}`);
    }

    const getResult = await getResponse.json();
    if (getResult.result) {
      const data = JSON.parse(getResult.result);
      console.log("✅ GET successful:");
      console.log(`   - Message: ${data.message}`);
      console.log(`   - Timestamp: ${data.timestamp}`);
    }

    // Test DBSIZE
    console.log("\n4️⃣ Testing DBSIZE command...");
    const dbsizeResponse = await fetch(`${redisUrl}/dbsize`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${redisToken}`,
      },
    });

    if (!dbsizeResponse.ok) {
      const error = await dbsizeResponse.text();
      throw new Error(`DBSIZE failed: ${error}`);
    }

    const dbsizeResult = await dbsizeResponse.json();
    console.log(`✅ Database size: ${dbsizeResult.result} keys`);

    // Test INFO memory
    console.log("\n5️⃣ Testing INFO command...");
    const infoResponse = await fetch(`${redisUrl}/info/memory`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${redisToken}`,
      },
    });

    if (!infoResponse.ok) {
      const error = await infoResponse.text();
      throw new Error(`INFO failed: ${error}`);
    }

    const infoResult = await infoResponse.json();
    const memoryMatch = infoResult.result.match(/used_memory_human:(.+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1].trim() : "unknown";
    console.log(`✅ Memory usage: ${memoryUsage}`);

    // Cleanup
    console.log("\n6️⃣ Cleaning up test data...");
    const delResponse = await fetch(`${redisUrl}/del/${testKey}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${redisToken}`,
      },
    });

    if (delResponse.ok) {
      const delResult = await delResponse.json();
      console.log("✅ Test data cleaned up:", delResult.result);
    }

    console.log("\n✅ ✅ ✅ UPSTASH REST API TEST PASSED ✅ ✅ ✅\n");
    console.log("🚀 Upstash is ready for production caching!");

  } catch (error: any) {
    console.error("\n❌ UPSTASH TEST FAILED:", error.message);
    
    console.log("\n🔧 Troubleshooting:");
    console.log("1. Check UPSTASH_REDIS_REST_URL is correct");
    console.log("2. Check UPSTASH_REDIS_REST_TOKEN is valid");
    console.log("3. Verify Upstash database is active");
    console.log("4. Check network connectivity");
    console.log("5. Make sure token has proper permissions");
    
    if (error.message.includes("401") || error.message.includes("Unauthorized")) {
      console.log("\n❌ Authentication failed - check your token");
    }
    
    if (error.message.includes("404") || error.message.includes("ENOTFOUND")) {
      console.log("\n❌ URL not found - check your Upstash URL");
    }
    
    if (error.message.includes("403")) {
      console.log("\n❌ Forbidden - check token permissions");
    }
  }
}

// Run test
testUpstashRest();
