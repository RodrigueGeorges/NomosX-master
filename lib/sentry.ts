/**
 * Sentry Error Monitoring
 * 
 * To activate:
 * 1. npm install @sentry/nextjs
 * 2. Set SENTRY_DSN in .env
 * 3. Uncomment the code below
 */

// import Sentry from '@sentry/nextjs';

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || 'development';

  if (!dsn) {
    console.warn('[Sentry] SENTRY_DSN not configured, error monitoring disabled');
    return;
  }

  // Uncomment when @sentry/nextjs is installed:
  /*
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      // Filter out sensitive data
      if (event.request?.headers) {
        delete event.request.headers['x-admin-key'];
        delete event.request.headers['authorization'];
      }
      return event;
    },
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  console.log('[Sentry] Initialized for environment:', environment);
  */
}

export function captureException(error: any, context?: Record<string, any>) {
  console.error('[Error]', error, context);

  // Uncomment when @sentry/nextjs is installed:
  /*
  Sentry.captureException(error, {
    extra: context,
  });
  */
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) {
  console.log(`[${level.toUpperCase()}]`, message, context);

  // Uncomment when @sentry/nextjs is installed:
  /*
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
  */
}

export function setUser(user: { id: string; email?: string }) {
  // Uncomment when @sentry/nextjs is installed:
  /*
  Sentry.setUser({
    id: user.id,
    email: user.email,
  });
  */
}

export function clearUser() {
  // Uncomment when @sentry/nextjs is installed:
  /*
  Sentry.setUser(null);
  */
}
