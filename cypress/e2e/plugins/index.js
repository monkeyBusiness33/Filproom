/// <reference types="cypress" />
// ***********************************************************
// This example plugins/index.js can be used to load plugins
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)
const axios = require('axios');
const { ACCOUNT_TYPES } = require('../shared/constants.js');
let cache = {}


module.exports.payInvoice = async (configs, body, key="payment", account='retailer') => {
  console.log(">> payInvoice", body)
  user = await module.exports.login(configs, account)

  const _body = {
    invoiceID: null,
    grossAmount: 100, 
    manual: 0
  }


  // overwrite params
  for (var paramKey in body) {
    _body[paramKey] = body[paramKey]
  }

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/invoice/${_body.invoiceID}/payment`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _body
    })
  } catch (e) {
    console.log(e)
  }

  return resp1.data
}

module.exports.createAddress = async (configs, data={}, key='address', account = 'retailer') => {
  console.log(">> createAddress")
  user = await module.exports.login(configs, account)

  const _body = {
    name: 'test',
    surname: 'test',
    phoneCountryCode: null,
    phoneNumber: null,
    address: '505 Howard St',
    addressExtra: 'Floor 3',
    city: 'San Francisco',
    countyCode: 'CA',
    postcode: '94105',
    country: 'us',
    email: 'test@test.com',
    validate: 'no_validation'
  }

  // overwrite params
  for (var paramKey in data) {
    // create object only of valid parameters
    if (paramKey in _body) {
      _body[paramKey] = data[paramKey]
    }
  }

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/address`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _body
    })
    cache[key] = resp1.data
    return resp1.data
  } catch (e) {
    return {status: e.response.status, data: e.response.data}
  }
}

module.exports.updateAddress = async (configs, addressID, updates, account='retailer') => {
  console.log(">> updateAddress", addressID)
  user = await module.exports.login(configs, account)

  const _updates = {
  }

  // overwrite params
  for (var paramKey in updates) {
    _updates[paramKey] = updates[paramKey]
  }

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/address/${addressID}`,
      method: 'put',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _updates
    })
  } catch (e) {
    console.log(e)
    return e
  }

  return resp1.data
}

module.exports.updateItem = async (configs, itemID, updates, account = "retailer") => {
  console.log(">> updateItem", itemID)

  const _updates = {
  }

  // overwrite params
  for (var paramKey in updates) {
    _updates[paramKey] = updates[paramKey]
  }

  user = await module.exports.login(configs, (account || 'retailer'))


  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/item/${itemID}`,
      method: 'put',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _updates
    })
  } catch (e) {
    console.log(e)
  }

  return "ok"
}

module.exports.createTransaction = async (configs, body, key="tx", account = "retailer") => {
  console.log(">> createTransaction", body)

  const _body = {
    type: 'sale',
    grossAmount: 0,
    currency: 'GBP',
    fromAccountID: null,
    toAccountID: null,
    orderLineItemID: null,
    orderID: null
  }

  // overwrite params
  for (var paramKey in body) {
    _body[paramKey] = body[paramKey]
  }

  user = await module.exports.login(configs, (account || 'retailer'))


  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/transactions`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _body
    })
  } catch (e) {
    return e.response
  }

  return resp1.data[0]
}

module.exports.updateTransaction = async (configs, transactionID, updates, account = "retailer") => {
  console.log(">> updateTransaction", transactionID)

  const _updates = {
  }

  // overwrite params
  for (var paramKey in updates) {
    _updates[paramKey] = updates[paramKey]
  }

  user = await module.exports.login(configs, (account || 'retailer'))


  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/transactions/${transactionID}`,
      method: 'put',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _updates
    })
  } catch (e) {
    console.log(e)
  }

  return "ok"
}

module.exports.getProduct = async (configs, productID, key="product", account = "retailer") => {
  console.log("getProduct", {productID, key, account})

  user = await module.exports.login(configs, account)

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/product/${productID}`,
      method: 'get',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      }
    })
  } catch (e) {
    return {status: e.response.status, data: e.response.data}
  }

  cache[key] = resp1.data
  return resp1.data
}

module.exports.getItem = async (configs, itemID, key="item", account = "retailer") => {
  console.log("getItem")

  user = await module.exports.login(configs, account)

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/item/${itemID}`,
      method: 'get',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      }
    })
  } catch (e) {
    console.error(e.response.status)
    console.error(e.response.statusText)
    throw new Error(e.response)
  }

  cache[key] = resp1.data
  return resp1.data
}

module.exports.importProduct = async (configs, productID, key = "imported-product", account = "retailer") => {
  user = await module.exports.login(configs, account)

  resp1 = await axios({
    url:  `${configs.env.api}/api/product/import`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    data: {
      productID: productID
    }
  })

  cache[key] = resp1.data
  return resp1.data
}

