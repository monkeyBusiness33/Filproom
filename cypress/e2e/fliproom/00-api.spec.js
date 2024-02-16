/// <reference types="Cypress" />
const moment = require('moment')

describe('api/inventory', () => {
  describe('GET /', () => {
    it('Should return 403 - when consignor tries to access retailer inventory record', () => {
      cy.task("createInventory", {
        account: 'retailer',
        setAsDelivered: true,
        quantity: 3
      })
      .then((inventory) => cy.task('getInventoryByID', {ID: inventory.ID, account: 'reseller'}))
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should return 403 - when consignor tries to access retailer inventory records list', () => {
      cy.task("createInventory", {
        account: 'retailer',
        setAsDelivered: true,
        quantity: 3
      })
      .then((inventory) => cy.task('getInventory', {accountID: inventory.accountID, account: 'reseller'}))
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  })

  describe('POST /', () => {
    it('Should Create Inventory and set as delivered', () => {
      cy.task("createInventory", {
        account: 'reseller',
        setAsDelivered: true,
        quantity: 5,
        payout: 500,
      })
      .then((newInventory) => {
        expect(newInventory.items.length).equals(5)
        expect(newInventory.items.length).equals(newInventory.quantity) //items
        expect(newInventory.items.length).equals(newInventory.quantityAtHand) //items
        expect(newInventory.quantityIncoming).equals(0) //items
        expect(newInventory.listings.length).not.equals(0)
        expect(newInventory.warehouseID).not.equals(null)
        for (const item of newInventory.items) {
          expect(item.statusID).equals(null)
        }
      })
    })
  
    it('Should Create Inventory with new payout instead of updating existing stock for variant', () => {
      let inventory = null
      cy.task("createInventory", {
        account: 'reseller',
        setAsDelivered: true,
        quantity: 3,
        payout: 100
      }).then((_inventory) => {
        inventory = _inventory
        return cy.task("createInventory", {
          account: 'reseller',
          setAsDelivered: true,
          quantity: 5,
          productID: inventory.productID,
          productVariantID: inventory.productVariantID,
          payout: 500,
        })
      }).then((newInventory) => {
        expect(newInventory.items.length).equals(5)
        expect(newInventory.items.length).equals(newInventory.quantity) //items
        expect(newInventory.items.length).equals(newInventory.quantityAtHand) //items
        expect(newInventory.quantityIncoming).equals(0) //items
        expect(newInventory.listings.length).not.equals(0)
        expect(newInventory.warehouseID).not.equals(null)
        expect(newInventory.listings.find(l => l.saleChannelID == 1).payout).not.equals(inventory.listings.find(l => l.saleChannelID == 1).payout)
        for (const item of newInventory.items) {
          expect(item.statusID).equals(null)
        }
      })
    })
  
    it('Should Create Inventory ready to be fulfilled inbound', () => {
      cy.task("createInventory", {
        account: 'retailer',
        setAsDelivered: false,
        quantity: 3
      }).then((inventory) => {
        expect(inventory.items.length).equals(3) // inventory quantity is correct
        expect(inventory.items.length).equals(inventory.quantity) //items
        expect(inventory.items.length).equals(inventory.quantityIncoming) //items
        expect(inventory.quantityAtHand).equals(0) //items
        expect(inventory.warehouseLocationID).not.equals(null)
        expect(inventory.items.filter(item => item.warehouseLocationID == null).length).equals(3) // all items have no location
        expect(inventory.listings.filter(listing => listing.status == "active").length).equals(inventory.listings.length) // inventory have the right status
        for (const item of inventory.items) {
          expect(item.statusID).equals(7)
        }
      })
    })
  
    it('Should Create Inventory and set as delivered (stress test)', () => {
      let t1 = new Date()
      cy.task("createInventory", {
        account: 'retailer',
        setAsDelivered: true,
        quantity: 50
      }).then((inventory) => {
        expect(inventory.items.length).equals(50) // inventory quantity is correct
        expect(inventory.items.length).equals(inventory.quantity) //items
        expect(inventory.items.length).equals(inventory.quantityAtHand) //items
        expect(inventory.quantityIncoming).equals(0) //items
        expect(inventory.items.filter(item => item.warehouseID == null).length).equals(0) // all items have location
        expect(inventory.warehouseID).not.equals(null)
        expect(inventory.listings.filter(listing => listing.status == "active").length).equals(inventory.listings.length) // inventory have the right status
        const t2 = new Date()
        const durationInSeconds = (t2.getTime()-t1.getTime())/1000
        expect(durationInSeconds < 30).to.be.true
      })
    })
  
    it('Should Create Virtual Inventory', () => {
      cy.task("createInventory", {
        account: 'retailer',
        virtual: true
      }).then((inventory) => {
        console.log(inventory)
        expect(inventory.items.length).equals(0) // inventory quantity is correct
        expect(inventory.quantity).equals(10)
        expect(inventory.quantity).equals(inventory.quantityIncoming)
        expect(inventory.quantityAtHand).equals(0) //items
        expect(inventory.warehouseID).equals(null)
      })
    })

    it('Should return 403 - when user tries to create inventory for another account', () => {
      cy.task("createInventory", {
        account: 'reseller',
        accountID: 3, // use a different accountID for the inventory record
        setAsDelivered: true,
        quantity: 3
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should return 403 - when user of the same account has no the permission to create inventory', () => {
      cy.task("createInventory", {
        account: 'retailer-user-limited',
        setAsDelivered: true,
        quantity: 3
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  })

  describe('PUT /', () => {
    it('Should return 403 - when external user tries to update account inventory record', () => {
      cy.task("createInventory", {
        account: 'retailer',
        setAsDelivered: true,
        quantity: 3
      })
      .then((inventory) => cy.task('updateInventory', {ID: inventory.ID, updates: {adjustQuantity: 0}, account: 'reseller'}))
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should return 403 - when user without permissions tries to update inventory record', () => {
      cy.task("createInventory", {
        account: 'retailer-user-limited',
        setAsDelivered: true,
        quantity: 3
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should unstock Virtual Inventory', () => {
      cy.task("createInventory", {
        account: 'retailer',
        virtual: true
      }).then((inventory) => {
        return cy.task("updateInventory", {
          ID: inventory.ID,
          updates: {
            adjustQuantity: -10
          }
        })
      }).then((inventory) => {
        console.log(inventory)
        expect(inventory.items.length).equals(0) // inventory quantity is correct
        expect(inventory.quantity).equals(0)
        expect(inventory.quantity).equals(inventory.quantityIncoming)
        expect(inventory.quantityAtHand).equals(0) //items
        expect(inventory.warehouseID).equals(null)
      })
    })
  
    it('Should re-stock Virtual Inventory', () => {
      cy.task("createInventory", {
        account: 'retailer',
        virtual: true
      })
      .then((inventory) => cy.task("updateInventory", {
          ID: inventory.ID,
          updates: {
            adjustQuantity: -10
          }
        }))
      .then((inventory) => cy.task("updateInventory", {
        ID: inventory.ID,
        updates: {
          adjustQuantity: 10
        }
      }))
      .then((inventory) => {
        console.log(inventory)
        expect(inventory.items.length).equals(0) // inventory quantity is correct
        expect(inventory.quantity).equals(10)
        expect(inventory.quantity).equals(inventory.quantityIncoming)
        expect(inventory.quantityAtHand).equals(0) //items
        expect(inventory.warehouseID).equals(null)
      })
    })

    it('Should retailer try to update consignor listing on retailer sale channel', () => {
      let inventory;
      cy.task('createInventory', {account: 'reseller', setAsDelivered: true})
      .then((_inventory) => {
        inventory = _inventory
        const listingToUpdate = inventory.listings.find(listing => listing.saleChannelID == 1)
        return cy.task('updateListing', {
          account: 'retailer',
          ID: listingToUpdate.ID,
          updates: {
            saleChannelID: 1, 
            status: 'draft'
          }
        })
      })
      .then((inventoryListing) => {
        expect(inventoryListing.status).equals('draft')
      })
    })

    it('Should return 403 - Should retailer try to update consignor listing on consignor sale channel', () => {
    })
  })
})

describe('api/order', () => {
  describe("GET /:orderID/download/invoice", () => {
    it('Generate and download invoice for sale order', () => {
      let saleOrder;
      cy.all([() => cy.task("createOrder", {type: 'outbound'}), () => cy.login("retailer")])
      .then((resp) => {
        saleOrder = resp[0]
        const user = resp[1]
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'GET',
          url: Cypress.env('api') + `/api/order/${saleOrder.ID}/download/invoice`,
        })
      })
      .then((resp) => {
        console.log()
        expect(resp.body.invoiceBase64).not.equals(null)
        return cy.task('getOrder', {ID: saleOrder.ID})
      })
      .then((order) => {
        expect(order.invoiceFilename).not.equals(null)
      })
    })

    it('Generate and download invoice for purchase order', () => {
      let inventory, purchaseOrder;
      cy.task('createInventory', {account: 'retailer', cost: 100, setAsDelivered: true})
      .then((_inventory) => {
        inventory = _inventory

        return cy.task("getOrders", {
          accountID: inventory.accountID,
          account: 'retailer',
          type: 'inbound'
        })
      })
      .then((orders) => {
        purchaseOrder = orders[0]
        return cy.task("updateOrder", {
          ID: purchaseOrder.ID,
          updates: {
            consignorID: inventory.warehouse.addressID,
            consignee: {
              phoneCountryCode: '44',
              phoneNumber: '172633459',
              address: '251 southwark bridge road',
              addressExtra: '1202',
              city: 'london',
              countyCode: 'london',
              postcode: 'SE16DF',
              country: 'GB',
              validate: 'validate'
            }
          }
        })
      })
      .then((_order) => cy.login("retailer"))
      .then((user) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'GET',
          url: Cypress.env('api') + `/api/order/${purchaseOrder.ID}/download/invoice`,
        })
      })
      .then((resp) => {
        expect(resp.body.invoiceBase64).not.equals(null)
        return cy.task('getOrder', {ID: purchaseOrder.ID})
      })
      .then((order) => {
        expect(order.invoiceFilename).not.equals(null)
      })
    })

    it('Refresh existing invoice for sale order', () => {
      let saleOrder, user, invoiceVersion1Filename, invoiceVersion2Filename;
      cy.all([() => cy.task("createOrder", {type: 'outbound'}), () => cy.login("retailer")])
      .then((resp) => {
        saleOrder = resp[0]
        user = resp[1]
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'GET',
          url: Cypress.env('api') + `/api/order/${saleOrder.ID}/download/invoice`,
        })
      })
      .then((resp) => {
        expect(resp.body.invoiceBase64).not.equals(null)
        return cy.task('getOrder', {ID: saleOrder.ID})
      })
      .then((order) => {
        invoiceVersion1Filename = order.invoiceFilename
        expect(order.invoiceFilename).not.equals(null)
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'GET',
          url: Cypress.env('api') + `/api/order/${saleOrder.ID}/download/invoice?refresh=true`,
        })
      })
      .then((resp) => cy.task('getOrder', {ID: saleOrder.ID}))
      .then((order) => {
        invoiceVersion2Filename = order.invoiceFilename
        expect(order.invoiceFilename).not.equals(invoiceVersion1Filename)
      })
    })
  })

  describe("POST /sale-order", () => {
    it('Should Create a simple Sale Order', () => {
      cy.task("createOrder", {
        account: 'retailer',
        type: 'outbound'
      }).then((order) => {
        expect(order.quantity).equals(3) //check quantity
        expect(order.status.name).equals("fulfill") //check status
        expect(order.orderLineItems.length).equals(3) //orderLineItems

        const saleTx = order.transactions.find(tx => tx.type == "sale")
        const oliTotalSaleAmount = order.orderLineItems.reduce((total, orderLineItem) => total += parseFloat(orderLineItem.price), 0).toFixed(2)
        expect(saleTx.grossAmount).equals(oliTotalSaleAmount)

        for (const oli of order.orderLineItems) {
          expect(oli.status.name).equals('fulfill')
          expect(oli.inventory.quantity).equals(0)
          expect(oli.inventory.quantityAtHand).equals(0)
          expect(oli.inventory.quantityIncoming).equals(0)
        }
      })
    })

    it('Should Create a Personal Shopper Sale Order', () => {
      let inventory, psUser;
      cy.task('createInventory', {account: 'retailer', setAsDelivered: true})
      .then((_inventory) => {
        inventory = _inventory
        return cy.task('login', 'personal-shopper')
      })
      .then(user => {
        psUser = user
        const listingToSell = inventory.listings.find(listing => listing.saleChannelID == 1)
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/sale-order`,
          body: {
            accountID: 3,
            saleChannelID: 1,
            type: 'outbound',
            consignorID: inventory.warehouse.addressID,
            consignee: {
              phoneCountryCode: '44',
              phoneNumber: '172633459',
              address: '251 southwark bridge road',
              addressExtra: '1202',
              city: 'london',
              countyCode: 'london',
              postcode: 'SE16DF',
              country: 'GB',
              validate: 'validate'
            },
            notes: "some test notes",
            details: [
              {inventoryListingID: listingToSell.ID, quantity: inventory.quantity, price: listingToSell.price + 100},
            ],
            transactions: [
              {toAccountID:  3, grossAmount: '10.00', currency: 'gbp', type: 'shipping', status: 'unpaid'}
            ]
          }
        })
      })
      .then((resp) => {
        const order = resp.body
        expect(order.quantity).equals(inventory.quantity) //check quantity
        expect(order.status.name).equals("fulfill") //check status
        expect(order.orderLineItems.length).equals(inventory.quantity) //orderLineItems
        expect(order.orderLineItems.filter(orderLineItem => orderLineItem.status.name == "fulfill").length).equals(order.quantity) // all orderLineItems have the right status
        expect(order.personalShopperAccountID).equals(psUser.accountID)
        expect(order.accountID).equals(inventory.accountID)
        expect(order.userID).equals(psUser.ID)
        expect(order.accessToken).not.equals(null)
        expect(order.notes).equals("some test notes")
        //TODO: implement and fix
        expect(order.billingAddressID).not.equals(null)
      })
    })

    it('Should Create a Sale Order already fulfilled', () => {
      //create order
      cy.task('createOrder', {
        account: 'retailer',
        type: 'outbound',
        fulfillment: {
          setAsDispatched: true
        }
      })
      .then((order) => {
        expect(order.quantity).equals(3) //check quantity
        expect(order.status.name).equals("dispatched") //check status
        expect(order.orderLineItems.length).equals(3) //orderLineItems

        const saleTx = order.transactions.find(tx => tx.type == "sale")
        const oliTotalSaleAmount = order.orderLineItems.reduce((total, orderLineItem) => total += parseFloat(orderLineItem.price), 0).toFixed(2)
        expect(saleTx.grossAmount).equals(oliTotalSaleAmount)

        for (const oli of order.orderLineItems) {
          expect(oli.status.name).equals('dispatched')
          expect(oli.inventory.quantity).equals(0)
          expect(oli.inventory.quantityAtHand).equals(0)
          expect(oli.inventory.quantityIncoming).equals(0)

          expect(oli.fulfillment.status.name).equals('transit')
        }
      })
    })

    it('Should Create a Sale Order and set is as fulfilled on creation (stress test)', () => {
      let t1 = new Date()
      cy.task('createOrder', {
        account: 'retailer',
        type: 'outbound',
        productQty: [10, 10, 10, 10, 10],
        fulfillment: {
          setAsDispatched: true
        }
      }).then((res) => {
        const t2 = new Date()
        const durationInSeconds = (t2.getTime()-t1.getTime())/1000
        expect(durationInSeconds < 60).to.be.true // consider the time to autofulfill the inbound to prepare the data as well
      })
    })

    it('Should Create a Sale Order with two consignor items. One external location and one internal', () => {
      let invRecReseller1, invRecReseller2 = null 

      cy.login('retailer')
      .then(user => {
        return cy.all([
          () => cy.task('createInventory', {account: 'reseller', setAsDelivered: true}),
          () => cy.task('createInventory', {account: 'reseller-2', setAsDelivered: true, warehouseID: user.account.warehouses[0].ID}),
        ])
      })
      .then((inventories) => {
        invRecReseller1 = inventories[0]
        invRecReseller2 = inventories[1]
        return cy.task('createOrder', {
          account: 'retailer',
          type: 'outbound',
          details: [
            {inventoryListingID: invRecReseller1.listings[0].ID, quantity: 1, price: invRecReseller1.listings[0].price},
            {inventoryListingID: invRecReseller2.listings[0].ID, quantity: 1, price: invRecReseller2.listings[0].price},
          ]
        })
      })
      .then((order) => {
        expect(order.quantity).equals(order.orderLineItems.length) //check quantity
        expect(order.status.name).equals("partially-confirmed") //check status
        expect(order.orderLineItems[0].status.name).equals('fulfill')
        expect(order.orderLineItems[0].item.warehouse.accountID).equals(order.accountID)
        expect(order.orderLineItems[1].status.name).equals('pending')
        expect(order.orderLineItems[1].item.warehouse.accountID).equals(order.orderLineItems[1].item.accountID)

        const saleTx = order.transactions.find(tx => tx.type == "sale")
        const oliTotalSaleAmount = order.orderLineItems.reduce((total, orderLineItem) => total += parseFloat(orderLineItem.price), 0).toFixed(2)
        expect(saleTx.grossAmount).equals(oliTotalSaleAmount)

        const consignment1PayoutTx = order.transactions.find(tx => tx.type == "payout" && tx.toAccountID == order.orderLineItems[0].item.accountID)
        expect(consignment1PayoutTx.status).equals("unpaid")
        expect(consignment1PayoutTx.grossAmount).equals(order.orderLineItems[0].cost)

        const consignment2PayoutTx = order.transactions.find(tx => tx.type == "payout" && tx.toAccountID == order.orderLineItems[1].item.accountID)
        expect(consignment2PayoutTx.status).equals("unpaid")
        expect(consignment2PayoutTx.grossAmount).equals(order.orderLineItems[1].cost)

      })
    })

    it('Should create a sale order with consignor item at a lower sale price and keep consignor payout as inserted', () => {
      /*


       */

      let externalSaleChannelListing;

      cy.task('createInventory', {account: 'reseller', setAsDelivered: true})
      .then((consignorInventory) => {
        externalSaleChannelListing = consignorInventory.listings.find(listing => listing.saleChannelID == 1)
        return cy.task('createOrder', {
          account: 'retailer',
          type: 'outbound',
          details: [
            {inventoryListingID: externalSaleChannelListing.ID, quantity: 1, price: externalSaleChannelListing.price - 100},
          ]
        })
      })
      .then(adminOrder => {
        const consignorItemOli = adminOrder.orderLineItems[0]
        expect(externalSaleChannelListing.payout).equals(consignorItemOli.cost)
        expect(consignorItemOli.price < externalSaleChannelListing.price).equals(true)
      })
    })

    it('extra - Should create a sale order with consignor item that is not at a fulfillment centre', () => {
      /*
        Expected behaviour:
              - When a consignor receives an order with inventory already at an admin location once accepted (only option
                on the front end) the order fulfillment will be patched with the one that was actioned when the item was
                transferred to the admins warehouse (not a fulfillment centre), since the item is in a warehouse that is
                not a fulfillment centre an automatic transfer should be created to a warehouse that is a fulfillment centre

          TEST BREAKDOWN:
            1. Create some inventory at edit
            2. Create a transfer for that inventory to an admin location that is not a fulfillment centre
            3. Complete the transfer
            4. Create consignor order for that inventory
            6. Accept consignor orderLineItem
            7. Accept orderLineItem and check that fulfillment gets patched
            8. check that an automatic transfer was created to the correct warehouse
            5. Check order values are correct

       */

      let admin, consignor, inventory, adminFulfillmentWarehouse, adminStandardWarehouse, consignorWarehouse, consignorTransferOut,  consignorTransferIn  = null
      let consignorOrder, adminOrder = null

      //get users
      cy.all([() => cy.task('login', "retailer"), () => cy.task('login', 'reseller')]).then((res) => {
        admin = res[0]
        consignor = res[1]
        //set warehouses
        adminFulfillmentWarehouse = admin.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
        adminStandardWarehouse = admin.account.warehouses.find(warehouse => !warehouse.fulfillmentCentre)
        consignorWarehouse = consignor.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
        //create some consignor inventory that will be transferred
        return cy.task('createInventory', {account: 'reseller', setAsDelivered: true})
      }).then((_inventory) => {
        inventory = _inventory
        //transfer inventory to an edit unfulfillable location
        //create and complete a transfer to a warehouse that is not a fulfillment centre
        const transferParams ={
          account: 'reseller',
          consigneeID: adminStandardWarehouse.addressID,
          consignorID: consignorWarehouse.addressID,
          type: 'transfer',
          accountID: consignor.accountID,
          fulfillment: {
            setAsDispatched:true
          },
          details: inventory.items.map(item => {return {
            itemID: item.ID
          }})
        }
        return cy.task('createOrder', transferParams)
      }).then((res)=> {
        return cy.all([() => cy.task('getOrder', {ID: res.ID, account: 'reseller'}), () => cy.task('getOrder', {ID: res.siblingOrderID, account: 'retailer'})])
      }).then((res) => {
        consignorTransferOut = res[0]
        consignorTransferIn = res[1]
        //check that both transfers where created and belong to the right accounts
        expect(consignorTransferOut).to.not.equals(null)
        expect(consignorTransferOut.accountID).equals(consignor.accountID)
        //check that order line items have been dispatched from the consignor side
        expect(consignorTransferOut.status.name).equals('dispatched')
        expect(consignorTransferOut.orderLineItems[0].status.name).equals('dispatched')
        //check admin transfer in
        expect(consignorTransferIn).to.not.equals(null)
        expect(consignorTransferIn.accountID).equals(admin.accountID)
        //check items
        expect(consignorTransferOut.orderLineItems[0].itemID).equals(consignorTransferIn.orderLineItems[0].itemID)
        // scan inbound at admin location
        return cy.task('scanInbound', {orderID: consignorTransferIn.orderLineItems[0].orderID, fulfillmentID: consignorTransferIn.orderLineItems[0].fulfillmentID, orderLineItems: consignorTransferIn.orderLineItems, account: 'retailer'})
      }).then(() => {
        //refetch and check transfer in
        return cy.task('getOrder', {ID: consignorTransferIn.ID, account: 'retailer'})
      }).then((res) => {
        consignorTransferIn = res
        //check transfer in has been completed
        expect(consignorTransferIn.status.name).equals('delivered')
        expect(consignorTransferIn.quantity).equals(1)
        expect(consignorTransferIn.orderLineItems[0].status.name).equals('delivered')
        //check that fyulfillment has been complted
        expect(consignorTransferIn.orderLineItems[0].fulfillment.status.name).equals('delivered')
        //check item location is correct
        expect(consignorTransferIn.orderLineItems[0].item.warehouseID).equals(adminStandardWarehouse.ID)
        //create consignor order
        const shopifyOrderParams = {
          account: 'retailer',
          line_items: [{
              "variant_id": consignorTransferIn.orderLineItems[0].variant.foreignID,
              "quantity": 1,
              "product_id": consignorTransferIn.orderLineItems[0].product.ID,
              "price": inventory.listings.find(listing => listing.saleChannelID == 1).price,
            }
          ]}

        return cy.task('createShopifyOrder', shopifyOrderParams)
      }).then((res) => {
        console.log(res)
        return cy.all([() => cy.task('getOrder', {ID: res.admin.ID, account: 'retailer'}), () => cy.task('getOrder', {ID: res.consignor.ID, account: 'reseller'})])
      }).then((res) => {
        adminOrder = res[0]
        consignorOrder = res[1]
        //consignor check the fulfillment was patched
        expect(consignorOrder.status.name).equals('delivered')
        expect(consignorOrder.orderLineItems[0].fulfillmentID).to.not.equals(null)
        expect(consignorOrder.orderLineItems[0].fulfillment.status.name).equals('delivered')
        expect(consignorOrder.orderLineItems[0].status.name).equals('delivered')
        expect(adminOrder.status.name).equals('fulfill')
        expect(adminOrder.tags).equals('consignment')
        expect(adminOrder.orderLineItems[0].status.name).equals('fulfill')
      })
    })

    it('extra - check fee thresholds logic for sale order with consignor items', () => {
      /*
        * 2. Create sale channel with fees
        * 1. Create consignor inventory
        * 2. Create manual order with consignor items
        * 3. Check orderLineItems are created with the right figures
        * 3.
       */
      let saleChannel, reseller, retailer, inventory1, inventory2, inventory3, item1, item2, item3;
      let adminOrder, resellerOrder;
      cy.task('createSaleChannel', {autoCreateFees: true})
      .then(_saleChannel => {
        saleChannel = _saleChannel
        return cy.all([() => cy.task('login', "retailer"), () => cy.task('login', 'reseller')])
      })
      .then(users => {
        //add sale channel fees
        retailer = users[0]
        reseller = users[1]
        // add reseller to sale channel
        return cy.task('addAccountToSaleChannel', {accountID: reseller.accountID, saleChannelID: saleChannel.ID})
      })
      .then((resp) => {
        //check the right consigno
        expect(resp.ID).equals(reseller.accountID)
        //create inv
        return cy.all([() => cy.task('createInventory', {
          key: 'inventory1',
          payout: 222,
          quantity: 1,
          account: 'reseller'
        }), () => cy.task('createInventory', {
          key: 'inventory2',
          payout: 390,
          quantity: 1,
          account: 'reseller'
        }), () => cy.task('createInventory', {key: 'inventory3', payout: 1245, quantity: 1, account: 'reseller'})])
      })
      .then((inventories) => {
        inventory1 = inventories[0]
        inventory2 = inventories[1]
        inventory3 = inventories[2]
        item1 = inventory1.items[0]
        item2 = inventory2.items[0]
        item3 = inventory3.items[0]
        let listing1 = inventory1.listings.find(_li => _li.saleChannelID == saleChannel.ID)
        let listing2 = inventory2.listings.find(_li => _li.saleChannelID == saleChannel.ID)
        let listing3 = inventory3.listings.find(_li => _li.saleChannelID == saleChannel.ID)

        //check prices generated from payouts
        expect(listing1.price).equals('300.00')
        expect(listing2.price).equals('500.00')
        expect(listing3.price).equals('1500.00')

        const orderOutParams = {
          account: 'retailer',
          type: 'outbound',
          saleChannelID: saleChannel.ID,
          details: [
            {itemID: item1.ID, price: listing1.price },
            {itemID: item2.ID, price: listing2.price },
            {itemID: item3.ID, price: listing3.price }
          ]
        }

        //create manual order
        return cy.task('createOrder', orderOutParams)
      })
      .then((res) => {
        adminOrder = res
        return cy.task('getOrders',{reference1: adminOrder.reference1, account: 'reseller', accountID: reseller.accountID})
      })
      .then((res) => {
        const orders = res
        resellerOrder = orders.find(order => order.accountID == reseller.accountID)
        // fetch full reseller order and admin order
        return cy.all([() => cy.task('getOrder', {ID: adminOrder.ID, account: 'retailer'}), () => cy.task('getOrder', {ID: resellerOrder.ID, account: 'reseller'})])
      }).then((res) => {
        adminOrder = res[0]
        console.log(adminOrder)
        resellerOrder = res[1]
        //check admin orderLineItems
        expect(adminOrder.orderLineItems.length).equals(3)
        const adminOrderLineItem1 = adminOrder.orderLineItems.find(oli=> oli.itemID == item1.ID)
        const adminOrderLineItem2 = adminOrder.orderLineItems.find(oli=> oli.itemID == item2.ID)
        const adminOrderLineItem3 = adminOrder.orderLineItems.find(oli=> oli.itemID == item3.ID)

        expect(adminOrderLineItem1.price).equals('300.00')
        expect(adminOrderLineItem2.price).equals('500.00')
        expect(adminOrderLineItem3.price).equals('1500.00')
        //checl admin orderLineItems costs
        expect(adminOrderLineItem1.cost).equals('222.00')
        expect(adminOrderLineItem1.cost).equals(adminOrder.transactions.find(tx => tx.type == 'payout' && tx.orderLineItemID == adminOrderLineItem1.ID).grossAmount)

        expect(adminOrderLineItem2.cost).equals('390.00')
        expect(adminOrderLineItem2.cost).equals(adminOrder.transactions.find(tx => tx.type == 'payout' && tx.orderLineItemID == adminOrderLineItem2.ID).grossAmount)

        expect(adminOrderLineItem3.cost).equals('1245.00')
        expect(adminOrderLineItem3.cost).equals(adminOrder.transactions.find(tx => tx.type == 'payout' && tx.orderLineItemID == adminOrderLineItem3.ID).grossAmount)

        //check reseller orderLineItems
        expect(resellerOrder.orderLineItems.length).equals(3)
        expect(resellerOrder.orderLineItems.find(oli=> oli.itemID == item1.ID).payout).equals('222.00')
        expect(resellerOrder.orderLineItems.find(oli=> oli.itemID == item2.ID).payout).equals('390.00')
        expect(resellerOrder.orderLineItems.find(oli=> oli.itemID == item3.ID).payout).equals('1245.00')
        //check reseller orderLineItems fees
        expect(resellerOrder.orderLineItems.find(oli=> oli.itemID == item1.ID).fees).equals('78.00')
        expect(resellerOrder.orderLineItems.find(oli=> oli.itemID == item2.ID).fees).equals('110.00')
        expect(resellerOrder.orderLineItems.find(oli=> oli.itemID == item3.ID).fees).equals('255.00')
      })
    })

    it('should fail with status 400 - impossible to find inventoryListingID', () => {
      cy.task('createOrder', {
        account: 'retailer',
        type: 'outbound',
        details: [
          {inventoryListingID: 2973286353, quantity: 1, price: 999},
        ]
      })
      .then((resp) => {
        expect(resp.status).equals(400)
        expect(resp.message).equals("InventoryListingID does not exist")
      })
    })
  })

  describe("POST /:orderID/accept", () => {
    it('Consignor should accept order line items',  () => {
      let invRecord, adminOrder, consignorOrder = null
      cy.task("createInventory", {account: 'reseller', quantity: 1})
      .then((inventory)=> {
        const listing = inventory.listings.find(listing => listing.saleChannelID == 1)
        const body = {
          account: 'retailer',
          line_items: [{
            variant_id: listing.variant.foreignID,
            quantity: 1,
            product_id: listing.product.foreignID,
            price: listing.price
          }]
        }
        return cy.task("createShopifyOrder", body)
      }).then((resp) => {
        // check that Shopify Order was created properly
        expect(resp.consignor).not.equals(null)
        adminOrder =  resp.admin
        consignorOrder = resp.consignor
        return cy.task("getOrder", {ID : consignorOrder.ID, account: 'reseller'})
      }).then((resp) => {
        consignorOrder = resp
        return cy.task('get', 'reseller')
      }).then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${consignorOrder.ID}/accept`,
          body: {
            orderID: consignorOrder.ID,
            orderLineItems: consignorOrder.orderLineItems
          }
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        //fetch orders
        return cy.all([() => cy.task("getOrder", {ID: consignorOrder.ID, account: 'reseller'}),() =>cy.task("getOrder", {ID: adminOrder.ID, account: 'retailer'})] )
      }).then((resp) => {
        const consignorOrder = resp[0]
        const adminOrder = resp[1]

        for (var coli of consignorOrder.orderLineItems) {
          const aoli = adminOrder.orderLineItems.find(oli => oli.itemID == coli.itemID)
          expect(coli.status.name).equals('fulfill')
          expect(aoli.status.name).equals('fulfill')
        }
  
        //check order status
        expect(consignorOrder.status.name).equals('fulfill')
        expect(adminOrder.status.name).equals('fulfill')
      })
    })
  })

  describe("POST /:orderID/fulfillment", () => {
    it('Consignor fulfill 1 item at the time', () => {
      /**
       * Check admin order inbound creation on acceptance of a consignor order
       *
       * 1. Create consignor order
       * 2. Accept consignor Item
       * 3. create fulfilment for that item
       * 4. check that order in for admin has been created for that item
       */

      let consignorOrder, fulfillment1, fulfillment2;
      cy.task("createInventory", {account: 'reseller', quantity: 2})
      .then((inventory) => {
        const listing = inventory.listings.find(listing => listing.saleChannelID == 1)
        //Build shopify order details
        const body = {
          account: 'retailer',
          line_items: [{
            variant_id: listing.variant.foreignID,
            quantity: 2,
            product_id: listing.product.foreignID,
            price: listing.price
          }]
        }
        return cy.task("createShopifyOrder", body)
      })
      .then(resp => cy.task("getOrder", {ID: resp.consignor.ID, key: "consignorOrder", account: 'reseller'})
      )
      .then((_consignorOrder) => {
        consignorOrder = _consignorOrder
        return cy.task('get', 'reseller')
      }).then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${consignorOrder.ID}/accept`,
          body: {
            orderID: consignorOrder.ID,
            orderLineItems: consignorOrder.orderLineItems
          }
        })
      })
      .then(() => {
        // fulfilment first item
        return cy.task('createFulfillment', {
          originAddressID:  consignorOrder.consignorID,
          destinationID: consignorOrder.consigneeID,
          destinationAddressID: consignorOrder.consigneeID,
          orderID: consignorOrder.ID,
          orderLineItems: consignorOrder.orderLineItems.slice(0, 1),
          setAsDispatched: true,
          account: 'reseller'
        })
      }).then((_fulfillment1) => {
        fulfillment1 = _fulfillment1
        expect(fulfillment1.orderLineItems.length).equals(2) // oone for each account
        expect(fulfillment1.outboundOrder.fulfillmentStartedAt).not.equals(null) 
        expect(fulfillment1.outboundOrder.fulfillmentCompletedAt).equals(null) 
        expect(fulfillment1.status.name).equals('transit') //check fulfillment status
        expect(fulfillment1.orderLineItems.filter(oli => oli.status.name == 'dispatched').length).equals(2) //check fulfillment oli status
        const consignorOli = fulfillment1.orderLineItems.find(oli => oli.accountID == consignorOrder.accountID)
        const adminOli = fulfillment1.orderLineItems.find(oli => oli.accountID != consignorOrder.accountID)
        expect(consignorOli.payout).equals(adminOli.cost)

        return cy.task('createFulfillment', {
          originAddressID:  consignorOrder.consignorID,
          destinationID: consignorOrder.consigneeID,
          destinationAddressID: consignorOrder.consigneeID,
          orderID: consignorOrder.ID,
          orderLineItems: consignorOrder.orderLineItems.slice(1),
          setAsDispatched: true,
          account: 'reseller'
        })
      })
      .then((fulfillment2) => {
        expect(fulfillment2.orderLineItems.length).equals(2) // oone for each account
        expect(fulfillment2.status.name).equals('transit') //check fulfillment status
        expect(fulfillment2.orderLineItems.filter(oli => oli.status.name == 'dispatched').length).equals(2) //check fulfillment oli status
        expect(fulfillment2.outboundOrder.fulfillmentStartedAt).not.equals(null) 
        expect(fulfillment2.outboundOrder.fulfillmentCompletedAt).not.equals(null) 
      })
      
    })

    it('Should generate a fulfillment with courier shipping label', () => {
      //create order
      let order;
      cy.task('createOrder', {
        type: 'outbound',
        productQty: [2, 2]
      }).then((_order) => {
        order = _order
        const updatedConsignor = {
          ID: order.consignor.ID,
          updates: {
            phoneNumber: '7928766999',
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
  
        const updatedConsignee = {
          ID: order.consignee.ID,
          updates: {
            phoneNumber: '7928766999',
            address: '1000 Louisiana St Suite 1990',
            city: 'Houston',
            postcode: '77002',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
        //fetch full orders for checks
        return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
      })
      .then(() => cy.task('createFulfillment', {
        orderID: order.ID,
        originAddressID: order.consignorID,
        destinationAddressID: order.consigneeID,
        courier: 'ups',
        courierServiceCode: 'ups_next_day_air_international',
        orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
      }))
    })

    it('Admin should fulfill sale order with courier', () => {
      let order
      cy.task('createOrder', {type: 'outbound'})
      .then((_order) => {
        order = _order
        const updatedConsignor = {
          ID: order.consignor.ID,
          updates: {
            phoneNumber: '7928766999',
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
  
        const updatedConsignee = {
          ID: order.consignee.ID,
          updates: {
            phoneNumber: '7928766999',
            address: '1000 Louisiana St Suite 1990',
            city: 'Houston',
            postcode: '77002',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
      //fetch full orders for checks
      return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
      })
      .then(() => cy.task('createFulfillment', {
        orderID: order.ID,
        originAddressID: order.consignor.ID,
        destinationAddressID: order.consignee.ID,
        courier: 'ups',
        courierServiceCode: 'ups_next_day_air_international',
        orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
      }))
      .then((fulfillment) => {
        console.log(fulfillment)
        expect(fulfillment.courierServiceCode).equals('ups_next_day_air_international')
        expect(fulfillment.courier.code).equals('ups')
        expect(fulfillment.shippingLabelFilename).not.equals(null)
        expect(fulfillment.trackingNumber).not.equals(null)
        expect(fulfillment.transactions.length).equals(1)
        expect(fulfillment.transactions[0].status).equals("paid")
        expect(fulfillment.transactions[0].type).equals("shipping")
        expect(fulfillment.transactions[0].orderID).equals(order.ID)
        expect(fulfillment.transactions[0].currency).equals(order.account.currency.toLowerCase())
        expect(fulfillment.outboundOrder.fulfillmentStartedAt).not.equals(null)
      })
    })

    it('Admin should update sale order fulfillment by adding a courier', () => {
      let order
      cy.task('createOrder', {type: 'outbound'})
      .then((_order) => {
        order = _order
        const updatedConsignor = {
          ID: order.consignor.ID,
          updates: {
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
  
        const updatedConsignee = {
          ID: order.consignee.ID,
          updates: {
            address: '1000 Louisiana St Suite 1990',
            city: 'Houston',
            postcode: '77002',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
        //fetch full orders for checks
        return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
      })
      .then(() => cy.task('createFulfillment', {
        orderID: order.ID,
        originAddressID: order.consignor.ID,
        destinationAddressID: order.consignee.ID,
        orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
      }))
      .then((fulfillment) => cy.task('updateFulfillment', {
        ID: fulfillment.ID,
        orderID: order.ID,
        updates: {
          courier: 'ups',
          courierServiceCode: 'ups_next_day_air_international',
          orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
        }
      }))
      .then((fulfillment) => {
        console.log(fulfillment)
        expect(fulfillment.courierServiceCode).equals('ups_next_day_air_international')
        expect(fulfillment.courier.code).equals('ups')
        expect(fulfillment.shippingLabelFilename).not.equals(null)
        expect(fulfillment.trackingNumber).not.equals(null)
        expect(fulfillment.transactions.length).equals(1)
        expect(fulfillment.transactions[0].status).equals("paid")
        expect(fulfillment.transactions[0].type).equals("shipping")
        expect(fulfillment.transactions[0].orderID).equals(order.ID)
        expect(fulfillment.transactions[0].currency).equals(order.account.currency.toLowerCase())
      })
    })
  
    it('Consignor should fulfill a consignment sale order with courier', () => {
      /**
       * Check admin order inbound creation on acceptance of a consignor order
       *
       * 1. Create consignor order
       * 2. Accept consignor Item
       * 3. create fulfilment for that item
       * 4. check that order in for admin has been created for that item
       */
      let adminOrder, consignorOrder = null
      cy.task("createShopifyOrder")
      .then((resp) => {
        adminOrder = resp.admin
        consignorOrder = resp.consignor
        
        const updatedConsignor = {
          ID: consignorOrder.consignor.ID,
          account: 'reseller',
          updates: {
            phoneNumber: '7928766999',
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
  
        const updatedConsignee = {
          ID: consignorOrder.consignee.ID,
          updates: {
            phoneNumber: '7928766999',
            address: '1000 Louisiana St Suite 1990',
            city: 'Houston',
            postcode: '77002',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
        //fetch full orders for checks
        return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
      })
      .then(() => cy.task('get', 'reseller'))
      .then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${consignorOrder.ID}/accept`,
          body: {
            orderID: consignorOrder.ID,
            orderLineItems: consignorOrder.orderLineItems
          }
        })
      }).then((resp) => {
        return cy.task('createFulfillment', {
          orderID: consignorOrder.ID,
          originAddressID: consignorOrder.consignor.ID,
          destinationAddressID: consignorOrder.consignee.ID,
          courier: 'ups',
          courierServiceCode: 'ups_next_day_air_international',
          orderLineItems: consignorOrder.orderLineItems.map(oli => {return {ID: oli.ID}}),
          account: 'reseller'
        })
      })
      .then(fulfillment => {
        expect(fulfillment.status.name).equals('created') //check fulfillment status
        expect(fulfillment.orderLineItems.length).equals(fulfillment.orderLineItems.filter(oli => oli.status.name == "fulfilling").length)
        expect(fulfillment.orderLineItems.length).equals(fulfillment.orderLineItems.filter(oli => oli.siblingID).length)
        expect(fulfillment.inboundOrderID).to.not.equals(null)
        expect(fulfillment.outboundOrderID).equals(consignorOrder.ID)
        expect(fulfillment.transactions.length).equals(1)
        expect(fulfillment.transactions[0].status).equals("paid")
        expect(fulfillment.transactions[0].type).equals("shipping")
        expect(fulfillment.transactions[0].orderID).equals(fulfillment.inboundOrderID)
        expect(fulfillment.transactions[0].fromAccountID).equals(adminOrder.accountID)
        expect(fulfillment.transactions[0].currency).equals(adminOrder.account.currency.toLowerCase())
      })
    })
  
    it('Should return 403 - when external user tries to create fulfillment', () => {
      cy.task('createOrder', {type: 'outbound', account: 'retailer'})
      .then((order) => {
        return cy.task('createFulfillment', {
          orderID: order.ID,
          account: 'reseller',
          originAddressID: order.consignor.ID,
          destinationAddressID: order.consignee.ID,
          orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  
    it('Should return 403 - when user without permissions tries to create fulfillment', () => {
      cy.task('createOrder', {type: 'outbound'})
      .then((order) => {
        //fetch full orders for checks
        return cy.task('createFulfillment', {
          account: 'retailer-user-limited',
          orderID: order.ID,
          originAddressID: order.consignor.ID,
          destinationAddressID: order.consignee.ID,
          orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  })

  describe(`PUT /:orderID/fulfillments/:fulfillmentID`, () => {
    it('Admin should update sale order fulfillment by adding a courier', () => {
      let order
      cy.task('createOrder', {type: 'outbound'}).then((_order) => {
        order = _order
        const updatedConsignor = {
          ID: order.consignor.ID,
          account: 'reseller',
          updates: {
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
  
        const updatedConsignee = {
          ID: order.consignee.ID,
          updates: {
            address: '1000 Louisiana St Suite 1990',
            city: 'Houston',
            postcode: '77002',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
        //fetch full orders for checks
        return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
      })
      .then(() => cy.task('createFulfillment', {
        orderID: order.ID,
        originAddressID: order.consignor.ID,
        destinationAddressID: order.consignee.ID,
        orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
      }))
      .then((fulfillment) => cy.task('updateFulfillment', {
        ID: fulfillment.ID,
        orderID: order.ID,
        updates: {
          courier: 'ups',
          courierServiceCode: 'ups_next_day_air_international',
        }
      }))
      .then((fulfillment) => {
        expect(fulfillment.courierServiceCode).equals('ups_next_day_air_international')
        expect(fulfillment.courier.code).equals('ups')
        expect(fulfillment.shippingLabelFilename).not.equals(null)
        expect(fulfillment.trackingNumber).not.equals(null)
        expect(fulfillment.transactions.length).equals(1)
        expect(fulfillment.transactions[0].status).equals("paid")
        expect(fulfillment.transactions[0].type).equals("shipping")
        expect(fulfillment.transactions[0].orderID).equals(order.ID)
        expect(fulfillment.transactions[0].currency).equals(order.account.currency.toLowerCase())
      })
    })

    it('Should return 403 - when external user tries to update fulfillment', () => {
      let order;
      cy.task('createOrder', {type: 'outbound', account: 'retailer'})
      .then((_order) => {
        order = _order
        return cy.task('createFulfillment', {
          orderID: order.ID,
          account: 'retailer',
          originAddressID: order.consignor.ID,
          destinationAddressID: order.consignee.ID,
          orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
        })
      })
      .then((fulfillment) => cy.task('updateFulfillment', {
        ID: fulfillment.ID,
        account: 'reseller',
        orderID: order.ID,
        updates: {
          courier: 'ups',
          courierServiceCode: 'ups_next_day_air_international',
        }
      }))
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should return 403 - when user without permissions tries to update fulfillment', () => {
      let order
      cy.task('createOrder', {type: 'outbound'})
      .then((_order) => {
        order = _order
        //fetch full orders for checks
        return cy.task('createFulfillment', {
          account: 'retailer',
          orderID: order.ID,
          originAddressID: order.consignor.ID,
          destinationAddressID: order.consignee.ID,
          orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
        })
      })
      .then((fulfillment) => cy.task('updateFulfillment', {
        ID: fulfillment.ID,
        account: 'retailer-user-limited',
        orderID: order.ID,
        updates: {
          courier: 'ups',
          courierServiceCode: 'ups_next_day_air_international',
        }
      }))
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  })

  describe(`POST /:orderID/fulfillments/:fulfillmentID/deliver`, () => {
    it('Admin should set as delivered an incoming transfer from consignor', () => {
      let admin, consignor, transferInventory, destinationWarehouse, originWarehouse, transferOut, transferIn = null
      //create some consignor inventory and create transfer to retailer
      cy.all([() => cy.task('login', 'retailer'), () => cy.task('login', 'reseller')]).then((resp) => {
        admin = resp[0]
        consignor = resp[1]
        //determine transfer warehouses
        destinationWarehouse = admin.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
        originWarehouse = consignor.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
        return cy.task("createInventory", {account: 'reseller', quantity: 5})
      }).then((inventory) => {
        transferInventory = inventory
        const transferParams ={
            account: 'reseller',
            consigneeID: destinationWarehouse.addressID,
            consignorID: originWarehouse.addressID,
            type: 'transfer',
            accountID: consignor.accountID,
            details: inventory.items.map(item => {return {itemID: item.ID}}),
            fulfillment: {
              setAsDispatched: true
            }
        }
        return cy.task('createOrder', transferParams)
      })
      .then((res)=> cy.all([() => cy.task('getOrder', {ID: res.ID, account: 'reseller'}), () => cy.task('getOrder', {ID: res.siblingOrderID})]))
      .then((res) => {
        transferOut = res[0]
        transferIn = res[1]
        return cy.request({
          headers: {
            authorization: `Bearer ${admin.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${transferIn.ID}/fulfillments/${transferIn.fulfillments[0].ID}/deliver`,
          body: {
            orderLineItems: transferIn.orderLineItems.map(oli => {return {ID: oli.ID}})
          }
        })
      })
      .then((resp) => {
        const fulfillment = resp.body
        const transferInOlis = fulfillment.orderLineItems.filter(oli => oli.orderID == transferIn.ID)
        expect(transferInOlis[0].inventory.quantityAtHand).equals(transferInOlis[0].inventory.quantity)
        expect(transferInOlis[0].inventory.quantityIncoming).equals(0)
        for (const oli of transferInOlis) {
          expect(oli.inventoryID).equals(transferInOlis[0].inventoryID)
        }
      })
    })

    it('Should return 403 - Consignor should not be able to set as delivered a transfer to a retailer', () => {
      let admin, consignor, transferInventory, destinationWarehouse, originWarehouse, transferOut, transferIn = null
      //create some consignor inventory and create transfer to retailer
      cy.all([() => cy.task('login', 'retailer'), () => cy.task('login', 'reseller')]).then((resp) => {
        admin = resp[0]
        consignor = resp[1]
        //determine transfer warehouses
        destinationWarehouse = admin.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
        originWarehouse = consignor.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
        return cy.task("createInventory", {account: 'reseller', quantity: 5})
      }).then((inventory) => {
        transferInventory = inventory
        const transferParams ={
            account: 'reseller',
            consigneeID: destinationWarehouse.addressID,
            consignorID: originWarehouse.addressID,
            type: 'transfer',
            accountID: consignor.accountID,
            details: inventory.items.map(item => {return {itemID: item.ID}}),
            fulfillment: {
              setAsDispatched: true
            }
        }
        return cy.task('createOrder', transferParams)
      })
      .then((res)=> cy.all([() => cy.task('getOrder', {ID: res.ID, account: 'reseller'}), () => cy.task('getOrder', {ID: res.siblingOrderID, account: 'retailer'})]))
      .then((res) => {
        transferOut = res[0]
        transferIn = res[1]
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${transferOut.ID}/fulfillments/${transferOut.fulfillments[0].ID}/deliver`,
          body: {
            orderLineItems: transferOut.orderLineItems.map(oli => {return {ID: oli.ID}})
          },
          failOnStatusCode: false
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should return 403 - when user without permissions tries to set as deliver', () => {
      let order;
      cy.task('createOrder', {type: 'outbound', fulfillment: {setAsDispatched: true}})
      .then((_order) => {
        order = _order
        return cy.task('login', 'retailer-user-limited')
      })
      .then((user) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${order.ID}/fulfillments/${order.fulfillments[0].ID}/deliver`,
          body: {
            orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
          },
          failOnStatusCode: false
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  })
  
  describe("POST /:orderID/cancel", () => {
    it('Purchase Order - no delivered. Cancel', () => {
      let purchaseOrder
      cy.task("createInventory", {account: 'retailer'})
      .then((inventory) => cy.task("getOrders", {type: 'inbound', accountID: inventory.accountID, account: 'retailer'}))
      .then((orders) => {
        purchaseOrder = orders[0]
        return cy.task("cancelOrder", {
          orderID: purchaseOrder.ID,
          orderLineItems: purchaseOrder.orderLineItems.map(oli => {return {ID: oli.ID, reason: 'test cancel reason'}})
        })
      })
      .then((orderUpdated) => {
        // order has the right status
        expect(orderUpdated.status.name).equals("deleted") 
        
        // items delete correctly
        for (var oli of orderUpdated.orderLineItems) {
          const item = oli.item
          expect(oli.status.name).equals("deleted")
          expect(oli.canceledAt).to.not.equal(null)
          expect(oli.fulfillmentID).equals(null)
          expect(oli.canceledReason).equals("test cancel reason")

          expect(oli.inventory.quantity).equals(0)
          expect(oli.inventory.quantityAtHand).equals(0)
          expect(oli.inventory.quantityIncoming).equals(0)

          expect(item.deletedAt).to.not.equal(null)
          expect(item.inventoryID).equals(null)
          expect(item.warehouseID).equals(null)
          expect(item.status.name).equals("deleted")
        }
      })
    })

    it('Purchase Order - Cancel item should return error - item:own | status:delivered', () => {
      let purchaseOrder
      cy.task("createInventory", {account: 'retailer', setAsDelivered: true})
      .then((inventory) => cy.task("getOrders", {type: 'inbound', accountID: inventory.accountID, account: 'retailer'}))
      .then((orders) => {
        purchaseOrder = orders[0]
        return cy.task("cancelOrder", {
          orderID: purchaseOrder.ID,
          orderLineItems: purchaseOrder.orderLineItems.map(oli => {return {ID: oli.ID, reason: 'test cancel reason'}})
        })
      })
      .then((response) => {
        // order has the right status
        expect(response.status).equals(400) 
        expect(response.message).equals("Can't cancel item already delivered. Only sale orders can be cancelled after delivery") 
      })
    })

    it('Sale Order - user:admin | item:own | restock:false | status:fulfill', () => {
      let adminOrder;
      let consignorOrder;
      cy.task("createShopifyOrder")
      .then((order) => cy.all([
        () => cy.task('getOrder', {ID: order.admin.ID}),
        () => cy.task('getOrder', {ID: order.consignor.ID})
      ])).then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]
        const adminItem = adminOrder.orderLineItems.find(oli => adminOrder.accountID == oli.item.accountID)
        return cy.task('cancelOrder', {
          orderID: adminOrder.ID,
          orderLineItems: [{ID: adminItem.ID, restock: false, reason: "test cancel reason"}]
        })
      })
      .then((orderUpdated) => {
        // order has the right state
        expect(orderUpdated.status.name).equals("partially-confirmed")

        // items no restocked correctly
        const cancelledOrderLineItem = orderUpdated.orderLineItems.find(oli => oli.status.name == 'deleted')
        expect(cancelledOrderLineItem.canceledAt).to.not.equal(null)
        expect(cancelledOrderLineItem.fulfillmentID).equals(null)
        expect(cancelledOrderLineItem.canceledReason).equals("test cancel reason")
        expect(cancelledOrderLineItem.replacePending).equals(true)

        expect(cancelledOrderLineItem.inventory.quantity).equals(0)
        expect(cancelledOrderLineItem.inventory.quantityAtHand).equals(0)
        expect(cancelledOrderLineItem.inventory.quantityIncoming).equals(0)

        const item = cancelledOrderLineItem.item
        expect(item.deletedAt).to.not.equal(null)
        expect(item.inventoryID).equals(null)
        expect(item.warehouseID).equals(null)
        expect(item.statusID).to.not.equal(null)
      })
    })

    it('Sale Order - user:admin | item:own | restock:true | status:dispatched (courier)', () => {
      let order;
      //create order
      cy.task('createOrder', {type: 'outbound'}).then((_order) => {
        order = _order
        const updatedConsignor = {
          ID: order.consignor.ID,
          account: 'reseller',
          updates: {
            phoneNumber: '7928766999',
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
  
        const updatedConsignee = {
          ID: order.consignee.ID,
          updates: {
            phoneNumber: '7928766999',
            address: '1000 Louisiana St Suite 1990',
            city: 'Houston',
            postcode: '77002',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
        //fetch full orders for checks
        return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
      })
      .then(() => cy.task('createFulfillment', {
        orderID: order.ID,
        originAddressID: order.consignor.ID,
        destinationAddressID: order.consignee.ID,
        courier: 'ups',
        courierServiceCode: 'ups_next_day_air_international',
        orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
      }))
      .then((fulfillment) => cy.task('cancelOrder', {
          orderID: order.ID,
          orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID, restock: true, reason: "test cancel reason", warehouseID: oli.inventory.warehouseID}})
        })
      )
      .then((order) => {
        expect(order.status.name).equals("pending")
        expect(order.orderLineItems.filter(oli => oli.replacePending).length).equals(order.orderLineItems.length)
        expect(order.transactions.length).equals(3)
        expect(order.totalAmount).equals(order.orderLineItems.filter(oli => oli.replacePending).reduce((tot, oli) => tot += parseFloat(oli.price), 0).toFixed(2))
        
        const shippingTransaction = order.transactions.find(tx => tx.type == "shipping")
        const refundedShippingTransaction = order.transactions.find(tx => tx.type == "shipping refund")
        expect(refundedShippingTransaction.orderID).equals(order.ID)
        expect(refundedShippingTransaction.fromAccountID).equals(null)
        expect(refundedShippingTransaction.completedAt).not.equals(null)
        expect(refundedShippingTransaction.toAccountID).equals(order.accountID)
        expect(refundedShippingTransaction.fulfillmentID).equals(shippingTransaction.fulfillmentID)
        expect(refundedShippingTransaction.grossAmount).equals(shippingTransaction.grossAmount)
        expect(refundedShippingTransaction.currency).equals(order.account.currency.toLowerCase())

        order.orderLineItems.forEach(oli => {
          expect(oli.status.name).equals("deleted")
          expect(oli.canceledAt).to.not.equal(null)
          expect(oli.fulfillmentID).equals(null)
          expect(oli.canceledReason).equals("test cancel reason")

          //TODO: uncomment this when we use findOrCreate on inventory.restock
          //expect(oli.inventory.quantity).equals(1)
          //expect(oli.inventory.quantityAtHand).equals(1)
          //expect(oli.inventory.quantityIncoming).equals(0)

          expect(oli.item.deletedAt).equals(null)
          expect(oli.item.inventoryID).to.not.equal(null)
          expect(oli.item.warehouseID).to.not.equal(null)
          expect(oli.item.statusID).equals(null)
        })
      })
    })

    it('Sale Order - user:admin | item:own | restock:true | status:delivered status:delivered', () => {
      cy.task('createOrder', {
        account: 'retailer',
        type: 'outbound',
        foreignID: null,
        productQty: [2],
        fulfillment: {
          setAsDispatched: true,
          setAsDelivered: true
        }
      })
      .then((order) => {
        //Cancel order
        return cy.task('cancelOrder', {
          orderID: order.ID,
          orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID, restock: true, reason: "test cancel reason", warehouseID: oli.inventory.warehouseID}})
        })
      })
      .then((order) => {
        return cy.task('refundOrder', {
          orderID: order.ID,
          orderLineItems: order.orderLineItems
        })
      })
      .then((order)=> {
        //check orderLineItems
        expect(order.quantity).equals(0) //check quantity
        expect(order.status.name).equals("deleted") //check status
        expect(order.orderLineItems.length).equals(2) //orderLineItems

        const saleTx = order.transactions.find(tx => tx.type == "sale")
        const oliTotalSaleAmount = order.orderLineItems.reduce((total, orderLineItem) => total += parseFloat(orderLineItem.price), 0).toFixed(2)
        expect(saleTx.grossAmount).equals(oliTotalSaleAmount)

        //check orderLineItems
        order.orderLineItems.forEach(oli => {
          expect(oli.status.name).equals("deleted")
          expect(oli.canceledAt).to.not.equal(null)
          expect(oli.fulfillmentID).equals(null)
          expect(oli.canceledReason).equals("test cancel reason")

          //TODO: uncomment this when we use findOrCreate on inventory.restock
          //expect(oli.inventory.quantity).equals(2)
          //expect(oli.inventory.quantityAtHand).equals(2)
          //expect(oli.inventory.quantityIncoming).equals(0)

          expect(oli.item.deletedAt).equals(null)
          expect(oli.item.inventoryID).to.not.equal(null)
          expect(oli.item.warehouseID).to.not.equal(null)
          expect(oli.item.statusID).equals(null)
        })
      })
    })

    it('Sale Order - user:admin | item:consignor | restock:false | status:pending | location:consignor', () => {
      let adminOrder;
      let consignorOrder;
      cy.task("createShopifyOrder")
      .then((order) => cy.all([
        () => cy.task('getOrder', {ID: order.admin.ID}),
        () => cy.task('getOrder', {ID: order.consignor.ID, account: 'reseller'})
      ])).then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]
        return cy.task('cancelOrder', {
          orderID: adminOrder.ID,
          orderLineItems:  adminOrder.orderLineItems.filter(oli => oli.item.accountID != adminOrder.accountID).map(oli => {return {ID: oli.ID, restock: false}})
        })
      })
      .then(() => cy.all([
        () => cy.task('getOrder', {ID: adminOrder.ID}),
        () => cy.task('getOrder', {ID: consignorOrder.ID, account: 'reseller'})
      ]))
      .then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]

        const salePrice = adminOrder.orderLineItems.reduce((tot, oli) => tot += parseFloat(oli.price), 0)
        const shippingPrice = parseFloat(adminOrder.transactions.find(tx => tx.type == 'shipping').grossAmount)
        expect(adminOrder.totalAmount).equals((salePrice + shippingPrice).toFixed(2))
        expect(consignorOrder.totalAmount).equals("0.00")
        
        const payoutTx = adminOrder.transactions.find(tx => tx.type == 'payout')
        expect(payoutTx.processedByUserID).to.not.equals(null)
        expect(payoutTx.status).equals("canceled")
        expect(payoutTx.completedAt).to.not.equals(null)
      })
    })

    it('Sale Order - user:admin | item:consignor | restock:true | status:fulfilling | location:admin', () => {
      let inventoryConsignor, adminOrder, consignorOrder, adminWarehouse;
      cy.login('retailer')
      .then(user => {
        adminWarehouse = user.account.warehouses[0]
        return cy.task('createInventory', {account: 'reseller', setAsDelivered: true, warehouseID: adminWarehouse.ID})
      })
      .then((inventory) => {
        inventoryConsignor = inventory
        return cy.task('createOrder', {
          account: 'retailer',
          type: 'outbound',
          details: [
            {inventoryListingID: inventoryConsignor.listings[0].ID, quantity: 1, price: inventoryConsignor.listings[0].price},
          ]
        })
      })
      .then((order) => {
        adminOrder = order
        return cy.task('cancelOrder', {
          orderID: order.ID,
          orderLineItems:  order.orderLineItems.map(oli => {return {ID: oli.ID, reason: 'test cancel reason', restock: true, warehouseID: adminWarehouse.ID}})
        })
      })
      .then(() => cy.login('reseller'))
      .then(resellerUser => {
        return cy.task('getOrders', { reference1: `~${adminOrder.reference1}`, account: 'reseller', accountID: resellerUser.accountID})
      })
      .then((res)=> {
        consignorOrder = res.find(order => order.parentOrderID)
        return cy.all([
          () => cy.task('getOrder', {ID: adminOrder.ID}),
          () => cy.task('getOrder', {ID: consignorOrder.ID, account: 'reseller'})
        ])
      })
      .then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]

        expect(adminOrder.totalAmount).equals(adminOrder.orderLineItems.reduce((tot, oli) => tot += parseFloat(oli.price), 0).toFixed(2))
        expect(consignorOrder.totalAmount).equals("0.00")
        
        const payoutTx = adminOrder.transactions.find(tx => tx.type == 'payout')
        expect(payoutTx.processedByUserID).to.not.equals(null)
        expect(payoutTx.status).equals("canceled")
        expect(payoutTx.completedAt).to.not.equals(null)

        //check orderLineItems
        consignorOrder.orderLineItems.forEach(oli => {
          const adminOli = adminOrder.orderLineItems.find(_oli => _oli.itemID == oli.itemID)
          expect(oli.status.name).equals("deleted")
          expect(oli.status.name).equals(adminOli.status.name)
          expect(oli.canceledAt).to.not.equal(null)
          expect(oli.canceledAt).equals(adminOli.canceledAt)

          expect(oli.fulfillmentID).equals(null)
          expect(oli.fulfillmentID).equals(adminOli.fulfillmentID)

          expect(oli.canceledReason).equals("test cancel reason")
          expect(oli.canceledReason).equals(adminOli.canceledReason)

          //TODO: uncomment this when we use findOrCreate on inventory.restock
          //expect(oli.inventory.quantity).equals(2)
          //expect(oli.inventory.quantityAtHand).equals(2)
          //expect(oli.inventory.quantityIncoming).equals(0)
          //expect(oli.inventory.warehouseID).equals(adminWarehouse.ID)

          expect(oli.item.deletedAt).equals(null)
          expect(oli.item.inventoryID).to.not.equals(null)
          expect(oli.item.warehouseID).to.not.equals(null)
          expect(oli.item.warehouseID).equals(adminWarehouse.ID)
          expect(oli.item.statusID).equals(null)
        })
      })
    })

    it('Sale Order - user:consignor | item:consignor | restock:true | status:pending | location:consignor', () => {
      let adminOrder;
      let consignorOrder;
      cy.task("createShopifyOrder")
      .then((order) => cy.all([
        () => cy.task('getOrder', {ID: order.admin.ID}),
        () => cy.task('getOrder', {ID: order.consignor.ID, account: 'reseller'})
      ])).then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]
        return cy.task('cancelOrder', {
          account: 'reseller',
          orderID: consignorOrder.ID,
          orderLineItems:  consignorOrder.orderLineItems.map(oli => {return {ID: oli.ID, restock: true, reason: 'test cancel reason', warehouseID: oli.inventory.warehouseID}})
        })
      })
      .then(() => cy.all([
        () => cy.task('getOrder', {ID: adminOrder.ID}),
        () => cy.task('getOrder', {ID: consignorOrder.ID, account: 'reseller'})
      ]))
      .then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]

        const salePrice = adminOrder.orderLineItems.reduce((tot, oli) => tot += parseFloat(oli.price), 0)
        const shippingPrice = parseFloat(adminOrder.transactions.find(tx => tx.type == 'shipping').grossAmount)
        expect(adminOrder.totalAmount).equals((salePrice + shippingPrice).toFixed(2))
        expect(consignorOrder.totalAmount).equals("0.00")
        
        const payoutTx = adminOrder.transactions.find(tx => tx.type == 'payout')
        expect(payoutTx.processedByUserID).to.not.equals(null)
        expect(payoutTx.status).equals("canceled")
        expect(payoutTx.completedAt).to.not.equals(null)

        //check orderLineItems
        consignorOrder.orderLineItems.forEach(oli => {
          const adminOli = adminOrder.orderLineItems.find(_oli => _oli.itemID == oli.itemID)
          expect(oli.status.name).equals("deleted")
          expect(oli.status.name).equals(adminOli.status.name)
          expect(oli.canceledAt).to.not.equal(null)
          expect(oli.canceledAt).equals(adminOli.canceledAt)

          expect(oli.fulfillmentID).equals(null)
          expect(oli.fulfillmentID).equals(adminOli.fulfillmentID)

          expect(oli.canceledReason).equals("test cancel reason")
          expect(oli.canceledReason).equals(adminOli.canceledReason)

          //TODO: uncomment this when we use findOrCreate on inventory.restock
          //expect(oli.inventory.quantity).equals(2)
          //expect(oli.inventory.quantityAtHand).equals(2)
          //expect(oli.inventory.quantityIncoming).equals(0)

          expect(oli.item.deletedAt).equals(null)
          expect(oli.item.inventoryID).to.not.equals(null)
          expect(oli.item.warehouseID).to.not.equals(null)
          expect(oli.item.statusID).equals(null)
        })
      })
    })

    it('Sale Order - user:consignor | item:consignor | restock:true | status:fulfilling | location:consignor', () => {
      let adminOrder;
      let consignorOrder;
      cy.task("createShopifyOrder")
      .then((order) => cy.all([
        () => cy.task('getOrder', {ID: order.admin.ID}),
        () => cy.task('getOrder', {ID: order.consignor.ID, account: 'reseller'})
      ]))
      .then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]
        return cy.task('createFulfillment', {
          orderID: consignorOrder.ID,
          originAddressID: consignorOrder.consignor.ID,
          destinationAddressID: consignorOrder.consignee.ID,
          courier: 'manual',
          orderLineItems: consignorOrder.orderLineItems.map(oli => {return {ID: oli.ID}}),
          account: 'reseller',
          setAsDispatched: true
        })
      })
      .then(() => {
        return cy.task('cancelOrder', {
          account: 'reseller',
          orderID: consignorOrder.ID,
          orderLineItems:  consignorOrder.orderLineItems.map(oli => {return {ID: oli.ID, restock: true, reason: 'test cancel reason', warehouseID: oli.inventory.warehouseID}})
        })
      })
      .then(() => cy.all([
        () => cy.task('getOrder', {ID: adminOrder.ID}),
        () => cy.task('getOrder', {ID: consignorOrder.ID, account: 'reseller'})
      ]))
      .then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]

        const salePrice = adminOrder.orderLineItems.reduce((tot, oli) => tot += parseFloat(oli.price), 0)
        const shippingPrice = parseFloat(adminOrder.transactions.find(tx => tx.type == 'shipping').grossAmount)
        expect(adminOrder.totalAmount).equals((salePrice + shippingPrice).toFixed(2))
        expect(consignorOrder.totalAmount).equals("0.00")
        
        const payoutTx = adminOrder.transactions.find(tx => tx.type == 'payout')
        expect(payoutTx.processedByUserID).to.not.equals(null)
        expect(payoutTx.status).equals("canceled")
        expect(payoutTx.completedAt).to.not.equals(null)

        //check orderLineItems
        consignorOrder.orderLineItems.forEach(oli => {
          const adminOli = adminOrder.orderLineItems.find(_oli => _oli.itemID == oli.itemID)
          expect(oli.status.name).equals("deleted")
          expect(oli.status.name).equals(adminOli.status.name)
          expect(oli.canceledAt).to.not.equal(null)
          expect(oli.canceledAt).equals(adminOli.canceledAt)

          expect(oli.fulfillmentID).equals(null)
          expect(oli.fulfillmentID).equals(adminOli.fulfillmentID)

          expect(oli.canceledReason).equals("test cancel reason")
          expect(oli.canceledReason).equals(adminOli.canceledReason)

          //TODO: uncomment this when we use findOrCreate on inventory.restock
          //expect(oli.inventory.quantity).equals(2)
          //expect(oli.inventory.quantityAtHand).equals(2)
          //expect(oli.inventory.quantityIncoming).equals(0)

          expect(oli.item.deletedAt).equals(null)
          expect(oli.item.inventoryID).to.not.equals(null)
          expect(oli.item.warehouseID).to.not.equals(null)
          expect(oli.item.statusID).equals(null)
        })
      })
    })

    it('Sale Order -  user:consignor | item:consignor | restock:true | status:fulfilled | location:consignor (courier)', () => {
      let adminOrder, consignorOrder, canceledOrderLineItem = null
      cy.task("createShopifyOrder")
      .then((resp) => {
        adminOrder = resp.admin
        consignorOrder = resp.consignor
        
        const updatedConsignor = {
          account: 'reseller',
          ID: consignorOrder.consignor.ID,
          updates: {
            phoneNumber: '7928766999',
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
  
        const updatedConsignee = {
          account: 'retailer',
          ID: consignorOrder.consignee.ID,
          updates: {
            phoneNumber: '7928766999',
            address: '1000 Louisiana St Suite 1990',
            city: 'Houston',
            postcode: '77002',
            countyCode: 'tx',
            country: 'US',
            countryCode: 'us',
            validated: 1
          }
        }
        //fetch full orders for checks
        return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
      })
      .then(() => cy.task('get', 'reseller'))
      .then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${consignorOrder.ID}/accept`,
          body: {
            orderID: consignorOrder.ID,
            orderLineItems: consignorOrder.orderLineItems
          }
        })
      }).then((resp) => {
        canceledOrderLineItem = consignorOrder.orderLineItems[0]
        return cy.task('createFulfillment', {
          orderID: consignorOrder.ID,
          originAddressID: consignorOrder.consignor.ID,
          destinationAddressID: consignorOrder.consignee.ID,
          courier: 'ups',
          courierServiceCode: 'ups_next_day_air_international',
          orderLineItems: [{ID: canceledOrderLineItem.ID}],
          account: 'reseller'
        })
      })
      .then((fulfillment) => {
        return cy.task('cancelOrder', {
          orderID: consignorOrder.ID,
          account: 'reseller',
          orderLineItems: [{ID: canceledOrderLineItem.ID, restock: true, reason: "test cancel reason", warehouseID: canceledOrderLineItem.inventory.warehouseID}]
        })
      })
      .then((consignorOrderUpdated) => {
        const deletedOli = consignorOrderUpdated.orderLineItems.find(oli => oli.canceledAt)
        expect(deletedOli.status.name).equals("deleted")
        expect(deletedOli.canceledAt).to.not.equal(null)
        expect(deletedOli.fulfillmentID).equals(null)
        expect(deletedOli.replacePending).equals(null)
        expect(deletedOli.canceledReason).equals("test cancel reason")
        expect(deletedOli.item.deletedAt).to.equal(null)
        expect(deletedOli.item.inventoryID).to.not.equal(null)
        expect(deletedOli.item.warehouseID).to.not.equal(null)
        expect(deletedOli.item.statusID).to.equal(null)
        return cy.task('getOrder', {ID: adminOrder.ID})
      })
      .then((updatedAdminOrder) => {
        const adminOrderLineItemCanceled = updatedAdminOrder.orderLineItems.find(oli => oli.itemID == canceledOrderLineItem.itemID)
        expect(adminOrderLineItemCanceled.status.name).equals("deleted")
        expect(adminOrderLineItemCanceled.canceledAt).to.not.equal(null)
        expect(adminOrderLineItemCanceled.fulfillmentID).equals(null)
        expect(adminOrderLineItemCanceled.replacePending).equals(true)
        expect(adminOrderLineItemCanceled.canceledReason).equals("test cancel reason")
        expect(adminOrderLineItemCanceled.item.deletedAt).to.equal(null)
        expect(adminOrderLineItemCanceled.item.inventoryID).to.not.equal(null)
        expect(adminOrderLineItemCanceled.item.warehouseID).to.not.equal(null)
        expect(adminOrderLineItemCanceled.item.statusID).to.equal(null)

        //shipping not refunded
        const shippingRefundTx = updatedAdminOrder.transactions.find(tx => tx.type == "shipping refund")
        expect(shippingRefundTx).equals(undefined)

        //cancelation for payout
        const payoutTx = updatedAdminOrder.transactions.find(tx => tx.orderLineItemID == adminOrderLineItemCanceled.ID)
        expect(payoutTx.processedByUserID).to.not.equals(null)
        expect(payoutTx.status).equals("canceled")
        expect(payoutTx.completedAt).to.not.equals(null)
      })
    })

    it('Sale Order - user:consignor | item:consignor | restock:true | status:fulfilling | location:admin', () => {
      let inventoryConsignor, adminOrder, consignorOrder, adminWarehouse;
      cy.login('retailer')
      .then(user => {
        adminWarehouse = user.account.warehouses[0]
        return cy.task('createInventory', {account: 'reseller', setAsDelivered: true, warehouseID: adminWarehouse.ID})
      })
      .then((inventory) => {
        inventoryConsignor = inventory
        return cy.task('createOrder', {
          account: 'retailer',
          type: 'outbound',
          details: [
            {inventoryListingID: inventoryConsignor.listings[0].ID, quantity: 1, price: inventoryConsignor.listings[0].price},
          ],
          fulfillment: {
            setAsDispatched: true
          }
        })
      })
      .then((order) => {
        adminOrder = order
        return cy.task('cancelOrder', {
          orderID: order.ID,
          orderLineItems:  order.orderLineItems.map(oli => {return {ID: oli.ID, reason: 'test cancel reason', restock: true, warehouseID: adminWarehouse.ID}})
        })
      })
      .then(() => 
        cy.login('reseller')
      )
      .then((resellerUser) => {
        return cy.task('getOrders', { reference1: `~${adminOrder.reference1}`, account: 'reseller', accountID: resellerUser.accountID})
      })
      .then((res)=> {
        consignorOrder = res.find(order => order.parentOrderID)
        return cy.all([
          () => cy.task('getOrder', {ID: adminOrder.ID}),
          () => cy.task('getOrder', {ID: consignorOrder.ID, account: 'reseller'})
        ])
      })
      .then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]

        expect(adminOrder.totalAmount).equals(adminOrder.orderLineItems.reduce((tot, oli) => tot += parseFloat(oli.price), 0).toFixed(2))
        expect(consignorOrder.totalAmount).equals("0.00")
        
        const payoutTx = adminOrder.transactions.find(tx => tx.type == 'payout')
        expect(payoutTx.processedByUserID).to.not.equals(null)
        expect(payoutTx.status).equals("canceled")
        expect(payoutTx.completedAt).to.not.equals(null)

        //check orderLineItems
        consignorOrder.orderLineItems.forEach(oli => {
          const adminOli = adminOrder.orderLineItems.find(_oli => _oli.itemID == oli.itemID)
          expect(oli.status.name).equals("deleted")
          expect(oli.status.name).equals(adminOli.status.name)
          expect(oli.canceledAt).to.not.equal(null)
          expect(oli.canceledAt).equals(adminOli.canceledAt)

          expect(oli.fulfillmentID).equals(null)
          expect(oli.fulfillmentID).equals(adminOli.fulfillmentID)

          expect(oli.canceledReason).equals("test cancel reason")
          expect(oli.canceledReason).equals(adminOli.canceledReason)

          //TODO: uncomment this when we use findOrCreate on inventory.restock
          //expect(oli.inventory.quantity).equals(2)
          //expect(oli.inventory.quantityAtHand).equals(2)
          //expect(oli.inventory.quantityIncoming).equals(0)
          //expect(oli.inventory.warehouseID).equals(adminWarehouse.ID)

          expect(oli.item.deletedAt).equals(null)
          expect(oli.item.inventoryID).to.not.equals(null)
          expect(oli.item.warehouseID).to.not.equals(null)
          expect(oli.item.warehouseID).equals(adminWarehouse.ID)
          expect(oli.item.statusID).equals(null)
        })
      })
    })

    it('Internal Transfer - cancel and no restock', () => {
      let admin, transferInventory, destinationWarehouse, originWarehouse, transferOut, transferIn = null
      cy.task('login', 'retailer').then((resp) => {
        admin = resp
        //determine transfer warehouses
        destinationWarehouse = admin.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
        originWarehouse = admin.account.warehouses.find(warehouse => !warehouse.fulfillmentCentre)
        return cy.task("createInventory")
      }).then((inventory) => {
        const transferParams ={
          consigneeID: destinationWarehouse.addressID,
          consignorID: originWarehouse.addressID,
          type: 'transfer',
          accountID: admin.accountID,
          fulfillment: {
            setAsDispatched: true
          },
          details: inventory.items.map(item => {return {itemID: item.ID}})
        }
        return cy.task('createOrder', transferParams)
      }).then((_transferOut)=> {
        transferOut = _transferOut
        return cy.task('get', 'retailer')
      }).then(user => {
        //fetch transfers
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${transferOut.ID}/cancel`,
          body: {
            orderLineItems: transferOut.orderLineItems.map(oli => {return {ID: oli.ID, reason: 'test cancel reason', restock: false}})
          }
        })
      }).then((resp) => {
        transferOut= resp.body
        //fetch transfers
        return cy.all([() => cy.task('getOrder', {ID: transferOut.ID}), () => cy.task('getOrder', {ID: transferOut.siblingOrderID})])
      }).then((res) => {
        transferOut = res[0]
        transferIn = res[1]
  
        //check that both transfers where created and belong to the right accounts
        expect(transferOut.ID).to.not.equals(null)
        expect(transferOut.accountID).equals(admin.accountID)
        expect(transferOut.status.name).equals('deleted')
  
        //check admin transfer in
        expect(transferIn.ID).to.not.equals(null)
        expect(transferIn.accountID).equals(admin.accountID)
        expect(transferIn.status.name).equals('deleted')
  
        for (const to_oli of transferOut.orderLineItems) {
          const ti_oli = transferIn.orderLineItems.find(oli => oli.siblingID == to_oli.ID)
          expect(ti_oli.ID).to.not.equals(null)
          expect(to_oli.itemID).equals(ti_oli.itemID)
          expect(to_oli.productVariantID).equals(ti_oli.productVariantID)
          expect(to_oli.status.name).equals("deleted")
          expect(to_oli.statusID).equals(ti_oli.statusID)
          expect(to_oli.restocked).equals(false)
          expect(to_oli.restocked).equals(ti_oli.restocked)
          expect(to_oli.canceledAt).to.not.equal(null)
          expect(to_oli.canceledAt).equals(ti_oli.canceledAt)
          expect(to_oli.fulfillmentID).equals(null)
          expect(to_oli.fulfillmentID).equals(ti_oli.fulfillmentID)
          expect(to_oli.canceledReason).equals("test cancel reason")
          expect(to_oli.canceledReason).equals(ti_oli.canceledReason)
  
          expect(to_oli.inventoryID).not.equals(null)
          expect(to_oli.inventoryID).not.equals(ti_oli.inventoryID)
          expect(to_oli.inventory.cost).equals(ti_oli.inventory.cost)
          expect(to_oli.inventory.notes).equals(ti_oli.inventory.notes)
          expect(ti_oli.inventory.warehouseID).equals(destinationWarehouse.ID)
          
          expect(to_oli.item.deletedAt).to.not.equal(null)
          expect(to_oli.item.inventoryID).equals(null)
          expect(to_oli.item.warehouseID).equals(null)
          expect(to_oli.item.statusID).to.not.equal(null)
        }
      })
    })

    it('Internal Transfer - cancel and restock item currently in transit to origin', () => {
      let admin, transferInventory, destinationWarehouse, originWarehouse, transferOut, transferIn = null
      cy.task('login', 'retailer').then((resp) => {
        admin = resp
        //determine transfer warehouses
        destinationWarehouse = admin.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
        originWarehouse = admin.account.warehouses.find(warehouse => !warehouse.fulfillmentCentre)
        return cy.task("createInventory", {setAsDelivered: true})
      }).then((inventory) => {
        const transferParams ={
          account: 'retailer',
          consigneeID: destinationWarehouse.addressID,
          consignorID: originWarehouse.addressID,
          type: 'transfer',
          accountID: admin.accountID,
          fulfillment: {
            setAsDispatched: true,
          },
          details: inventory.items.map(item => {return {itemID: item.ID}})
        }
        return cy.task('createOrder', transferParams)
      }).then((_transferOut)=> {
        transferOut = _transferOut
        return cy.task('get', 'retailer')
      }).then(user => {
        //fetch transfers
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${transferOut.ID}/cancel`,
          body: {
            orderLineItems: transferOut.orderLineItems.map(oli => {return {ID: oli.ID, reason: 'test cancel reason', restock: true, warehouseID: originWarehouse.ID}})
          }
        })
      }).then((resp) => {
        transferOut= resp.body
        //fetch transfers
        return cy.all([() => cy.task('getOrder', {ID: transferOut.ID}), () => cy.task('getOrder', {ID: transferOut.siblingOrderID})])
      }).then((res) => {
        transferOut = res[0]
        transferIn = res[1]
  
        //check that both transfers where created and belong to the right accounts
        expect(transferOut.ID).to.not.equals(null)
        expect(transferOut.accountID).equals(admin.accountID)
        expect(transferOut.status.name).equals('deleted')
  
        //check admin transfer in
        expect(transferIn.ID).to.not.equals(null)
        expect(transferIn.accountID).equals(admin.accountID)
        expect(transferIn.status.name).equals('deleted')
  
        for (const to_oli of transferOut.orderLineItems) {
          const ti_oli = transferIn.orderLineItems.find(oli => oli.siblingID == to_oli.ID)
          expect(ti_oli.ID).to.not.equals(null)
          expect(to_oli.itemID).equals(ti_oli.itemID)
          expect(to_oli.productVariantID).equals(ti_oli.productVariantID)
          expect(to_oli.status.name).equals("deleted")
          expect(to_oli.statusID).equals(ti_oli.statusID)
  
          expect(to_oli.restocked).equals(true)
          expect(to_oli.restocked).equals(ti_oli.restocked)
          expect(to_oli.canceledAt).to.not.equal(null)
          expect(to_oli.canceledAt).equals(ti_oli.canceledAt)
          expect(to_oli.fulfillmentID).equals(null)
          expect(to_oli.fulfillmentID).equals(ti_oli.fulfillmentID)
          expect(to_oli.canceledReason).equals("test cancel reason")
          expect(to_oli.canceledReason).equals(ti_oli.canceledReason)
  
          expect(to_oli.inventoryID).not.equals(null)
          expect(to_oli.inventoryID).not.equals(ti_oli.inventoryID)
          expect(to_oli.inventory.cost).equals(ti_oli.inventory.cost)
          expect(to_oli.inventory.notes).equals(ti_oli.inventory.notes)
          
          expect(to_oli.item.deletedAt).equals(null)
          expect(to_oli.item.inventoryID).to.not.equal(null)
          expect(to_oli.item.warehouseID).to.not.equal(null)
          expect(to_oli.item.warehouseID).equals(originWarehouse.ID)
          expect(to_oli.item.statusID).equals(null)
        }
      })
    })
  })

  describe("POST /:orderID/replace", () => {
    it('consignor cancel item with restock, admin replace item with another consignor items (replace:manual)', () => {
      let adminOrder, consignorOrder, altInventory, consignorItemToCancel
      cy.task("createShopifyOrder")
      .then((order) => cy.all([
        () => cy.task('getOrder', {ID: order.admin.ID}),
        () => cy.task('getOrder', {ID: order.consignor.ID, account: 'reseller'})
      ])).then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]
        return cy.task('createInventory', {
          account: 'reseller-2',
          setAsDelivered: true,
          quantity: 2,
          payout: 1111
        })
      }).then((_inventory) => {
        altInventory = _inventory
        consignorItemToCancel = consignorOrder.orderLineItems[0]
        return cy.task('cancelOrder', {
          orderID: consignorOrder.ID,
          account: 'reseller',
          orderLineItems: [{ID: consignorItemToCancel.ID, reason: 'test cancel reason', restock: true, warehouseID: consignorItemToCancel.inventory.warehouseID}]
        })
      })
      .then((() => cy.login('retailer')))
      .then(user => {
        const adminOrderOliCanceled = adminOrder.orderLineItems.find(oli => oli.item.ID == consignorItemToCancel.item.ID)
        const replacementItem = altInventory.items[0]
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${adminOrder.ID}/replace`,
          body: {
            orderLineItems: [{ID: adminOrderOliCanceled.ID, action: 'manual', itemID: replacementItem.ID}]
          }
        })
      }).then((resp) => {
        const adminOrder = resp.body
        // order has the right state
        expect(adminOrder.status.name).equals("partially-confirmed")
        expect(adminOrder.orderLineItems.length).equals(5)

        const shippingCosts = adminOrder.transactions.filter(oli => oli.canceledAt == null).filter(tx => tx.type == 'shipping' && tx.toAccountID == adminOrder.accountID)
        let totalAmount = adminOrder.orderLineItems.filter(oli => oli.canceledAt == null).reduce((tot, oli) => tot += parseFloat(oli.price), 0)
        if (shippingCosts.length > 0) {
          totalAmount += shippingCosts.reduce((totalAmount, tx) => totalAmount += parseFloat(tx.grossAmount), 0)
        }
        expect(adminOrder.totalAmount).equals(totalAmount.toFixed(2))

        const canceledOrderLineItem = adminOrder.orderLineItems.find(oli => oli.canceledAt != null)
        expect(canceledOrderLineItem).to.not.equal(null)
        expect(canceledOrderLineItem.status.name).equals("deleted")
        expect(canceledOrderLineItem.fulfillmentID).equals(null)
        //expect(canceledOrderLineItem.restocked).equals(true)//TODO - is null because the restock is set on the consignor order line item 
        expect(canceledOrderLineItem.canceledReason).equals("test cancel reason")
        expect(canceledOrderLineItem.item.deletedAt).equal(null)
        expect(canceledOrderLineItem.item.inventoryID).to.not.equal(null)
        expect(canceledOrderLineItem.item.warehouseID).to.not.equal(null)
        expect(canceledOrderLineItem.item.statusID).to.equal(null)

        const replacementOrderLineItem = adminOrder.orderLineItems.find(oli => oli.item.ID == altInventory.items[0].ID)
        expect(replacementOrderLineItem.status.name).equals("pending")
        expect(replacementOrderLineItem.canceledAt).equals(null)
        expect(replacementOrderLineItem.fulfillmentID).equals(null)
        expect(replacementOrderLineItem.canceledReason).equals("")
        expect(replacementOrderLineItem.cost).equals("1111.00")
        expect(replacementOrderLineItem.item.deletedAt).equals(null)
        expect(replacementOrderLineItem.item.inventoryID).equals(null)
        expect(replacementOrderLineItem.item.warehouseID).to.not.equal(null)
        expect(replacementOrderLineItem.item.statusID).equals(null)

        //transactions
        const cancelOliTx = adminOrder.transactions.find(tx => tx.orderLineItemID == canceledOrderLineItem.ID)
        expect(cancelOliTx.status).equals("canceled")
        expect(cancelOliTx.grossAmount).equals(canceledOrderLineItem.cost)

        const altOliPayoutTx = adminOrder.transactions.find(tx => tx.orderLineItemID == replacementOrderLineItem.ID)
        expect(altOliPayoutTx.status).equals("unpaid")
        expect(altOliPayoutTx.grossAmount).equals(replacementOrderLineItem.cost)

        // in admin order  internal items checks
        for (var oli of adminOrder.orderLineItems.filter(oli => oli.item.accountID == adminOrder.accountID)) {
          expect(oli.status.name).equals("fulfill")
          expect(oli.canceledAt).equals(null)
          expect(oli.fulfillmentID).equals(null)
          expect(oli.canceledReason).equals("")

          expect(oli.item.deletedAt).equals(null)
          expect(oli.item.inventoryID).equals(null)
          expect(oli.item.warehouseID).to.not.equal(null)
          expect(oli.item.statusID).equals(null)
        }
      })
    })

    it('admin cancel consignor item with no restock, admin replace item with a sourcing item (replace:source)', () => {
      let adminOrder, consignorOrder, consignorItemToCancelOnAdminOrder
      cy.task("createShopifyOrder")
      .then((order) => cy.all([
          () => cy.task('getOrder', {ID: order.admin.ID}),
          () => cy.task('getOrder', {ID: order.consignor.ID, account: 'reseller'})
        ])
      )
      .then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]
        consignorItemToCancelOnAdminOrder = adminOrder.orderLineItems.find(oli => oli.item.accountID != adminOrder.accountID)
        return cy.task('cancelOrder', {
          orderID: adminOrder.ID,
          orderLineItems: [{ID: consignorItemToCancelOnAdminOrder.ID, reason: 'test cancel reason', restock: false}]
        })
      })
      .then(() => cy.login('retailer'))
      .then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${adminOrder.ID}/replace`,
          body: {
            orderLineItems: [{ID: consignorItemToCancelOnAdminOrder.ID, action: 'source'}]
          }
        })
      }).then((resp) => {
        const adminOrder = resp.body

        // order has the right state
        expect(adminOrder.status.name).equals("partially-confirmed")
        expect(adminOrder.orderLineItems.length).equals(5)
        
        const shippingCosts = adminOrder.transactions.filter(oli => oli.canceledAt == null).filter(tx => tx.type == 'shipping' && tx.toAccountID == adminOrder.accountID)
        let totalAmount = adminOrder.orderLineItems.filter(oli => oli.canceledAt == null).reduce((tot, oli) => tot += parseFloat(oli.price), 0)
        if (shippingCosts.length > 0) {
          totalAmount += shippingCosts.reduce((totalAmount, tx) => totalAmount += parseFloat(tx.grossAmount), 0)
        }
        expect(adminOrder.totalAmount).equals(totalAmount.toFixed(2))

        const canceledOrderLineItem = adminOrder.orderLineItems.find(oli => oli.canceledAt != null)
        expect(canceledOrderLineItem).to.not.equal(null)
        expect(canceledOrderLineItem.status.name).equals("deleted")
        expect(canceledOrderLineItem.fulfillmentID).equals(null)
        //expect(canceledOrderLineItem.restocked).equals(true)//TODO - is null because the restock is set on the consignor order line item 
        expect(canceledOrderLineItem.canceledReason).equals("test cancel reason")
        expect(canceledOrderLineItem.item.deletedAt).to.not.equal(null)
        expect(canceledOrderLineItem.item.inventoryID).equals(null)
        expect(canceledOrderLineItem.item.warehouseID).equals(null)
        expect(canceledOrderLineItem.item.status.name).equals("deleted")

        const replacementOrderLineItem = adminOrder.orderLineItems.find(oli => oli.item.accountID == adminOrder.accountID && oli.status.name == "pending")
        expect(replacementOrderLineItem.status.name).equals("pending")
        expect(replacementOrderLineItem.canceledAt).equals(null)
        expect(replacementOrderLineItem.fulfillmentID).equals(null)
        expect(replacementOrderLineItem.canceledReason).equals("")
        expect(replacementOrderLineItem.cost).equals("0.00")
        expect(replacementOrderLineItem.item.inventoryID).equals(null)
        expect(replacementOrderLineItem.item.warehouseID).equals(null)

        //transactions
        const cancelOliTx = adminOrder.transactions.find(tx => tx.orderLineItemID == canceledOrderLineItem.ID)
        expect(cancelOliTx.status).equals("canceled")
        expect(cancelOliTx.grossAmount).equals(canceledOrderLineItem.cost)

        // in admin order  internal items checks
        for (var oli of adminOrder.orderLineItems.filter(oli => oli.item.accountID == adminOrder.accountID && oli.ID != replacementOrderLineItem.ID)) {
          expect(oli.status.name).equals("fulfill")
          expect(oli.canceledAt).equals(null)
          expect(oli.fulfillmentID).equals(null)
          expect(oli.canceledReason).equals("")

          expect(oli.item.deletedAt).equals(null)
          expect(oli.item.inventoryID).equals(null)
          expect(oli.item.warehouseID).to.not.equal(null)
          expect(oli.item.statusID).equals(null)
        }
      })
    })

    it('admin cancel consignor item with no restock, admin triggers refund (replace:refund)', () => {
      let adminOrder, consignorOrder, consignorItemToCancelOnAdminOrder
      cy.task("createShopifyOrder")
      .then((order) => cy.all([
        () => cy.task('getOrder', {ID: order.admin.ID}),
        () => cy.task('getOrder', {ID: order.consignor.ID})
      ]))
      .then((orders) => {
        adminOrder = orders[0]
        consignorOrder = orders[1]
        consignorItemToCancelOnAdminOrder = adminOrder.orderLineItems.find(oli => oli.item.accountID != adminOrder.accountID)
        return cy.task('cancelOrder', {
          orderID: adminOrder.ID,
          orderLineItems: [{ID: consignorItemToCancelOnAdminOrder.ID, reason: 'test cancel reason', restock: false}]
        })
      })
      .then(() => cy.login('retailer'))
      .then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${adminOrder.ID}/replace`,
          body: {
            orderLineItems: [{ID: consignorItemToCancelOnAdminOrder.ID, action: 'refund'}]
          }
        })
      }).then((resp) => {
        const adminOrder = resp.body

        // order has the right state
        expect(adminOrder.status.name).equals("partially-confirmed")
        expect(adminOrder.orderLineItems.length).equals(4)

        const shippingCosts = adminOrder.transactions.filter(oli => oli.canceledAt == null).filter(tx => tx.type == 'shipping' && tx.toAccountID == adminOrder.accountID)
        let totalAmount = adminOrder.orderLineItems.filter(oli => oli.canceledAt == null).reduce((tot, oli) => tot += parseFloat(oli.price), 0)
        if (shippingCosts.length > 0) {
          totalAmount += shippingCosts.reduce((totalAmount, tx) => totalAmount += parseFloat(tx.grossAmount), 0)
        }
        expect(adminOrder.totalAmount).equals(totalAmount.toFixed(2))

        const canceledOrderLineItem = adminOrder.orderLineItems.find(oli => oli.canceledAt != null)
        expect(canceledOrderLineItem).to.not.equal(null)
        expect(canceledOrderLineItem.status.name).equals("deleted")
        expect(canceledOrderLineItem.fulfillmentID).equals(null)
        //expect(canceledOrderLineItem.restocked).equals(true)//TODO - is null because the restock is set on the consignor order line item 
        expect(canceledOrderLineItem.canceledReason).equals("test cancel reason")
        expect(canceledOrderLineItem.item.deletedAt).to.not.equal(null)
        expect(canceledOrderLineItem.item.inventoryID).equals(null)
        expect(canceledOrderLineItem.item.warehouseID).equals(null)
        expect(canceledOrderLineItem.item.status.name).equals("deleted")

        //transactions
        const cancelOliTx = adminOrder.transactions.find(tx => tx.orderLineItemID == canceledOrderLineItem.ID)
        expect(cancelOliTx.status).equals("canceled")
        expect(cancelOliTx.grossAmount).equals(canceledOrderLineItem.cost)

        const refundOliTx = adminOrder.transactions.find(tx => tx.type == "refund")
        expect(refundOliTx.status).equals("paid")
        expect(refundOliTx.reference).equals(adminOrder.reference1)
        expect(refundOliTx.grossAmount).equals(canceledOrderLineItem.price)

        // in admin order  internal items checks
        for (var oli of adminOrder.orderLineItems.filter(oli => oli.item.accountID == adminOrder.accountID)) {
          expect(oli.status.name).equals("fulfill")
          expect(oli.canceledAt).equals(null)
          expect(oli.fulfillmentID).equals(null)
          expect(oli.canceledReason).equals("")

          expect(oli.item.deletedAt).equals(null)
          expect(oli.item.inventoryID).equals(null)
          expect(oli.item.warehouseID).to.not.equal(null)
          expect(oli.item.statusID).equals(null)
        }
      })
    })

    it('Should refund all items in the order', () => {
      cy.task('createOrder', {
          type: 'outbound',
      })
      .then((order) => {
        return cy.task('refundOrder', {
          orderID: order.ID,
          orderLineItems: order.orderLineItems
        })
      })
      .then((order) => {
        expect(order.status.name).equals("deleted")
        expect(order.orderLineItems.filter(oli => oli.status.name == "deleted").length).equals(order.orderLineItems.length)
        expect(order.totalAmount).equals("0.00")

        const saleTx = order.transactions.find(tx => tx.type == 'sale')
        const refundTx = order.transactions.find(tx => tx.type == 'refund')

        expect(saleTx.grossAmount).equals(refundTx.grossAmount)
        expect(refundTx.completedAt).to.not.equals(null)
        expect(refundTx.processedByUserID).to.not.equals(null)
        expect(refundTx.reference).equals(order.reference1)
        expect(refundTx.status).equals("paid")
      })
    })
  })

  describe("POST /:orderID/checkout-session", () => {
    it('should return a stripe checkout session for give orderID', () => {
      let authUser;
      cy.task('login', 'retailer')
      .then(user => {
        authUser = user
        return cy.task("createOrder", {
          account: 'retailer',
          type: 'outbound'
        })
      })
      .then(order => {
        return cy.request({
          headers: {
            authorization: `Bearer ${authUser.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/${order.ID}/checkout-session`,
          body: {
            gateway: 'stripe'
          },
          timeout: 60000000,
        })
      }).then(resp => {
          expect(resp.status).equals(200)
          expect(resp.body.id).to.not.equal(null)
          expect(resp.body.mode).to.equal('payment')
      })
    })
  })
})

