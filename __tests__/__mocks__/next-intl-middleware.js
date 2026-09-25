// Test stub for next-intl/middleware (ESM-only package Jest can't transform).
// Security tests exercise CSRF/auth logic — i18n routing is a passthrough here.
const { NextResponse } = require('next/server');
module.exports = function createIntlMiddleware() {
  return function intlMiddleware() {
    return NextResponse.next();
  };
};