module.exports.createProduct = async (configs, params, key="product", account = "retailer") => {
  console.log(">> createProduct", params)

  const body = {
    foreignID: `${Math.random().toString(36).slice(2)}`,
    category: 'test category',
    sourceProductID: null,
    code: `${Math.random().toString(36).slice(2)}`,
    title: `${Math.random().toString(36).slice(2)}`,
    eanCode: null,
    description: 'test description',
    volume: 1,
    weight: 1,
    pieces: 1,
    status: 'active',
    variants: [{
      name: `${Math.random().toString(36).slice(2)}`,
      foreignID: `${Math.random().toString(36).slice(2)}`,
      weight: 1,
      volume: 1,
      sourceProductVariantID: null,
      gtin: `${Math.random().toString(36).slice(2)}`,
      ukSize: 'UK 1'
    }],
    images: [
      {
        src:
          'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png',
        position: 0
      },
      {
        src:
          'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png',
        position: 1
      }
    ]
  }

  //Overwrite default request
  for (var paramKey in params) {
    if (paramKey == 'variants') {
      body['variants'] = []
      for (var variant of params['variants']) {
        body['variants'].push({
          name: variant.name || `${Math.random().toString(36).slice(2)}`,
          foreignID: variant.foreignID ||`${Math.random().toString(36).slice(2)}`,
          weight: variant.weight || 1,
          volume: variant.volume || 1,
          sourceProductVariantID: variant.sourceProductVariantID || null,
          gtin: variant.gtin || `${Math.random().toString(36).slice(2)}`,
        })
      }
      continue
    }

    body[paramKey] = params[paramKey]
  }

  if (body.public) {
    body.stockxId = `${Math.random().toString(36).slice(2)}`
    body.imageReferenceUrl = 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png'
    body.styleId = body.code
  }

  // get account 
  user = await module.exports.login(configs, account)
  body.accountID = user.accountID

  let resp
  try {
    resp = await axios({
      url:  `${configs.env.api}/${body.public ? 'api/bridge/ingress/stock-x/product/created' : 'api/product'}`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: body
    })
    cache[key] = resp.data
  } catch(e) {
    console.log(e.response)
    return {status: e.response.status, data: e.response.data}
  }
  
  // create product matches
  if (account != 'retailer' && params.skipSync != true) {
    const adminUser = 'retailer'
    const _adminUser = await module.exports.login(configs, adminUser)

    const consignedProduct = await module.exports.createProduct(configs, {code: body.code}, null, adminUser)
    await axios({
      url:  `${configs.env.api}/api/product/variants/${resp.data.variants[0].ID}/match`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}` // service user
      },
      data: {
        externalAccountID: _adminUser.accountID,
        externalProductVariantID: consignedProduct.variants[0].ID
      }})
  }

  return resp.data


}

module.exports.updateProduct = async (configs, productID, params = {}, key="product", account = "retailer") => {
  console.log(">> updateProduct", params)

  const _updates = {
  }

  for (var key in params) {
    _updates[key] = params[key]
  }

  // get account 
  user = await module.exports.login(configs, account)
  _updates.accountID = user.accountID

  let resp
  try {
    resp = await axios({
      url:  `${configs.env.api}/api/product/${productID}`,
      method: 'put',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _updates
    })
    cache[key] = resp.data
  } catch(e) {
    return {status: e.response.status, data: e.response.data}
  }

  return resp.data


}

module.exports.importProduct = async (configs, productID, key = "imported-product", account = "retailer") => {
  user = await module.exports.login(configs, account)

  resp1 = await axios({
    url:  `${configs.env.api}/api/product/import`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    data: {
      productID: productID
    }
  })

  cache[key] = resp1.data
  return resp1.data
}

module.exports.getProducts = async (configs, params, key = "products", account = "retailer") => {
  const _params = {
    offset: 0,
    limit: 100,
    sort: null
  }
  console.log(">> getProducts", params)

  // overwrite params
  for (var paramKey in params) {
    if (['account', 'key'].includes(paramKey)) continue
    _params[paramKey] = params[paramKey]
  }

  user = await module.exports.login(configs, account)

  let resp1;
  try {
    if (_params.search) {
      resp1 = await axios({
        url:  `${configs.env.api}/api/product/search`,
        method: 'post',
        headers: {
          'Authorization' : `Bearer ${user.apiKey}`
        },
        data: _params
      })
    } else {
      resp1 = await axios({
        url:  `${configs.env.api}/api/product`,
        method: 'get',
        headers: {
          'Authorization' : `Bearer ${user.apiKey}`
        },
        params: _params
      })
    }
  } catch (e) {
    return {status: e.response.status, data: e.response.data}
  }


  cache[key] = resp1.data.rows
  return resp1.data.rows
}

module.exports.updateOrder = async (configs, orderID, updates, account = "retailer") => {
  console.log(">> updateOrder", orderID)

  const _updates = {
  }

  // overwrite params
  for (var paramKey in updates) {
    _updates[paramKey] = updates[paramKey]
  }

  user = await module.exports.login(configs, account)

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/order/${orderID}`,
      method: 'PUT',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _updates
    })
  } catch (e) {
    console.log(e)
  }

  return "ok"
}

