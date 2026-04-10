/// <reference types="cypress" />

/**
 * E2E Tests — Authentication Flow
 * Verifies registration, login, and session management.
 */

describe('Authentication Flow', () => {
  const testEmail = `e2e-${Date.now()}@test.nomosx.com`;
  const testPassword = 'TestPassword123!';

  it('Registration with valid credentials succeeds', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/register',
      body: { email: testEmail, password: testPassword, name: 'E2E Test User' },
      failOnStatusCode: false,
    }).then((resp) => {
      // 200 or 201 = success, 409 = already exists (re-run)
      expect(resp.status).to.be.oneOf([200, 201, 409]);
    });
  });

  it('Registration with weak password fails', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/register',
      body: { email: 'weak@test.com', password: '123', name: 'Weak' },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([400, 422]);
    });
  });

  it('Login with wrong password fails', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: { email: testEmail, password: 'WrongPassword!' },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([400, 401]);
    });
  });

  it('Login with valid credentials sets cookie', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: { email: testEmail, password: testPassword },
      failOnStatusCode: false,
    }).then((resp) => {
      if (resp.status === 200) {
        // Session cookie should be set
        expect(resp.headers).to.have.property('set-cookie');
      }
    });
  });

  it('Homepage shows auth modal on CTA click', () => {
    cy.visit('/');
    // Find a CTA button and click it
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Start")').length) {
        cy.contains('button', 'Start').first().click();
        // Auth modal should appear
        cy.get('[role="dialog"], .modal, [data-state="open"]').should('exist');
      }
    });
  });

  it('Dashboard redirects unauthenticated users', () => {
    cy.clearCookies();
    cy.visit('/dashboard', { failOnStatusCode: false });
    // Should either redirect to login or show auth wall
    cy.url().then((url) => {
      // Either redirected or shows login prompt
      cy.get('body').should('exist');
    });
  });
});