describe('api/transfer', () => {
  it('Should Create Order Transfer (Consignor -> Edit)', () => {
    let admin, consignor, transferInventory, destinationWarehouse, originWarehouse, transferOut, transferIn = null
    //create some consignor inventory
    cy.all([() => cy.task('login', 'retailer'), () => cy.task('login', 'reseller')]).then((resp) => {
      admin = resp[0]
      consignor = resp[1]
      //determine transfer warehouses
      destinationWarehouse = admin.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
      originWarehouse = consignor.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
      return cy.task("createInventory", {account: 'reseller', quantity: 5})
    }).then((inventory) => {
      transferInventory = inventory
      const transferParams ={
          account: 'reseller',
          consigneeID: destinationWarehouse.addressID,
          consignorID: originWarehouse.addressID,
          type: 'transfer',
          accountID: consignor.accountID,
          details: inventory.items.map(item => {return {itemID: item.ID}})
      }
      return cy.task('createOrder', transferParams)
    }).then((res)=> {
      //fetch transfers
      return cy.all([() => cy.task('getOrder', {ID: res.ID, account: 'reseller'}), () => cy.task('getOrder', {ID: res.siblingOrderID})])
    }).then((res) => {
      transferOut = res[0]
      transferIn = res[1]
      //check that both transfers where created and belong to the right accounts
      expect(transferOut.ID).to.not.equals(null)
      expect(transferOut.accountID).equals(consignor.accountID)
      for (const to_oli of transferOut.orderLineItems) {
        const ti_oli = transferIn.orderLineItems.find(oli => oli.siblingID == to_oli.ID)
        expect(ti_oli.ID).to.not.equals(null)
        expect(to_oli.itemID).equals(ti_oli.itemID)
        expect(to_oli.productVariantID).not.equals(ti_oli.productVariantID)
        expect(to_oli.inventoryID).not.equals(null)
        expect(to_oli.inventoryID).not.equals(ti_oli.inventoryID)
        expect(to_oli.status.name).equals("fulfill") //fulfill
        expect(to_oli.statusID).equals(ti_oli.statusID)
        expect(to_oli.inventory.cost).equals(ti_oli.inventory.cost)
        expect(to_oli.inventory.notes).equals(ti_oli.inventory.notes)
        expect(ti_oli.inventoryID).equals(transferIn.orderLineItems[0].inventoryID) // be sure all items are using the same inventory
      }
      //check admin transfer in
      expect(transferIn.ID).to.not.equals(null)
      expect(transferIn.accountID).equals(admin.accountID)
    })
  })

  it('Should Create Order Transfer between account warehouses (internal)', () => {
    let admin, transferInventory, destinationWarehouse, originWarehouse, transferOut, transferIn = null
    //create some consignor inventory
    cy.task('login', 'retailer').then((resp) => {
      admin = resp
      //determine transfer warehouses
      destinationWarehouse = admin.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
      originWarehouse = admin.account.warehouses.find(warehouse => !warehouse.fulfillmentCentre)
      return cy.task("createInventory", {notes: 'test notes are copied'})
    }).then((inventory) => {
      transferInventory = inventory
      const transferParams ={
        account: 'retailer',
        consigneeID: destinationWarehouse.addressID,
        consignorID: originWarehouse.addressID,
        type: 'transfer',
        accountID: admin.accountID,
        fulfillment: {
          setAsDispatched: true
        },
        details: inventory.items.map(item => {return {itemID: item.ID}})
      }
      return cy.task('createOrder', transferParams)
    }).then((res)=> {
      //fetch transfers
      return cy.all([() => cy.task('getOrder', {ID: res.ID}), () => cy.task('getOrder', {ID: res.siblingOrderID})])
    }).then((res) => {
      transferOut = res[0]
      transferIn = res[1]
      //check that both transfers where created and belong to the right accounts
      expect(transferOut.ID).to.not.equals(null)
      expect(transferOut.accountID).equals(admin.accountID)
      expect(transferOut.status.name).equals('dispatched')

      //check admin transfer in
      expect(transferIn.ID).to.not.equals(null)
      expect(transferIn.accountID).equals(admin.accountID)
      expect(transferIn.status.name).equals('dispatched')

      for (const to_oli of transferOut.orderLineItems) {
        const ti_oli = transferIn.orderLineItems.find(oli => oli.siblingID == to_oli.ID)
        expect(ti_oli.ID).to.not.equals(null)
        expect(to_oli.itemID).equals(ti_oli.itemID)
        expect(to_oli.productVariantID).equals(ti_oli.productVariantID)
        expect(to_oli.inventoryID).not.equals(null)
        expect(to_oli.inventoryID).not.equals(ti_oli.inventoryID)
        expect(to_oli.status.name).equals("dispatched")
        expect(to_oli.statusID).equals(ti_oli.statusID)
        expect(transferInventory.notes).equals(to_oli.notes)
        expect(to_oli.notes).equals(ti_oli.notes)
      }
    })
  })

  it('Should Create Order Transfer Internal and Auto Complete it', () => {
    let admin, transferInventory, destinationWarehouse, originWarehouse, transferOut, transferIn = null
    //create some consignor inventory
    cy.task('login', 'retailer').then((resp) => {
      admin = resp
      //determine transfer warehouses
      destinationWarehouse = admin.account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
      originWarehouse = admin.account.warehouses.find(warehouse => !warehouse.fulfillmentCentre)
      return cy.task("createInventory")
    }).then((inventory) => {
      transferInventory = inventory
      const transferParams ={
        account: 'retailer',
        consigneeID: destinationWarehouse.addressID,
        consignorID: originWarehouse.addressID,
        type: 'transfer',
        accountID: admin.accountID,
        fulfillment: {
          setAsDispatched: true,
          setAsDelivered: true
        },
        details: inventory.items.map(item => {return {itemID: item.ID}})
      }
      return cy.task('createOrder', transferParams)
    }).then((res)=> {
      //fetch transfers
      return cy.all([() => cy.task('getOrder', {ID: res.ID}), () => cy.task('getOrder', {ID: res.siblingOrderID})])
    }).then((res) => {
      transferOut = res[0]
      transferIn = res[1]

      //check that both transfers where created and belong to the right accounts
      expect(transferOut.ID).to.not.equals(null)
      expect(transferOut.accountID).equals(admin.accountID)
      expect(transferOut.status.name).equals('delivered')

      //check admin transfer in
      expect(transferIn.ID).to.not.equals(null)
      expect(transferIn.accountID).equals(admin.accountID)
      expect(transferIn.status.name).equals('delivered')

      for (const to_oli of transferOut.orderLineItems) {
        const ti_oli = transferIn.orderLineItems.find(oli => oli.siblingID == to_oli.ID)
        expect(ti_oli.ID).to.not.equals(null)
        expect(to_oli.itemID).equals(ti_oli.itemID)
        expect(to_oli.productVariantID).equals(ti_oli.productVariantID)
        expect(to_oli.inventoryID).not.equals(null)
        expect(to_oli.inventoryID).not.equals(ti_oli.inventoryID)
        expect(to_oli.status.name).equals("delivered")
        expect(to_oli.statusID).equals(ti_oli.statusID)
        expect(to_oli.inventory.cost).equals(ti_oli.inventory.cost)
        expect(to_oli.inventory.notes).equals(ti_oli.inventory.notes)
        expect(ti_oli.inventory.warehouseID).equals(destinationWarehouse.ID)
        expect(ti_oli.item.warehouseID).equals(destinationWarehouse.ID)
      }
    })
  })
})