module.exports.createOrder = async (configs, params, key = "order", account = "retailer") => {
  console.log(">> createOrder")
  // default parameters shared between orders that can be overwritten 
  let body = {
    foreignID: `${Math.random().toString(36).slice(2)}`,
    reference1: `${Math.random().toString(36).slice(2)}`,
    arrivalDate: null,
    details: [],
    productQty: [1,1,1]
  }

  const accountName = (params.account || account)
  const user = await module.exports.login(configs, accountName)
  body.accountID = user.accountID

  if (params.type == "inbound") {
    console.log(">>>> inbound")
    // default parameters for order inbound that can be overwritten 
    body.consigneeID = user.account.warehouses[0].addressID

    //overwrite params
    for (var paramKey in params) {
      body[paramKey] = params[paramKey]
    }

    // params that can't be overwritten
    body.type = "inbound"
    //auto generate details
    if(body.details.length == 0){
      const productConfig = params.product || {}
      productConfig.account = accountName
      const products = await Promise.all(body.productQty.map(qty => module.exports.createProduct(configs, productConfig)))

      const inventoryRecords = await Promise.all(body.productQty.map((qty, idx) => {
        const product = products[idx]
        return exports.createInventory(configs, {quantity: qty, productID: product.productID, productVariantID: product.variants[0].ID, account: accountName})
      }))

      inventoryRecords.map((invRec, idx) => {
        invRec.items.map(item => {
          body.details.push({
            itemID: item.ID,
          })
        })
      })
    }

  }

  if (params.type == "outbound") {
    console.log(">>>> outbound")
    // default parameters for order outbound that can be overwritten 
    body.consignorID = user.account.warehouses[0].addressID
    body.consignee = {
      name: `${Math.random().toString(36).slice(2)}`,
      surname: `${Math.random().toString(36).slice(2)}`,
      address: `${Math.random().toString(36).slice(2)}`,
      email: `test@gmail.com`,
      phoneCountryCode: '1',
      phoneNumber: '7928766999',
      address: '305 S Midland St',
      city: 'Merrill',
      postcode: '48637',
      countyCode: 'mi',
      country: 'US',
      countryCode: 'us',
      validated: 1
    }
    
    //optional override params
    for (var paramKey in params) {
      //patch body and  _params copy (inboundParams)
      body[paramKey] = params[paramKey]
    }
    
    // params that can't be overwritten
    body.type = "outbound"
    body.saleChannelID = user.account.saleChannels[0].ID

    //auto generate details
    if(body.details.length == 0){
      const inbound = {
        account: accountName,
        reference1: body.reference1,
        setAsDelivered: true
      }
      const inventoryRecords = await Promise.all(body.productQty.map(qty => {
        const _body = JSON.parse(JSON.stringify(inbound))
        _body.quantity = qty
        return module.exports.createInventory(configs, _body)
      }))

      inventoryRecords.map((inventoryRecord, idx) => {
        const saleChannelListing = inventoryRecord.listings.find(listing => listing.saleChannelID == body.saleChannelID)
        const quantity = body.productQty[idx]
        body.details.push({inventoryListingID: saleChannelListing.ID, quantity: quantity, price: saleChannelListing.payout})
      })

      //asign barcode in case it needs to be used
      const queries = []
      inventoryRecords.map(invRec => invRec.items.map(item => queries.push(module.exports.updateItem(configs, item.ID, {barcode: `${Math.random().toString(36).slice(2)}`}, accountName))))
      await Promise.all(queries)
    }

    if(params.transactions && params.transactions.length > 0){
      body.transactions = params.transactions
    }
    else{
      // add sale transaction
      body.transactions = [{
        grossAmount:       body.details.reduce((acc, detail) => acc + detail.price * (detail.quantity || 1), 0),
        currency:     user.account.currency,
        type:         'sale',
        reference:     body.reference1,
        //paymentMethod: '', //TODO
        gateway:'fliproom',
        status:'paid'
      }]
    }


  }

  if (params.type == "transfer") {
    console.log(">>>> transfer")
    body.consigneeID = null
    body.consignorID = null

    //optional override params
    for (var paramKey in params) {
      //patch body and  _params copy (inboundParams)
      body[paramKey] = params[paramKey]
    }

    body.type = 'transfer'
    //auto generate details
    if(body.details.length == 0){
      //TODO: to fix
      try {
        const queries = await Promise.all(params.productQty.map(qty => module.exports.createInventory(configs, {
          reference1: body.reference1,
          productQty: [qty]
        }, account)))
        queries.map((inventoryRecord, idx) => {
          body.details.push({inventoryRecordID: inventoryRecord[0].ID, quantity: params.productQty[idx]})
        })
      } catch (e) {
        console.log(e)
      }
    }
  }

  try {
    const urls = {
      inbound: `${configs.env.api}/api/order/purchase`,
      outbound: `${configs.env.api}/api/order/sale-order`,
      transfer: `${configs.env.api}/api/order/transfer`
    }
    resp1 = await axios({
      url:  urls[params.type],
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: body,
    })
  } catch (e) {
    console.error(params.type)
    console.error(e.response.statusText)
    return {status: e.response.status, message: e.response.data.error}
  }
  let order = resp1.data

  if (body.type == "inbound" && body.fulfillment && body.fulfillment.setAsDelivered == true) {

    //for each item - assign barcode
    const orderID = order.ID
    await Promise.all(order.orderLineItems.map(oli => {
      const customBarcode = Math.random().toString(36).slice(10) + (new Date()).getTime().toString(16) //uuid.v4()
      return module.exports.updateItem(configs, oli.itemID, {barcode: customBarcode})
    }))
    order = await module.exports.getOrder(configs, orderID) //re-fetch updated order
  }

  // for transfer orders - if we need to have it complete (ex manual order fromharrods) we need to complete the transfer separatly can't setAsDelivered from fulfillment
  if (body.type == "transfer" && body.fulfillment?.setAsDelivered == true) {
    const transferIn = await module.exports.getOrder(configs, order.siblingOrderID, 'transferInOrder')

    await module.exports.scanInbound(configs, transferIn.orderLineItems[0].orderID, transferIn.orderLineItems[0].fulfillmentID, transferIn.orderLineItems)

    order = await module.exports.getOrder(configs, order.ID, 'transferOutOrder', account)
  }

  cache[key] = order
  return order
}

