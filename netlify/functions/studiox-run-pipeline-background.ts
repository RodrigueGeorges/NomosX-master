/**
 * Netlify Background Function — StudioX Pipeline Runner
 * Runs up to 15 minutes. Invoked fire-and-forget after Stripe payment.
 *
 * POST body: { orderId: string }
 * Auth: Bearer $CRON_SECRET
 */

export default async (req: Request) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[studiox-run-pipeline-background] CRON_SECRET missing');
    return new Response(JSON.stringify({ error: 'CRON_SECRET missing' }), { status: 500 });
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let orderId: string;
  try {
    const body = await req.json();
    orderId = String(body.orderId ?? '');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400 });
  }

  if (!orderId) {
    return new Response(JSON.stringify({ error: 'orderId required' }), { status: 400 });
  }

  try {
    const { processStudioXOrder } = await import('../../lib/studiox/runner');
    await processStudioXOrder(orderId);
    return new Response(JSON.stringify({ ok: true, orderId }), { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[studiox-run-pipeline-background] ${orderId} error:`, message);
    return new Response(JSON.stringify({ ok: false, orderId, error: message }), { status: 500 });
  }
};