describe('api/order-line-items', () => {
  describe('PUT /api/order-line-items/:ID', () => {
    it('should update order line item cost', () => {
      let user, orderLineItemSelected;

      cy.login('retailer')
      .then(_user => {
        user = _user
        return cy.task("createOrder", {
          account: 'retailer',
          type: 'outbound'
        })
      })
      .then((order) => {
        orderLineItemSelected = order.orderLineItems[0]
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'PUT',
          url: Cypress.env('api') + `/api/order/${order.ID}/order-line-items/${orderLineItemSelected.ID}`,
          body: {
            cost: 250
          }
        })
      })
      .then(resp => {
        const updatedOrderLineItem = resp.body
        expect(updatedOrderLineItem.cost).equals("250.00")
        expect(updatedOrderLineItem.profit).equals("749.00")
      })
    })

    it('should update order line item cost of a consigned item (payout)', () => {
      let user, orderLineItemSelected, consignorOrder;

      cy.login('retailer')
      .then(_user => {
        user = _user
        return cy.task("createShopifyOrder")
      })
      .then((order) => {
        consignorOrder = order.consignor
        orderLineItemSelected = order.admin.orderLineItems.find(oli => oli.item.accountID != order.admin.accountID)
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'PUT',
          url: Cypress.env('api') + `/api/order/${order.admin.ID}/order-line-items/${orderLineItemSelected.ID}`,
          body: {
            cost: 250
          }
        })
      })
      .then(resp => {
        const updatedOrderLineItem = resp.body
        expect(updatedOrderLineItem.cost).equals("250.00")
        expect(updatedOrderLineItem.profit).equals("860.00")
        expect(updatedOrderLineItem.transaction.grossAmount).equals("250.00")
        return cy.task('getOrder', {ID: consignorOrder.ID, account: 'reseller'})
      })
      .then(order => {
        const updatedOrderLineItemConsignor = order.orderLineItems.find(oli => oli.itemID == orderLineItemSelected.itemID)
        expect(updatedOrderLineItemConsignor.payout).equals("250.00")

      })
    })
  })
})