module.exports.createManualOrder = async (configs, params, key = "manual-order", account = "retailer") => {
  console.log(">> createOrder")
  // default parameters shared between orders that can be overwritten

  const accountName = (params.account || account)
  const user = await module.exports.login(configs, accountName)

  let body = {
    foreignID: `${Math.random().toString(36).slice(2)}`,
    reference1: `${Math.random().toString(36).slice(2)}`,
    arrivalDate: null,
    saleChannelID : user.account.saleChannels[0].ID,
    details: [],
    productQty: [1, 1, 1]
  }
  body.accountID = user.accountID

  console.log(">>>> outbound")
  // default parameters for order outbound that can be overwritten
  body.consignorID = user.account.warehouses[0].addressID
  body.consignee = {
    name: `${Math.random().toString(36).slice(2)}`,
    surname: `${Math.random().toString(36).slice(2)}`,
    address: `${Math.random().toString(36).slice(2)}`,
    addressExtra: `00`,
    postcode: `00azh`,
    city: `london`,
    country: `uk`,
    email: `test@gmail.com`,
    phoneNumber: `0000873654`,
    phoneCountryCode: '44',
  }



  //optional override params
  for (var paramKey in params) {
    //patch body and  _params copy (inboundParams)
    body[paramKey] = params[paramKey]
  }

  // params that can't be overwritten
  body.type = "outbound"


  //auto generate details
  if (body.details.length == 0) {
    const inbound = {
      account: accountName,
      reference1: body.reference1,
      setAsDelivered: true
    }
    const inventoryRecords = await Promise.all(body.productQty.map(qty => {
      const _body = JSON.parse(JSON.stringify(inbound))
      _body.quantity = qty
      return module.exports.createInventory(configs, _body)
    }))

    inventoryRecords.map((inventoryRecord, idx) => {
      const saleChannelListing = inventoryRecord.listings.find(listing => listing.saleChannelID == body.saleChannelID)
      const quantity = body.productQty[idx]
      body.details.push({
        inventoryListingID: saleChannelListing.ID,
        quantity: quantity,
        price: saleChannelListing.payout
      })
    })

    //asign barcode in case it needs to be used
    const queries = []
    inventoryRecords.map(invRec => invRec.items.map(item => queries.push(module.exports.updateItem(configs, item.ID, {barcode: `${Math.random().toString(36).slice(2)}`}, accountName))))
    await Promise.all(queries)
  }


  try {
    resp1 = await axios({
      url: `${configs.env.api}/api/order/manual`,
      method: 'post',
      headers: {
        'Authorization': `Bearer ${user.apiKey}`
      },
      data: body
    })
  } catch (e) {
    console.error(e.response.status)
    console.error(e.response.statusText)
    throw new Error(e.response)
  }
  let order = resp1.data

  cache[key] = order
  return order
}

module.exports.cancelOrder = async (configs, params, key = "order", account = "retailer") => {
  console.log(">> cancelOrder")
  // default parameters shared between orders that can be overwritten 
  let body = {
    orderID: null,
    orderLineItems: []
  }

  const user = await module.exports.login(configs, account)
  body.accountID = user.accountID

  //overwrite params
  for (var paramKey in params) {
    body[paramKey] = params[paramKey]
  }

  const reqParams = {
    url:  `${configs.env.api}/api/order/${body.orderID}/cancel`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    data: body
  }

    let response

    try {
      resp1 = await axios(reqParams)
      response = resp1.data
      cache[key] = response
    } catch (e) {
      console.error(e.response.status)
      console.error(e.response.statusText)
      response = {status:e.response.status, message: e.response.data.error}

    }
    return response


}

module.exports.refundOrder = async (configs, params, key = "order", account = "retailer") => {
  console.log(">> refundOrder")
  // default parameters shared between orders that can be overwritten 
  let body = {
    orderID: null,
    orderLineItems: []
  }

  const user = await module.exports.login(configs, account)
  body.accountID = user.accountID

  //overwrite params
  for (var paramKey in params) {
    body[paramKey] = params[paramKey]
  }

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/order/${body.orderID}/refund`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: body
    })
  } catch (e) {
    console.error(e.response.status)
    console.error(e.response.statusText)
    throw new Error(e.response)
  }
  let order = resp1.data

  cache[key] = order
  return order
}

module.exports.getOrder = async (configs, orderID, key="order", account = "retailer") => {
  console.log("getOrder", orderID)

  //TODO user Logged
  user = await module.exports.login(configs, account)

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/order/${orderID}`,
      method: 'get',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      }
    })
  } catch (e) {
    return {status: e.response.status, data: e.response.data}
  }

  cache[key] = resp1.data
  return resp1.data
}

module.exports.getOrders = async (configs, params, key = "orders", account = "retailer") => {
  console.log("getOrders")

  delete params['account']

  delete params['key']
  const _params = {
    offset: 0,
    limit: 100,
    sort: null
  }

  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }

  user = await module.exports.login(configs, account)

  _params.accountID = user.accountID

  resp1 = await axios({
    url:  `${configs.env.api}/api/order`,
    method: 'get',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    params: _params
  })

  cache[key] = resp1.data.rows
  return resp1.data.rows
}

