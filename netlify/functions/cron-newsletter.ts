/**
 * Netlify Scheduled Function — Weekly Newsletter
 * Schedule: Every Monday at 08:00 UTC
 * Calls: POST /api/cron/newsletter
 */

export const config = {
  schedule: "0 8 * * 1",
};

const handler = async () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://nomosx.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-newsletter] CRON_SECRET not set');
    return { statusCode: 500, body: 'CRON_SECRET missing' };
  }

  try {
    const res = await fetch(`${appUrl}/api/cron/newsletter`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log('[cron-newsletter] Result:', JSON.stringify(data));

    return {
      statusCode: res.status,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    console.error('[cron-newsletter] Error:', error.message);
    return { statusCode: 500, body: error.message };
  }
};

export default handler;