describe('api/product', () => {

  describe('GET /', () => {
    it('Should get all product matches using input query for Laced', () => {
      cy.task('login', 'retailer')
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'GET',
          url: Cypress.env('api') + `/api/product/`,
          qs: {
            catalogue: 'laced',
            offset: 0,
            limit: 25,
            search: 'panda'
          }
        }))
      .then(resp => {
        expect(resp.status).equals(200)
        expect(resp.body.rows).to.be.a('array')
        expect(resp.body.rows[0].variants).to.be.a('array')

        const isMatchFound = resp.body.rows.find(product => product.title.toLowerCase().includes('panda'))
        expect(isMatchFound).to.not.equal(undefined)
      })
    })
  })

  describe('GET /product/:productID', () => {
    it('should test that the return of the product is not too slow', () => {
      let retailerProduct, resellerProduct, startTime;
      cy.task('createProduct', {
        variants: Array.from(Array(20).keys()).map(r => {return {name: `Test Variant--${r}`}}),
      })
      .then((_retailerProduct) => {
        //generate matches
        retailerProduct = _retailerProduct
        return cy.task('importProduct', {ID: retailerProduct.ID, account: 'reseller'})
      })
      .then((resellerProduct) => {
        startTime = new Date()
        return cy.task('getProduct', {ID: resellerProduct.ID, account: 'reseller'})
      })
      .then((product) => {
        const elapsedTime = new Date() - startTime
        expect(product.matches.length).equals(retailerProduct.variants.length)
        product.images.forEach((image, idx) => expect(image.position).equals(idx))
        product.variants.forEach((variant, idx) => expect(variant.position).equals(idx))
        expect(product.matches.length).equals(retailerProduct.variants.length)
        expect(elapsedTime).to.be.lt(500)
      })
    })
  })

  describe('GET /product/laced/:lacedID', () => {
    it('should get all the variants for the given lacedID', () => {
      cy.task('login', 'retailer')
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'GET',
          url: Cypress.env('api') + `/api/product/laced/4056`
        }))
      .then(resp => {
        expect(resp.status).equals(200)
        expect(resp.body.lacedID).equals(4056)
        expect(resp.body.variants).to.be.a('array')
      })
    })
  })

  describe('POST /', () => {
    it('Should create a simple product', () => {
      const body = {
        title: `Jordan 4 Retro Thunder (2023)`,
        code: `${Math.random().toString(36).slice(2)}`,
        category: 'sneakers',
        description: 'some product description',
        images: [
          {base64: 'data:image/png;/9j/4AAQSkZJ..'}
        ]
      }

      cy.task('createProduct', body)
      .then(product => {
        expect(product.title).equals(body.title)
        expect(product.code).equals(body.code)
        expect(product.description).equals(body.description)
        expect(product.category.name).equals(body.category)
        expect(product.variants.length).equals(1)
        expect(product.images.length).equals(1)
      })
    })

    it('Should create a complete product', () => {
      const body = {
        foreignID: 1234567890,
        title: `${Math.random().toString(36).slice(2)}`,
        code: `${Math.random().toString(36).slice(2)}`,
        sourceProductID: 1,
        category: 'sneakers',
        description: 'some product description',
        brand: 'Jordan',
        category2: 'air jordan',
        releaseDate: '2023-07-10',
        gender: 'unisex',
        color: 'cement grey/white/true blue',
        retailPrice: '135.00',
        images: [
          {base64: 'data:image/png;/9j/4AAQSkZJ..'},
          {base64: 'data:image/png;/9j/4AAQSkZJ..'},
          {base64: 'data:image/png;/9j/4AAQSkZJ..'}
        ],
        variants: ([...Array(20).keys()]).map(idx => {return {
          name: `Test Variant--${idx}`,
          foreignID: 202210032 + idx,
          weight: 1,
          volume: 1,
          sourceProductVariantID: idx + 1,
          gtin: `${Math.random().toString(36).slice(2)}`
        }}),
      }
  
      cy.task('createProduct', body)
      .then(product => {
        expect(product.title).equals(body.title)
        expect(product.sourceProductID).equals(body.sourceProductID)
        expect(product.code).equals(body.code)
        expect(product.description).equals(body.description)
        expect(product.category.name).equals(body.category)
        expect(product.brand).equals(body.brand)
        expect(product.category2).equals(body.category2)
        expect(product.releaseDate).equals(body.releaseDate)
        expect(product.gender).equals(body.gender)
        expect(product.color).equals(body.color)
        expect(product.retailPrice).equals(body.retailPrice)
        expect(product.variants.length).equals(body.variants.length)
        expect(product.images.length).equals(body.images.length)
        body.variants.forEach((variant, idx) => {
          const productVariant = product.variants[idx]
          expect(productVariant.sourceProductVariantID).equals(variant.sourceProductVariantID)
          expect(productVariant.gtin).equals(variant.gtin)
        })
      })
    })

    it('Should create a product while preventing duplicate variants', () => {
      const body = {
        title: `Jordan 4 Retro Thunder (2023)`,
        code: `${Math.random().toString(36).slice(2)}`,
        category: 'sneakers',
        description: 'some product description',
        images: [
          {base64: 'data:image/png;/9j/4AAQSkZJ..'}
        ],
        variants: [
          {
            name: `Test Variant--1`,
            foreignID: 202210032,
            weight: 1,
            volume: 1,
            sourceProductVariantID: 1,
            gtin: `"vict0jr9gu"`
          },
          {
            name: `Test Variant--1`,
            foreignID: 202210032,
            weight: 1,
            volume: 1,
            sourceProductVariantID: 1,
            gtin: `"vict0jr9gu"`
          },
          {
            name: `Test Variant--1`,
            foreignID: 202210032,
            weight: 1,
            volume: 1,
            sourceProductVariantID: 1,
            gtin: `"vict0jr9gu"`
          },
          {
            name: `Test Variant--2`,
            foreignID: 202210033,
            weight: 1,
            volume: 1,
            sourceProductVariantID: 1,
            gtin: `"vict0jr9gf"`
          },
        ],
      }
  
      cy.task('createProduct', body)
      .then(product => {
        expect(product.title).equals(body.title)
        expect(product.code).equals(body.code)
        expect(product.category.name).equals(body.category)
        expect(product.variants.length).equals(2)
        expect(product.images.length).equals(body.images.length)
      })
    })
  })

  describe('POST /search', () => {
    it('test filters, limit and sorting', () => {
      cy.task('getProducts', {
        search: 'nike',
        accountID: 3,
        limit: 50,
        sort: 'releaseDate:asc'
      })
      .then((response) => {
        expect(response.length).equals(50)
        expect(response[0].releaseDate < response[response.length - 1].releaseDate).equals(true)
        expect(response.filter(p => p.account.ID != 3).length).equals(0)
      })
    })

    it('test combo value filters and sorting', () => {
      cy.task('getProducts', {
        search: 'nike',
        'account.ID': '3,4,5,6',
        limit: 50,
        sort: 'createdAt:desc;title:asc'
      })
      .then((response) => {
        expect(response.length).equals(50)
        expect(response[0].createdAt > response[response.length - 1].createdAt).equals(true)
        expect(response.filter(p => p.account.ID != 3).length).equals(0)
      })
    })

    it('test public products search with date range as filter', () => {
      const dateGreatherThan = moment()
      const dateLowerThan = moment().add(7, 'days')
      cy.task('getProducts', {
        search: 'nike',
        limit: 50,
        releaseDate: `${dateGreatherThan.format('YYYY-MM-DD')}:${dateLowerThan.format('YYYY-MM-DD')}`,
        sort: 'createdAt:desc;title:asc'
      })
      .then((response) => {
        expect(response[0].createdAt > response[response.length - 1].createdAt).equals(true)
        expect(response.filter(p => !p.public).length).equals(0)
        const records = response.filter(p => p.releaseDate < dateGreatherThan && p.releaseDate > dateLowerThan)
        expect(records.length).equals(0)
      })
    })

    it('test public products sort by most sold', () => {
      cy.task('getProducts', {
        search: 'nike',
        limit: 50,
        sort: 'salesLast72Hours:desc'
      })
      .then((response) => {
        expect(response[0].salesLast72Hours > response[response.length - 1].salesLast72Hours).equals(true)
        expect(response.filter(p => !p.public).length).equals(0)
      })
    })

    it('search among public products latest releases', () => {
      const dateThreshold = moment().subtract(7, 'days')
      cy.task('getProducts', {
        search: 'nike',
        limit: 50,
        releaseDate: `:${dateThreshold.format('YYYY-MM-DD')}`,
        sort: 'releaseDate:desc;title:asc'
      })
      .then((response) => {
        expect(response[0].releaseDate > response[response.length - 1].releaseDate).equals(true)
        expect(response.filter(p => !p.public).length).equals(0)
        expect(response.filter(p => p.releaseDate > dateThreshold).length).equals(0)
      })
    })

    it('search among public products upcoming releases', () => {
      const dateThreshold = moment().subtract(7, 'days')
      cy.task('getProducts', {
        search: 'nike',
        limit: 50,
        releaseDate: `${dateThreshold.format('YYYY-MM-DD')}:`,
        sort: 'releaseDate:asc;title:asc'
      })
      .then((response) => {
        expect(response[0].releaseDate < response[response.length - 1].releaseDate).equals(true)
        expect(response.filter(p => !p.public).length).equals(0)
        expect(response.filter(p => p.releaseDate < dateThreshold).length).equals(0)
      })
    })

    it('Consignor should search products from retailer catalog', () => {
      cy.task('getProducts', {
        search: 'nike',
        account: 'reseller', // user trying to search
        accountID: 3, //search among products of another account 
        limit: 50,
        sort: 'releaseDate:asc'
      })
      .then((response) => {
        expect(response.length).equals(50)
      })
    })
  })

  describe('POST /product/:productID/variants/:variantID/match', () => {
    it('should match a variant with an external variant passed', () => {
      let retailerProduct, resellerProduct;
      cy.all([() => cy.task('createProduct'), () => cy.task('createProduct', {account: 'reseller', skipSync: true})])
      .then((products) => {
        [retailerProduct, resellerProduct] = products
        return cy.task('matchProductVariant', {
          productID: resellerProduct.ID, 
          variantID: resellerProduct.variants[0].ID, 
          externalProductVariantID: retailerProduct.variants[0].ID,
          account: 'reseller'
        })
      })
      .then((match) => {
        expect(Number(match.productVariantID)).equals(Number(resellerProduct.variants[0].ID))
        expect(Number(match.externalProductVariantID)).equals(Number(retailerProduct.variants[0].ID))
      })
    })

    it('should prevent to match variant to two external externalVariantID', () => {
      let retailerProduct, retailerProduct2, resellerProduct;
      cy.all([() => cy.task('createProduct'), () => cy.task('createProduct'), () => cy.task('createProduct', {account: 'reseller', skipSync: true})])
      .then((products) => {
        [retailerProduct, retailerProduct2, resellerProduct] = products
        return cy.task('matchProductVariant', {
          productID: resellerProduct.ID, 
          variantID: resellerProduct.variants[0].ID, 
          externalProductVariantID: retailerProduct.variants[0].ID,
          account: 'reseller'
        })
      })
      .then((product) => {
        return cy.task('matchProductVariant', {
          productID: resellerProduct.ID, 
          variantID: resellerProduct.variants[0].ID, 
          externalProductVariantID: retailerProduct2.variants[0].ID,
          account: 'reseller'
        })
      })
      .then((resp) => {
        expect(resp.status).equals(400)
        expect(resp.message).equals(`Variant ${resellerProduct.variants[0].ID} is already matched on this external account`)
      })
    })
  })

  describe('POST /import', () => {
    it('Should create a new match for an external product for an internal account', () => {
      let retailerProduct;
      cy.task('createProduct')
      .then((product) => {
        retailerProduct = product
        return cy.task('findOrCreateProductMatch', {
          productID: retailerProduct.ID,
          account: 'reseller'
        })
      })
      .then((internalProduct) => {
        expect(internalProduct.title).equals(retailerProduct.title)
        expect(internalProduct.code).equals(retailerProduct.code)
        expect(internalProduct.variants.length).equals(retailerProduct.variants.length)
      })
    })

    it('Should find an existing match for an external product for  ', () => {
      let retailerProduct;
      let createdProduct;
      let foundProduct;
      cy.task('createProduct')
          .then((product) => {
            retailerProduct = product
            return cy.task('findOrCreateProductMatch', {
              productID: retailerProduct.ID,
              account: 'reseller'
            })
          })
          .then((product) => {
            createdProduct = product
            return cy.task('findOrCreateProductMatch', {
              productID: retailerProduct.ID,
              account: 'reseller'
            })
          })
          .then((foundProduct) => {
            expect(foundProduct.ID).equals(createdProduct.ID)
          })
    })
  })

  describe('POST /product/:productID/variants', () => {
    it('Should add new variant for a product', () => {
      let product;

      cy.task("createProduct")
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'POST',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants`,
          body: {
            variants: [
              {
                name: 'new v1',
                weight: 1,
                gtin: '320937209237',
                foreignID: '32986294864'
              },
            ]
          }
        }))
      .then(resp => {
        expect(resp.status).equals(200)
        console.log(resp.body)
        expect(resp.body.length).equals(1)
        expect(resp.body[0].name).equals("new v1")
        expect(resp.body[0].weight).equals('1.000')
        expect(resp.body[0].gtin).equals('320937209237')
        expect(resp.body[0].foreignID).equals('32986294864')
      })
    })

    it('Should add two new variants for a product', () => {
      let product;

      cy.task("createProduct")
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'POST',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants`,
          body: {
            variants: [
              {name: 'new v1'},
              {name: 'new v2'},
            ]
          }
        }))
      .then(resp => {
        expect(resp.status).equals(200)
        expect(resp.body.length).equals(2)
      })
    })

    it('Should return 403 - when user tries to add variants to a product of another account', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.login('reseller')
      })
      .then((user) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants`,
          body: {
            variants: [
              {name: 'new v1'},
              {name: 'new v2'},
            ]
          },
          failOnStatusCode: false
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should return 403 - when user of the same account has no the permission to add variants to a product', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.login('retailer-user-limited')
      })
      .then((user) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants`,
          body: {
            variants: [
              {name: 'new v1'},
              {name: 'new v2'},
            ]
          },
          failOnStatusCode: false
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  })

  describe('POST /product/:productID/images', () => {
    it('Should upload two new images for a product', () => {
      let product;
      let imageBase64;

      cy.fixture('product-image.jpeg').then((_imageBase64) => {
        imageBase64 = _imageBase64
        return cy.task("createProduct")
      })
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'POST',
          url: Cypress.env('api') + `/api/product/${product.ID}/images`,
          body: {
            images: [
              {base64: imageBase64},
              {base64: imageBase64},
            ]
          }
        }))
      .then(resp => {
          expect(resp.status).equals(200)
          const productImages = resp.body
          expect(productImages.length).equals(2)
          expect(productImages[0].src).include('https://storage.googleapis.com/staging-wiredhub/resources/')
          expect(productImages[1].src).include('https://storage.googleapis.com/staging-wiredhub/resources/')
      })
    })

    it('Should upload two new images for a product and choose the position', () => {
      let product;
      let imageBase64;

      cy.fixture('product-image.jpeg').then((_imageBase64) => {
        imageBase64 = _imageBase64
        return cy.task("createProduct")
      })
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'POST',
          url: Cypress.env('api') + `/api/product/${product.ID}/images`,
          body: {
            images: [
              {src: 'https://storage.googleapis.com/staging-wiredhub/resources/test1.png', position: 1},
              {src: 'https://storage.googleapis.com/staging-wiredhub/resources/test2.png', position: 0},
            ]
          }
        }))
      .then(resp => {
          expect(resp.status).equals(200)
          const productImages = resp.body
          expect(productImages.length).equals(2)
          expect(productImages[1].src).equals('https://storage.googleapis.com/staging-wiredhub/resources/test1.png')
          expect(productImages[1].position).equals(1)
          expect(productImages[0].src).equals('https://storage.googleapis.com/staging-wiredhub/resources/test2.png')
          expect(productImages[0].position).equals(0)
      })
    })

    it('Should link an existing image to a product', () => {
      let product;
      cy.task("createProduct")
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'POST',
          url: Cypress.env('api') + `/api/product/${product.ID}/images`,
          body: {
            images: [
              {src: 'https://images.stockx.com/images/Nike-Dunk-High-Championship-Navy-PS.jpg', position: 0},
            ]
          }
        }))
      .then(resp => {
          expect(resp.status).equals(200)
          const productImages = resp.body
          expect(productImages.length).equals(1)
          expect(productImages[0].src).equals('https://images.stockx.com/images/Nike-Dunk-High-Championship-Navy-PS.jpg')
      })
    })
  })

  describe('PUT /:productID', () => {
    it('Should update a product title and description', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.task('updateProduct', {
          ID: product.ID,
          updates: {
            title: 'updated title',
            description: 'updated description'
          }
        })
      })
      .then((updatedProduct) => {
        expect(updatedProduct.title).equals('updated title')
        expect(updatedProduct.description).equals('updated description')
        expect(product.variants.length).equals(updatedProduct.variants.length)
        expect(product.images.length).equals(updatedProduct.images.length)
      })
    })

    it('Should update a product title and one of its variants', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.task('updateProduct', {
          ID: product.ID,
          updates: {
            title: 'updated title',
            variants: [{
              ID: product.variants[0].ID,
              name: 'updated variant name'
            }]
          }
        })
      })
      .then((updatedProduct) => {
        expect(updatedProduct.title).equals('updated title')
        expect(updatedProduct.variants[0].name).equals('updated variant name')
        expect(product.variants.length).equals(updatedProduct.variants.length)
        expect(product.images.length).equals(updatedProduct.images.length)
      })
    })

    it('Should update a product and set it as draft', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.task('updateProduct', {
          ID: product.ID,
          updates: {
            status: 'draft',
          }
        })
      })
      .then((updatedProduct) => {
        expect(updatedProduct.status).equals('draft')
        expect(product.variants.length).equals(updatedProduct.variants.length)
        expect(product.images.length).equals(updatedProduct.images.length)
      })
    })

    it('Should reorder the product variants', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.task('updateProduct', {
          ID: product.ID,
          updates: {
            variants: product.variants.map(v => {return {
              ID: v.ID,
              position: v.position == (product.variants.length - 1) ? 0 : v.position + 1
            }})
          }
        })
      })
      .then((updatedProduct) => {
        expect(product.variants[product.variants.length - 1].ID).equals(updatedProduct.variants[0].ID)
        expect(product.variants[0].ID).equals(updatedProduct.variants[updatedProduct.variants.length - 1].ID)
      })
    })

    it('Should reorder the product images', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.task('updateProduct', {
          ID: product.ID,
          updates: {
            images: product.images.map(img => {return {
              ID: img.ID,
              position: img.position == (product.images.length - 1) ? 0 : img.position + 1
            }})
          }
        })
      })
      .then((updatedProduct) => {
        expect(product.images[product.images.length - 1].ID).equals(updatedProduct.images[0].ID)
        expect(product.images[0].ID).equals(updatedProduct.images[updatedProduct.images.length - 1].ID)
      })
    })

    it('Should return 403 - when user tries to update product for another account', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.task('updateProduct', {
          ID: product.ID,
          account: 'reseller',
          updates: {
            title: 'updated title',
            description: 'updated description'
          }
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should return 403 - when user of the same account has no the permission to update product', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.task('updateProduct', {
          ID: product.ID,
          account: 'retailer-user-limited',
          updates: {
            title: 'updated title',
            description: 'updated description'
          }
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  })

  describe('PUT /product/:productID/variants', () => {
    it('should update variant names of a product', () => {
      let product;
      cy.task("createProduct", {variants: [{name: 'variant1'}, {name: 'variant2'}]})
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'PUT',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants`,
          body: {
            variants: product.variants.map(v => {return {
              ID: v.ID,
              name: `${v.name} edited`,
            }})
          }
        })
      )
      .then(resp => {
        expect(resp.status).equals(200)
        for (const variant of product.variants) {
          const updatedVariant = resp.body.find(v => v.ID === variant.ID)
          expect(updatedVariant.name).equals(`${variant.name} edited`)
        }
      })
    })

    it('should set a variant as deleted', () => {
      let product;
      cy.task("createProduct", {variants: [{name: 'variant1'}, {name: 'variant2'}]})
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'PUT',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants`,
          body: {
            variants: [{
              ID: product.variants[0].ID,
              status: `deleted`,
            }]
          }
        })
      )
      .then(resp => {
        expect(resp.status).equals(200)
        expect(resp.body[0].status).equals('deleted')
      })
    })
    
    it('Should return 403 - when user tries to uupdate variants to a product of another account', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.login('reseller')
      })
      .then((user) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'PUT',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants`,
          body: {
            variants: [{
              ID: product.variants[0].ID,
              status: `deleted`,
            }]
          },
          failOnStatusCode: false
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should return 403 - when user of the same account has no the permission to update variants to a product', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.login('retailer-user-limited')
      })
      .then((user) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'PUT',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants`,
          body: {
            variants: [{
              ID: product.variants[0].ID,
              status: `deleted`,
            }]
          },
          failOnStatusCode: false
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  })

  describe('PUT /product/:productID/images', () => {
    it('Should update the position of an image', () => {
      let product;
      const updates = {
        images: []
      }
      cy.task("createProduct", {images: [
        {src: 'https://storage.googleapis.com/staging-wiredhub/resources/test1.png'},
        {src: 'https://storage.googleapis.com/staging-wiredhub/resources/test2.png'},
      ]})
      .then((_product)=> {
        product = _product

        updates.images.push({
          ID: _product.images[0].ID,
          position: 1
        })
        updates.images.push({
          ID: _product.images[1].ID,
          position: 0
        })
        return cy.task('login', 'retailer')
      })
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'PUT',
          url: Cypress.env('api') + `/api/product/${product.ID}/images`,
          body: updates
        }))
      .then(resp => {
          expect(resp.status).equals(200)
          const productImages = resp.body
          expect(productImages.length).equals(2)
          expect(productImages.find(i => i.ID == product.images[0].ID).position).equals(1)
          expect(productImages.find(i => i.ID == product.images[1].ID).position).equals(0)
      })
    })

    it('Should update the source link of an image', () => {
      let product;
      cy.task("createProduct", {images: [
        {src: 'https://storage.googleapis.com/staging-wiredhub/resources/test1.png'},
        {src: 'https://storage.googleapis.com/staging-wiredhub/resources/test2.png'},
      ]})
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'PUT',
          url: Cypress.env('api') + `/api/product/${product.ID}/images`,
          body: {
            images: [
              {ID: product.images[0].ID, src: 'test'}
            ]
          }
        }))
      .then(resp => {
          expect(resp.status).equals(200)
          const productImages = resp.body
          expect(productImages.length).equals(1)
          expect(productImages[0].src).equals('test')
      })
    })
  })

  describe('DELETE /product/:productID/variants', () => {
    it('Should delete all variants of a given product', () => {
      let product;
      cy.task("createProduct")
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'DELETE',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants?variantIDs=${product.variants.map(i => i.ID).join(',')}`,
        }))
      .then(resp => {
          expect(resp.status).equals(200)
          return cy.task('getProduct', {ID: product.ID})
      })
      .then((response) => {
        console.log(response)
      })
    })

    it('Should return 403 - when user tries to delete variants of a product of another account', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.login('reseller')
      })
      .then((user) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'DELETE',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants?variantIDs=${product.variants.map(i => i.ID).join(',')}`,
          failOnStatusCode: false
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })

    it('Should return 403 - when user of the same account has no the permission to update variants to a product', () => {
      let product;
      cy.task('createProduct')
      .then(_product => {
        product = _product
        return cy.login('retailer-user-limited')
      })
      .then((user) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'DELETE',
          url: Cypress.env('api') + `/api/product/${product.ID}/variants?variantIDs=${product.variants.map(i => i.ID).join(',')}`,
          failOnStatusCode: false
        })
      })
      .then((response) => {
        expect(response.status).equals(403)
      })
    })
  })

  describe('DELETE /product/:productID/images', () => {
    it('Should delete all images of a given product', () => {
      let product;
      cy.task("createProduct", {images: [
        {src: 'https://storage.googleapis.com/staging-wiredhub/resources/test1.png'},
        {src: 'https://storage.googleapis.com/staging-wiredhub/resources/test2.png'},
      ]})
      .then((_product)=> {
        product = _product
        return cy.task('login', 'retailer')
      })
      .then(user => 
        cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
          method: 'DELETE',
          url: Cypress.env('api') + `/api/product/${product.ID}/images?imageIDs=${product.images.map(i => i.ID).join(',')}`,
        }))
      .then(resp => {
          expect(resp.status).equals(200)
          return cy.task('getProduct', {ID: product.ID})
      })
      .then((product) => {
        expect(product.images.length).equal(0)
        expect(product.imageReference).equal(null)
      })
    })
  })

})

