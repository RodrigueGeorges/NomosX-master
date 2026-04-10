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
    // Navigation exists
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
    cy.contains('Researcher').should('be.visible');
    cy.contains('Studio').should('be.visible');
  });

  it('Articles page loads', () => {
    cy.visit('/articles');
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

  it('Redirects /briefs to /articles', () => {
    cy.request({ url: '/briefs', followRedirect: false }).then((resp) => {
      expect(resp.status).to.be.oneOf([301, 308]);
      expect(resp.headers.location).to.contain('/articles');
    });
  });

  it('Redirects /publications to /articles', () => {
    cy.request({ url: '/publications', followRedirect: false }).then((resp) => {
      expect(resp.status).to.be.oneOf([301, 308]);
      expect(resp.headers.location).to.contain('/articles');
    });
  });
});
