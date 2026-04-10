/**
 * Netlify Scheduled Function — Auto-Scan
 * Schedule: Every day at 06:00 and 18:00 UTC
 * Calls: POST /api/cron/auto-scan
 * 
 * Runs twice daily to:
 * 1. Scout new academic sources per vertical
 * 2. Detect signals from new sources
 * 3. Analyze trends across corpus
 * 4. Detect contradictions
 * 5. Fetch live news intelligence (GDELT + NewsAPI + RSS think tanks)
 */

export const config = {
  schedule: "0 6,18 * * *",
};

const handler = async () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://nomosx.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-auto-scan] CRON_SECRET not set');
    return { statusCode: 500, body: 'CRON_SECRET missing' };
  }

  try {
    console.log('[cron-auto-scan] Starting proactive intelligence scan...');

    const res = await fetch(`${appUrl}/api/cron/auto-scan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log('[cron-auto-scan] Result:', JSON.stringify(data));

    return {
      statusCode: res.status,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    console.error('[cron-auto-scan] Error:', error.message);
    return { statusCode: 500, body: error.message };
  }
};

export default handler;
