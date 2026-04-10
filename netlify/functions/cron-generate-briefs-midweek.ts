/**
 * Netlify Scheduled Function — Mid-Week Brief Generation
 * Schedule: Every Wednesday at 12:00 UTC
 * Calls: POST /api/cron/generate-briefs
 * 
 * Catches urgent signals detected during the week that can't wait until Sunday.
 */

export const config = {
  schedule: "0 12 * * 3",
};

const handler = async () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://nomosx.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-generate-briefs-midweek] CRON_SECRET not set');
    return { statusCode: 500, body: 'CRON_SECRET missing' };
  }

  try {
    console.log('[cron-generate-briefs-midweek] Starting mid-week brief generation...');

    const res = await fetch(`${appUrl}/api/cron/generate-briefs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log('[cron-generate-briefs-midweek] Result:', JSON.stringify(data));

    return {
      statusCode: res.status,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    console.error('[cron-generate-briefs-midweek] Error:', error.message);
    return { statusCode: 500, body: error.message };
  }
};

export default handler;