describe('api/fulfillment', () => {
  it('Should return a list of rates given a draft fulfillment and a list of couriers and courierServices', () => {
    let order, consignor, consignee
    cy.task('createOrder', {type: 'outbound'}).then((_order) => {
      order = _order
      const updatedConsignor = {
        ID: order.consignor.ID,
        updates: {
          phoneCountryCode: '1',
          phoneNumber: '928766999',
          address: '504 Lavaca St Suite 1100',
          city: 'Austin',
          postcode: '78701',
          countyCode: 'tx',
          country: 'US',
          countryCode: 'us',
          validated: 1
        }
      }

      const updatedConsignee = {
        ID: order.consignee.ID,
        updates: {
          phoneCountryCode: '1',
          phoneNumber: '928766999',
          address: '1000 Louisiana St Suite 1990',
          city: 'Houston',
          postcode: '77002',
          countyCode: 'tx',
          country: 'US',
          countryCode: 'us',
          validated: 1
        }
      }
      //fetch full orders for checks
      return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
    })
    .then((response) => {
      [consignor, consignee] = response
      return cy.task('get', 'retailer')
    }).then(user => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + `/api/order/${order.ID}/compute-shipping-rates`,
        body: {
          couriers: [{
            ID: 1,
          }], 
          origin: consignor,
          destination: consignee,
          packages: [{
            weight: 1 // in kilograms
          }]
        }
      })
    })
    .then((response) => {
      console.log(response.body)
    })
  })
})

describe('api/address', () => {
  it('Should create a address with mandatory validation', () => {
    cy.task('createAddress', {
      phoneCountryCode: '44',
      phoneNumber: '172633459',
      address: '251 southwark bridge road',
      addressExtra: '1202',
      city: 'london',
      countyCode: 'london',
      postcode: 'SE16DF',
      country: 'GB',
      validate: 'validate'
    }).then((address) => {
      expect(address.validated).equals(true)
    })
  })

  it('Should return 422 - create a address with mandatory validation and fail', () => {
    cy.task('createAddress', {
      phoneNumber: '7928766999',
      address: '1000 Louisiana St Suite 1990',
      city: 'Houston',
      postcode: '77002',
      country: 'US',
      validate: 'validate'
    }).then((response) => {
      expect(response.status).equals(422)
    })
  })

  it('Should create a address with optional validation and fail', () => {
    cy.task('createAddress', {
      phoneNumber: '7928766999',
      address: '1000 Louisiana St Suite 1990',
      city: 'Houston',
      postcode: '77002',
      country: 'United States',
      validate: 'validate_optional'
    }).then((address) => {
      expect(address.validated).equals(false)
    })
  })

  it('Should return 403 - User should not be able to update address it doesnt own', () => {
    let address;
    cy.task('createAddress', {
      phoneNumber: '7928766999',
      address: '1000 Louisiana St Suite 1990',
      city: 'Houston',
      postcode: '77002',
      country: 'United States',
      validate: 'validate_optional'
    }).then((_address) => {
      address = _address
      return cy.login('reseller')
    })
    .then((user) => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'PUT',
        url: Cypress.env('api') + `/api/address/${address.ID}`,
        body: {
          name: 'test',
        },
        timeout: 60000000,
        failOnStatusCode: false
      })
    }).then((resp) => {
      expect(resp.status).equals(403)
    })
  })

  it('Should return 403 - User without permissions tries to create an address', () => {
    let address;
    cy.task('createAddress', {
      phoneNumber: '7928766999',
      address: '1000 Louisiana St Suite 1990',
      city: 'Houston',
      postcode: '77002',
      country: 'United States',
      validate: 'validate_optional'
    }).then((_address) => {
      address = _address
      return cy.login('retailer-user-limited')
    })
    .then((user) => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'PUT',
        url: Cypress.env('api') + `/api/address/${address.ID}`,
        body: {
          name: 'test',
        },
        timeout: 60000000,
        failOnStatusCode: false
      })
    }).then((resp) => {
      expect(resp.status).equals(403)
    })
  })
})

