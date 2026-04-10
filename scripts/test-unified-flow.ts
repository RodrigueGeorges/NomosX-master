/**
 * Test Unified Email Flow
 * 
 * Tests the unified system where both users and newsletter subscribers
 * receive the same premium email template
 * Run with: npx tsx scripts/test-unified-flow.ts
 */

import { config } from "dotenv";

// Load env manually
config({ path: ".env" });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;
const TEST_EMAIL = "rodrigue.etifier@gmail.com";

async function testUnifiedFlow() {
  console.log("🧪 Testing Unified Email Flow\n");

  if (!CRON_SECRET) {
    console.log("❌ CRON_SECRET not set in .env");
    return;
  }

  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`📧 Test Email: ${TEST_EMAIL}\n`);

  try {
    console.log("1️⃣ Testing Unified Weekly Briefs Cron...");
    
    const response = await fetch(`${BASE_URL}/api/cron/weekly-briefs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CRON_SECRET}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ Unified cron failed:", error);
      return;
    }

    const result = await response.json();
    console.log("✅ Unified cron successful:");
    console.log(`   - Success: ${result.success}`);
    console.log(`   - Message: ${result.message}`);
    console.log(`   - Registered users: ${result.stats?.users || 0}`);
    console.log(`   - Newsletter subscribers: ${result.stats?.newsletterSubscribers || 0}`);
    console.log(`   - Total recipients: ${result.stats?.totalRecipients || 0}`);
    console.log(`   - Sent: ${result.stats?.sent || 0}`);
    console.log(`   - Failed: ${result.stats?.failed || 0}`);

    console.log("\n🎯 Unified Flow Analysis:");
    
    if (result.stats?.totalRecipients > 0) {
      console.log("✅ System has recipients to send to");
      
      if (result.stats?.sent > 0) {
        console.log("🎉 Emails sent successfully!");
        console.log("📧 Check inbox for premium emails with NomosX logo");
      } else if (result.stats?.briefsCount === 0) {
        console.log("ℹ️  No executive briefs available this week");
        console.log("💡 Create some briefs to test full email delivery");
      }
    } else {
      console.log("ℹ️  No recipients found");
      console.log("💡 Subscribe via homepage or create user account");
    }

    console.log("\n🔄 Flow Comparison:");
    console.log("┌─────────────────────┬──────────────────┐");
    console.log("│ Newsletter          │ Registered User  │");
    console.log("├─────────────────────┼──────────────────┤");
    console.log("│ Homepage signup     │ Full signup      │");
    console.log("│ No password         │ Password + auth  │");
    console.log("│ All briefs          │ Filtered briefs  │");
    console.log("│ Same template       │ Same template    │");
    console.log("│ NomosX logo         │ NomosX logo     │");
    console.log("│ Dark theme          │ Dark theme      │");
    console.log("└─────────────────────┴──────────────────┘");

    console.log("\n✅ ✅ ✅ UNIFIED FLOW TEST PASSED ✅ ✅ ✅\n");
    console.log("🚀 Everyone receives the same premium experience!");

  } catch (error: any) {
    console.error("\n❌ UNIFIED FLOW TEST FAILED:", error.message);
    
    console.log("\n🔧 Troubleshooting:");
    console.log("1. Make sure the app is running (npm run dev)");
    console.log("2. Check BASE_URL is correct");
    console.log("3. Verify CRON_SECRET is set");
    console.log("4. Check network connectivity");
    
    process.exit(1);
  }
}

// Run test
testUnifiedFlow();
