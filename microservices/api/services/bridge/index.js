/**
 * Module used to the map data between our system and external apis: ingress and outgress
 * Here the list of the apis integration
 * 
 * Note:
 * - this module should never be called directly by the business logic but triggered through cloud tasks hitting the bridge/ endpoints
 */
exports.shopify = require('./shopify')
exports.stockx = require('./stock-x')
exports.stripe = require('./stripe')
exports.shipEngine = require('./shipEngine')
exports.laced = require('./laced')
exports.revolut = require('./revolut')
exports.gmerchant = require('./google-merchant')
exports.sendGrid = require('./sendGrid.js')
exports.typesense = require('./typesense.js')
exports.cache = require('./cache.js')



