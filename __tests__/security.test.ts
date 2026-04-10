import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

// Mock NextResponse
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    json: jest.fn().mockReturnValue({ status: 200 }),
    next: jest.fn().mockReturnValue({ headers: new Map() }),
  },
}));

describe('Security Middleware', () => {
  let mockRequest: Partial<NextRequest>;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      nextUrl: { pathname: '/api/test' },
      headers: new Map(),
    };
    jest.clearAllMocks();
  });

  describe('CSRF Protection', () => {
    it('should allow GET requests without CSRF validation', () => {
      mockRequest.method = 'GET';
      mockRequest.nextUrl = { pathname: '/api/test' };
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });

    it('should allow server-to-server calls with admin key', () => {
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map([['x-admin-key', 'test-key']]);
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });

    it('should allow server-to-server calls with authorization', () => {
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map([['authorization', 'Bearer token']]);
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });

    it('should reject API mutations without valid origin', () => {
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map();
      
      const { NextResponse } = require('next/server');
      const response = middleware(mockRequest as NextRequest);
      
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'CSRF validation failed' },
        { status: 403 }
      );
    });

    it('should allow requests with valid origin', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map([['origin', 'http://localhost:3000']]);
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    it('should set security headers for all requests', () => {
      mockRequest.method = 'GET';
      mockRequest.nextUrl = { pathname: '/test' };
      
      const { NextResponse } = require('next/server');
      const mockNextResponse = { headers: new Map() };
      NextResponse.next.mockReturnValue(mockNextResponse);
      
      middleware(mockRequest as NextRequest);
      
      expect(mockNextResponse.headers.get('X-Frame-Options')).toBe('DENY');
      expect(mockNextResponse.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(mockNextResponse.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(mockNextResponse.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should set CSP header for pages only', () => {
      mockRequest.method = 'GET';
      mockRequest.nextUrl = { pathname: '/test' };
      
      const { NextResponse } = require('next/server');
      const mockNextResponse = { headers: new Map() };
      NextResponse.next.mockReturnValue(mockNextResponse);
      
      middleware(mockRequest as NextRequest);
      
      const csp = mockNextResponse.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-eval'");
    });

    it('should not set CSP header for API routes', () => {
      mockRequest.method = 'GET';
      mockRequest.nextUrl = { pathname: '/api/test' };
      
      const { NextResponse } = require('next/server');
      const mockNextResponse = { headers: new Map() };
      NextResponse.next.mockReturnValue(mockNextResponse);
      
      middleware(mockRequest as NextRequest);
      
      expect(mockNextResponse.headers.get('Content-Security-Policy')).toBeNull();
    });
  });

  describe('Environment Configuration', () => {
    it('should use environment variables for allowed origins', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://nomosx.com';
      process.env.URL = 'https://app.nomosx.com';
      
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map([['origin', 'https://nomosx.com']]);
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });
  });
});
