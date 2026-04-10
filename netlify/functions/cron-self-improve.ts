/**
 * Netlify Scheduled Function — Self-Improvement (Prediction Auditor + Source Reputation)
 * Schedule: Every day at 03:00 UTC
 * Calls: GET /api/cron/self-improve
 */

export const config = {
  schedule: "0 3 * * *",
};

const handler = async () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://nomosx.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-self-improve] CRON_SECRET not set');
    return { statusCode: 500, body: 'CRON_SECRET missing' };
  }

  try {
    const res = await fetch(`${appUrl}/api/cron/self-improve`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
      },
    });

    const data = await res.json();
    console.log('[cron-self-improve] Result:', JSON.stringify(data));

    return {
      statusCode: res.status,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    console.error('[cron-self-improve] Error:', error.message);
    return { statusCode: 500, body: error.message };
  }
};

export default handler;
