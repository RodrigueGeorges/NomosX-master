/**
 * Netlify Scheduled Function — Cadence Reset
 * Schedule: Every day at 00:00 UTC
 * 
 * Resets expired publication counters (daily + weekly).
 * Direct import — no HTTP call needed (pure DB operation).
 */

import { resetDailyCounters, resetWeeklyCounters } from '../../lib/agent/cadence-enforcer';

export const config = {
  schedule: "0 0 * * *",
};

const handler = async () => {
  console.log("[cadence-reset] Starting scheduled reset...");

  try {
    const dailyReset = await resetDailyCounters();
    const weeklyReset = await resetWeeklyCounters();

    console.log(`[cadence-reset] Reset ${dailyReset} daily, ${weeklyReset} weekly counters`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Cadence reset complete",
        dailyReset,
        weeklyReset,
      }),
    };
  } catch (error: any) {
    console.error("[cadence-reset] Error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

export default handler;
