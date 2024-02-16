// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')
//Cypress.session();

module.exports.pilotAppDomain = "http://localhost:4400"
module.exports.webAppDomain = "http://localhost:4200"
module.exports.mobileAppDomain = "http://localhost:4300"
module.exports.consignorAppDomain = "http://localhost:4100"