module.exports.getFulfillment = async (configs, orderID, fulfillmentID, key="fulfillment", account = "retailer") => {
  console.log("getFulfillment")

  user = await module.exports.login(configs, account)

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/order/${orderID}/fulfillments/${fulfillmentID}`,
      method: 'get',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      }
    })
  } catch (e) {
    console.error(e.response.status)
    console.error(e.response.statusText)
    throw new Error(e.response)
  }

  cache[key] = resp1.data
  return resp1.data
}

module.exports.getFulfillments = async (configs, params, key = "fulfillments", account = "retailer") => {
  const _params = {
    offset: 0,
    limit: 100,
    sort: null
  }

  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }

  user = await module.exports.login(configs, account)

  resp1 = await axios({
    url:  `${configs.env.api}/api/fulfillment`,
    method: 'get',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    params: _params
  })

  cache[key] = resp1.data.rows
  return resp1.data.rows
}

module.exports.createFulfillment = async (configs, orderID, body, account = 'retailer') => {
  console.log(">> createFulfillment", body)
  user = await module.exports.login(configs, account)

  const _body = {
    foreignID: `${Math.random().toString(36).slice(2)}`,
    reference1: null,
    originAddressID: null,
    destinationAddressID: null,
    orderID: null,
    courier: null,
    courierServiceCode: null,
    setAsDispatched: false,
    orderLineItems: []
  }

  // overwrite params
  for (var paramKey in body) {
    _body[paramKey] = body[paramKey]
  }

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/order/${orderID}/fulfillments`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _body
    })
  } catch (e) {
    return {status: e.response.status, message: e.response.data.error}
  }

  return resp1.data
}


module.exports.updateFulfillment = async (configs, fulfillmentID, orderID, updates, account='retailer') => {
  console.log(">> updateFulfillment", fulfillmentID)
  user = await module.exports.login(configs, account)

  const _updates = {
  }

  // overwrite params
  for (var paramKey in updates) {
    _updates[paramKey] = updates[paramKey]
  }

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/order/${orderID}/fulfillments/${fulfillmentID}`,
      method: 'put',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: _updates
    })
  } catch (e) {
    return {status: e.response.status, message: e.response.data.error}
  }

  return resp1.data
}

module.exports.getInventoryByID = async (configs, params, key = "inventory", account = "retailer") => {

  const _params = {
    account: account,
    key: key,
  }

  // overwrite params
    for (var paramKey in params) {
      _params[paramKey] = params[paramKey]
    }


  let user = await module.exports.login(configs, _params.account)

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/inventory/${params.ID}`,
      method: 'get',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
    })
  } catch (e) {
    return {status: e.response.status, message: e.response.data.error}
  }

  cache[_params.key] = resp1.data
  return resp1.data
}

module.exports.getInventory = async (configs, params, key = "inventory", account = "retailer") => {
  user = await module.exports.login(configs, account)

  const _params = {
    offset: 0,
    limit: 100,
    sort: null
  }
  
  _params.accountID = user.accountID

  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }

  delete _params['account']



  try {    
    resp1 = await axios({
      url:  `${configs.env.api}/api/inventory`,
      method: 'get',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      params: _params
    })
  } catch (e) {
    return {status: e.response.status, message: e.response.data.error}
  }

  cache[key] = resp1.data.rows
  return resp1.data.rows
}

module.exports.createInventory = async (configs, params, key="inventory", account = 'retailer') => {
  console.log(">> createInventory", params)

  // get account
  const user = await module.exports.login(configs, account)

  // default parameters that can be overwritten 
  const body = {
    orderKey: 'order',
    key: 'key',
  
    accountID: user.accountID,
    reference1: `${Math.random().toString(36).slice(2)}`,
    virtual: false,
    productID: null,
    productVariantID: null,
    quantity: 1,
    cost: 100,
    notes: 'some notes',
    payout: 999,
    priceSourceMargin: null,
    priceSourceName: null,
    status: 'active',
    setAsDelivered: false,
    warehouseID: user.account.warehouses.find(wh => wh.fulfillmentCentre).ID,
    saleChannels: user.account.saleChannels
  }

  // overwrite params
  for (var paramKey in params) {
    body[paramKey] = params[paramKey]
  }

  // params that can't be overwritten
  body['quantity'] = body.virtual ? 10 : body['quantity']
  
  let inventoryProduct;
  const _accountForProduct = account == 'retailer-user-limited' ? 'retailer' : account
  if (body.productID == null || body.productVariantID == null) {
    const productParams = params?.product || {}
    //use admin account to create product if using limited user account
    inventoryProduct = await module.exports.createProduct(configs, productParams, null, _accountForProduct)
    body['productID'] = inventoryProduct.ID
    body['productVariantID'] = inventoryProduct.variants[0].ID
  } else {
    inventoryProduct = await module.exports.getProduct(configs, body.productID, null, _accountForProduct)
  }
  
  body['listings'] = []
  for (var saleChannel of body.saleChannels) {
    let listingProductID = body['productID']
    let listingProductVariantID = body['productVariantID']

    if (saleChannel.accountID != body.accountID) {
      console.log(">> fetch products matches for listings upload")

      /**
       New endpoint is broken
      const externalProductVariantResp = await axios({
        url:  `${configs.env.api}/api/product/v2/${body['productID']}/variants/${body['productVariantID']}/match`,
        method: 'post',
        headers: {
          'Authorization' : `Bearer ${user.apiKey}` // service user
        },
        data: {
          externalProductVariantID: saleChannel.accountID,
      }})
       */

      const externalProductVariantResp = await axios({
        url:  `${configs.env.api}/api/product/variants/${body['productVariantID']}/match`,
        method: 'post',
        headers: {
          'Authorization' : `Bearer ${user.apiKey}` // service user
        },
        data: {
          externalAccountID: saleChannel.accountID
      }})

      listingProductID = externalProductVariantResp.data.productID
      listingProductVariantID = externalProductVariantResp.data.ID
    }

    if ((body.virtual == true && saleChannel.allowVirtualInventory) || body.virtual == false) {
      body['listings'].push({
        saleChannelID: saleChannel.ID,
        productID: listingProductID,
        productVariantID: listingProductVariantID,
        payout: body.payout,
        priceSourceMargin: body.priceSourceMargin,
        priceSourceName: body.priceSourceName,
        status: body.status
      })
    }
  }

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/inventory`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: body
    })
  } catch (e) {
    return {status: e.response.status, message: e.response.data.error}
  }

  let inventory = resp1.data
  cache[key] = inventory
  return inventory
}


module.exports.updateListing = async (configs, listingID, params, key="listing", account = 'retailer') => {
  console.log(">> updateListing", params)

  // get account
  const user = await module.exports.login(configs, account)
  const updates = {}

  // overwrite params
  for (var paramKey in params) {
    updates[paramKey] = params[paramKey]
  }

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/inventory-listings/${listingID}`,
      method: 'put',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: updates
    })
  } catch (e) {
    console.log("failed to PUT api/inventory-listings")
    console.log(e)
    return {status: e.response.status, message: e.response.data.error}
  }

  let inventoryListing = resp1.data
  cache[key] = inventoryListing
  return inventoryListing
}

