/**
 * Netlify Scheduled Function — Auto-Tweet Publications
 * Schedule: Every 30 minutes
 * Calls: POST /api/cron/tweet-publications
 *
 * Finds newly published articles that haven't been tweeted yet,
 * generates a stylized teasing tweet via LLM, and posts to Twitter/X.
 *
 * Requires Twitter API credentials (Basic tier $100/mo):
 *   TWITTER_API_KEY, TWITTER_API_SECRET,
 *   TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
 */

export const config = {
  schedule: "*/30 * * * *",
};

const handler = async () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://nomosx.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-tweet-publications] CRON_SECRET not set');
    return { statusCode: 500, body: 'CRON_SECRET missing' };
  }

  try {
    const res = await fetch(`${appUrl}/api/cron/tweet-publications`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[cron-tweet-publications] API returned', res.status, data);
      return { statusCode: res.status, body: JSON.stringify(data) };
    }

    console.log('[cron-tweet-publications] Result:', data);
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('[cron-tweet-publications] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Auto-tweet cron failed' }),
    };
  }
};

export default handler;
