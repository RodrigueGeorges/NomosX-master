/// <reference types="cypress" />

// Custom commands for NomosX E2E tests

Cypress.Commands.add('login', (email: string, password: string) => {
  cy.request('POST', '/api/auth/login', { email, password }).then((resp) => {
    expect(resp.status).to.eq(200);
  });
});

Cypress.Commands.add('visitAndWait', (path: string) => {
  cy.visit(path);
  cy.get('body').should('be.visible');
});

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      visitAndWait(path: string): Chainable<void>;
    }
  }
}

export {};
