/**
 * Netlify Scheduled Function — Generate Briefs
 * Schedule: Every Sunday at 22:00 UTC (after editorial plan)
 * Calls: POST /api/cron/generate-briefs
 */

export const config = {
  schedule: "0 22 * * 0",
};

const handler = async () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://nomosx.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-generate-briefs] CRON_SECRET not set');
    return { statusCode: 500, body: 'CRON_SECRET missing' };
  }

  try {
    const res = await fetch(`${appUrl}/api/cron/generate-briefs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log('[cron-generate-briefs] Result:', JSON.stringify(data));

    return {
      statusCode: res.status,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    console.error('[cron-generate-briefs] Error:', error.message);
    return { statusCode: 500, body: error.message };
  }
};

export default handler;