module.exports.updateInventory = async (configs, inventoryID, params, key="inventory", account = 'retailer') => {
  console.log(">> updateInventory", params)

  // get account
  const user = await module.exports.login(configs, account)
  const updates = {}

  // overwrite params
  for (var paramKey in params) {
    updates[paramKey] = params[paramKey]
  }

  try {
    resp1 = await axios({
      url:  `${configs.env.api}/api/inventory/${inventoryID}`,
      method: 'put',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: updates
    })
  } catch (e) {
    console.log("failed to PUT api/inventory")
    console.log(e)
    return {status: e.response.status, message: e.response.data.error}
  }

  let inventory = resp1.data
  cache[key] = inventory
  return inventory
}


module.exports.createShopifyProduct= async (configs, params, key = "product", account = "retailer") => {

  const _params = {
    id: `${Math.random().toString(36).slice(2)}`,
    product_type: "test category",
    title: "test product created " + (Math.random() + 1).toString(36).substring(7),
    variants: [
      {id: `${Math.random().toString(36).slice(2)}`, title: 'variant 1', grams: 1000, sku: 'DB009876'},
      {id: `${Math.random().toString(36).slice(2)}`, title: 'variant 2', grams: 2000, sku: 'DB009876'},
      {id: `${Math.random().toString(36).slice(2)}`, title: 'variant 3', grams: 3000, sku: 'DB009876'},
      {id: `${Math.random().toString(36).slice(2)}`, title: 'variant 4', grams: 4000, sku: 'DB009876'}
    ],
    images: [
      {id: `${Math.random().toString(36).slice(2)}`, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 1},
      {id: `${Math.random().toString(36).slice(2)}`, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 2},
      {id: `${Math.random().toString(36).slice(2)}`, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/eurocave/logo.svg', position: 3},
      {id: `${Math.random().toString(36).slice(2)}`, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/schmidt/logo.png', position: 4}
    ]
  }

  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }

  const product = {
    id: _params.id,
    product_type: _params.product_type,
    title: _params.title,
    variants: _params.variants,
    images: _params.images
  }

  console.log("Create Shopify Product")
  const user = await module.exports.login(configs, account)
  resp1 = await axios({
    url:  `${configs.env.api}/api/bridge/ingress/shopify/product/created`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}` // service user
    },
    data: product
  })
  const dbProduct = resp1.data

  // cache
  cache[`${key}`] = dbProduct
  
  // return orders
  return dbProduct
}

module.exports.createShopifyOrder= async (configs, params, key = "order", account = "retailer", account2 = "reseller") => {

  const _params = {
    id: `${Math.random().toString(36).slice(2)}`,
    adminProductQty: [2],
    consignorProductQty: [2],
    reference1: `${Math.random().toString(36).slice(2)}`,
    line_items: []
  }



  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }

  const order = {
    id: _params.id,
    order_number: `${_params.reference1}`,
    line_items: _params.line_items,
    shipping_address: {
        "first_name": "Steve",
        "address1": "123 Shipping Street",
        "phone": "555-555-SHIP",
        "city": "Shippington",
        "zip": "40003",
        "province": "Kentucky",
        "country": "United States",
        "last_name": "Shipper",
        "address2": null,
        "company": "Shipping Company",
        "latitude": null,
        "longitude": null,
        "name": "Steve Shipper",
        "country_code": "US",
        "province_code": "KY"
    },
    currency: 'GBP',
    total_line_items_price: '19.99',
    total_outstanding: '0.00',
    discount_codes: [
        {amount: '11.99'}
    ],
    shipping_lines: [
        {price: '5.00'}
    ]
  }
  //auto generate details
  if (order.line_items.length == 0){
   order.line_items = await exports.createShopifyOrderLineItems(configs, _params)
  }

  order.total_line_items_price = order.line_items.reduce((total, item) => total + (item.price * item.quantity), 0)

  console.log("Create Shopify Order")
  const user = await module.exports.login(configs, account)
  resp1 = await axios({
    url:  `${configs.env.api}/api/bridge/ingress/shopify/order/created`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}` // service user
    },
    data: order
  })
  const adminOrder = resp1.data

  // get orders
  ordersList = await module.exports.getOrders(configs, {parentOrderID: adminOrder.ID}, "orders", account2)
  cache[key] = ordersList

  const consignorOrderID = ordersList.find(order => order.parentOrderID != null)?.ID

  // cache
  cache[`${key}_admin`] = adminOrder

  if (consignorOrderID) {
    cache[`${key}_consignor`] =  await module.exports.getOrder(configs, consignorOrderID, "order", account2)
  }
  
  // return orders
  return {
    admin: cache[`${key}_admin`],
    consignor: cache[`${key}_consignor`]
  }
}

