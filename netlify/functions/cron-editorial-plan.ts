/**
 * Netlify Scheduled Function — Editorial Planner
 * Schedule: Every Sunday at 20:00 UTC (before weekly pipeline)
 * Calls: POST /api/cron/editorial-plan
 */

export const config = {
  schedule: "0 20 * * 0",
};

const handler = async () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://nomosx.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-editorial-plan] CRON_SECRET not set');
    return { statusCode: 500, body: 'CRON_SECRET missing' };
  }

  try {
    const res = await fetch(`${appUrl}/api/cron/editorial-plan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log('[cron-editorial-plan] Result:', JSON.stringify(data));

    return {
      statusCode: res.status,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    console.error('[cron-editorial-plan] Error:', error.message);
    return { statusCode: 500, body: error.message };
  }
};

export default handler;
