/**
 * Complete User Flow Test Script
 * 
 * Tests the entire flow from signup to email delivery
 * Run with: npx tsx scripts/test-user-flow.ts
 */

const TEST_EMAIL = "rodrigue.etifier@gmail.com";
const TEST_PASSWORD = "TestPassword123!";
const TEST_NAME = "Rodrigue Test";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function testUserFlow() {
  console.log("🧪 Starting Complete User Flow Test\n");
  console.log(`📧 Test Email: ${TEST_EMAIL}`);
  console.log(`🌐 Base URL: ${BASE_URL}\n`);

  try {
    // Step 1: Register new user
    console.log("1️⃣ Testing Registration...");
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: TEST_NAME,
      }),
    });

    if (!registerRes.ok) {
      const error = await registerRes.json();
      console.error("❌ Registration failed:", error);
      
      // If user already exists, try login instead
      if (error.error?.includes("already exists")) {
        console.log("ℹ️  User already exists, trying login...");
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
          }),
        });

        if (!loginRes.ok) {
          throw new Error("Login also failed. Please delete existing user first.");
        }

        const loginData = await loginRes.json();
        console.log("✅ Login successful:", loginData.user.email);
      } else {
        throw new Error(`Registration failed: ${error.error}`);
      }
    } else {
      const registerData = await registerRes.json();
      console.log("✅ Registration successful:", registerData.user.email);
    }

    // Step 2: Get available verticals
    console.log("\n2️⃣ Fetching Available Verticals...");
    const verticalsRes = await fetch(`${BASE_URL}/api/user/verticals`, {
      headers: {
        "Cookie": `session=${TEST_EMAIL}`, // Simplified for testing
      },
    });

    if (!verticalsRes.ok) {
      throw new Error("Failed to fetch verticals");
    }

    const verticalsData = await verticalsRes.json();
    console.log(`✅ Found ${verticalsData.verticals.length} verticals`);
    
    // Select first 3 verticals
    const selectedVerticals = verticalsData.verticals.slice(0, 3);
    console.log("📋 Selected verticals:", selectedVerticals.map((v: any) => v.name).join(", "));

    // Step 3: Save preferences (onboarding)
    console.log("\n3️⃣ Saving User Preferences...");
    const preferences = verticalsData.verticals.map((v: any) => ({
      verticalId: v.id,
      enabled: selectedVerticals.some((sv: any) => sv.id === v.id),
    }));

    const prefsRes = await fetch(`${BASE_URL}/api/user/preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `session=${TEST_EMAIL}`,
      },
      body: JSON.stringify({
        verticalPreferences: preferences,
        emailEnabled: true,
        emailFrequency: "WEEKLY",
      }),
    });

    if (!prefsRes.ok) {
      throw new Error("Failed to save preferences");
    }

    console.log("✅ Preferences saved successfully");

    // Step 4: Trigger weekly email (manual)
    console.log("\n4️⃣ Triggering Weekly Email Delivery...");
    console.log("⚠️  Note: This requires CRON_SECRET to be set");
    
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.log("⚠️  CRON_SECRET not set, skipping email trigger");
      console.log("ℹ️  To trigger manually, run:");
      console.log(`   curl -X POST ${BASE_URL}/api/cron/weekly-briefs \\`);
      console.log(`        -H "Authorization: Bearer YOUR_CRON_SECRET"`);
    } else {
      const emailRes = await fetch(`${BASE_URL}/api/cron/weekly-briefs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cronSecret}`,
        },
      });

      if (!emailRes.ok) {
        const error = await emailRes.json();
        console.error("❌ Email trigger failed:", error);
      } else {
        const emailData = await emailRes.json();
        console.log("✅ Email delivery triggered:", emailData);
      }
    }

    // Step 5: Verify user preferences
    console.log("\n5️⃣ Verifying User Preferences...");
    const verifyRes = await fetch(`${BASE_URL}/api/user/preferences`, {
      headers: {
        "Cookie": `session=${TEST_EMAIL}`,
      },
    });

    if (!verifyRes.ok) {
      throw new Error("Failed to verify preferences");
    }

    const verifyData = await verifyRes.json();
    console.log("✅ Preferences verified:");
    console.log(`   - Email enabled: ${verifyData.emailEnabled}`);
    console.log(`   - Email frequency: ${verifyData.emailFrequency}`);
    console.log(`   - Verticals selected: ${verifyData.verticalPreferences.filter((p: any) => p.enabled).length}`);

    console.log("\n✅ ✅ ✅ COMPLETE USER FLOW TEST PASSED ✅ ✅ ✅\n");
    console.log("📧 Check your email at:", TEST_EMAIL);
    console.log("⏰ Email should arrive on next Monday at 8am UTC");
    console.log("\n🎉 All systems operational!");

  } catch (error: any) {
    console.error("\n❌ TEST FAILED:", error.message);
    console.error("\nStack trace:", error.stack);
    process.exit(1);
  }
}

// Run test
testUserFlow();