describe('api/transaction', () => {
  describe('POST /pay', () => {
    it('Should process unpaid payout tx using revolut', () => {
      let payoutTx, user;
      cy.task("createShopifyOrder")
      .then((orders) => {
        payoutTx = orders.admin.transactions.find(tx => tx.type == "payout")
        return cy.task('login', 'retailer')
      })
      .then(_user => {
        user = _user
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/account/${user.accountID}/revolut/topup`,
          body: {
            amount: 1002,
          },
          timeout: 60000000,
        })
      })
      .then(() => cy.task('login', 'reseller'))
      .then(consignor => {
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/account/${user.accountID}/consignor/${consignor.ID}/bank-details`,
          body: {
            gateway: 'revolut',
            companyName: `test company ${Math.random().toString(36).slice(2)}`,
            accountNumber: `${10000000 + (Math.floor(Math.random() * 10000000))}`,
            sortCode: '123456',
            address: {
              street: '251 southwwark bridge road',
              city: 'London',
              postcode: 'SG18 9ND',
              country: 'GB',
            }
          },
          timeout: 60000000,
        })
      })
      .then(() => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/transactions/${payoutTx.ID}/pay`,
          body: {
            gateway: 'revolut',
          },
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        const updatedPayoutTx = resp.body
        expect(updatedPayoutTx.status).equals("processing")
        expect(updatedPayoutTx.processingAt).not.equals(null)
        expect(updatedPayoutTx.gateway).equals("revolut")
        expect(updatedPayoutTx.processedByUserID).not.equals(null)
        expect(updatedPayoutTx.revolutTransactionID).not.equals(null)
      })
    })

    it('Should process unpaid payout tx with tx fees using revolut', () => {
      let payoutTxToPay, cancelledFeeTx, user;
      cy.task("createShopifyOrder")
      .then((orders) => {
        const payoutTxs = orders.admin.transactions.filter(tx => tx.type == "payout")
        payoutTxToPay = payoutTxs[0]
        const payoutTxToCancel = payoutTxs[1]
        return cy.all([
          () => cy.task('cancelOrder', {orderID: orders.admin.ID, orderLineItems: [{ID: payoutTxToCancel.orderLineItemID}]}), 
          () => cy.task('createTransaction', {
            accountID: orders.admin.accountID,
            type: 'cancellation fee',
            grossAmount: '50.00',
            fromAccountID: payoutTxToCancel.toAccountID,
            toAccountID: payoutTxToCancel.fromAccountID,
            orderID: payoutTxToCancel.orderID,
            orderLineItemID: payoutTxToCancel.orderLineItemID,
          })
        ])
      })
      .then((responses) => {
        cancelledFeeTx = responses[1]
        return cy.task('login', 'retailer')
      })
      .then(_user => {
        user = _user
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/account/${user.accountID}/revolut/topup`,
          body: {
            amount: 1000,
          },
          timeout: 60000000,
        })
      })
      .then(() => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/transactions/${payoutTxToPay.ID}/pay`,
          body: {
            gateway: 'revolut',
            cancellationFeeTxIds: [cancelledFeeTx.ID]
          },
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        const updatedPayoutTx = resp.body
        expect(updatedPayoutTx.status).equals("processing")
        expect(updatedPayoutTx.gateway).equals("revolut")
        expect(updatedPayoutTx.processedByUserID).not.equals(null)
        expect(updatedPayoutTx.revolutTransactionID).not.equals(null)
        expect(updatedPayoutTx.childTxs.length).equals(1)
        expect(updatedPayoutTx.childTxs[0].grossAmount).equals(cancelledFeeTx.grossAmount)
        expect(updatedPayoutTx.childTxs[0].status).equals("processing")
        expect(updatedPayoutTx.childTxs[0].ID).equals(cancelledFeeTx.ID)
      })
    })

    it('Should return 403 when consignor tries to pay its payout through revolut', () => {
      let payoutTx;
      cy.task("createShopifyOrder")
      .then((orders) => {
        payoutTx = orders.admin.transactions.find(tx => tx.type == "payout")
        return cy.task('login', 'reseller')
      })
      .then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/transactions/${payoutTx.ID}/pay`,
          body: {
            gateway: 'revolut',
          },
          timeout: 60000000,
          failOnStatusCode: false
        })
      }).then((resp) => {
        expect(resp.status).equals(403)
      })

    })

    it('Should process unpaid payout tx using stripe', () => {
      let payoutTx, retailer;
      cy.task("createShopifyOrder")
      .then((orders) => {
        payoutTx = orders.admin.transactions.find(tx => tx.type == "payout")
        return cy.task('login', 'retailer')
      })
      .then(user => {
        retailer = user
        return cy.task('login', 'reseller')
      })
      .then(consignor => {
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/account/${retailer.accountID}/consignor/${consignor.ID}/bank-details`,
          body: {
            gateway: 'stripe',
            stripeAuthID: `acct_1KZ2UQQYMyEkvfv2`,
          },
          timeout: 60000000,
        })
      })
      .then(() => {
        return cy.request({
          headers: {
            authorization: `Bearer ${retailer.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/transactions/${payoutTx.ID}/pay`,
          body: {
            gateway: 'stripe',
          },
          timeout: 60000000,
        })
      })
      .then((resp) => {
        expect(resp.status).equals(200)
        const updatedPayoutTx = resp.body
        expect(updatedPayoutTx.status).equals("processing")
        expect(updatedPayoutTx.processingAt).not.equals(null)
        expect(updatedPayoutTx.gateway).equals("stripe")
        expect(updatedPayoutTx.processedByUserID).not.equals(null)
        expect(updatedPayoutTx.stripeID).not.equals(null)
      })
    })

    it('Should process unpaid payout tx with tx fees using stripe', () => {
      let payoutTxToPay, cancelledFeeTx;
      cy.task("createShopifyOrder")
      .then((orders) => {
        const payoutTxs = orders.admin.transactions.filter(tx => tx.type == "payout")
        payoutTxToPay = payoutTxs[0]
        const payoutTxToCancel = payoutTxs[1]
        return cy.all([
          () => cy.task('cancelOrder', {orderID: orders.admin.ID, orderLineItems: [{ID: payoutTxToCancel.orderLineItemID}]}), 
          () => cy.task('createTransaction', {
            accountID: orders.admin.accountID,
            type: 'cancellation fee',
            grossAmount: '50.00',
            fromAccountID: payoutTxToCancel.toAccountID,
            toAccountID: payoutTxToCancel.fromAccountID,
            orderID: payoutTxToCancel.orderID,
            orderLineItemID: payoutTxToCancel.orderLineItemID,
          })
        ])
      })
      .then((responses) => {
        cancelledFeeTx = responses[1]
        return cy.task('login', 'retailer')
      })
      .then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/transactions/${payoutTxToPay.ID}/pay`,
          body: {
            gateway: 'stripe',
            cancellationFeeTxIds: [cancelledFeeTx.ID]
          },
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        const updatedPayoutTx = resp.body
        expect(updatedPayoutTx.status).equals("processing")
        expect(updatedPayoutTx.gateway).equals("stripe")
        expect(updatedPayoutTx.processedByUserID).not.equals(null)
        expect(updatedPayoutTx.stripeID).not.equals(null)
        expect(updatedPayoutTx.childTxs.length).equals(1)
        expect(updatedPayoutTx.childTxs[0].grossAmount).equals(cancelledFeeTx.grossAmount)
        expect(updatedPayoutTx.childTxs[0].status).equals("processing")
        expect(updatedPayoutTx.childTxs[0].ID).equals(cancelledFeeTx.ID)
      })
    })

    it('Should return 403 when consignor tries to pay its payout through stripe', () => {
      let payoutTx;
      cy.task("createShopifyOrder")
      .then((orders) => {
        payoutTx = orders.admin.transactions.find(tx => tx.type == "payout")
        return cy.task('login', 'reseller')
      })
      .then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/transactions/${payoutTx.ID}/pay`,
          body: {
            gateway: 'stripe',
          },
          timeout: 60000000,
          failOnStatusCode: false
        })
      }).then((resp) => {
        expect(resp.status).equals(403)
      })

    })
  })
})

describe('api/bridge', () => {
  describe("ingress", () => {
    describe('shopify/product/created', () => {
      it('idempotency test - Should prevent from generating the same product twice', () => {
        let product
        // create shopify
        cy.task('createShopifyProduct').then((_product) =>{
          product = _product
          return cy.task('createShopifyProduct', {id: product.foreignID})
        }).then((product2) => {
          return cy.task('getProducts', {foreignID: product.foreignID})
        }).then((res) => {
          expect(res.length).equals(1)
        })
      })
    })

    describe('shopify/order/created', () => {
      it('Should Generate order with multiple items (admin order 2 items | consignor order 2 items )', () => {
        let adminOrder, consignorOrder
        // create shopify
        cy.task('createShopifyOrder').then((res) =>{
          adminOrder = res.admin
          consignorOrder = res.consignor
          //fetch full orders for checks
          return cy.all([() => cy.task('getOrder', {ID: adminOrder.ID}), () => cy.task('getOrder', {ID: consignorOrder.ID, account: 'reseller'})])
        }).then((res) => {
          adminOrder = res[0]
          consignorOrder = res[1]

          //check admin order
          expect(adminOrder.orderLineItems.length).equals(4)
          // check admin order has correct default tags
          expect(adminOrder.tags).equals('consignment')
          //check source warehouse is set
          expect(adminOrder.consignorID).to.not.equals(null)
          // check payment transaction created and correct status 
          const saleTx = adminOrder.transactions.find(tx => tx.type == "sale")
          const totalSaleOrderLineItems = parseFloat(adminOrder.orderLineItems.reduce((tot, orderLineItem) => tot += parseFloat(orderLineItem.price), 0).toPrecision(15))
          expect(parseFloat(saleTx.grossAmount)).equals(totalSaleOrderLineItems)
          expect(saleTx.status).equals("paid")
          expect(saleTx.completedAt).to.not.equals(null)
          expect(saleTx.fromAccountID).equals(null)
          expect(saleTx.toAccountID).equals(adminOrder.accountID)
          expect(saleTx.reference).equals(adminOrder.reference1)

          const discountTx = adminOrder.transactions.find(tx => tx.type == "discount")
          expect(discountTx.grossAmount).equals('11.99')
          expect(discountTx.status).equals("paid")
          expect(discountTx.completedAt).to.not.equals(null)
          expect(discountTx.toAccountID).equals(null)
          expect(discountTx.fromAccountID).equals(adminOrder.accountID)
          expect(discountTx.reference).equals(adminOrder.reference1)

          const shippingTx = adminOrder.transactions.find(tx => tx.type == "shipping")
          expect(shippingTx.grossAmount).equals('5.00')
          expect(shippingTx.status).equals("paid")
          expect(shippingTx.completedAt).to.not.equals(null)
          expect(shippingTx.toAccountID).equals(adminOrder.accountID)
          expect(shippingTx.fromAccountID).equals(null)
          expect(shippingTx.reference).equals(adminOrder.reference1)

          const payoutTxs = adminOrder.transactions.filter(tx => tx.type == "payout")
          const totalPayoutConsignedOrderLineItems = parseFloat(adminOrder.orderLineItems.filter(oli => oli.item.accountID != adminOrder.accountID).reduce((tot, orderLineItem) => tot += parseFloat(orderLineItem.cost), 0).toPrecision(15))
          expect(payoutTxs.reduce((tot, tx) => tot += parseFloat(tx.grossAmount), 0)).equals(totalPayoutConsignedOrderLineItems)
          expect(payoutTxs.filter(tx => tx.status == "unpaid").length).equals(payoutTxs.length)
          expect(payoutTxs.filter(tx => tx.completedAt == null).length).equals(payoutTxs.length)
          expect(payoutTxs.filter(tx => tx.fromAccountID == adminOrder.accountID).length).equals(payoutTxs.length)
          expect(payoutTxs.filter(tx => tx.toAccountID != adminOrder.accountID).length).equals(payoutTxs.length)

          // check order status
          expect(adminOrder.status.name).equals('partially-confirmed')
          //consignor order checks
          expect(consignorOrder.orderLineItems.length).equals(2)
          expect(adminOrder.orderLineItems.filter(oli => oli.item.accountID == consignorOrder.accountID && oli.status.name == "pending").length).equals(2)
          expect(adminOrder.orderLineItems.filter(oli => oli.item.accountID != consignorOrder.accountID && oli.status.name == "fulfill").length).equals(2)

          //check source warehouse is set
          expect((consignorOrder.consignorID)).to.not.equals(null)

          //check destination warehouse is set
          expect((consignorOrder.consignee)).to.not.equal(null)
          // check order status
          expect(consignorOrder.status.name).equals('pending')

        })
      })

      it('Should Generate order with multiple items (admin order 1 item quantity 2)', () => {
        let adminOrder, consignorOrder
        let selectedInventory = []
        //create admin inventory
        cy.task('createInventory', {quantity: 2, setAsDelivered: true}).then(inventory => {
          selectedInventory.push(inventory)
          return cy.task('createInventory', {account: 'reseller', quantity: 2, setAsDelivered: true})
        }).then(inventory => {
          selectedInventory.push(inventory)
          // create shopify order body
          const shopifyOrderParams = {line_items: []}
          selectedInventory.map((invRecord, idx) => {
            const listing = invRecord.listings.find(listing => listing.saleChannelID == 1)
            shopifyOrderParams.line_items.push({
              "variant_id": listing.variant.foreignID,
              "quantity": 2,
              "product_id": listing.product.ID,
              "price": listing.price
            })
          })
          return cy.task('createShopifyOrder', shopifyOrderParams)
        }).then((res) =>{
          adminOrder = res.admin
          //fetch full orders for checks
          return cy.task('getOrder', {ID: adminOrder.ID})
        }).then((res) => {
          adminOrder = res
          //check admin order
          expect(adminOrder.orderLineItems.length).equals(4)
          //check source warehouse is set
          expect(adminOrder.consignorID).to.not.equals(null)
          // check order status
          expect(adminOrder.status.name).equals('partially-confirmed')

          // check payment transaction created and correct status 
          const saleTx = adminOrder.transactions.find(tx => tx.type == "sale")
          const totalSaleOrderLineItems = parseFloat(adminOrder.orderLineItems.reduce((tot, orderLineItem) => tot += parseFloat(orderLineItem.price), 0).toPrecision(15))
          expect(parseFloat(saleTx.grossAmount)).equals(totalSaleOrderLineItems)
          expect(saleTx.status).equals("paid")
          expect(saleTx.completedAt).to.not.equals(null)
          expect(saleTx.fromAccountID).equals(null)
          expect(saleTx.toAccountID).equals(adminOrder.accountID)
          expect(saleTx.reference).equals(adminOrder.reference1)

          const discountTx = adminOrder.transactions.find(tx => tx.type == "discount")
          expect(discountTx.grossAmount).equals('11.99')
          expect(discountTx.status).equals("paid")
          expect(discountTx.completedAt).to.not.equals(null)
          expect(discountTx.fromAccountID).equals(adminOrder.accountID)
          expect(discountTx.toAccountID).equals(null)
          expect(discountTx.reference).equals(adminOrder.reference1)

          const shippingTx = adminOrder.transactions.find(tx => tx.type == "shipping")
          expect(shippingTx.grossAmount).equals('5.00')
          expect(shippingTx.status).equals("paid")
          expect(shippingTx.completedAt).to.not.equals(null)
          expect(shippingTx.fromAccountID).equals(null)
          expect(shippingTx.toAccountID).equals(adminOrder.accountID)
          expect(shippingTx.reference).equals(adminOrder.reference1)
        })
      })

      it('Should Generate order with virtual inventory (item1 and item 2 )', () => {
        let inventoryRecordsSelected ,sourcedItem1, sourcedItem2, adminOrder, sourceOrder= null
        //create some virtual inventory
        cy.task('createInventory', {virtual: true, quantity: 1}).then((inventory) => {
          inventoryRecordsSelected = [inventory]
          return cy.task('createInventory', {virtual: true, quantity: 1})})
        .then((inventory) => {
          inventoryRecordsSelected.push(inventory)

          const shopifyOrderParams = {
            line_items: inventoryRecordsSelected.map((invRecord, idx) => {return {
              "variant_id": invRecord.variant.foreignID,
              "quantity": 1,
              "product_id": invRecord.product.ID,
              "price": invRecord.listings.find(listing => listing.saleChannelID == 2).price
            }})
          }
          
          return cy.task('createShopifyOrder', shopifyOrderParams)
        }).then((res) => {
          return cy.task('getOrder', {ID: res.admin.ID})
        }).then((order) => {
          adminOrder = order
          // check order belongs to inventory accountID
          expect(adminOrder.accountID).equals(inventoryRecordsSelected[0].accountID)
          // order has 2 lines items and 2 items
          expect(adminOrder.orderLineItems.length).equals(2)
          // check all items belong to order's account
          expect(adminOrder.orderLineItems.filter(item => item.accountID == adminOrder.accountID).length).equals(adminOrder.orderLineItems.length)

          // check payment transaction created and correct status 
          const saleTx = adminOrder.transactions.find(tx => tx.type == "sale")
          const totalSaleOrderLineItems = parseFloat(adminOrder.orderLineItems.reduce((tot, orderLineItem) => tot += parseFloat(orderLineItem.price), 0).toPrecision(15))
          expect(parseFloat(saleTx.grossAmount)).equals(totalSaleOrderLineItems)
          expect(saleTx.status).equals("paid")
          expect(saleTx.completedAt).to.not.equals(null)
          expect(saleTx.fromAccountID).equals(null)
          expect(saleTx.toAccountID).equals(adminOrder.accountID)
          expect(saleTx.reference).equals(adminOrder.reference1)

          const discountTx = adminOrder.transactions.find(tx => tx.type == "discount")
          expect(discountTx.grossAmount).equals('11.99')
          expect(discountTx.status).equals("paid")
          expect(discountTx.completedAt).to.not.equals(null)
          expect(discountTx.fromAccountID).equals(adminOrder.accountID)
          expect(discountTx.toAccountID).equals(null)
          expect(discountTx.reference).equals(adminOrder.reference1)

          const shippingTx = adminOrder.transactions.find(tx => tx.type == "shipping")
          expect(shippingTx.grossAmount).equals('5.00')
          expect(shippingTx.status).equals("paid")
          expect(shippingTx.completedAt).to.not.equals(null)
          expect(shippingTx.fromAccountID).equals(null)
          expect(shippingTx.toAccountID).equals(adminOrder.accountID)
          expect(shippingTx.reference).equals(adminOrder.reference1)

          //TODO: monitor on tags change
          return cy.task('getOrders', { reference1: `~sourcing for sale #${adminOrder.ID}`})
          //check that order in was generated for sourced items
        }).then((res)=> {
          //check that only one order in was created for the source
          expect(res.length).equals(1)
          return cy.task('getOrder', {ID: res[0].ID})
        }).then((res) => {
          sourceOrder = res
          expect(sourceOrder.type.name).equals('inbound')
          //check order line items quantity is correct for source
          expect(sourceOrder.orderLineItems.length).equals(2)
          expect(sourceOrder.quantity).equals(2)
          // check that source was created for the right items
          adminOrder.orderLineItems.map(oli => {
            const foundItem = sourceOrder.orderLineItems.find(_oli => _oli.itemID == oli.itemID)
            expect(foundItem).not.equals(null)
          })
          return cy.task('getInventory', {IDs: [inventoryRecordsSelected[0].ID,inventoryRecordsSelected[1].ID]})
        }).then(resp => {
          //check virtual inv quantity is still correct (10)
          expect(resp[0].quantity).equals(10)
          expect(resp[1].quantity).equals(10)
        })
      })

      it('Should Generate order quantity x3 and inventory records are multiple: x2 and x3. Should pick x2 and x1 from the seconnd record', () => {
        let inventory1 ,inventory2, adminOrder, sourceOrder= null
        //create some virtual inventory
        cy.task('createInventory', {quantity: 2, payout: 100})
        .then((inventory) => {
          inventory1 = inventory
          return cy.task('createInventory', {quantity: 3, productID: inventory1.productID, productVariantID: inventory1.productVariantID, payout: 100})})
        .then((inventory) => {
          inventory2 = inventory

          const shopifyOrderParams = {
            line_items: [{
              "variant_id": inventory1.variant.foreignID,
              "quantity": inventory1.quantity + 1,
              "product_id": inventory1.product.foreignID,
              "price": inventory1.listings.find(listing => listing.saleChannelID == 1).price
            }]
          }
          
          return cy.task('createShopifyOrder', shopifyOrderParams)
        }).then((res) => {
          return cy.task('getOrder', {ID: res.admin.ID})
        }).then((order) => {
          adminOrder = order
          console.log(adminOrder)
          // check order belongs to inventory accountID
          expect(adminOrder.accountID).equals(inventory1.accountID)
          // order has 2 lines items and 2 items
          expect(adminOrder.orderLineItems.length).equals(3)
          // check all items belong to order's account
          expect(adminOrder.orderLineItems.filter(item => item.accountID == adminOrder.accountID).length).equals(adminOrder.orderLineItems.length)

          // check payment transaction created and correct status 
          const saleTx = adminOrder.transactions.find(tx => tx.type == "sale")
          const totalSaleOrderLineItems = parseFloat(adminOrder.orderLineItems.reduce((tot, orderLineItem) => tot += parseFloat(orderLineItem.price), 0).toPrecision(15))
          expect(parseFloat(saleTx.grossAmount)).equals(totalSaleOrderLineItems)
          expect(saleTx.status).equals("paid")
          expect(saleTx.completedAt).to.not.equals(null)
          expect(saleTx.fromAccountID).equals(null)
          expect(saleTx.toAccountID).equals(adminOrder.accountID)
          expect(saleTx.reference).equals(adminOrder.reference1)

          const discountTx = adminOrder.transactions.find(tx => tx.type == "discount")
          expect(discountTx.grossAmount).equals('11.99')
          expect(discountTx.status).equals("paid")
          expect(discountTx.completedAt).to.not.equals(null)
          expect(discountTx.fromAccountID).equals(adminOrder.accountID)
          expect(discountTx.toAccountID).equals(null)
          expect(discountTx.reference).equals(adminOrder.reference1)

          const shippingTx = adminOrder.transactions.find(tx => tx.type == "shipping")
          expect(shippingTx.grossAmount).equals('5.00')
          expect(shippingTx.status).equals("paid")
          expect(shippingTx.completedAt).to.not.equals(null)
          expect(shippingTx.toAccountID).equals(adminOrder.accountID)
          expect(shippingTx.fromAccountID).equals(null)
          expect(shippingTx.reference).equals(adminOrder.reference1)
        })
      })

      it('Should Generate order quantity x3 and inventory records are multiple: x1, x1 and x1. Should not pick same itemID multiple times', () => {
        let inventory1 ,inventory2, inventory3, adminOrder, sourceOrder= null

        cy.task('createInventory', {quantity: 1, payout: 100})
        .then((inventory) => {
          inventory1 = inventory
          return cy.all([
            () => cy.task('createInventory', {quantity: 1, productID: inventory1.productID, productVariantID: inventory1.productVariantID, payout: 100}),
            () => cy.task('createInventory', {quantity: 1, productID: inventory1.productID, productVariantID: inventory1.productVariantID, payout: 100}),
          ])
        })
        .then((responses) => {
          inventory2 = responses[0]
          inventory3 = responses[1]

          const shopifyOrderParams = {
            line_items: [{
              "variant_id": inventory1.variant.foreignID,
              "quantity": inventory1.quantity + inventory2.quantity + inventory3.quantity,
              "product_id": inventory1.product.foreignID,
              "price": inventory1.listings.find(listing => listing.saleChannelID == 1).price
            }]
          }
          
          return cy.task('createShopifyOrder', shopifyOrderParams)
        }).then((res) => {
          return cy.task('getOrder', {ID: res.admin.ID})
        }).then((order) => {
          adminOrder = order
          console.log(adminOrder.orderLineItems)
          // check order belongs to inventory accountID
          expect(adminOrder.accountID).equals(inventory1.accountID)
          // order has 2 lines items and 2 items
          expect(adminOrder.orderLineItems.length).equals(3)
          // check all items belong to order's account
          expect(adminOrder.orderLineItems.filter(item => item.accountID == adminOrder.accountID).length).equals(adminOrder.orderLineItems.length)
          //check item not added multiple times
          expect(([...new Set(adminOrder.orderLineItems.map(oli => oli.itemID))]).length).equals(3)

          // check payment transaction created and correct status 
          const saleTx = adminOrder.transactions.find(tx => tx.type == "sale")
          const totalSaleOrderLineItems = parseFloat(adminOrder.orderLineItems.reduce((tot, orderLineItem) => tot += parseFloat(orderLineItem.price), 0).toPrecision(15))
          expect(parseFloat(saleTx.grossAmount)).equals(totalSaleOrderLineItems)
          expect(saleTx.status).equals("paid")
          expect(saleTx.completedAt).to.not.equals(null)
          expect(saleTx.fromAccountID).equals(null)
          expect(saleTx.toAccountID).equals(adminOrder.accountID)
          expect(saleTx.reference).equals(adminOrder.reference1)

          const discountTx = adminOrder.transactions.find(tx => tx.type == "discount")
          expect(discountTx.grossAmount).equals('11.99')
          expect(discountTx.status).equals("paid")
          expect(discountTx.completedAt).to.not.equals(null)
          expect(discountTx.fromAccountID).equals(adminOrder.accountID)
          expect(discountTx.toAccountID).equals(null)
          expect(discountTx.reference).equals(adminOrder.reference1)

          const shippingTx = adminOrder.transactions.find(tx => tx.type == "shipping")
          expect(shippingTx.grossAmount).equals('5.00')
          expect(shippingTx.status).equals("paid")
          expect(shippingTx.completedAt).to.not.equals(null)
          expect(shippingTx.toAccountID).equals(adminOrder.accountID)
          expect(shippingTx.fromAccountID).equals(null)
          expect(shippingTx.reference).equals(adminOrder.reference1)
        })
      })

      it('idempotency test - Should prevent from generating the same order twice', () => {
        let adminOrder, consignorOrder
        // create shopify
        cy.task('createShopifyOrder').then((res) =>{
          adminOrder = res.admin
          consignorOrder = res.consignor
          return cy.task('createShopifyOrder', {id: adminOrder.foreignID})
        }).then((res) => {
          //fetch full orders for checks
          return cy.task('getOrders', {foreignID: adminOrder.foreignID})
        }).then((res) => {
          expect(res.length).equals(1)
        })
      })
    })

    describe('shopify/order/edited', () => {
      it('Add stock item to an existing order', () => {
        let adminOrder, consignorOrder, addedInvRecord = null

        cy.all([
          () => cy.task('createInventory', {quantity: 1, setAsDelivered: true}),
          () => cy.task('createShopifyOrder'),
          () => cy.task('get', 'retailer')
        ]).then(([createInventoryResp, createShopifyOrderResp, getRetailerResp]) => {
          addedInvRecord = createInventoryResp
          adminOrder = createShopifyOrderResp.admin
          consignorOrder = createShopifyOrderResp.consignor
          // add newly created admin inventory
          return cy.request({
            headers: {
              'Authorization': `Bearer ${getRetailerResp.apiKey}`,
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/ingress/shopify/order/edited",
            body: {
              shopifyOrder: {
                id: adminOrder.foreignID,
                shipping_address: {
                  "first_name": "test name",
                  "address1": "test address",
                  "phone": "0000873654",
                  "city": "london",
                  "zip": "00azh",
                  "country": "uk",
                  "countryCode": "uk",
                  "last_name": "test surname",
                  "address2": "00",
                  "latitude": null,
                  "longitude": null
                },
                line_items: [
                  {
                    "id": 768312548757563,
                    "variant_id": addedInvRecord.variant.foreignID,
                    "quantity": 1,
                    "vendor": null,
                    "product_id": addedInvRecord.product.ID,
                    "price": addedInvRecord.listings[0].payout,
                  }
                ]
              },
              orderEditContent: {
                line_items: {
                  additions: [
                    {
                      id: 768312548757563,
                      delta: 1
                    }
                  ]
                }
              }
            }
          })
        })
        .then((res) => {
          expect(res.status).equals(200)
          //fetch updated order
          return cy.task('getOrder', {ID: adminOrder.ID})
        }).then((order) => {
          console.log(order)
          //check that order line item was added
          const addedOrderLineItem = order.orderLineItems.find(oli => oli.inventoryID == addedInvRecord.ID)
          expect(addedOrderLineItem).to.not.equal(null)

          //check it was added at correct status
          expect(addedOrderLineItem.status.name).equal('fulfill')
          expect(order.status.name).equal('partially-confirmed')
          expect(order.quantity).equals(5)

          const shippingCosts = order.transactions.filter(tx => tx.type == 'shipping' && tx.toAccountID == order.accountID)
          let totalAmount = order.orderLineItems.reduce((tot, oli) => tot += parseFloat(oli.price), 0)
          if (shippingCosts.length > 0) {
            totalAmount += shippingCosts.reduce((totalAmount, tx) => totalAmount += parseFloat(tx.grossAmount), 0)
          }
          expect(order.totalAmount).equals(totalAmount.toFixed(2))

          // check that total sale order is correct
          const saleTxs = order.transactions.filter(tx => tx.type == "sale")
          expect(Math.round(saleTxs.reduce((sum, tx) => sum += parseFloat(tx.grossAmount), 0))).equals(Math.round(order.orderLineItems.reduce((sum, oli) => sum += parseFloat(oli.price), 0)))

          // check payouts transactions are correct
          const payoutTxs = order.transactions.filter(tx => tx.type == "payout")
          const consignedOlis = order.orderLineItems.filter(oli => oli.item.accountID != order.accountID)
          expect(payoutTxs.length).equals(consignedOlis.length)
          expect(Math.round(payoutTxs.reduce((sum, tx) => sum += parseFloat(tx.grossAmount), 0))).equals(Math.round(consignedOlis.reduce((sum, oli) => sum += parseFloat(oli.cost), 0)))
        })
      })

      it('Admin added consignor item to an order', () => {
        let adminOrder, consignorOrder, addedInvRecord, addedOrderLineItem = null

        cy.all([
          () => cy.task('createInventory', {quantity: 1, setAsDelivered: true, account: 'reseller'}),
          () => cy.task('createShopifyOrder'),
          () => cy.task('get', 'retailer')
        ])
        .then(([createInventoryResp, createShopifyOrderResp, getRetailerResp]) => {
          addedInvRecord = createInventoryResp
          adminOrder = createShopifyOrderResp.admin
          consignorOrder = createShopifyOrderResp.consignor

          const listing = createInventoryResp.listings.find(l => l.saleChannelID == 1)
          return cy.request({
            headers: {
              'Authorization': `Bearer ${getRetailerResp.apiKey}`,
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/ingress/shopify/order/edited",
            body: {
              shopifyOrder: {
                id: adminOrder.foreignID,
                shipping_address: {
                  "first_name": "test name",
                  "address1": "test address",
                  "phone": "0000873654",
                  "city": "london",
                  "zip": "00azh",
                  "country": "uk",
                  "countryCode": "uk",
                  "last_name": "test surname",
                  "address2": "00",
                  "latitude": null,
                  "longitude": null
                },
                line_items: [
                  {
                    "id": 768312548757563,
                    "variant_id": listing.variant.foreignID,
                    "quantity": 1,
                    "vendor": null,
                    "product_id": listing.product.ID,
                    "price":listing.payout,
                  }
                ]
              },
              orderEditContent: {
                line_items: {
                  additions: [
                    {
                      id: 768312548757563,
                      delta: 1
                    }
                  ]
                }
              }
            }
          })
        })
        .then((resp) => {
          adminOrder= resp.body
          //check that order line item was added
          addedOrderLineItem = adminOrder.orderLineItems.find(oli => oli.inventoryID == addedInvRecord.ID)
          //check that item was added
          expect(addedOrderLineItem).to.not.equal(null)
          //check it was added at correct status
          expect(addedOrderLineItem.status.name).equal('pending')
          //check that item added belongs to the consignor
          expect(addedOrderLineItem.item.accountID).equal(addedInvRecord.accountID)
          expect(adminOrder.status.name).equal('partially-confirmed')
          expect(adminOrder.quantity).equals(5)

          const shippingCosts = adminOrder.transactions.filter(tx => tx.type == 'shipping' && tx.toAccountID == adminOrder.accountID)
          let totalAmount = adminOrder.orderLineItems.reduce((tot, oli) => tot += parseFloat(oli.price), 0)
          if (shippingCosts.length > 0) {
            totalAmount += shippingCosts.reduce((totalAmount, tx) => totalAmount += parseFloat(tx.grossAmount), 0)
          }
          expect(adminOrder.totalAmount).equals(totalAmount.toFixed(2))

          // check that total sale order is correct
          const saleTxs = adminOrder.transactions.filter(tx => tx.type == "sale")
          expect(Math.round(saleTxs.reduce((sum, tx) => sum += parseFloat(tx.grossAmount), 0))).equals(Math.round(adminOrder.orderLineItems.reduce((sum, oli) => sum += parseFloat(oli.price), 0)))

          // check that total payout-athorized is correct
          // check payouts transactions are correct
          const payoutTxs = adminOrder.transactions.filter(tx => tx.type == "payout")
          const consignedOlis = adminOrder.orderLineItems.filter(oli => oli.item.accountID != adminOrder.accountID)
          expect(payoutTxs.length).equals(consignedOlis.length)
          expect(Math.round(payoutTxs.reduce((sum, tx) => sum += parseFloat(tx.grossAmount), 0))).equals(Math.round(consignedOlis.reduce((sum, oli) => sum += parseFloat(oli.cost), 0)))

          return cy.task('getOrders', {accountID: consignorOrder.accountID, parentOrderID: adminOrder.ID, type: 'outbound', account: 'reseller'})
        })
        .then((res) => {
          //find consignor order
          consignorOrder = res[0]
          //fetch full order
          return cy.task('getOrder', {ID: consignorOrder.ID, account: 'reseller'})
        })
        .then((res) => {
          consignorOrder = res
          //complete consignor order checks
          expect(consignorOrder.status.name).equal('pending')
          expect(consignorOrder.orderLineItems.length).equals(3)
          expect(consignorOrder.quantity).equals(3)
          expect(consignorOrder.totalAmount).equals(consignorOrder.orderLineItems.reduce((tot, oli) => tot += parseFloat(oli.price), 0).toFixed(2))

          //check that item added is the same
          expect(consignorOrder.orderLineItems[0].itemID).equals(addedOrderLineItem.itemID)
        })
      })

      it('Admin added virtual item to an order', () => {
          let order, addedInvRecord, addedOrderLineItem, sourceOrder = null

          cy.task('createShopifyOrder')
          .then((resp) => {
            order = resp.admin
            //create inventory to add
            return cy.task('createInventory', {virtual: true})
          }).then((inventory) => {
            addedInvRecord = inventory
            return cy.task('get', 'retailer')
          }).then(user => {
            // add newly created admin inventory
            return cy.request({
              headers: {
                'Authorization': `Bearer ${user.apiKey}`,
              },
              method: 'POST',
              url: Cypress.env('api') + "/api/bridge/ingress/shopify/order/edited",
              body: {
                shopifyOrder: {
                  id: order.foreignID,
                  shipping_address: {
                    "first_name": "test name",
                    "address1": "test address",
                    "phone": "0000873654",
                    "city": "london",
                    "zip": "00azh",
                    "country": "uk",
                    "last_name": "test surname",
                    "address2": "00",
                    "latitude": null,
                    "longitude": null
                  },
                  line_items: [
                    {
                      "id": 768312548757563,
                      "variant_id": addedInvRecord.variant.foreignID,
                      "quantity": 1,
                      "vendor": null,
                      "product_id": addedInvRecord.product.ID,
                      "grams": addedInvRecord.product.weight * 1000,
                      "price":addedInvRecord.listings[0].payout,
                    }
                  ]
                },
                orderEditContent: {
                  line_items: {
                    additions: [
                      {
                        id: 768312548757563,
                        delta: 1
                      }
                    ]
                  }
                }
              }
            })
          }).then((res) => {
            expect(res.status).equals(200)
            //fetch updated order
            return cy.task('getOrder', {ID: order.ID})
          }).then((res) => {
            order = res
            console.log(order)
            //check that order line item was added
            addedOrderLineItem = order.orderLineItems.find(oli => oli.productID == addedInvRecord.productID)
            //check that item was added
            expect(addedOrderLineItem).to.not.equal(null)
            //check it was added at correct status
            expect(addedOrderLineItem.status.name).equal('pending')
            expect(order.status.name).equal('partially-confirmed')
            expect(order.quantity).equals(5)

            const shippingCosts = order.transactions.filter(tx => tx.type == 'shipping' && tx.toAccountID == order.accountID)
            let totalAmount = order.orderLineItems.reduce((tot, oli) => tot += parseFloat(oli.price), 0)
            if (shippingCosts.length > 0) {
              totalAmount += shippingCosts.reduce((totalAmount, tx) => totalAmount += parseFloat(tx.grossAmount), 0)
            }
            expect(order.totalAmount).equals(totalAmount.toFixed(2))

              // check that total sale order is correct
            const saleTxs = order.transactions.filter(tx => tx.type == "sale")
            expect(Math.round(saleTxs.reduce((sum, tx) => sum += parseFloat(tx.grossAmount), 0))).equals(Math.round(order.orderLineItems.reduce((sum, oli) => sum += parseFloat(oli.price), 0)))

            return cy.task('getOrders', { reference1: `~sourcing for sale #${order.ID}`})
            //check that order in was generated for sourced items
          }).then((res) => {
            sourceOrder = res[0]
            expect(sourceOrder).to.not.equals(null)
            expect(sourceOrder.type.name).equals('inbound')
            expect(sourceOrder.quantity).equals(1)
          })
      })
    })

    describe('shopify/order/refund', () => {
      it('Should full refund, order cancelled and items restocked', () => {
        let adminOrder
        let consignorOrder;
        cy.task("createShopifyOrder")
        .then((order) => cy.all([
          () => cy.task('getOrder', {ID: order.admin.ID}),
          () => cy.task('getOrder', {ID: order.consignor.ID})
        ])).then((orders) => {
          adminOrder = orders[0]
          consignorOrder = orders[1]
          return cy.task('get', 'retailer')
        }).then(user => {
          const rnd_lineItems = []
          adminOrder.orderLineItems.map(oli => {
            const recordIdx = rnd_lineItems.findIndex(r => r.line_item.variant_id == oli.variant.foreignID)
            if (recordIdx != -1) {
              rnd_lineItems[recordIdx].quantity += 1
            } else {
              rnd_lineItems.push({
                quantity: 1,
                restock_type: 'cancel',
                line_item: {
                  product_exists: true,
                  variant_id: `${oli.variant.foreignID}`
                }
              })
            }
          })
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + `/api/bridge/ingress/shopify/order/refunded`,
            body: {
              order_id: adminOrder.foreignID,
              refund_line_items: rnd_lineItems
            }
          })
        }).then(resp => {
          expect(resp.status).equals(200)
          return cy.task('getOrder', {ID: adminOrder.ID})
        }).then((order) => {
          console.log(order)
          // order state
          expect(order.status.name).equals('deleted')

          //check olis state
          for (var oli of order.orderLineItems) {
            expect(oli.status.name).equals("deleted")
            expect(oli.canceledAt).to.not.equal(null)
            expect(oli.refundedAt).to.not.equal(null)
            expect(oli.fulfillmentID).equals(null)
            expect(oli.canceledReason).equals("")
            expect(oli.replacePending).equals(false)
  
            expect(oli.item.deletedAt).equals(null)
            expect(oli.item.inventoryID).to.not.equal(null)
            expect(oli.item.warehouseID).to.not.equal(null)
            expect(oli.item.statusID).equals(null)
          }

          //consignor payouts should be cancelled
          const consignorTransactions = order.transactions.filter(tx => tx.type == "payout")
          expect(consignorTransactions.filter(tx => tx.status == "canceled").length).equals(consignorTransactions.length)

          //there should be a transaction called refund equale to the sale grossAmount
          const sale = order.transactions.find(tx => tx.type == "sale")
          const saleRefund = order.transactions.find(tx => tx.type == "refund")
          expect(sale.grossAmount).equals(saleRefund.grossAmount)

        })
      })

      it('Should partially refund (1 of 2 retailer and 1 of 2 reseller) with items not restocked', () => {
        let adminOrder
        let consignorOrder;
        cy.task("createShopifyOrder")
        .then((order) => cy.all([
          () => cy.task('getOrder', {ID: order.admin.ID}),
          () => cy.task('getOrder', {ID: order.consignor.ID})
        ])).then((orders) => {
          adminOrder = orders[0]
          consignorOrder = orders[1]
          return cy.task('get', 'retailer')
        }).then(user => {
          const rnd_lineItems = []
          adminOrder.orderLineItems.map(oli => {
            const recordIdx = rnd_lineItems.findIndex(r => r.line_item.variant_id == oli.variant.foreignID)
            if (recordIdx == -1) {
              rnd_lineItems.push({
                quantity: 1,
                restock_type: 'no_restock',
                line_item: {
                  product_exists: true,
                  variant_id: `${oli.variant.foreignID}`
                }
              })
            }
          })
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + `/api/bridge/ingress/shopify/order/refunded`,
            body: {
              order_id: adminOrder.foreignID,
              refund_line_items: rnd_lineItems
            }
          })
        }).then(resp => {
          expect(resp.status).equals(200)
          return cy.task('getOrder', {ID: adminOrder.ID})
        }).then((order) => {
          // order state
          expect(order.status.name).equals('partially-confirmed')

          //check olis state
          expect(order.orderLineItems.filter(o => o.canceledAt != null).length).equals(2)
          for (var oli of order.orderLineItems.filter(o => o.canceledAt != null)) {
            const item = oli.item

            expect(oli.status.name).equals("deleted")
            expect(oli.canceledAt).to.not.equal(null)
            expect(oli.fulfillmentID).equals(null)
            expect(oli.canceledReason).equals("")
            expect(oli.replacePending).equals(false)
  
            expect(item.deletedAt).equals(null)
            expect(item.inventoryID).not.equals(null)
            expect(item.warehouseID).not.equals(null)
            expect(item.statusID).equals(null)
          }

          //consignor payouts should be cancelled
          const consignorTxCanceledAmount = order.transactions.filter(tx => tx.type == "payout" && tx.status == "canceled").reduce((tot, tx) => tot += parseFloat(tx.grossAmount), 0)
          const totAmountCanceled = order.orderLineItems.filter(oli => oli.canceledAt != null && oli.item.accountID != order.accountID).reduce((tot, oli) => tot += parseFloat(oli.cost), 0)
          expect(totAmountCanceled).equals(consignorTxCanceledAmount)

          const refundedAmount = order.orderLineItems.filter(oli => oli.canceledAt != null).reduce((sum, oli) => sum += parseFloat(oli.price), 0)
          const refundTx = order.transactions.find(tx => tx.type == "refund")
          expect(refundedAmount).equals(parseFloat(refundTx.grossAmount))
        })
      })

      it('Should handle scenario where olis already being cancelled in fliproom', () => {
        let adminOrder
        let consignorOrder;
        cy.task("createShopifyOrder")
        .then((order) => cy.all([
          () => cy.task('getOrder', {ID: order.admin.ID}),
          () => cy.task('getOrder', {ID: order.consignor.ID})
        ])).then((orders) => {
          adminOrder = orders[0]
          consignorOrder = orders[1]
          return cy.task('cancelOrder', {orderID: adminOrder.ID, orderLineItems: adminOrder.orderLineItems})
        })
        .then(() => cy.login('retailer'))
        .then((user) => {
          const rnd_lineItems = []
          adminOrder.orderLineItems.map(oli => {
            const recordIdx = rnd_lineItems.findIndex(r => r.line_item.variant_id == oli.variant.foreignID)
            if (recordIdx != -1) {
              rnd_lineItems[recordIdx].quantity += 1
            } else {
              rnd_lineItems.push({
                quantity: 1,
                restock_type: 'cancel',
                line_item: {
                  product_exists: true,
                  variant_id: `${oli.variant.foreignID}`
                }
              })
            }
          })
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + `/api/bridge/ingress/shopify/order/refunded`,
            body: {
              order_id: adminOrder.foreignID,
              refund_line_items: rnd_lineItems
            }
          })
        }).then((resp) => {
          expect(resp.status).equals(200)
        })
      })
    })

    describe('shopify/product/updated', () => {
      it('Product Updated by adding variants and images', () => {
        let product
        const body = {
          variants: [
            {foreignID: '1111111111111', title: 'variant 1',     },
            {foreignID: '2222222222222', title: 'variant 2',     },
            {foreignID: '3333333333333', title: 'variant 3',     },
            {foreignID: '6666666666666', title: 'variant 4 5kg', },
          ]
        }
        cy.task('createProduct', body)
        .then((_product) => {
          console.log(_product)
          product = _product
          return cy.login('retailer')
        }).then((user) => {
            return cy.request({
              headers: {
                authorization: `Bearer ${user.apiKey}`
              },
              method: 'POST',
              url: Cypress.env('api') + "/api/bridge/ingress/shopify/product/updated",
              body: {
                id: product.foreignID,
                product_type: "test category edited",
                title: "test product created",
                variants: [
                  {id: '1111111111111', title: 'variant 1 upated',     grams: 1000, sku: null}, //test first sku missing problem
                  {id: '2222222222222', title: 'variant 2 upated',     grams: 2000, sku: 'BN867575'},
                  {id: '3333333333333', title: 'variant 3 upated',     grams: 3000, sku: 'BN867575'},
                  //{id: '6666666666666', title: 'variant 4 updated', grams: 5000, sku: 'BN867575'}, don't include to simulate variant deleted
                  {id: '0000000000000', title: 'new variant',   grams: 1000, sku: 'BN867575'},
                ],
                images: [
                  {id: '222222222222', src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 4},
                  {id: '222222222222', src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 2},
                  {id: '333333333333', src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/eurocave/logo.svg', position: 3},
                  {id: '444444444444', src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/schmidt/logo.png', position: 1},
                ]
              }
            })
        })
        .then((resp) => {
          expect(resp.status).equals(200)
          console.log(resp.body)
          expect(resp.body.code).not.equals(null) //check that first variant without sku doesn't set the product code to empty
          expect(resp.body.variants.length).equals(4)
          const refImage = resp.body.images.find(img => img.position == 0)
          expect(refImage.src).equals('https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/schmidt/logo.png')
          expect(resp.body.imageReference).equals(refImage.src)
        })
    
    
      })
    
      it('Product has been untracked on shopify', () => {
        // Create product
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
            title: "test product created " + (Math.random() + 1).toString(36).substring(7),
            variants: [
              {id: 1111111111111, title: 'variant 1', grams: 1000, sku: 'DB009876'},
              {id: 2222222222222, title: 'variant 2', grams: 2000, sku: 'DB009876'},
            ],
            images: [
              {id: 1111111111111, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 0},
              {id: 2222222222222, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 1},
            ]
          }
        })
        }).then((resp) => {
          const product = resp.body
          return cy.task('createInventory', {reference1: 'untrack-test-4', quantity: 3, productID: product.ID, productVariantID: product.variants[0].ID, setAsDelivered: true})
        }).then((resp) => {
          return cy.task('get', 'retailer')
        })
        .then((user) => {
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/ingress/shopify/product/updated",
            body: {
              id: product_id,
              product_type: "test category",
              title: "test product created " + (Math.random() + 1).toString(36).substring(7),
              tags: 'wiredhub-untracked',
              variants: [
                {id: 1111111111111, title: 'variant 1', grams: 1000, sku: 'DB009876'},
                {id: 2222222222222, title: 'variant 2', grams: 2000, sku: 'DB009876'},
              ],
              images: [
                {id: 1111111111111, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 0},
                {id: 2222222222222, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 1},
              ]
            }
          })
        })
        .then((resp) => {
          console.log(resp)
        })
      })

      it('Untracked Product is updated on Shopify', () => {
        let user;
        const product_id = Math.random().toString(36).slice(2)
        cy.login('retailer')
        .then((_user) => {
          user = _user
          return cy.request({
            headers: {
              authorization: `Bearer ${_user.apiKey}`
            },
          method: 'POST',
          url: Cypress.env('api') + "/api/bridge/ingress/shopify/product/created",
          body: {
            id: product_id,
            product_type: "test category",
            title: "test product created " + (Math.random() + 1).toString(36).substring(7),
            tags: 'wiredhub-untracked',
            variants: [
              {id: 1111111111111, title: 'variant 1', grams: 1000, sku: 'DB009876', position: 1},
              {id: 2222222222222, title: 'variant 2', grams: 2000, sku: 'DB009876', position: 2},
            ],
            images: [
              {id: 1111111111111, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 0},
              {id: 2222222222222, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 1},
            ]
          }
        })
        }).then((resp) => {
          const product = resp.body
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/ingress/shopify/product/updated",
            body: {
              id: product_id,
              product_type: "test category",
              title: "test product created " + (Math.random() + 1).toString(36).substring(7),
              tags: 'wiredhub-untracked',
              //status: 'draft',
              variants: [
                {id: 1111111111111, title: 'variant 1 updated', grams: 1000, sku: 'DB009876'},
                {id: 2222222222222, title: 'variant 2 updated', grams: 2000, sku: 'DB009876'},
              ],
              images: [
                {id: 1111111111111, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 0},
                {id: 2222222222222, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 1},
              ]
            }
          })
        })
        .then((resp) => {
          expect(resp.body.variants[0].name).equals('variant 1 updated')
          expect(resp.body.variants[0].untracked).equals(true)
          expect(resp.body.variants[1].name).equals('variant 2 updated')
          expect(resp.body.variants[1].untracked).equals(true)
          expect(resp.body.variants.length).equals(2)
        })
      })

      it('Shopify Product without variant SKUs is updated on Shopify', () => {
        let user;
        const product_id = Math.random().toString(36).slice(2)
        cy.login('retailer')
        .then((_user) => {
          user = _user
          return cy.request({
            headers: {
              authorization: `Bearer ${_user.apiKey}`
            },
          method: 'POST',
          url: Cypress.env('api') + "/api/bridge/ingress/shopify/product/created",
          body: {
            id: product_id,
            product_type: "test category",
            title: "test product created " + (Math.random() + 1).toString(36).substring(7),
            variants: [
              {id: 1111111111111, title: 'variant 1', grams: 1000, sku: '', position: 1},
              {id: 2222222222222, title: 'variant 2', grams: 2000, sku: '', position: 2},
            ],
            images: [
              {id: 1111111111111, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 0},
              {id: 2222222222222, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 1},
            ]
          }
        })
        }).then((resp) => {
          const product = resp.body
          console.log(product)
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/ingress/shopify/product/updated",
            body: {
              id: product_id,
              product_type: "test category",
              title: "test product created " + (Math.random() + 1).toString(36).substring(7),
              variants: [
                {id: 1111111111111, title: 'variant 1 updated', grams: 1000, sku: null},
                {id: 2222222222222, title: 'variant 2 updated', grams: 2000, sku: null},
              ],
              images: [
                {id: 1111111111111, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', position: 0},
                {id: 2222222222222, src: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/clients/boffi/logo.png', position: 1},
              ]
            }
          })
        })
        .then((resp) => {
          console.log(resp.body)
          expect(resp.body.variants[0].name).equals('variant 1 updated')
          expect(resp.body.variants[1].name).equals('variant 2 updated')
          expect(resp.body.variants.length).equals(2)
        })
      })
    })

    describe('shopify/fulfillment/created', () => {
      it('Fulfillment created with all the order items', () => {
        let order;
        cy.task('createOrder', {type: 'outbound'})
            .then((_order) => {
              order = _order
              return cy.task('get', 'retailer')
            })
            .then((user) => {
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/ingress/shopify/fulfillment/created",
                body: {
                  id: order.foreignID,
                  order_id: order.foreignID,
                  tracking_number: '123456789',
                  name: 'fulfillment name',
                  line_items: order.orderLineItems.map(oli => {return {
                    variant_id: oli.variant.foreignID,
                    quantity: 1
                  }})
                }
              })
            }).then((resp) => {
          expect(resp.status).equals(200)
          const fulfillment = resp.body
          console.log(fulfillment)
          expect(fulfillment.orderLineItems.length).equals(order.orderLineItems.length)
        })

      })

      it('Fulfillment created with partial order items', () => {
        let order;
        cy.task('createOrder', {type: 'outbound', productQty: [2, 2, 2]})
            .then((_order) => {
              order = _order
              return cy.task('get', 'retailer')
            })
            .then((user) => {
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/ingress/shopify/fulfillment/created",
                body: {
                  id: order.foreignID,
                  order_id: order.foreignID,
                  tracking_number: '123456789',
                  name: 'fulfillment name',
                  line_items: [
                    {variant_id: order.orderLineItems[0].variant.foreignID, quantity: 2},
                    {variant_id: order.orderLineItems[2].variant.foreignID, quantity: 1},
                  ]
                }
              })
            }).then((resp) => {
          expect(resp.status).equals(200)
          const fulfillment = resp.body
          console.log(fulfillment)
          expect(fulfillment.orderLineItems.length).equals(3)
        })

      })

      it('Fulfillment created with partial order items twice', () => {
        let order, user, fulfillment1, fulfillment2;
        cy.task('createOrder', {type: 'outbound', productQty: [2, 2, 2]})
            .then((_order) => {
              order = _order
              return cy.task('get', 'retailer')
            })
            .then((_user) => {
              user = _user
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/ingress/shopify/fulfillment/created",
                body: {
                  id: `${Math.random().toString(36).slice(2)}`,
                  order_id: order.foreignID,
                  tracking_number: '123456789',
                  name: 'fulfillment name',
                  line_items: [
                    {variant_id: order.orderLineItems[0].variant.foreignID, quantity: 2},
                    {variant_id: order.orderLineItems[2].variant.foreignID, quantity: 1},
                  ]
                }
              })
            }).then((resp) => {
          expect(resp.status).equals(200)
          const fulfillment = resp.body
          fulfillment1 = fulfillment
          expect(fulfillment.orderLineItems.length).equals(3)
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/ingress/shopify/fulfillment/created",
            body: {
              id: `${Math.random().toString(36).slice(2)}`,
              order_id: order.foreignID,
              tracking_number: '123456789',
              name: 'fulfillment name',
              line_items: [
                {variant_id: order.orderLineItems[3].variant.foreignID, quantity: 1},
                {variant_id: order.orderLineItems[4].variant.foreignID, quantity: 2},
              ]
            }
          })
        })
            .then((resp) => {
              expect(resp.status).equals(200)
              const fulfillment = resp.body
              fulfillment2 = fulfillment
              expect(fulfillment.orderLineItems.length).equals(3)
              const itemsLeftToBeFulfilled = order.orderLineItems.filter(oli => !fulfillment1.orderLineItems.find(foli => foli.ID == oli.ID) && !fulfillment2.orderLineItems.find(foli => foli.ID == oli.ID))
              expect(itemsLeftToBeFulfilled.length).equals(0)
            })
      })
    })

    describe('stock-x/product/updated', () => {
      it("Should Update public product with new data", () => {
        let publicProduct
        cy.request({
          method: 'POST',
          url: Cypress.env('api') + "/api/bridge/ingress/stock-x/product/created",
          body: {
            ID: 100000,
            stockxId: `6f88fc3e-2411-4a68-a0bf-e834f091-${Math.random().toString(36).slice(2)}`,
            brand: 'JORDAN',
            title: `JORDAN Webhook Test Product - ${Math.random().toString(36).slice(2)}`,
            description: 'This is just a simple description for webhook product',
            styleId: '04102022',
            eanCode: '04102022',
            imageReferenceUrl: 'https://images.squarespace-cdn.com/content/v1/62e96c41a63efd5ce904c05d/d5bcce2a-336a-414a-9ec0-1d9df293f9d1/Artboard+11%406x.png',
            price: 500,
            category2: 'sub-category',
            releaseDate: '2023-06-14T00:00:00.000Z',
            gender: 'unisex',
            color: 'here some colors',
            retailPrice: '199.78',
            variants: [
              {
                ID: 100001,
                extraSizes: 'Jordan variant 1',
                stockxId: `6f88fc3e-2411-4a68-a0bf-${Math.random().toString(36).slice(2)}`,
                gtin: `${Math.random().toString(36).slice(2)}`,
                position: 2
              },
              {
                ID: 100002,
                extraSizes: 'Jordan variant 2',
                stockxId: `6f88fc3e-2411-4a68-a0bf-${Math.random().toString(36).slice(2)}`,
                gtin: null,
                position: 0
              },
              {
                ID: 100003,
                extraSizes: 'Jordan variant 3',
                stockxId: `6f88fc3e-2411-4a68-a0bf-${Math.random().toString(36).slice(2)}`,
                gtin: `${Math.random().toString(36).slice(2)}`,
                position: 1
              }
            ]
          }
        })
        .then(resp => {
          publicProduct = resp.body
          return cy.task('login', 'retailer')
        })
        .then(user => {
          //values to update
          publicProduct.category2 = `${publicProduct.category2} ${Math.random().toString(36).slice(2)}`
          publicProduct.gender = `${publicProduct.gender} ${Math.random().toString(36).slice(2)}`
          publicProduct.color = `${publicProduct.color} ${Math.random().toString(36).slice(2)}`
          publicProduct.brand = `${publicProduct.brand} ${Math.random().toString(36).slice(2)}`
          //update variant gtin 
          publicProduct.variants[0].gtin = `${Math.random().toString(36).slice(2)}`
          publicProduct.variants[0].lowestAsk = 200
          //set variant gtin
          publicProduct.variants[1].gtin = `${Math.random().toString(36).slice(2)}`
          publicProduct.variants[1].lowestAsk = 100
          //update variant gtin to null
          publicProduct.variants[2].gtin = null
          publicProduct.variants[2].lowestAsk = null

          delete publicProduct.category
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/ingress/stock-x/product/updated",
            body: publicProduct,
            timeout: 60000000,
          })
        }).then((resp) => {
          const product = resp.body
          expect(publicProduct.category2).equals(product.category2)
          expect(publicProduct.gender).equals(product.gender)
          expect(publicProduct.color).equals(product.color)
          expect(publicProduct.brand).equals(product.brand)
          expect(product.variants[0].gtin).equals(publicProduct.variants[0].gtin)
          expect(product.variants[0].price).equals(publicProduct.variants[0].lowestAsk.toFixed(2))

          expect(product.variants[1].gtin).equals(publicProduct.variants[1].gtin)
          expect(product.variants[1].price).equals(publicProduct.variants[1].lowestAsk.toFixed(2))

          expect(product.variants[2].gtin).not.equals(null) //should not udpate gtin of the variant to null if not on stockx anymore
          expect(product.variants[2].price).equals(null) //should set the price to null if not available anymore
        })
      })
    })

    describe('stock-x/product/created', () => {
      it('Should import a new product', () => {
        const body = {
          ID: 100000,
          stockxId: `6f88fc3e-2411-4a68-a0bf-e834f091-${Math.random().toString(36).slice(2)}`,
          brand: 'JORDAN',
          title: `JORDAN Webhook Test Product - ${Math.random().toString(36).slice(2)}`,
          description: 'This is just a simple description for webhook product',
          styleId: '04102022',
          eanCode: '04102022',
          imageReferenceUrl: 'https://images.stockx.com/360/Air-Jordan-1-High-OG-UNC-Toe/Images/Air-Jordan-1-High-OG-UNC-Toe/Lv2/img01.jpg',
          price: 500,
          category2: 'sub-category',
          releaseDate: '2023-06-14',
          gender: 'unisex',
          color: 'here some colors',
          retailPrice: '199.78',
          variants: [
            {
              ID: 100001,
              extraSizes: 'Jordan variant 1',
              stockxId: `6f88fc3e-2411-4a68-a0bf-${Math.random().toString(36).slice(2)}`,
              gtin: `${Math.random().toString(36).slice(2)}`,
              position: 2
            },
            {
              ID: 100002,
              extraSizes: 'Jordan variant 2',
              stockxId: `6f88fc3e-2411-4a68-a0bf-${Math.random().toString(36).slice(2)}`,
              gtin: `${Math.random().toString(36).slice(2)}`,
              position: 0
            },
            {
              ID: 100003,
              extraSizes: 'Jordan variant 3',
              stockxId: `6f88fc3e-2411-4a68-a0bf-${Math.random().toString(36).slice(2)}`,
              gtin: `${Math.random().toString(36).slice(2)}`,
              position: 1
            }
          ]
        }
        cy.request({
          method: 'POST',
          url: Cypress.env('api') + "/api/bridge/ingress/stock-x/product/created",
          body: body
        })
        .then(resp => {
          const publicProduct = resp.body
          expect(resp.status).equals(200)
          expect(publicProduct.accountID).equals(null)
          expect(publicProduct.code).equals(body.styleId)
          expect(publicProduct.title).equals(body.title)
          expect(publicProduct.description).equals(body.description)
          expect(publicProduct.status).equals("active")
          expect(publicProduct.stockxId).equals(body.stockxId)
          expect(publicProduct.brand).equals(body.brand)
          expect(publicProduct.public).equals(true)
          expect(publicProduct.imageReference.includes('https://storage.googleapis.com/staging-wiredhub/resources/')).equals(true)
          expect(publicProduct.category2).equals(body.category2)
          expect(publicProduct.releaseDate).equals(body.releaseDate)
          expect(publicProduct.gender).equals(body.gender)
          expect(publicProduct.colors).equals(body.colors)
          expect(publicProduct.retailPrice).equals(body.retailPrice)
          
          expect(publicProduct.variants.length).equals(body.variants.length)
          for (var variant of publicProduct.variants) {
            const stockxVariant = body.variants.find(v => v.stockxId == variant.stockxId)
            expect(variant.position).equals(stockxVariant.position)
            expect(variant.name).equals(stockxVariant.extraSizes)
          }

          expect(publicProduct.images.length).equals(1)
        })
      })
    })

    describe('stripe/payout/updated', () => {
      it('Should set a stripe transaction as paid', () => {
        const stripeID = `${Math.random().toString(36).slice(2)}`
        let tx;
        cy.task('createShopifyOrder')
        .then(orders => {
          const payoutTx = orders.admin.transactions.find(tx => tx.type == "payout")
          return cy.task('updateTransaction', {ID: payoutTx.ID, updates: { stripeID: stripeID}})
        })
        .then((tx) => cy.login('retailer'))
        .then(user => cy.request({
          method: 'POST',
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          url: Cypress.env('api') + "/api/bridge/ingress/stripe/payout/updated",
          body: {
            data: {
              object: {
                id: stripeID,
                status: "paid",
              }
            }
          }
      }))
        .then((res) => {
          expect(res.status).equals(200)
        })
      })
    })

    describe('stripe/payout/failed', () => {
      it('Should set a stripe transaction as failed', () => {
        const stripeID = `${Math.random().toString(36).slice(2)}`
        let tx;
        cy.task('createShopifyOrder')
        .then(orders => {
          const payoutTx = orders.admin.transactions.find(tx => tx.type == "payout")
          return cy.task('updateTransaction', {ID: payoutTx.ID, updates: { stripeID: stripeID}})
        })
        .then((tx) => cy.login('retailer'))
        .then(user => cy.request({
          method: 'POST',
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          url: Cypress.env('api') + "/api/bridge/ingress/stripe/payout/failed",
          body: {
            data: {
              object: {
                id: stripeID,
                status: "failed",
              }
            }
          }
      }))
        .then((res) => {
          const tx = res.body
          expect(res.status).equals(200)
          expect(tx.revertedAt).not.equals(null)
          expect(tx.status).equals("reverted")
        })
      })
    })

    describe('stripe/account/updated', () => {
      it('Should throw 400 for a account with incomplete setup', () => {
        cy.task('login', 'retailer')
            .then(user => {
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/ingress/stripe/account/updated",
                timeout: 60000000,
                failOnStatusCode: false,
                body: {
                  "data": {
                    "object": {
                      "id": "acct_1032D82eZvKYlo2C",
                      "details_submitted": false
                    }
                  },
                  "account": "acct_1032D82eZvKYlo2C" // Only there for express account
                }
              })
            })
            .then((resp) => {
              expect(resp.status).equals(400)
            })
      })

      it('Should mimic a successful stripe connect account setup', () => {
        let authUser, stripeConnectAccountID;
        cy.task('login', 'retailer')
            .then(user => {
              authUser = user
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + `/api/account/${user.accountID}/stripe/connect-account-setup`,
                timeout: 60000000,
              })
            })
            .then(resp => {
              stripeConnectAccountID = resp.body.match(/(?=acct)[\s\S]*?(?=\/)/g)[0];
              return cy.request({
                headers: {
                  authorization: `Bearer ${authUser.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/ingress/stripe/account/updated",
                timeout: 60000000,
                body: {
                  "data": {
                    "object": {
                      "id": stripeConnectAccountID,
                      "details_submitted": true
                    }
                  },
                  "account": stripeConnectAccountID // Only there for express account
                }
              })
            })
            .then((resp) => {
              const account = resp.body
              expect(resp.status).equals(200)
              expect(account.stripeConnectAccountID).equals(stripeConnectAccountID)
              expect(account.stripeConnectAccountSetupCompleted).equals(true)

            })
      })
   })

   describe('stripe/payment-intent/created', () => {
     it('Should mimic a successful response for a payment_intent.created event from stripe', () => {
        let inventory, psUser;
        cy.task('createInventory', {account: 'retailer', setAsDelivered: true})
        .then((_inventory) => {
          inventory = _inventory
          return cy.task('login', 'personal-shopper')
        })
        .then(user => {
          psUser = user
          const listingToSell = inventory.listings.find(listing => listing.saleChannelID == 1)
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + `/api/order/sale-order`,
            body: {
              accountID: 3,
              saleChannelID: 1,
              type: 'outbound',
              consignorID: inventory.warehouse.addressID,
              consigneeID: inventory.warehouse.addressID,
              notes: "some test notes",
              details: [
                {inventoryListingID: listingToSell.ID, quantity: inventory.quantity, price: listingToSell.price + 100},
              ],
              transactions: [
                {type: 'sale', grossAmount: listingToSell.price, currency: 'gbp'},
                {type: 'shipping', grossAmount: '10.00', currency: 'gbp'}
              ]
            }
          })
        })
        .then((resp) => {
          const order = resp.body
          return cy.request({
            headers: {
              authorization: `Bearer ${psUser.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/ingress/stripe/payment-intent/created",
            timeout: 60000000,
            body: {
              "id": "cs_test_a1lJGmxOb6ZJA5KdmtZOjyyWb7EQs0FEAnKZSOx3ESeXVTJf5AEMQrExGG",
              "payment_intent": "pi_1Gt0PX2eZvKYlo2CtOWz03Nm",
              "transfer_group": `${order.ID}`
            }
          })
        })
        .then(resp => {
          expect(resp.status).equals(200)
          const saleOrder = resp.body
          
          const saleTx = saleOrder.transactions.find(tx => tx.type == 'sale')
          expect(saleTx.status).equals("processing")

          const shippingTx = saleOrder.transactions.find(tx => tx.type == 'shipping')
          expect(shippingTx.status).equals("processing")
        })
     })
   })

   describe('stripe/charge/succeeded', () => {
     it('Should mimic a successful response for a charge.succeeded event from stripe', () => {
      let inventory, psUser;
      const balance_transaction = `txn_1032Rp2eZvK${Math.random().toString(36).slice(2)}`
      const psFee = 100
      cy.task('createInventory', {account: 'retailer', setAsDelivered: true})
      .then((_inventory) => {
        inventory = _inventory
        return cy.task('login', 'personal-shopper')
      })
      .then(user => {
        psUser = user
        const listingToSell = inventory.listings.find(listing => listing.saleChannelID == 1)
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/order/sale-order`,
          body: {
            accountID: 3,
            saleChannelID: 1,
            type: 'outbound',
            consignorID: inventory.warehouse.addressID,
            notes: "some test notes",
            details: [
              {inventoryListingID: listingToSell.ID, quantity: inventory.quantity, price: listingToSell.price + psFee},
            ],
            transactions: [
              {type: 'sale', grossAmount: listingToSell.price, currency: 'gbp', status: 'processing'}, // NOTE:  Status is hardcoded to processing as if checkout.session.completed is already triggered
              {type: 'shipping', toAccountID: 3, grossAmount: '10.00', currency: 'gbp', status: 'processing'}, // NOTE:  Status is hardcoded to processing as if checkout.session.completed is already triggered
              {type: 'payout', toAccountID: psUser.accountID, grossAmount: psFee, currency: 'gbp', status: 'processing'} // NOTE:  Status is hardcoded to processing as if checkout.session.completed is already triggered
            ]
          }
        })
      })
      .then(resp => {
        const order = resp.body
        return cy.request({
          headers: {
            authorization: `Bearer ${psUser.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + "/api/bridge/ingress/stripe/charge/succeeded",
          timeout: 60000000,
          body: {
            "id": "ch_1OI7Bd2eZvKYlo2CKWBBuedy",
            "amount_captured": 1000,
            "balance_transaction": balance_transaction,
            "transfer_group": `${order.ID}`
          }
        })
      })
      .then(resp => {
        expect(resp.status).equals(200)

        const saleOrder = resp.body
        console.log(saleOrder)
          
        const saleTx = saleOrder.transactions.find(tx => tx.type == 'sale')
        expect(saleTx.stripeID).equals(balance_transaction)

        const shippingTx = saleOrder.transactions.find(tx => tx.type == 'shipping')
        expect(shippingTx.stripeID).equals(balance_transaction)

        const psPayoutTx = saleOrder.transactions.find(tx => tx.type == 'payout')
        expect(psPayoutTx.stripeID).equals(balance_transaction)

      })
     })
   })

   describe('ship-engine/shipment/updated', () => {
     it('Should update a fulfillment to dispatched - ups fulfillment', () => {
       let trackingNumber = `${Math.random().toString(36).slice(2)}`

        cy.task('createOrder', {type: 'outbound', fulfillment: {courier: 'ups', courierServiceCode: 'ups_next_day_air'}})
        .then((order) => cy.task('updateFulfillment', {ID: order.fulfillments[0].ID, orderID: order.ID, updates: {trackingNumber: trackingNumber}}))
        .then(() => cy.login('retailer'))
        .then((user) => {
          return cy.request({
            method: 'POST',
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            url: Cypress.env('api') + "/api/bridge/ingress/ship-engine/shipment/updated",
            body: {
              "resource_url": `https://api.shipengine.com/v1/tracking?carrier_code=usps&tracking_number=${trackingNumber}`,
              "resource_type": "API_TRACK",
              "data": {
                tracking_number: trackingNumber,
                carrier_status_code: "P"
              }
            }
          })
        })
        .then(resp => {
          expect(resp.status).equals(200)
          expect(resp.body.status.name).equals('transit')
        })
      })

      it('Should not find the fulfillment', () => {
        const trackingNumber = `${Math.random().toString(36).slice(2)}`

        cy.task('createOrder', {type: 'outbound', fulfillment: {trackingNumber: trackingNumber}})
        .then(() => cy.login('retailer'))
        .then((user) => {
          return cy.request({
            method: 'POST',
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            url: Cypress.env('api') + "/api/bridge/ingress/ship-engine/shipment/updated",
            body: {
              "resource_url": `https://api.shipengine.com/v1/tracking?carrier_code=usps&tracking_number=00000`,
              "resource_type": "API_TRACK",
              "data": {
                tracking_number: '00000',
                status_code: "AC"
              }
            },
            failOnStatusCode: false
          })
        })
        .then(resp => {
          expect(resp.status).equals(404)
        })
      })
    })

    describe('revolut/events', () => {
      it('Should update a revolut transaction and set it as completed', () => {
        let payoutTx;
        let revolutTransactionID = `${Math.random().toString(36).slice(2)}`
        cy.task("createShopifyOrder")
        .then((orders) => {
          payoutTx = orders.admin.transactions.find(tx => tx.type == "payout")
          return cy.task("updateTransaction", {ID: payoutTx.ID, updates: {revolutTransactionID: revolutTransactionID}})
        }).then(() => cy.login('retailer'))
        .then((user) => {
          return cy.request({
            method: 'POST',
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            url: Cypress.env('api') + "/api/bridge/ingress/revolut/transaction/updated",
            body: {
              "event": "TransactionStateChanged",
              "timestamp": "2023-04-06T12:21:49.865Z",
              "data": {
                "id": revolutTransactionID,
                "request_id": "6a8b2ad9-d8b9-4348-9207-1c5737ccf11b",
                "old_state": "pending",
                "new_state": "completed"
              }
            }
          })
        })
        .then(resp => {
          expect(resp.status).equals(200)
          expect(resp.body.status).equals("paid")
          expect(resp.body.completedAt).not.equals(null)
        })
      })

      it('Should update a revolut transaction and set it as reverted', () => {
        let payoutTx;
        let revolutTransactionID = `${Math.random().toString(36).slice(2)}`
        cy.task("createShopifyOrder")
        .then((orders) => {
          payoutTx = orders.admin.transactions.find(tx => tx.type == "payout")
          return cy.task("updateTransaction", {ID: payoutTx.ID, updates: {revolutTransactionID: revolutTransactionID}})
        }).then(() => cy.login('retailer'))
        .then((user) => {
          return cy.request({
            method: 'POST',
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            url: Cypress.env('api') + "/api/bridge/ingress/revolut/transaction/updated",
            body: {
              "event": "TransactionStateChanged",
              "timestamp": "2023-04-06T12:21:49.865Z",
              "data": {
                "id": revolutTransactionID,
                "request_id": "6a8b2ad9-d8b9-4348-9207-1c5737ccf11b",
                "old_state": "pending",
                "new_state": "reverted"
              }
            }
          })
        })
        .then(resp => {
          expect(resp.status).equals(200)
          expect(resp.body.status).equals("reverted")
          expect(resp.body.revertedAt).not.equals(null)
        })
      })
    })
  })

  describe("egress", () => {

    describe('shopify/product/created', () => {
      it('Create a simple product and upload it to Shopify', () => {
        let product,user;
        cy.login('retailer')
        .then((_user) => {
          user = _user;
          return cy.task('createProduct', {
            title: 'test product 10',
            variants: [
              { name: 'variant 1', price: 100, sku: 'sku1' },
            ],
            account: 'retailer'
          })
        })
        .then((_product) => {
          product = _product;
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/egress/shopify/product/create",
            body: product
          })
        })
        .then((resp) => {
          expect(resp.body.title).equals(product.title)
          expect(resp.body.body_html).equals(product.description)
          expect(resp.body.variants.length).equals(product.variants.length)
          expect(resp.body.variants[0].title).equals(product.variants[0].name)
          expect(resp.body.variants[0].price).equals(product.variants[0].price || 0)
        })
      })
    })

    describe('shopify/product/updated', () => {
      it('Should update product information on Shopify', () => {
        let product;
        cy.task("createProduct")
        .then((res) => {
          product = res
          return cy.login('retailer')
        })
        .then((user) => {
          product.title = `${product.title} - updated`
          product.variants[0].name = `${product.variants[0].name} - updated`
          return cy.request({
            headers: {
                authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/egress/shopify/product/update",
            body: product
          })
        }).then((response) => {
          expect(response.body.title).equals(product.title)
          expect(response.body.variants[0].title).equals(product.variants[0].name)
        })
      })
    })

    describe('shopify/variant/sync', () => {
      it('Should prioritize lowest price', () => {
        let inventory1, inventory2;
        cy.task("createInventory", {key: 'inventory1', payout: 999, quantity: 3, setAsDelivered: true})
        .then((inventory)=> {
          inventory1 = inventory
          return cy.task("createInventory", {key: 'inventory2', productID: inventory.productID, productVariantID: inventory.productVariantID, cost: 30, payout: 111, quantity: 11, setAsDelivered: true})
        })
        .then((inventory) => {
          inventory2 = inventory
          return cy.request({
            headers: {
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/egress/shopify/variant/sync",
            body: {
              variantID: inventory1.productVariantID
            }
          })
        }).then((response) => {
          console.log(response.body)
          expect(response.body.salePrice).equals('111.00')
          expect(response.body.quantity).equals(11)
          expect(response.body.metatags["stock.type"]).equals("store")
          expect(response.body.metatags["stock.locationId"]).equals(1)
        })
        
      })

      it('Should prioritize stock over virtual stock', () => {
        let inventory1, inventory2;
        cy.task("createInventory", {key: 'inventory1', payout: 100, quantity: 3, setAsDelivered: true})
        .then((inventory)=> {
          inventory1 = inventory
          return cy.task("createInventory", {key: 'inventory2', productID: inventory.productID, productVariantID: inventory.productVariantID, virtual: 1, payout: 100})
        })
        .then((inventory) => {
          inventory2 = inventory
          return cy.request({
            headers: {
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/egress/shopify/variant/sync",
            body: {
              variantID: inventory1.productVariantID
            }
          })
        }).then((response) => {
          console.log(response.body)
          expect(response.body.salePrice).equals('100.00')
          expect(response.body.quantity).equals(3)
          expect(response.body.metatags["stock.type"]).equals("store")
          expect(response.body.metatags["stock.locationId"]).equals(1)
        })
      })

      it('Should set virtual stock', () => {
        cy.task("createInventory", {key: 'inventory2', virtual: 1, payout: 100})
        .then((inventory) => {
          return cy.request({
            headers: {
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/egress/shopify/variant/sync",
            body: {
              variantID: inventory.productVariantID
            }
          })
        }).then((response) => {
          expect(response.body.salePrice).equals('100.00')
          expect(response.body.quantity).equals(10)
          expect(response.body.metatags["stock.type"]).equals("sourcing")
          expect(response.body.metatags["stock.locationId"]).equals("null")
        })
      })

      it('Should Prioritize listing at internal location when priority margin not beat', () => {
        let selectedInventoryListing, inventory2;
        
        cy.task("createInventory", {key: 'inventory1', payout: 150, quantity: 1, setAsDelivered: true})
        .then((inventory)=> {
          const shopifySaleChannel =(inventory.listings.find(listing => listing.saleChannel.platform == 'shopify')).saleChannel // shopify sale channel
           //generate a payout that is a lower price than the selected one but not bigger than the internal priority margin
          selectedInventoryListing = inventory.listings.find(listing => listing.saleChannelID == shopifySaleChannel.ID) // shopify sale channel
          let competitivePayout = Math.round(parseFloat(selectedInventoryListing.payout) * (  1 - ((parseFloat(shopifySaleChannel.sameDayDeliveryInternalPriorityMargin)/2)/100)))
          return cy.all([
            // used to compare internal - external location
            () => cy.task("createInventory", {key: 'inventory2', productID: inventory.productID, productVariantID: inventory.productVariantID, payout: competitivePayout, quantity: 1, setAsDelivered: true, account: 'reseller'}),
            // used to compare location priority
            () => cy.task("createInventory", {key: 'inventory1', productID: inventory.productID, productVariantID: inventory.productVariantID, cost: 80, payout: selectedInventoryListing.payout, quantity: 1, setAsDelivered: true, warehouseID: 923}),
            // used to compare price 
            () => cy.task("createInventory", {key: 'inventory1', productID: inventory.productID, productVariantID: inventory.productVariantID, cost: 80, payout: 200, quantity: 1, setAsDelivered: true}),
          ])
        })
        .then((inventory) => {
          inventory2 = inventory
          return cy.request({
            headers: {
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/egress/shopify/variant/sync",
            body: {
              variantID: selectedInventoryListing.productVariantID
            }
          })
        }).then((response) => {
          console.log(response.body)
          expect(response.body.salePrice).equals(selectedInventoryListing.price)
          expect(response.body.selectedInventoryListings[0].ID).equals(selectedInventoryListing.ID)
          expect(response.body.metatags["stock.type"]).equals("store")
          expect(response.body.metatags["stock.locationId"]).equals(1)
        })
        
      })

      it('Should sum quantity from different listings', () => {
        let inventory1, inventory2;
        cy.task("createInventory", {key: 'inventory2', payout: 100, quantity: 5, setAsDelivered: true})
        .then((inventory) => {
          inventory1 = inventory
          return cy.task("createInventory", {key: 'inventory2', productID: inventory.productID, productVariantID: inventory.productVariantID, payout: 100, quantity: 3, setAsDelivered: true})
        })
        .then((inventory) => {
          inventory2 = inventory
          return cy.request({
            headers: {
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/egress/shopify/variant/sync",
            body: {
              variantID: inventory1.productVariantID
            }
          })
        }).then((response) => {
          expect(response.body.salePrice).equals('100.00')
          expect(response.body.quantity).equals(inventory1.quantity + inventory2.quantity)
          expect(response.body.metatags["stock.type"]).equals("store")
          expect(response.body.metatags["stock.locationId"]).equals(inventory1.warehouseID)
        })
      })
    })

    describe('shopify/variant/update', () => {
      it('Should Update Variant On Shopify', () => {
        let product;
        cy.task("createProduct")
            .then((res) => {
              product = res
              return cy.login('retailer')
            })
            .then((user) => {
              let variant = JSON.parse(JSON.stringify(product.variants[0]))
              variant['product'] = product
              return cy.request({
                headers: {
                    authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/egress/shopify/variant/update",
                body: variant
              })
            }).then((response) => {
          console.log('>>',response.body)
          expect(response.body.variant.title).equals(product.variants[0].name)
        })

      })
    })

    describe('shopify/variant/delete', () => {
      it('Should Delete Variant On Shopify', () => {
        let product;
        cy.task("createProduct")
            .then((res) => {
              product = res
              return cy.login('retailer')
            })
            .then((user) => {
              let variant = JSON.parse(JSON.stringify(product.variants[0]))
              variant['product'] = product
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/egress/shopify/variant/delete",
                body: variant
              })
            }).then((response) => {
          console.log(response)
        })

      })
    })

    //TODO: find a way to mock the external endpoints being called
    describe.skip('shopify/order/refund', () => [
      it('Should try to refund, but order has already been refunded', () => {
        cy.request({
          headers: {
            authorization: `Bearer ${Cypress.env('apiKey-edit')}`
          },
          method: 'POST',
          url: Cypress.env('api') + "/api/bridge/egress/shopify/order/refund",
          body: {
            ID: 36041,
            orderLineItems: [
              {ID: 92977}
            ]
          }
        }).then((resp) => {
          expect(resp.status).equals(200)
        })
      })

    ])

    describe('shopify/fulfillment/create', () => {
      it('Should Create fulfillment on Shopify with all items', () => {
        let order, fulfillment;
        cy.task('createOrder', {type: 'outbound'}).then((_order) => {
          order = _order
          const updatedConsignor = {
            ID: order.consignor.ID,
            account: 'reseller',
            updates: {
              phoneNumber: '7928766999',
              address: '504 Lavaca St Suite 1100',
              city: 'Austin',
              postcode: '78701',
              countyCode: 'tx',
              country: 'US',
              countryCode: 'us',
              validated: 1
            }
          }

          const updatedConsignee = {
            ID: order.consignee.ID,
            updates: {
              phoneNumber: '7928766999',
              address: '1000 Louisiana St Suite 1990',
              city: 'Houston',
              postcode: '77002',
              countyCode: 'tx',
              country: 'US',
              countryCode: 'us',
              validated: 1
            }
          }
          //fetch full orders for checks
          return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
        })
            .then(() => cy.task('createFulfillment', {
              orderID: order.ID,
              originAddressID: order.consignor.ID,
              destinationAddressID: order.consignee.ID,
              courier: 'ups',
              courierServiceCode: 'ups_next_day_air_international',
              orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
            }))
            .then((_fulfillment) => {
              fulfillment = _fulfillment
              return cy.login('retailer')
            })
            .then((user) => {
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/egress/shopify/fulfillment/create",
                body: fulfillment
              })
            })
            .then((resp) => {
              expect(resp.status).equals(200)
              const fulfillmentShopifyReq = resp.body
              expect(fulfillmentShopifyReq.line_items_by_fulfillment_order[0].fulfillment_order_id).not.equals(null)
              expect(fulfillmentShopifyReq.tracking_info.number).equals(fulfillment.trackingNumber)
              expect(fulfillmentShopifyReq.tracking_info.company).equals(fulfillment.courier.name)
            })
      })

      it('Should Create fulfillment on Shopify with only 2 items', () => {
        let order, fulfillment;
        cy.task('createOrder', {type: 'outbound', productQty: [2,2,2]}).then((_order) => {
          order = _order
          const updatedConsignor = {
            ID: order.consignor.ID,
            account: 'reseller',
            updates: {
              phoneNumber: '7928766999',
              address: '504 Lavaca St Suite 1100',
              city: 'Austin',
              postcode: '78701',
              countyCode: 'tx',
              country: 'US',
              countryCode: 'us',
              validated: 1
            }
          }

          const updatedConsignee = {
            ID: order.consignee.ID,
            updates: {
              phoneNumber: '7928766999',
              address: '1000 Louisiana St Suite 1990',
              city: 'Houston',
              postcode: '77002',
              countyCode: 'tx',
              country: 'US',
              countryCode: 'us',
              validated: 1
            }
          }
          //fetch full orders for checks
          return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
        })
            .then(() => cy.task('createFulfillment', {
              orderID: order.ID,
              originAddressID: order.consignor.ID,
              destinationAddressID: order.consignee.ID,
              courier: 'ups',
              courierServiceCode: 'ups_next_day_air_international',
              orderLineItems: order.orderLineItems.filter((oli, idx) => idx < 3).map((oli) => {return {ID: oli.ID}})
            }))
            .then((_fulfillment) => {
              fulfillment = _fulfillment
              return cy.login('retailer')
            })
            .then((user) => {
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/egress/shopify/fulfillment/create",
                body: fulfillment
              })
            })
            .then((resp) => {
              expect(resp.status).equals(200)
              const fulfillmentShopifyReq = resp.body
              console.log(fulfillmentShopifyReq)
              expect(fulfillmentShopifyReq.line_items_by_fulfillment_order[0].fulfillment_order_id).not.equals(null)
              expect(fulfillmentShopifyReq.line_items_by_fulfillment_order[0].fulfillment_order_line_items[0].quantity).equals(1)
              expect(fulfillmentShopifyReq.line_items_by_fulfillment_order[0].fulfillment_order_line_items[1].quantity).equals(2)
              expect(fulfillmentShopifyReq.tracking_info.number).equals(fulfillment.trackingNumber)
              expect(fulfillmentShopifyReq.tracking_info.company).equals(fulfillment.courier.name)
            })
      })

      it('Should do nothing when fulfillment for order not on Shopify', () => {
        let order, fulfillment;
        cy.task('createOrder', {type: 'outbound', productQty: [2,2,2], foreignID: null})
            .then((_order) => {
              order = _order
              //fetch full orders for checks
              return cy.task('createFulfillment', {
                orderID: order.ID,
                originAddressID: order.consignor.ID,
                destinationAddressID: order.consignee.ID,
                courier: 'manual',
                orderLineItems: order.orderLineItems.filter((oli, idx) => idx < 3).map((oli) => {return {ID: oli.ID}})
              })
            })
            .then((_fulfillment) => {
              fulfillment = _fulfillment
              return cy.login('retailer')
            })
            .then((user) => {
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/egress/shopify/fulfillment/create",
                body: fulfillment,
                failOnStatusCode: false
              })
            })
            .then((resp) => {
              expect(resp.status).equals(400)
              expect(resp.body.error).contains("not linked to shopify")
            })
      })
    })

    describe('shopify/fulfillment/update', () => {
      it('Should Update a fulfillment on Shopify', () => {
        let order, fulfillment;
        cy.task('createOrder', {type: 'outbound'}).then((_order) => {
          order = _order
          const updatedConsignor = {
            ID: order.consignor.ID,
            account: 'reseller',
            updates: {
              phoneNumber: '7928766999',
              address: '504 Lavaca St Suite 1100',
              city: 'Austin',
              postcode: '78701',
              countyCode: 'tx',
              country: 'US',
              countryCode: 'us',
              validated: 1
            }
          }

          const updatedConsignee = {
            ID: order.consignee.ID,
            updates: {
              phoneNumber: '7928766999',
              address: '1000 Louisiana St Suite 1990',
              city: 'Houston',
              postcode: '77002',
              countyCode: 'tx',
              country: 'US',
              countryCode: 'us',
              validated: 1
            }
          }
          //fetch full orders for checks
          return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
        })
            .then(() => cy.task('createFulfillment', {
              orderID: order.ID,
              originAddressID: order.consignor.ID,
              destinationAddressID: order.consignee.ID,
              courier: 'ups',
              courierServiceCode: 'ups_next_day_air_international',
              orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
            }))
            .then((_fulfillment) => {
              fulfillment = _fulfillment
              return cy.login('retailer')
            })
            .then((user) => {
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/egress/shopify/fulfillment/update",
                body: fulfillment
              })
            })
            .then((resp) => {
              expect(resp.status).equals(200)
              const fulfillmentShopifyUpdateReq = resp.body
              console.log(fulfillmentShopifyUpdateReq)
              expect(fulfillmentShopifyUpdateReq.tracking_info.number).equals(fulfillment.trackingNumber)
              expect(fulfillmentShopifyUpdateReq.tracking_info.company).equals(fulfillment.courier.name)
            })
      })
    })

    describe('shopify/fulfillment/cancel', () => {
      it('Should Cancel a fulfillment on Shopify', () => {
        let order, fulfillment;
        cy.task('createOrder', {type: 'outbound'}).then((_order) => {
          order = _order
          const updatedConsignor = {
            ID: order.consignor.ID,
            account: 'reseller',
            updates: {
              phoneNumber: '7928766999',
              address: '504 Lavaca St Suite 1100',
              city: 'Austin',
              postcode: '78701',
              countyCode: 'tx',
              country: 'US',
              countryCode: 'us',
              validated: 1
            }
          }

          const updatedConsignee = {
            ID: order.consignee.ID,
            updates: {
              phoneNumber: '7928766999',
              address: '1000 Louisiana St Suite 1990',
              city: 'Houston',
              postcode: '77002',
              countyCode: 'tx',
              country: 'US',
              countryCode: 'us',
              validated: 1
            }
          }
          //fetch full orders for checks
          return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
        })
            .then(() => cy.task('createFulfillment', {
              orderID: order.ID,
              originAddressID: order.consignor.ID,
              destinationAddressID: order.consignee.ID,
              courier: 'ups',
              courierServiceCode: 'ups_next_day_air_international',
              orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}})
            }))
            .then((_fulfillment) => {
              fulfillment = _fulfillment
              return cy.login('retailer')
            })
            .then((user) => {
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/egress/shopify/fulfillment/cancel",
                body: {
                  fulfillmentID: fulfillment.ID
                }
              })
            })
            .then((resp) => {
              expect(resp.status).equals(200)
              const fulfillmentShopifyCancelReq = resp.body
              console.log(fulfillmentShopifyCancelReq)
              expect(fulfillmentShopifyCancelReq).equals("ok")
            })
      })
    })

    describe('laced/inventory/create', () => {
      it('Should create a new listing', () => {
        let inventory;
        cy.task("createInventory", {key: 'inventory1', payout: 999, quantity: 3, setAsDelivered: true})
        .then((_inventory) => {
          inventory = _inventory
          return cy.login('retailer')
        })
        .then((user => {
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/egress/laced/listing/create",
            body: {
              inventoryListingID: inventory.listings[0].ID
            }
          })
        }))
        .then((response) => {
          expect(response.body.id).not.equals(null)
        })

      })
    })

    describe('laced/inventory/update', () => {
      it('Should update an existing listing', () => {
        cy.login('retailer')
            .then((user => {
              return cy.request({
                headers: {
                  authorization: `Bearer ${user.apiKey}`
                },
                method: 'POST',
                url: Cypress.env('api') + "/api/bridge/egress/laced/listing/update",
                body: {
                  inventoryListing: {
                    accountID: user.accountID,
                    lacedID: '123456789',
                    product: {
                      lacedID: '465789',
                    },
                    variant: {
                      lacedID: '789234'
                    },
                    inventory: {
                      quantity: 1
                    },
                    price: 100,
                    saleChannel: {
                      email: 'abc@gmail.com',
                      password: 'pass'
                    }
                  }
                }
              })
            }))
            .then((response) => {
              expect(response.body.lacedListingID).not.equals(null)
            })
      })
    })

    describe('laced/inventory/sync', () => {
      it('Should look for new sales on Laced', () => {
        cy.login('reseller')
        .then((user) => {
          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/ingress/laced/listing/sync"
          })
        })
        .then((response) => {
          expect(response.body).equals('ok')
        })
      })
    })

    describe('google-merchant/variant/update', () => {
      it('Should Update a Variant On Google Merchant', () => {
        let product;
        cy.task("createProduct", {
          color: 'red',
          gender: 'infant'
        })
        .then((res) => {
          product = res
          return cy.login('retailer')
        })
        .then((user) => {

          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',

            url: Cypress.env('api') + "/api/bridge/egress/google-merchant/variant/update",
            body: {
              variantID: product.variants[0].ID
            }
          })
        }).then((response) => {
          const mercantRequestObejct = response.body
          expect(mercantRequestObejct.merchantId).not.equals(null)
          expect(mercantRequestObejct.feedId).not.equals(null)
          expect(mercantRequestObejct.requestBody.channel).equals('online')
          expect(mercantRequestObejct.requestBody.contentLanguage).equals('en')
          expect(mercantRequestObejct.requestBody.targetCountry).equals('GB')
          expect(mercantRequestObejct.requestBody.offerId).equals(`shopify_GB_${product.foreignID}_${product.variants[0].foreignID}`)
          expect(mercantRequestObejct.requestBody.feedLabel).equals('GB')

          expect(mercantRequestObejct.requestBody.age_group).equals('infant')
          expect(mercantRequestObejct.requestBody.color).equals('red')
          expect(mercantRequestObejct.requestBody.gender).equals('unisex')
          expect(mercantRequestObejct.requestBody.gtin).equals(product.variants[0].gtin)
          expect(mercantRequestObejct.requestBody.sizes).equals(product.variants[0].name)
        })
      })

      it('Should Update a Variant price On Google Merchant', () => {
        let product;
        cy.task("createProduct", {
          color: 'red',
          gender: 'infant'
        })
        .then((res) => {
          product = res
          return cy.login('retailer')
        })
        .then((user) => {

          return cy.request({
            headers: {
              authorization: `Bearer ${user.apiKey}`
            },
            method: 'POST',
            url: Cypress.env('api') + "/api/bridge/egress/google-merchant/variant/update",
            body: {
              variantID: product.variants[0].ID,
              data: {price: 100}
            }
          })
        }).then((response) => {
          const mercantRequestObejct = response.body
          expect(mercantRequestObejct.merchantId).not.equals(null)
          expect(mercantRequestObejct.feedId).not.equals(null)
          expect(mercantRequestObejct.requestBody.channel).equals('online')
          expect(mercantRequestObejct.requestBody.contentLanguage).equals('en')
          expect(mercantRequestObejct.requestBody.targetCountry).equals('GB')
          expect(mercantRequestObejct.requestBody.offerId).equals(`shopify_GB_${product.foreignID}_${product.variants[0].foreignID}`)
          expect(mercantRequestObejct.requestBody.feedLabel).equals('GB')

          expect(mercantRequestObejct.requestBody.age_group).equals('infant')
          expect(mercantRequestObejct.requestBody.color).equals('red')
          expect(mercantRequestObejct.requestBody.gender).equals('unisex')
          expect(mercantRequestObejct.requestBody.gtin).equals(product.variants[0].gtin)
          expect(mercantRequestObejct.requestBody.sizes).equals(product.variants[0].name)
          expect(mercantRequestObejct.requestBody.price.value).equals(100)
          expect(mercantRequestObejct.requestBody.price.currency).equals("GBP")
        })
      })
    })

  })
})

