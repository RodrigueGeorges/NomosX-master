/**
 * Netlify Scheduled Function — StudioX order drainer
 * Schedule: every 5 minutes
 * Calls: POST /api/cron/studiox-drain
 */

export const config = {
  schedule: '*/5 * * * *',
};

const handler = async () => {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://nomosx.com').replace(/\/$/, '');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-studiox-drain] CRON_SECRET not set');
    return { statusCode: 500, body: 'CRON_SECRET missing' };
  }

  try {
    const res = await fetch(`${appUrl}/api/cron/studiox-drain`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log('[cron-studiox-drain] Result:', JSON.stringify(data));

    return {
      statusCode: res.status,
      body: JSON.stringify(data),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cron-studiox-drain] Error:', message);
    return { statusCode: 500, body: message };
  }
};

export default handler;