module.exports.createShopifyOrderLineItems=  async (configs, params, key = "line_items", account = "retailer", account2 = "reseller") => {
  const _params = {
    adminProductQty: [2],
    consignorProductQty: [2],
    consignorSetAsDelivered: true,
    adminSetAsDelivered: true,
    reference1: `${Math.random().toString(36).slice(2)}`,
  }

  const line_items = []


  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }

  const saleChannelID = 1
  // Create admin inventory
  const inventoryRecordsAdmin = await Promise.all(_params.adminProductQty.map(qty => {
    console.log('@@@quantity', qty == 'virtual' ? 10 : qty)
    console.log('@@@virtual', qty == 'virtual' ? true : false)

    return module.exports.createInventory(configs, {
      account: account,
      reference1: _params.reference1,
      setAsDelivered: _params.adminSetAsDelivered,
      quantity: qty == 'virtual' ? 10 : qty,
      virtual: qty == 'virtual' ? true : false
    }, null, account)
  }))

  inventoryRecordsAdmin.map((invRec, idx) => line_items.push({
    "variant_id": invRec.variant.foreignID,
    "quantity":   _params.adminProductQty[idx] == 'virtual' ? 2 : _params.adminProductQty[idx],
    "product_id": invRec.product.ID,
    "price":      invRec.listings.find(listing => listing.saleChannelID == saleChannelID).price,
  }))


  console.log("Create consignor inventory")
  const inventoryRecordsConsignor = await Promise.all(_params.consignorProductQty.map(qty => module.exports.createInventory(configs, {
    reference1: _params.reference1,
    setAsDelivered: _params.consignorSetAsDelivered,
    quantity: qty
  }, null, account2)))

  inventoryRecordsConsignor.map((invRec, idx) => {
    const listing = invRec.listings.find(listing => listing.saleChannelID == saleChannelID)
    line_items.push({
      "variant_id": listing.variant.foreignID,
      "quantity":   _params.consignorProductQty[idx],
      "product_id": listing.product.ID,
      "price":      listing.price,
    })
  })

  return line_items
}

/**
 * WAREHOUSING FUNCTIONS
 */

module.exports.createStockTake= async (configs, params, key="stock-take", account="retailer") => {
  const user = await module.exports.login(configs, account)
  const _params = {
    key: key,
    type: 'stock-take',
    warehouseID: 1, // STORAGE#1 HARDCODED
    accountID: user.accountID,
    userID: user.ID,
  }

  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }
  const resp = await axios({
    url:  `${configs.env.api}/api/job`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    data: _params
  })

  cache[_params.key] = resp.data
  return resp.data
}

module.exports.scanOutbound= async (configs, orderID, fulfillmentID, orderLineItems, account = "retailer") => {
  const user = await module.exports.login(configs, account)

  resp2 = await axios({
    url:  `${configs.env.api}/api/order/${orderID}/fulfillments/${fulfillmentID}/dispatch`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    data: {
      fulfillmentID: fulfillmentID,
      orderLineItems: orderLineItems.map(oli => {return {ID: oli.ID}})
    }
  })
  return "ok"
}

module.exports.scanInbound= async (configs, orderID, fulfillmentID, orderLineItems, account = "retailer") => {
  console.log(">> scanInbound")
  const user = await module.exports.login(configs, account)
  // check if needs to assign barcode first
  for (var oli of orderLineItems) {
    if (oli.item.barcode == null) {
      const customBarcode = Math.random().toString(36).slice(10) + (new Date()).getTime().toString(16) //uuid.v4()
      await module.exports.updateItem(configs, oli.itemID, {barcode: customBarcode}, account)
    }
  }

  resp2 = await axios({
    url:  `${configs.env.api}/api/order/${orderID}/fulfillments/${fulfillmentID}/deliver`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    data: {
      fulfillmentID: fulfillmentID,
      orderLineItems: orderLineItems.map(oli => {return {ID: oli.ID}})
    }
  })
  return "ok"
}

module.exports.login = async (configs, accountName) => {
  const credentials = {}

  if (accountName == ACCOUNT_TYPES.RETAILER) {
    credentials.email = 'demo@fliproom.io'
    credentials.password = 'Fliproom2022!'
  }

  if (accountName == ACCOUNT_TYPES.RESELLER) {
    credentials.email = 'reseller@fliproom.io'
    credentials.password = 'Fliproom2022!'
  }

  if (accountName == ACCOUNT_TYPES.RESELLER2) {
    credentials.email = 'reseller2@fliproom.io'
    credentials.password = 'Fliproom2022!'
  }

  if (accountName == ACCOUNT_TYPES.PERSONAL_SHOPPER) {
    credentials.email = 'personal-shopper@fliproom.io'
    credentials.password = 'Fliproom2022!'
  }

  if (accountName == ACCOUNT_TYPES.RETAILER_USER_LIMITED) {
    credentials.email = 'limited-user@fliproom.io'
    credentials.password = 'Fliproom2022!'
  }

  let apiKey

  if (accountName in cache && cache[accountName].apiKey) {
    apiKey = cache[accountName].apiKey
  } else {
    resp1 = await axios({
      url:  `${configs.env.api}/auth/signin`,
      method: 'post',
      data: credentials
    })
    apiKey = resp1.data.jwt
  }

  let user;
  try {
    resp2 = await axios({
      url:  `${configs.env.api}/api/user/session`,
      method: 'get',
      headers: {
        'Authorization' : `Bearer ${apiKey}`
      }
    })
    user = resp2.data
  } catch (e) {
    console.log(e.response)
  }

  cache[accountName] = user
  return user
}

