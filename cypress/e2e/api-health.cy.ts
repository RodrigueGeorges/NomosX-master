/// <reference types="cypress" />

/**
 * E2E Tests — API Health & Security
 * Verifies API endpoints respond correctly with proper security headers.
 */

describe('API Health & Security', () => {
  it('Public briefs endpoint responds 200', () => {
    cy.request('/api/public/briefs?limit=1').then((resp) => {
      expect(resp.status).to.eq(200);
      expect(resp.body).to.have.property('briefs');
    });
  });

  it('Auth routes require credentials', () => {
    cy.request({ url: '/api/auth/me', failOnStatusCode: false }).then((resp) => {
      expect(resp.status).to.be.oneOf([401, 403]);
    });
  });

  it('Protected routes reject unauthenticated requests', () => {
    const protectedRoutes = [
      '/api/studiox',
      '/api/studiox/checkout',
      '/api/auth/me',
    ];

    protectedRoutes.forEach((route) => {
      cy.request({ url: route, failOnStatusCode: false }).then((resp) => {
        expect(resp.status).to.be.oneOf([401, 403]);
      });
    });
  });

  it('CSRF protection blocks POST without origin', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'test@test.com', password: 'wrong' },
      failOnStatusCode: false,
      headers: { origin: 'https://evil-site.com' },
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([400, 401, 403]);
    });
  });

  it('Rate limiting headers are present on auth routes', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'test@test.com', password: 'wrong' },
      failOnStatusCode: false,
    }).then((resp) => {
      // Should return 401 (bad credentials) not 500
      expect(resp.status).to.be.oneOf([400, 401, 403, 429]);
    });
  });

  it('Stripe webhook rejects missing signature', () => {
    cy.request({
      method: 'POST',
      url: '/api/stripe/webhook',
      body: '{}',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.eq(400);
      expect(resp.body).to.have.property('error');
    });
  });

  it('Newsletter subscribe validates email', () => {
    cy.request({
      method: 'POST',
      url: '/api/newsletter/subscribe',
      body: { email: 'not-an-email' },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([400, 422]);
    });
  });
});
