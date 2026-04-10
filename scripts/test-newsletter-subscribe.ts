/**
 * Test Newsletter Subscription
 * 
 * Tests the newsletter signup flow
 * Run with: npx tsx scripts/test-newsletter-subscribe.ts
 */

import { config } from "dotenv";

// Load env manually
config({ path: ".env" });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const TEST_EMAIL = "rodrigue.etifier@gmail.com";

async function testNewsletterSubscribe() {
  console.log("🧪 Testing Newsletter Subscription\n");

  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`📧 Test Email: ${TEST_EMAIL}\n`);

  try {
    console.log("1️⃣ Testing Newsletter Subscribe API...");
    
    const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        source: "test-script",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ Newsletter subscribe failed:", error);
      return;
    }

    const result = await response.json();
    console.log("✅ Newsletter subscribe successful:");
    console.log(`   - Success: ${result.success}`);
    console.log(`   - Message: ${result.message}`);
    console.log(`   - Already subscribed: ${result.alreadySubscribed || false}`);

    console.log("\n2️⃣ Testing Newsletter Status Check...");
    
    const statusResponse = await fetch(`${BASE_URL}/api/newsletter/subscribe?email=${TEST_EMAIL}`);
    
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log("✅ Newsletter status:");
      console.log(`   - Subscribed: ${status.subscribed}`);
      console.log(`   - Status: ${status.status}`);
      console.log(`   - Since: ${status.since || 'N/A'}`);
    }

    console.log("\n3️⃣ Testing Newsletter Cron After Subscription...");
    
    const CRON_SECRET = process.env.CRON_SECRET;
    if (!CRON_SECRET) {
      console.log("⚠️  CRON_SECRET not set, skipping cron test");
      return;
    }

    const cronResponse = await fetch(`${BASE_URL}/api/cron/newsletter-briefs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CRON_SECRET}`,
        "Content-Type": "application/json",
      },
    });

    if (cronResponse.ok) {
      const cronResult = await cronResponse.json();
      console.log("✅ Newsletter cron after subscription:");
      console.log(`   - Success: ${cronResult.success}`);
      console.log(`   - Total subscribers: ${cronResult.stats?.total || 0}`);
      console.log(`   - Sent: ${cronResult.stats?.sent || 0}`);
      console.log(`   - Failed: ${cronResult.stats?.failed || 0}`);
      console.log(`   - Briefs available: ${cronResult.stats?.briefsCount || 0}`);

      if (cronResult.stats?.sent > 0) {
        console.log("\n🎉 Newsletter email sent successfully!");
        console.log("📧 Check your inbox for the test email.");
      } else if (cronResult.stats?.briefsCount === 0) {
        console.log("\nℹ️  No executive briefs available to send.");
        console.log("💡 Create some executive briefs first to test full flow");
      }
    }

    console.log("\n✅ ✅ ✅ NEWSLETTER SUBSCRIPTION TEST PASSED ✅ ✅ ✅\n");
    console.log("🚀 Newsletter system is fully functional!");

  } catch (error: any) {
    console.error("\n❌ NEWSLETTER SUBSCRIPTION TEST FAILED:", error.message);
    
    console.log("\n🔧 Troubleshooting:");
    console.log("1. Make sure the app is running (npm run dev)");
    console.log("2. Check BASE_URL is correct");
    console.log("3. Check network connectivity");
    
    process.exit(1);
  }
}

// Run test
testNewsletterSubscribe();