module.exports.userSignup = async (configs, body) => {
  try {
    const resp = await axios({
      url: `${configs.env.api}/auth/signup`,
      method: 'post',
      data: body
    })
    return resp.data
  } catch (e) {
    console.log(e)
    throw new Error(e)
  }
}

module.exports.getCache = async (key) => {
  return cache[key]
}

module.exports.clearCache = async () => {
  cache = {}
  return "ok"
}

module.exports.setCache = async (key, data) => {
  cache[key] = data
  return "ok"
}

module.exports.createSaleChannel= async (configs, params = {}, key="sale-channel", account = "retailer") => {
  const user = await module.exports.login(configs, account)
  const _params = {
    key: 'sale-channel',
    accountID: user.accountID,
    title: `${Math.random().toString(36).slice(2)}`,
    description: `<p>${Math.random().toString(36).slice(2)}}</p>`,
    platform: "store",
    allowVirtualInventory: false,
    markup: 0,
    taxRate: 0,
    fees: [],
    autoCreateFees: false,
  }

  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }
  let saleChannel;
  let resp = await axios({
    url:  `${configs.env.api}/api/sale-channels`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    data: _params
  })
  saleChannel = resp.data
  cache[_params.key] = saleChannel

  // create fees if any
  if(_params.fees.length > 0 || _params.autoCreateFees){
    console.log('Create sale channel fees')
    _params.fees =[
      {ID: null, minPrice: 0, maxPrice: 320, value: 26, type: 'percentage', toRemove: false},
      {ID: null, minPrice: 321, maxPrice: 999, value: 22, type: 'percentage', toRemove: false},
      {ID: null, minPrice: 1000, maxPrice: 99999999, value: 17, type: 'percentage', toRemove: false}
    ]
    saleChannel = await module.exports.createSaleChannelFees(configs, {saleChannelID: resp.data.ID, fees: _params.fees}, key, account)
  }
  return saleChannel
}

module.exports.createSaleChannelFees= async (configs, params = {}, key='sale-channel', account = "retailer") => {
  console.log('>>> create sale channel fees')
  const user = await module.exports.login(configs, account)
  const saleChannelID = params.saleChannelID
  const _params = {
    key: 'sale-channel',
    accountID: user.accountID,
    fees: []
  }

  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }
  const resp = await axios({
    url:  `${configs.env.api}/api/sale-channels/${saleChannelID}/consignment-fees `,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    data: _params.fees
  })
  cache[_params.key] = resp.data
  return resp.data
}

module.exports.addAccountToSaleChannel= async (configs, params = {}, key='new-sale-channel-consignor', account = "retailer") => {
  const user = await module.exports.login(configs, account)
  const _params = {
    key: 'new-sale-channel-consignor',
    accountID: params.accountID,
    saleChannelID: params.saleChannelID,
  }

  // overwrite params
  for (var paramKey in params) {
    _params[paramKey] = params[paramKey]
  }
  const resp = await axios({
    url:  `${configs.env.api}/api/sale-channels/${_params.saleChannelID}/consignors/${_params.accountID}`,
    method: 'post',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
    data: _params
  })
  cache[_params.key] = resp.data
  return resp.data
}

module.exports.getSaleChannelByID= async (configs, saleChannelID, key="sale-channel", account = "retailer") => {
  const user = await module.exports.login(configs, account)

  const resp = await axios({
    url:  `${configs.env.api}/api/sale-channels/${saleChannelID}`,
    method: 'get',
    headers: {
      'Authorization' : `Bearer ${user.apiKey}`
    },
  })
  cache[key] = resp.data
  return resp.data
}

module.exports.matchProductVariant= async (configs, params, key="variant-match", account = "retailer") => {
  console.log(">> matchProductVariant")
  const user = await module.exports.login(configs, account)

  // all possible parameters for this call are listed below
  const _params = {
    productID: params.productID,
    variantID: params.variantID,
    externalProductVariantID: params.externalProductVariantID,
  }

  let resp;
  try {
    resp = await axios({
      url:  `${configs.env.api}/api/product/${_params.productID}/variants/${_params.variantID}/match`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: {
        externalProductVariantID: _params.externalProductVariantID,
      }
    })
  } catch (e) {
    return {status: e.response.status, message: e.response.data.error}
  }

  return resp.data

}


module.exports.findOrCreateProductMatch= async (configs, params, key="product-match", account = "retailer") => {
  console.log(">> findOrCreateProductMatch")
  const user = await module.exports.login(configs, account)
  // all possible parameters for this call are listed below
  const _params = {
    productID: params.productID,
  }

  let resp;
  try {
    resp = await axios({
      url:  `${configs.env.api}/api/product/import`,
      method: 'post',
      headers: {
        'Authorization' : `Bearer ${user.apiKey}`
      },
      data: {
        productID: _params.productID,
      }
    })
  } catch (e) {
    resp = e.response
  }

  return resp.data

}
