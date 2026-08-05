/**
 * Next.js Instrumentation
 * Runs once when the server starts
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import('./lib/sentry');
    initSentry();

    // Prevent HTTP/2 socket errors (remote API closing connection) from crashing the server
    process.on('uncaughtException', (err) => {
      if (err && (err.code === 'UND_ERR_SOCKET' || err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
        console.warn(`[Server] Network error (non-fatal): ${err.code} — ${err.message?.slice(0, 100)}`);
        return;
      }
      console.error('[Server] Uncaught exception:', err);
    });
  }
}