describe('api/saleChannel', () => {
  describe('SaleChannel Fees', () => {
    it('testFeeRangesGeneratingPricesFromPayout', () => {
      let saleChannel, reseller, retailer, inventory1, inventory2, inventory3;
      cy.task('createSaleChannel',  {autoCreateFees: true})
          .then(_saleChannel => {
            saleChannel = _saleChannel
            console.log(saleChannel)
            return cy.all([() => cy.task('login', "retailer"), () => cy.task('login', 'reseller')])
          }).then(users => {
        //add sale channel fees
        retailer = users[0]
        reseller = users[1]
        // add reseller to sale channel
        return cy.task('addAccountToSaleChannel', {accountID: reseller.accountID, saleChannelID: saleChannel.ID})
      })
          .then((resp) => {
            //check the right consigno
            expect(resp.ID).equals(reseller.accountID)
            //create inv
            return cy.all([() => cy.task('createInventory', {
              key: 'inventory1',
              payout: 222,
              quantity: 1,
              account: 'reseller'
            }), () => cy.task('createInventory', {
              key: 'inventory2',
              payout: 390,
              quantity: 1,
              account: 'reseller'
            }), () => cy.task('createInventory', {key: 'inventory3', payout: 1245, quantity: 1, account: 'reseller'})])
          }).then(
          (inventories) => {
            inventory1 = inventories[0]
            inventory2 = inventories[1]
            inventory3 = inventories[2]
            let listing1 = inventory1.listings.find(_li => _li.saleChannelID == saleChannel.ID)
            let listing2 = inventory2.listings.find(_li => _li.saleChannelID == saleChannel.ID)
            let listing3 = inventory3.listings.find(_li => _li.saleChannelID == saleChannel.ID)

            //check prices generated from payouts
            expect(listing1.price).equals('300.00')
            expect(listing2.price).equals('500.00')
            expect(listing3.price).equals('1500.00')
          }
      )
    })
  })
})

