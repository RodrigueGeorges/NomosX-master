/// <reference types="cypress" />

/**
 * E2E Tests — Public Pages
 * Verifies all public-facing pages load correctly with expected content.
 */

describe('Public Pages', () => {
  it('Homepage loads with hero and CTA', () => {
    cy.visit('/');
    cy.contains('NomosX').should('be.visible');
    cy.get('body').should('contain.text', 'Think Tank');
    cy.get('nav').should('exist');
  });

  it('About page loads', () => {
    cy.visit('/about');
    cy.get('h1').should('exist');
    cy.get('body').should('not.contain.text', 'Application error');
  });

  it('Methodology page loads', () => {
    cy.visit('/methodology');
    cy.get('h1').should('exist');
  });

  it('Pricing page shows plans', () => {
    cy.visit('/pricing');
    cy.contains('Reader').should('be.visible');
    cy.contains('Studio').should('be.visible');
  });

  it('Archives page loads', () => {
    cy.visit('/archives');
    cy.get('body').should('not.contain.text', 'Application error');
  });

  it('Researchers page loads', () => {
    cy.visit('/researchers');
    cy.get('body').should('not.contain.text', 'Application error');
  });

  it('Privacy page loads', () => {
    cy.visit('/privacy');
    cy.get('body').should('not.contain.text', 'Application error');
  });

  it('Terms page loads', () => {
    cy.visit('/terms');
    cy.get('body').should('not.contain.text', 'Application error');
  });

  it('404 page renders for unknown routes', () => {
    cy.visit('/this-page-does-not-exist', { failOnStatusCode: false });
    cy.get('body').should('exist');
  });

  it('Redirects /articles to /archives', () => {
    cy.request({ url: '/articles', followRedirect: false }).then((resp) => {
      expect(resp.status).to.be.oneOf([301, 307, 308]);
      expect(resp.headers.location).to.contain('/archives');
    });
  });

  it('Redirects /publications to /archives', () => {
    cy.request({ url: '/publications', followRedirect: false }).then((resp) => {
      expect(resp.status).to.be.oneOf([301, 307, 308]);
      expect(resp.headers.location).to.contain('/archives');
    });
  });
});
