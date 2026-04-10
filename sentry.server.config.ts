/**
 * Sentry Server Configuration
 * Error tracking and performance monitoring for Node.js server
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  // Performance monitoring
  tracesSampleRate: 0.2, // 20% of transactions (higher for server)
  
  // Environment
  environment: process.env.NODE_ENV,
  
  // Integrations
  integrations: [
    // Add custom integrations here
  ],
  
  // Before send hook
  beforeSend(event, hint) {
    // Don't send events in development
    if (process.env.NODE_ENV === "development") {
      console.log("Sentry server event (dev):", event);
      return null;
    }
    
    // Filter sensitive data
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }
    
    return event;
  },
});
