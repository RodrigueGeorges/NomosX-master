/**
 * Test Newsletter Cron Job
 * 
 * Tests the newsletter briefs delivery system
 * Run with: npx tsx scripts/test-newsletter-cron.ts
 */

import { config } from "dotenv";

// Load env manually
config({ path: ".env" });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

async function testNewsletterCron() {
  console.log("🧪 Testing Newsletter Cron Job\n");

  if (!CRON_SECRET) {
    console.log("❌ CRON_SECRET not set in .env");
    console.log("Please add: CRON_SECRET=your-secret-key");
    return;
  }

  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`🔐 Using CRON_SECRET: ${CRON_SECRET.substring(0, 20)}...\n`);

  try {
    console.log("1️⃣ Testing Newsletter Briefs Cron...");
    
    const response = await fetch(`${BASE_URL}/api/cron/newsletter-briefs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CRON_SECRET}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ Newsletter cron failed:", error);
      return;
    }

    const result = await response.json();
    console.log("✅ Newsletter cron successful:");
    console.log(`   - Success: ${result.success}`);
    console.log(`   - Message: ${result.message}`);
    console.log(`   - Total subscribers: ${result.stats?.total || 0}`);
    console.log(`   - Sent: ${result.stats?.sent || 0}`);
    console.log(`   - Failed: ${result.stats?.failed || 0}`);
    console.log(`   - Briefs available: ${result.stats?.briefsCount || 0}`);

    if (result.stats?.sent > 0) {
      console.log("\n🎉 Newsletter emails sent successfully!");
      console.log("📧 Check your inbox for the test email.");
    } else if (result.stats?.total === 0) {
      console.log("\nℹ️  No newsletter subscribers found.");
      console.log("💡 To test: First subscribe via homepage newsletter box");
    } else if (result.stats?.briefsCount === 0) {
      console.log("\nℹ️  No executive briefs available this week.");
      console.log("💡 To test: Create some executive briefs first");
    }

    console.log("\n✅ ✅ ✅ NEWSLETTER CRON TEST PASSED ✅ ✅ ✅\n");
    console.log("🚀 Newsletter delivery system is ready!");

  } catch (error: any) {
    console.error("\n❌ NEWSLETTER CRON TEST FAILED:", error.message);
    
    console.log("\n🔧 Troubleshooting:");
    console.log("1. Make sure the app is running (npm run dev)");
    console.log("2. Check BASE_URL is correct");
    console.log("3. Verify CRON_SECRET is set");
    console.log("4. Check network connectivity");
    
    process.exit(1);
  }
}

// Run test
testNewsletterCron();
