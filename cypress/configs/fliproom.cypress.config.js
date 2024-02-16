const { defineConfig } = require('cypress')
const {createShopifyOrder, getInventory, createProduct, login, getCache, setCache, createOrder, updateItem, getOrder,
  createInventory, getInventoryByID, clearCache, getOrders, getItem, scanInbound, scanOutbound, getFulfillments,
  getFulfillment, updateAddress, updateFulfillment, userSignup, createStockTake, createSaleChannel, getSaleChannelByID,
  createFulfillment, createAddress, matchProductVariant,findOrCreateProductMatch, createTransaction, payInvoice, cancelOrder,
  createSaleChannelFees,addAccountToSaleChannel, refundOrder, updateTransaction,createShopifyOrderLineItems, getProduct, 
  getProducts, importProduct, updateProduct, createShopifyProduct, updateInventory, updateListing, updateOrder } = require('../e2e/plugins/index.js')

module.exports = defineConfig({
  projectId: 'zoezy8',
  chromeWebSecurity: false,
  fixturesFolder: 'e2e/fixtures',
  screenshotsFolder: 'output/e2e/screenshots',
  videosFolder: 'output/e2e/videos',
  viewportWidth: 400,
  viewportHeight: 2200,
  includeShadowDom: true,
  env: {
    api: 'http://localhost:9000',
  },
  retries: {
    runMode: 1,
    openMode: 1,
  },
  defaultCommandTimeout: 10000,
  requestTimeout: 10000,
  taskTimeout: 120000,
  e2e: {
    retries: {
      runMode: 1,
      openMode: 1,
    },
    specPattern:
      'e2e/fliproom/{00-api,01-general,02-orders,03-inventory,04-fulfillment,05-products,06-warehousing,10-webhooks}.spec.js',
    supportFile: 'e2e/support/index.js',
    baseUrl: 'http://localhost:8100',
    setupNodeEvents(on, configs) {
      // bind to the event we care about
      on('before:run', (details) => {
        clearCache()
      }),
      on('task', {
        // plugin stuff here
        get: (key) => getCache(key),
        set: (params) => setCache(params.key, params.data),
        login: (accountName) => login(configs, accountName),
        userSignup: (body) => userSignup(configs, body),
        scanInbound:         params => scanInbound(configs, params.orderID, params.fulfillmentID, params.orderLineItems, params?.account),
        scanOutbound:        params => scanOutbound(configs, params.orderID, params.fulfillmentID, params.orderLineItems, params?.account),
        getOrder:            params => getOrder(configs, params.ID, params?.key, params?.account),
        getItem:             params => getItem(configs, params.ID, params?.key, params?.account),
        getProduct:          params => getProduct(configs, params.ID, params?.key, params?.account),
        getProducts:        params => getProducts( configs, params,  params?.key, params?.account),
        getOrders:           params => getOrders(         configs, params, params.key, params?.account),
        getFulfillment:      params => getFulfillment(configs, params.orderID, params.ID, params.key),
        getFulfillments:     params => getFulfillments(   configs, params, params?.key),
        getInventoryByID:    params => getInventoryByID(configs, params, params?.key, params?.account),
        getInventory:        params => getInventory(      configs, params,  params?.key, params?.account),
        getSaleChannelByID:  params => getSaleChannelByID(configs, params.ID, params.key),
        createOrder:         params => createOrder(       configs, params, params?.key, params?.account),
        createInventory:     params => createInventory(   configs, params, params?.key, params?.account),
        importProduct:       params => importProduct(     configs, params.ID, params?.key, params?.account),
        createProduct:       params => createProduct(     configs, params, params?.key, params?.account),
        createShopifyOrder:  params => createShopifyOrder(configs, params, params?.key, params?.account, params?.account2),
        createShopifyOrderLineItems:  params => createShopifyOrderLineItems(configs, params, params?.key, params?.account, params?.account2),
        createStockTake:     params=>  createStockTake(   configs, params, params?.key, params?.account),
        createSaleChannel:   params=>  createSaleChannel( configs, params, params?.key, params?.account),
        createSaleChannelFees: params=>  createSaleChannelFees( configs, params, params?.key, params?.account),
        createTransaction:   params=>  createTransaction( configs, params, params?.key, params?.account),
        addAccountToSaleChannel: params=>  addAccountToSaleChannel( configs, params, params?.key, params?.account),
        createFulfillment:   params=>  createFulfillment(  configs, params.orderID, params, params?.account),
        createAddress:       params => createAddress(     configs, params, params?.key, params?.account),
        createShopifyProduct:  params => createShopifyProduct(configs, params, params?.key, params?.account),
        payInvoice:          params => payInvoice(        configs, params, params?.key, params?.account),
        updateAddress:       params => updateAddress(     configs, params.ID, params.updates, params?.account),
        updateFulfillment:   params => updateFulfillment( configs, params.ID, params.orderID, params.updates, params?.account),
        updateItem:          params => updateItem(configs, params.itemID, params.updates, params?.account),
        updateProduct:       params => updateProduct(configs, params.ID, params.updates, params?.key, params?.account),
        updateInventory:     params => updateInventory(configs, params.ID, params.updates, params?.key, params?.account),
        updateOrder:     params => updateOrder(configs, params.ID, params.updates, params?.key, params?.account),
        updateListing:     params => updateListing(configs, params.ID, params.updates, params?.key, params?.account),
        updateTransaction:   params => updateTransaction(configs, params.ID, params.updates, params?.account),
        matchProductVariant: params => matchProductVariant(configs, params, params?.key, params?.account),
        findOrCreateProductMatch: params => findOrCreateProductMatch(configs, params, params?.key, params?.account),
        cancelOrder:         params => cancelOrder(        configs, params, params?.key, params?.account),
        refundOrder:         params => refundOrder(        configs, params, params?.key, params?.account)
      })
    }
  },
})
