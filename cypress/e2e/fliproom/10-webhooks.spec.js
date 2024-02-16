// WORKING
describe('Shopify', () => {
  it('product/created', () => {
    cy.login('retailer')
    .then((user) => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/bridge/ingress/shopify/product/created",
        body: {
          id: 1111111111151,
          product_type: "test category",
          title: "test product created " + (Math.random() + 1).toString(36).substring(7),
          variants: [
            {id: 1111111111111, title: 'variant 1', grams: 1000, sku: null}, //test first sku missing problem
            {id: 2222222222222, title: 'variant 2', grams: 2000, sku: 'DB009876'},
            {id: 3333333333333, title: 'variant 3', grams: 3000, sku: 'DB009876'},
            {id: 4444444444444, title: 'variant 4', grams: 4000, sku: 'DB009876'}
          ],
          images: [
            {id: 222222222222, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 1},
            {id: 222222222222, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 2},
            {id: 333333333333, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/eurocave/logo.svg', position: 3},
            {id: 444444444444, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/schmidt/logo.png', position: 4}
          ]
        }
      })
    }).then((resp) => {
      expect(resp.status).equals(200)
      Object.keys(resp.body).map(i => cy.log(i))
    })

  })

  it('product/created with untracked tag', () => {
    const product_id = Math.random().toString(36).slice(2)
    cy.login('retailer')
    .then((user) => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/bridge/ingress/shopify/product/created",
        body: {
          id: product_id,
          product_type: "test category",
          title: "Untracked product creation " + (Math.random() + 1).toString(36).substring(7),
          tags: 'wiredhub-untracked',
          variants: [
            {id: Math.random().toString(36).slice(2), title: 'UK 1', grams: 1000, sku: 'DB009876'},
            {id: Math.random().toString(36).slice(2), title: 'UK 2', grams: 2000, sku: 'DB009876'},
            {id: Math.random().toString(36).slice(2), title: 'UK 3', grams: 3000, sku: 'DB009876'},
          ],
          images: [
            {id: Math.random().toString(36).slice(2), src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 0},
            {id: Math.random().toString(36).slice(2), src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 1},
            {id: Math.random().toString(36).slice(2), src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/eurocave/logo.svg', position: 2},
          ]
        }
      })
    }).then((resp) => {
      expect(resp.status).equals(200)
    })

  })

  it('product/deleted', () => {
    let product;
    cy.task('createProduct')
    .then((_product) => {
      product = _product
      return cy.login('retailer')
    }).then((user) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + "/api/bridge/ingress/shopify/product/deleted",
          body: {
            id: product.foreignID
          }
        })
    })
   .then((resp) =>{
      expect(resp.status).equals(200)
    })
  })
})

describe('Shopify - Order', () => {
  it('shopify/order/created - price difference < 10 (shopify: 95 | inventory: 100)', () => {
    const order = {
      id: `${Math.random().toString(36).slice(2)}`,
      order_number: `${Math.random().toString(36).slice(2)}`,
      total_line_items_price: 299,
      currency: 'GBP',
      line_items: [],
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
      }
    }

    cy.task('createInventory', {quantity: 1, key: 'inventory'}).then(inventory => {
      console.log(inventory.listings)
      order.line_items.push({
        "variant_id": inventory.variant.foreignID,
        "quantity": inventory.quantity,
        "product_id": inventory.product.ID,
        "price": parseFloat(inventory.listings[0].payout) - 5,
      })

      return cy.task('get', 'retailer')
    }).then(user => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/bridge/ingress/shopify/order/created",
        body: order,
      })
    }).then(resp => {
      expect(resp.status).equals(200)
      return cy.task('getOrders', {foreignID: order.id})
    }).then(resp => cy.task('getOrder', {ID: resp[0].ID}))
    .then(order => {
      expect(order.orderLineItems[0].price).equals("994.00")
    })
  })

  it('shopify/order/created - price difference > 10 - shopify: 80 | inventory: 100', () => {
    const order = {
      id: `${Math.random().toString(36).slice(2)}`,
      order_number: `${Math.random().toString(36).slice(2)}`,
      total_line_items_price: 299,
      currency: 'GBP',
      line_items: [],
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
      }
    }

    cy.task('createInventory', {quantity: 1, key: 'inventory'}).then(inventory => {
      order.line_items.push({
        "variant_id": inventory.variant.foreignID,
        "quantity": inventory.quantity,
        "product_id": inventory.product.ID,
        "price": parseFloat(inventory.listings[0].payout) - 20,
      })

      return cy.task('get', 'retailer')
    }).then(user => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/bridge/ingress/shopify/order/created",
        body: order,
        failOnStatusCode: false
      })

    }).then(resp => {
      expect(resp.status).equals(200)
    })
  })

  it('shopify/order/refund - order not on the platform (return 404)', () => {
    // should return 404
    cy.task('get', 'retailer').then(user => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/bridge/ingress/shopify/order/refunded",
        body: {
          order_id: `${Math.random().toString(36).slice(2)}`
        },
        failOnStatusCode: false
      })
    }).then(resp => {
      expect(resp.status).equals(404)
    })
  })
  it('shopify/fulfillment/created ', () => {
    // should return 404
    cy.request({
      headers: {
        'x-shopify-shop-domain': 'fliproom-dev.myshopify.com'
      },
      method: 'POST',
      url: Cypress.env('api') + "/api/webhooks/shopify/fulfillment/created",
      body: {
        order_id: `${Math.random().toString(36).slice(2)}`
      },
      failOnStatusCode: false
    }).then(resp => {
      expect(resp.status).equals(200)
    })
  })
})

describe('webhooks/ship-engine/shipment/updated', () => {
  it('Should return 200', () => {
    const trackingNumber = `${Math.random().toString(36).slice(2)}`
    let order
    cy.task('createOrder', {type: 'outbound', fulfillment: {trackingNumber: trackingNumber}})
    .then((_order) => {
      order = _order
      return cy.task('get', 'retailer')
    })
    .then((user) => {
      return cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/webhooks/ship-engine/shipment/updated",
        headers: {
          'user-agent': 'ShipEngine/v1',
          authorization: `Bearer ${user.apiKey}`
        },
        body: {
          "resource_url": `https://api.shipengine.com/v1/tracking?carrier_code=usps&tracking_number=${trackingNumber}`,
          "resource_type": "API_TRACK",
          "data": {
            tracking_number: trackingNumber
          }
        }
      })
    })
    .then(resp => {
      expect(resp.status).equals(200)
    })
  })


  it('Should return 403 - missing user-agent', () => {
    const trackingNumber = `${Math.random().toString(36).slice(2)}`
    cy.task('createOrder', {type: 'outbound', fulfillment: {trackingNumber: trackingNumber}}).then((order) => {
      console.log(order)
      return cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/webhooks/ship-engine/shipment/updated",
        headers: {
        },
        body: {
          "resource_url": `https://api.shipengine.com/v1/tracking?carrier_code=usps&tracking_number=${trackingNumber}`,
          "resource_type": "API_TRACK",
          "data": {
            tracking_number: 'trackingNumber'
          }
        },
        failOnStatusCode: false
      })
    })
    .then(resp => {
      expect(resp.status).equals(401)
    })
  })
})
