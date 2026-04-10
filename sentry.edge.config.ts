/**
 * Sentry Edge Configuration
 * Error tracking for Edge Runtime (middleware, edge functions)
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  // Performance monitoring (lower rate for edge)
  tracesSampleRate: 0.1,
  
  // Environment
  environment: process.env.NODE_ENV,
  
  // Before send hook
  beforeSend(event, hint) {
    if (process.env.NODE_ENV === "development") {
      return null;
    }
    return event;
  },
});
