/**
 * Netlify Scheduled Function — Macro Data Refresh
 * Schedule: Every Monday at 05:00 UTC (before auto-scan)
 * Calls: POST /api/cron/macro-refresh
 * 
 * Refreshes Eurostat, ECB, INSEE macro series for data-driven analysis.
 */

export const config = {
  schedule: "0 5 * * 1",
};

const handler = async () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://nomosx.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-macro-refresh] CRON_SECRET not set');
    return { statusCode: 500, body: 'CRON_SECRET missing' };
  }

  try {
    const res = await fetch(`${appUrl}/api/cron/macro-refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log('[cron-macro-refresh] Result:', JSON.stringify(data));

    return {
      statusCode: res.status,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    console.error('[cron-macro-refresh] Error:', error.message);
    return { statusCode: 500, body: error.message };
  }
};

export default handler;