describe('analytics', () => {
  it('kpis/personal-shopping', () => {
    cy.request({
        method: 'get',
        url: Cypress.env('api') + "/api/analytics/kpis/personal-shopping",
        timeout: 60000000,
      })
    .then((resp) => {
        expect(resp.status).equals(200)
        console.log(resp.body)
    })
  })

  it('kpis/engagement', () => {
    cy.request({
        method: 'get',
        url: Cypress.env('api') + "/api/analytics/kpis/engagement",
        timeout: 60000000,
      })
    .then((resp) => {
        expect(resp.status).equals(200)
        console.log(resp.body)
    })
  })
})

describe('api/workflow', () => {
  it('syncShopifySaleChannel', () => {
    let saleChannel;
    cy.task('createSaleChannel', {
      platform: 'shopify',
      shopifyStoreName: 'editmanldn-staging',
      shopifyAPIAuth: `https://3476b33233b4c0f2a4f30cd59fb8540a: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@editmanldn-staging.myshopify.com/admin/api/2021-04/`,
    })
    .then(_saleChannel => {
      saleChannel = _saleChannel
      return cy.task('get', 'retailer')
    })
    .then(user => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/syncShopifySaleChannel",
        body: {
          saleChannelID: saleChannel.ID,
        },
        timeout: 60000000,
      })
    }).then((resp) => {
      expect(resp.status).equals(200)
    })
  })

  it('updateSaleChannelConsignorListings', () => {
    let saleChannelID;
    cy.login('reseller')
    .then(user => {
      saleChannelID = user.account.saleChannels.find(sc => sc.accountID != user.accountID).ID
      cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/updateSaleChannelConsignorListings",
        body: {
          saleChannelID: saleChannelID,
          accountID: user.accountID,
          status: 'vacation'
        }
      }).then((resp) => {
        expect(resp.status).equals(200)
        return cy.task('getInventory', {limit: 999999, accountID: user.accountID, 'listings.saleChannelID': saleChannelID})
      }).then(inventoryRecords => {
        expect(inventoryRecords.filter(inv => inv.listings[0].status != 'drafted').length).equals(0)
      })
    })
  })

  it('downloadBulkDocuments', () => {
    let ordersWithInvoice;
    cy.task('getOrders', {limit: 999999, 'invoiceFilename': '*'})
    .then((orders) => {
      ordersWithInvoice = orders
      return cy.login('retailer')
    })
    .then(user => {
      return  cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/downloadBulkDocuments",
        body: {
          orderIDs: ordersWithInvoice.map(o => o.ID)
        },
        timeout: 60000000,
      })
    })
    .then((resp) => {
        expect(resp.status).equals(200)
    })
  })

  it('downloadTable', () => {
    cy.login('retailer')
    .then(user => {
      return  cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/downloadTable",
        body: {
          table: 'inventory',
          columns: [
            'ID',
            'createdAt',
            'product.imageReference',
            'product.code',
            'product.title',
            'product.category.name',
            'variant.name',
            'account.ID',
            'account.name',
            'quantity',
            'quantityIncoming',
            'quantityAtHand',
            'cost',
            'listingsQuantity',
            'warehouse.name',
            'notes'
          ],
          query: { sort: 'id:asc', 'account.ID': '~3'},
          destinationEmail: 's.rosa@wiredhub.io'
        },
        timeout: 60000000,
      })
    })
    .then((resp) => {
        expect(resp.status).equals(200)
        const csvRows = resp.body
        expect(csvRows[0].ID).not.equals(null)
    })
  })

  it('runScheduler - sale-order/created', () => {
    let saleOrder;
    cy.task("createOrder", {
      account: 'retailer',
      type: 'outbound'
    })
    .then((_saleOrder) => {
      saleOrder = _saleOrder
      return cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/runScheduler",
        body: {
          forceTimestamp: moment({minutes: 0}),
          forceWorkflowName: 'sale-order/created'
        },
        timeout: 60000000,
      })
    })
    .then((resp) => {
      expect(resp.status).equals(200)
      const notifications = resp.body
      const orderNotification = notifications.find(n => n.notification.id == saleOrder.ID)
      const orderEmailNotification = orderNotification.email
      const orderPushNotification = orderNotification.notification
      expect(orderEmailNotification).not.equals(null)
      expect(orderPushNotification).not.equals(null)
      expect(orderPushNotification.notificationType).equals('sale-order/created')
      expect(orderPushNotification.id).equals(saleOrder.ID.toString())
    })
  })

  it('runScheduler - sale-order/pending-reminder', () => {
    let saleOrder
    cy.task("createShopifyOrder")
    .then((so) => {
      saleOrder = so.consignor
      return cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/runScheduler",
        body: {
          forceTimestamp: moment().add(23, 'hours'),
          forceWorkflowName: 'sale-order/pending-reminder'
        },
        timeout: 60000000,
      })
    })
    .then((resp) => {
        expect(resp.status).equals(200)
        const notifications = resp.body
        console.log(notifications)
        const orderNotification = notifications.find(n => n.notification.id == saleOrder.ID)
        const orderPushNotification = orderNotification.notification
        expect(orderPushNotification).not.equals(null)
        expect(orderPushNotification.notificationType).equals('sale-order/pending-reminder-24h')
        expect(orderPushNotification.id).equals(saleOrder.ID.toString())
    })
  })

  it('runScheduler - sale-order/fulfill-reminder', () => {
    let saleOrder
    cy.task("createShopifyOrder")
    .then((so) => {
      saleOrder = so.consignor
      return cy.login('reseller')
    })
    .then((user) => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + `/api/order/${saleOrder.ID}/accept`,
        body: {
          orderID: saleOrder.ID,
          orderLineItems: saleOrder.orderLineItems
        }
      })
    })
    .then(() => {
      return cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/runScheduler",
        body: {
          forceTimestamp: moment().add(23, 'hours'),
          forceWorkflowName: 'sale-order/fulfill-reminder'
        },
        timeout: 60000000,
      })
    })
    .then((resp) => {
        expect(resp.status).equals(200)
        const notifications = resp.body
        console.log(notifications)
        const orderNotification = notifications.find(n => n.notification.id == saleOrder.ID)
        const orderPushNotification = orderNotification.notification
        expect(orderPushNotification).not.equals(null)
        expect(orderPushNotification.notificationType).equals('sale-order/fulfill-reminder-24h')
        expect(orderPushNotification.id).equals(saleOrder.ID.toString())
    })
  })

  it('runScheduler - inventory/upload-reminder', () => {
    cy.task('userSignup', {
      name: 'cypress',
      surname: 'Test',
      email: `cypress${Math.random().toString(36).slice(2)}@test.com`,
      password: `${Math.random().toString(36).slice(2)}`,
    })
    .then((user) => {
      return cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/runScheduler",
        body: {
          forceTimestamp: moment().add(7*24, 'hours').add(10, 'minutes'),
          forceWorkflowName: 'inventory/upload-reminder'
        },
        timeout: 60000000,
      })
    })
    .then((resp) => {
        expect(resp.status).equals(200)
        const notifications = resp.body
        const inventoryNotification = notifications[0]
        const inventoryPushNotification = inventoryNotification.notification
        expect(inventoryPushNotification).not.equals(null)
        expect(inventoryPushNotification.notificationType).equals('inventory/upload-reminder-1w')
    })
  })

  it('runScheduler - milanostoreReport', () => {
    cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/runScheduler",
        body: {
          forceTimestamp: moment({days: 1, hours: 0, minutes: 0}),
          forceWorkflowName: 'milanostoreReport'
        },
        timeout: 60000000,
      })
    .then((resp) => {
        expect(resp.status).equals(200)
        expect(resp.body).equals('ok')
    })
  })

  it('runScheduler - account-report/disconnected-listing', () => {
    let adminUser, inventory;
    cy.task("createInventory", {
      account: 'reseller',
      setAsDelivered: true,
      quantity: 3
    }).then((_inventory) => {
      inventory = _inventory
      return cy.task('login', 'retailer')
    })
    .then((_user) => {
      adminUser = _user
      const externalListing = inventory.listings.find(l => l.saleChannel.accountID == adminUser.account.ID)
      return cy.request({
          headers: {
            authorization: `Bearer ${adminUser.apiKey}`
          },
        method: 'DELETE',
        url: Cypress.env('api') + `/api/product/${externalListing.productID}/variants?variantIDs=${externalListing.productVariantID}`,
      })
    })
    .then(_ => {
      return cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/runScheduler",
        body: {
          forceTimestamp: moment({days: 15, hours: 0, minutes: 0}),
          forceWorkflowName: 'account-report/disconnected-listing'
        },
        timeout: 60000000,
      })
    })
    .then((resp) => {
        expect(resp.status).equals(200)
        expect(resp.body.data).is.an('array')
        expect(resp.body.data.length).not.equals(0)

        const disconnectedListings = resp.body.data
        expect(disconnectedListings[0].inventoryListingID).not.equals(null)
    })
  })

  it('runScheduler - account-report/new-product-uploads', () => {
    cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/runScheduler",
        body: {
          forceTimestamp: moment({days: 15, hours: 0, minutes: 0}),
          forceWorkflowName: 'account-report/new-product-uploads'
        },
        timeout: 60000000,
    })
    .then((resp) => {
        expect(resp.status).equals(200)
        expect(resp.body.data).is.an('array')
        expect(resp.body.data.length).not.equals(0)

        const newProductUploads = resp.body.data
        expect(newProductUploads[0].productID).not.equals(null)
    })
  })

  it('runScheduler - account-report/best-selling-products', () => {
    cy.task('createOrder', { account: 'retailer', type: 'outbound' })
    .then((_) => {
      return cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/runScheduler",
        body: {
          forceTimestamp: moment({days: 15, hours: 0, minutes: 0}),
          forceWorkflowName: 'account-report/best-selling-products'
        },
        timeout: 60000000,
      })
    })
    .then((resp) => {
      console.log(resp)
        expect(resp.status).equals(200)
        expect(resp.body.data).is.an('array')
        expect(resp.body.data.length).not.equals(0)

        const bestSellingProducts = resp.body.data
        expect(bestSellingProducts[0].productID).not.equals(null)
        expect(bestSellingProducts[0].numberOfSalesLastWeek).not.equals(null)
        expect(bestSellingProducts[0].mostSoldVariantID).not.equals(null)
        expect(bestSellingProducts[0].avgSaleValue).not.equals(null)
    })
  })

  it('runScheduler - account-report/stock-levels', () => {
    cy.task('createOrder', { account: 'retailer', type: 'outbound' })
    .then((_) => {
      return cy.request({
          method: 'POST',
          url: Cypress.env('api') + "/api/workflows/runScheduler",
          body: {
            forceTimestamp: moment({days: 15, hours: 0, minutes: 0}),
            forceWorkflowName: 'account-report/stock-levels'
          },
          timeout: 60000000,
      })
    })
    .then((resp) => {
        expect(resp.status).equals(200)
        expect(resp.body.data).is.an('array')
        expect(resp.body.data.length).not.equals(0)

        const stockLevels = resp.body.data
        expect(stockLevels[0].productVariantID).not.equals(null)
        expect(stockLevels[0].numberOfSalesLastWeek).not.equals(null)
        expect(stockLevels[0].averageSaleValue).not.equals(null)
        expect(stockLevels[0].currentInventoryQuantity).not.equals(null)
        expect(stockLevels[0].createdAt).not.equals(null)
    })
  })

  it('runScheduler - syncShopifyInventoryAndPrices', () => {
    cy.request({
        method: 'POST',
        url: Cypress.env('api') + "/api/workflows/runScheduler",
        body: {
          forceTimestamp: moment({days: 15, hours: 0, minutes: 0}),
          forceWorkflowName: 'syncShopifyInventoryAndPrices'
        },
        timeout: 60000000,
      })
    .then((resp) => {
        expect(resp.status).equals(200)
        expect(resp.body).equals("ok")
    })
  })

  it('runScheduler - reconcileStripePaymentsCaptured', () => {
    let inventory, psUser;
    const balance_transaction = `txn_1032Rp2eZvK`
    const psFee = 100
    cy.task('createInventory', {account: 'retailer', setAsDelivered: true})
    .then((_inventory) => {
      inventory = _inventory
      return cy.task('login', 'personal-shopper')
    })
    .then(user => {
      psUser = user
      const listingToSell = inventory.listings.find(listing => listing.saleChannelID == 1)
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + `/api/order/sale-order`,
        body: {
          accountID: 3,
          saleChannelID: 1,
          type: 'outbound',
          consignorID: inventory.warehouse.addressID,
          notes: "some test notes",
          details: [
            {inventoryListingID: listingToSell.ID, quantity: inventory.quantity, price: listingToSell.price + psFee},
          ],
          transactions: [
            {type: 'sale', grossAmount: listingToSell.price, currency: 'gbp', status: 'processing'}, // NOTE:  Status is hardcoded to processing as if checkout.session.completed is already triggered
            {type: 'shipping', toAccountID: 3, grossAmount: '10.00', currency: 'gbp', status: 'processing'}, // NOTE:  Status is hardcoded to processing as if checkout.session.completed is already triggered
            {type: 'payout', toAccountID: psUser.accountID, grossAmount: psFee, currency: 'gbp', status: 'processing'} // NOTE:  Status is hardcoded to processing as if checkout.session.completed is already triggered
          ]
        }
      })
    })
    .then(resp => {
      const order = resp.body
      return cy.request({
        headers: {
          authorization: `Bearer ${psUser.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + "/api/bridge/ingress/stripe/charge/succeeded",
        timeout: 60000000,
        body: {
          "id": "ch_1OI7Bd2eZvKYlo2CKWBBuedy",
          "amount_captured": 1000,
          "balance_transaction": balance_transaction,
          "transfer_group": `${order.ID}`
        }
      })
    })
    .then(() => cy.request({
      method: 'POST',
      url: Cypress.env('api') + "/api/workflows/runScheduler",
      body: {
        forceTimestamp: moment({days: 15, hours: 0, minutes: 0}),
        forceWorkflowName: 'reconcileStripePaymentsCaptured'
      },
      timeout: 60000000,
    }))
    .then((resp) => {
        expect(resp.status).equals(200)
        const saleOrder = resp.body
          
        const totalFeeAmount = parseFloat(saleOrder.totalAmount) * 0.01
        const psPayoutTx = saleOrder.transactions.find(tx => tx.type == 'payout')

        const psChargedFeePercentage = (parseFloat(psPayoutTx.grossAmount) / parseFloat(saleOrder.totalAmount))
        const psChargedFeeAmount = totalFeeAmount * psChargedFeePercentage;
        const sellerChargedFeeAmount = totalFeeAmount - psChargedFeeAmount

        const saleTx = saleOrder.transactions.find(tx => tx.type == 'sale')
        expect(saleTx.status).equals("paid")
        expect(saleTx.feesAmount).equals(sellerChargedFeeAmount.toFixed(2))

        const shippingTx = saleOrder.transactions.find(tx => tx.type == 'shipping')
        expect(shippingTx.status).equals("paid")
        expect(shippingTx.feesAmount).equals("0.00")

        expect(psPayoutTx.status).equals("paid")
        expect(psPayoutTx.feesAmount).equals(psChargedFeeAmount.toFixed(2))
    })
  })

  it('runScheduler - lacedSync', () => {
    return cy.request({
      method: 'POST',
      url: Cypress.env('api') + "/api/workflows/runScheduler",
      body: {
        forceTimestamp: {hours: 2, minutes: 0},
        forceWorkflowName: 'lacedSync'
      },
      timeout: 60000000,
    })
    .then((resp) => {
      expect(resp.status).equals(200)
      expect(resp.body).equals('ok')
    })
  })
})

describe('api/account', () => {
  describe('revolut/', () => {
    it.skip('setup revolut banking api - need to set refresh auth code for this test to work', () => {
      cy.login('retailer')
      .then((user => cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + `/api/account/3/revolut/setup`,
        body: {
          authCode: '',
          clientID: 'gbziunB0ySn5orRyYLtAI5lSRl7u9e9o5E2Xt9yOSps',
        },
        timeout: 60000000,
      })))
    .then((resp) => {
      expect(resp.status).equals(200)
      console.log(resp.body)
      //const consignmentRelation = resp.body
      //expect(consignmentRelation.revolutCounterpartyID).not.equals(null)
    })

    })
  })

  describe('GET /accountID/consignor/consignorAccountID', () => {
    it('get account consignment details', () => {
      let retailer, consignor;
      cy.task('login', 'retailer')
      .then(user => {
        retailer = user
        return cy.task('login', 'reseller')
      })
      .then(user => {
        consignor = user
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'GET',
          url: Cypress.env('api') + `/api/account/${retailer.accountID}/consignor/${consignor.accountID}`,
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        const consignmentRelation = resp.body
        expect(consignmentRelation).not.equals(null)
        expect(consignmentRelation.saleChannels).not.equals(null)
      })
    })
  })

  describe('GET /accountID/consignor/consignorAccountID/bank-details/:counterpartyId', () => {
    it('return the consignor bank details', () => {
      let retailer, consignor;
      cy.task('login', 'retailer')
      .then(user => {
        retailer = user
        return cy.task('login', 'reseller')
      })
      .then(user => {
        consignor = user
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/account/${retailer.accountID}/consignor/${consignor.ID}/bank-details`,
          body: {
            gateway: 'revolut',
            companyName: `test company ${Math.random().toString(36).slice(2)}`,
            accountNumber: `${10000000 + (Math.floor(Math.random() * 10000000))}`,
            sortCode: '123456',
            address: {
              street: '251 southwwark bridge road',
              city: 'London',
              postcode: 'SG18 9ND',
              country: 'GB',
            }
          },
          timeout: 60000000,
        })
      }).then((resp) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'GET',
          url: Cypress.env('api') + `/api/account/${retailer.accountID}/consignor/${consignor.ID}/bank-details/${resp.body.revolutCounterpartyID}`,
          timeout: 60000000,
        })
      })
      .then((resp) => {
        expect(resp.body.id).not.equals(null)
        expect(resp.body.accounts.length).equals(1)
        expect(resp.body.accounts[0].account_no).not.equals(null)
        expect(resp.body.accounts[0].sort_code).not.equals(null)
      })
    })
  })

  describe('POST /accountID/consignor/consignorAccountID/bank-details', () => {
    it('consignor should be able to add bank details  (stripe)', () => {
      let retailer, consignor;
      cy.task('login', 'retailer')
      .then(user => {
        retailer = user
        return cy.task('login', 'reseller')
      })
      .then(user => {
        consignor = user
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/account/${retailer.accountID}/consignor/${consignor.ID}/bank-details`,
          body: {
            gateway: 'stripe',
            stripeAuthID: `${Math.random().toString(36).slice(2)}`,
          },
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        const consignmentRelation = resp.body
        expect(consignmentRelation.stripeAccountID).not.equals(null)
        expect(consignmentRelation.stripeDefaultDestinationID).not.equals(null)
      })
    })

    it('consignor should be able to add bank details  (revolut)', () => {
      let retailer, consignor;
      cy.task('login', 'retailer')
      .then(user => {
        retailer = user
        return cy.task('login', 'reseller')
      })
      .then(user => {
        consignor = user
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/account/${retailer.accountID}/consignor/${consignor.ID}/bank-details`,
          body: {
            gateway: 'revolut',
            companyName: `test company ${Math.random().toString(36).slice(2)}`,
            accountNumber: `${10000000 + (Math.floor(Math.random() * 10000000))}`,
            sortCode: '123456',
            address: {
              street: '251 southwwark bridge road',
              city: 'London',
              postcode: 'SG18 9ND',
              country: 'GB',
            }
          },
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        const consignmentRelation = resp.body
        expect(consignmentRelation.revolutCounterpartyID).not.equals(null)
      })
    })
  })

  describe('DELETE /accountID/consignor/consignorAccountID/bank-details', () => {
    it('consignor should be able to remove its bank details (revolut)', () => {
      let retailer, consignor;
      cy.task('login', 'retailer')
      .then(user => {
        retailer = user
        return cy.task('login', 'reseller')
      })
      .then(user => {
        consignor = user
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/account/${retailer.accountID}/consignor/${consignor.ID}/bank-details`,
          body: {
            gateway: 'revolut',
            companyName: `test company ${Math.random().toString(36).slice(2)}`,
            accountNumber: `${Math.floor(Math.random() * 100000000)}`,
            sortCode: '123456',
            address: {
              "street_line1": "251 southwark bridge road",
              "postcode": "SE16FJ",
              "city": "london",
              "country": "GB"
            }
          },
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        const consignmentRelation = resp.body
        expect(consignmentRelation.revolutCounterpartyID).not.equals(null)
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'delete',
          url: Cypress.env('api') + `/api/account/${retailer.accountID}/consignor/${consignor.ID}/bank-details?gateway=revolut`,
          timeout: 60000000,
        })
      })
      .then((resp) => {
        expect(resp.status).equals(200)
        console.log(resp.body)
      })
    })
  })

  describe('PUT /accountID/consignor/consignorAccountID/sale-channels/saleChannelID', () => {
    it('consignor should be set consignment sale channel to vacation mode', () => {
      let retailer, consignor, externalSaleChannel;
      cy.task('login', 'retailer')
      .then(user => {
        retailer = user
        return cy.task('login', 'reseller')
      })
      .then(user => {
        consignor = user
        externalSaleChannel = consignor.account.saleChannels.find(saleChannel => saleChannel.accountID != consignor.accountID)
        return cy.request({
          headers: {
            authorization: `Bearer ${consignor.apiKey}`
          },
          method: 'PUT',
          url: Cypress.env('api') + `/api/account/${retailer.accountID}/consignor/${consignor.accountID}/sale-channels/${externalSaleChannel.ID}`,
          body: {
            status: 'vacation',
          },
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        const consignment = resp.body
        expect(consignment.saleChannels.find(sc => sc.ID == externalSaleChannel.ID).account_saleChannel.status).equals('vacation')
      })
    })

  })

  describe('analytics', () => {
    it('/inventory-value', () => {
      cy.task("createInventory", {
        setAsDelivered: true,
        quantity: 3
      }).then(() => cy.task('login', 'retailer'))
      .then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'GET',
          url: Cypress.env('api') + `/api/account/${user.accountID}/analytics/inventory-value`,
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        expect(resp.body.x.length).equals(45)
        expect(resp.body.y.length).equals(45)
      })
    })

    it('/unrealized-profits', () => {
      cy.task("createInventory", {
        setAsDelivered: true,
        quantity: 3
      }).then(() => cy.task('login', 'retailer'))
      .then(user => {
        return cy.request({
          headers: {
            authorization: `Bearer ${user.apiKey}`
          },
          method: 'GET',
          url: Cypress.env('api') + `/api/account/${user.accountID}/analytics/unrealized-profits`,
          timeout: 60000000,
        })
      }).then((resp) => {
        expect(resp.status).equals(200)
        expect(resp.body.x.length).equals(45)
        expect(resp.body.y.length).equals(45)
      })
    })

  })

  describe('POST /accountID/stripe/connect-account-setup', () => {
    it('Should return stripe express account setup link', () => {
      cy.task('login', 'retailer')
          .then(user => {
            return cy.request({
              headers: {
                authorization: `Bearer ${user.apiKey}`
              },
              method: 'POST',
              url: Cypress.env('api') + `/api/account/${user.accountID}/stripe/connect-account-setup`,
              timeout: 60000000,
            })
          })
          .then((resp) => {
            expect(resp.status).equals(200)
            expect(resp.body).contains('connect.stripe.com/setup')
          })
    })
  })

})

describe('api/event', () => {
  describe('POST /', () => {
    it('should log a new event', () => {
      cy.login('retailer')
      .then((user => cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + `/api/events`,
        body: {
          resource: 'announcement-id1',
          metadata: {}, 
          action: 'viewed',
          timestamp: new Date()
        },
        timeout: 60000000,
      })))
    .then((resp) => {
      expect(resp.status).equals(200)
      const event = resp.body
      expect(event.ID).not.equals(null)
      expect(event.resource).equals('announcement-id1')
      expect(event.action).equals('viewed')
      expect(event.timestamp).not.equals(null)
    })
    })
  })
})

describe('api/auth', () => {

  describe('POST /guest-access-token', () => {
    it('Should return a jwt for the guest user', () => {
      cy.task("createOrder", {
        account: 'retailer',
        type: 'outbound'
      })
      .then(order => {
        return cy.request({
          method: 'POST',
          url: Cypress.env('api') + `/auth/guest-access-token`,
          body: {
            accessToken: order.accessToken,
            resource: 'order'
          },
          timeout: 60000000,
        })
      })
      .then(resp => {
        expect(resp.status).equals(200)
        expect(resp.body.jwtToken).not.equals(null)
      })
    })
  })

})
