/// <reference types="Cypress" />

describe("General", () => {
  beforeEach(() => {
  })
  
  it("Edit Fulfillment reference & Fulfillment Destination & can't add origin", () => {
    cy.login('retailer')
    cy.task("createOrder", {type: 'inbound', fulfillment: {}, productQty: [1], account: 'retailer'})
    .then(order => {
      cy.visit(`orders/${order.ID}/fulfillment/${order.fulfillments[0].ID}`)

      // edit reference
      cy.get('a.button[test-id="edit-tracking"]').should('be.visible').click()
      cy.get('app-fulfillment-form input[formcontrolname="reference1"]').should('be.visible').type(Math.random().toString(36).slice(2))
      cy.get('app-fulfillment-form button[test-id="submit"]').click()
      cy.get('ion-toast').contains('Fulfillment Updated', {matchCase: false, includeShadowDom: true})

      // edit destination
      cy.get('a.button[test-id="edit-destination"]').should('be.visible').click()
      cy.get('app-address-contact input[formcontrolname="name"]').should('be.visible').type(' edited')
      cy.get('app-address-contact input[formcontrolname="surname"]').should('be.visible').type(' edited')
      cy.get('app-address-contact button[test-id="submit"]').should('be.visible').click()
      cy.toastMessage('Fulfillment Updated')

      // can't add origin
      cy.get('a.button[test-id="add-origin"]').should('not.exist')
      
    })
  })
})

describe("Inbound", () => {
  beforeEach(() => {
    cy.login('retailer')
  })

  it("Retailer update Purchase Order fulfillment with supplier and courier", () => {
    let order;
    cy.task("createOrder", {type: 'inbound', fulfillment: {}, productQty: [1], account: 'retailer'})
    .then(_order => {
      order = _order
      cy.visit(`orders/${order.ID}/fulfillment/${order.fulfillments[0].ID}`)

      // open fulfillment form
      cy.get('a.button[test-id="edit-tracking"]').click()

      // shouldn display message that order is missing supplier
      cy.get('mat-hint[test-id="missing-shipFrom-address"]').should('be.visible')

      // add order supplier
      return cy.task('updateAddress', {
        ID: order.consignee.ID,
        account: 'retailer',
        updates: {
          phoneNumber: '7928766999',
          address: '504 Lavaca St Suite 1100',
          city: 'Austin',
          postcode: '78701',
          country: 'US',
          countryCode: 'US',
          countyCode: 'tx',
          validated: 1
        }
      })
    }).then(() => {
      cy.visit(`orders/${order.ID}`)

      // add supplier to order
      cy.get('a#add-supplier').click()
      cy.get('app-address-contact ion-fab-button').click()
      cy.fillAddressForm()
      cy.wait(1000)


      // open fulfillment form
      cy.get('ion-list ion-card').eq(0).click()
      
      cy.get('ion-action-sheet button#fulfillment-view').click()
      cy.get('a.button[test-id="edit-tracking"]').click()

      cy.fillFulfillmentForm({
        courier: 'ups',
        details: 0
      })

      //verify shipping label has been generated
      cy.get('app-fulfillment span[test-id="tracking-number"]').should('be.visible')
      cy.get('app-fulfillment span[test-id="print-shipping-label"]').should('be.visible')
      
      cy.get('app-fulfillment ion-list ion-card').eq(0).click()
      cy.get('app-input input[formcontrolname="input"]').type(`${Math.random().toString(36).slice(2)}`)
      cy.get('app-input button[test-id="confirm"]').click()

      cy.get(`app-confirm button[test-id="confirm"]`).should('be.visible').click()
      cy.get(`app-order-detail span[test-id="order-status"]`).should('be.visible').contains('delivered')
    })
  })

  it("Retailer completes purchase order fulfillment wihtout supplier and courier", () => {
    cy.task("createOrder", {type: 'inbound', fulfillment: {}, productQty: [1, 1, 1], account: 'retailer'})
    .then(order => {
      cy.visit(`orders/${order.ID}`)

      // go to fulfillment
      cy.get(`app-order-detail ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
      cy.wait(300)
      
      cy.get('button#fulfillment-view').should('be.visible').click()

      //scan inbound
      for (var oli of order.orderLineItems) {
        cy.get(`ion-card[test-id=${oli.ID}]`).should('be.visible').click()
        cy.get('app-input input').should('be.visible').type(`${Math.random().toString(36).slice(2)}`)
        cy.get('button[test-id="confirm"]').click()
        cy.wait(500)
      }

      cy.get(`app-confirm button[test-id="confirm"]`).should('be.visible').click()
      cy.get(`app-order-detail span[test-id="order-status"]`).should('be.visible').contains('delivered')
    })
  })

})

describe("Outbound", () => {
  it("Retailer fulfill Sale Order with courier", () => {
    let order;
    cy.login('retailer')
    cy.task("createOrder", {type: 'outbound', productQty: [1, 1, 1], account: 'retailer'})
    .then((_order) => {
      order = _order
      // update addresses to be alid for courier testing
      const updatedConsignor = {
        ID: order.consignor.ID,
        account: 'retailer',
        updates: {
          name: 'The edit',
          surname: 'ldn',
          phoneNumber: '7928766999',
          address: '504 Lavaca St Suite 1100',
          city: 'Austin',
          postcode: '78701',
          country: 'US',
          countryCode: 'US',
          countyCode: 'tx',
          validated: 1
        }
      }

      const updatedConsignee = {
        ID: order.consignee.ID,
        account: 'retailer',
        updates: {
          phoneNumber: '7928766999',
          address: '1000 Louisiana St Suite 1990',
          city: 'Houston',
          postcode: '77002',
          country: 'US',
          countryCode: 'US',
          countyCode: 'tx',
          validated: 1
        }
      }
      return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
    })
    .then(() => {
      cy.visit(`orders/${order.ID}`)

      // create fulfillment
      cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
      
      cy.get(`button#fulfill`).should('be.visible').click()

      cy.fillFulfillmentForm({
        shipFrom: 'Storage #1',
        courier: 'ups'
      })

      // check that retailer is able to edit only fulfillment refernece (since fulfillment already has a shipping label generated)
      cy.get('app-fulfillment a.button[test-id="edit-tracking"]').should('be.visible').click()
      cy.get('app-fulfillment-form ion-card[test-id="shipFrom"]').should('be.visible').click()
      cy.wait(300)
      cy.get('app-address-contact').should('not.exist')

      cy.get('app-fulfillment-form ion-card[test-id="shipTo"]').should('be.visible').click()
      cy.wait(300)
      cy.get('app-address-contact').should('not.exist')

      cy.get('app-fulfillment-form input[formcontrolname="trackingNumber"]').should('be.disabled')

      cy.visit(`orders/${order.ID}`)
      // wait page loads
      cy.get(`app-order-detail ion-list`).should('be.visible')
      // check order line item status
      cy.get(`app-order-detail ion-card[test-id="oli"] span[test-id="oli-status"]`).eq(0).contains('fulfilling')

      // check that item can be manually set as dispatched
      cy.get(`app-order-detail ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
      cy.wait(300)
      
      cy.get('button#dispatch').should('be.visible')

      // go to fulfillment and scan outbound
      cy.get('button#fulfillment-view').should('be.visible').click()

      for (var oli of order.orderLineItems) {
        cy.get(`ion-card[test-id=${oli.ID}]`).should('be.visible').click()
        cy.get('app-input input').should('be.visible').type(oli.item.barcode)
        cy.get('button[test-id="confirm"]').click()
        cy.wait(500)
      }
    })
  })

  it("Retailer fulfills Sale Order with 'manual' courier", () => {
    let order;
    cy.login('retailer')
    cy.task("createOrder", {type: 'outbound', productQty: [1, 1, 1], account: 'retailer'})
        .then((_order) => {
          order = _order
          // update addresses to be alid for courier testing
          const updatedConsignor = {
            ID: order.consignor.ID,
            account: 'retailer',
            updates: {
              name: 'The edit',
              surname: 'ldn',
              phoneNumber: '7928766999',
              address: '504 Lavaca St Suite 1100',
              city: 'Austin',
              postcode: '78701',
              country: 'US',
              countryCode: 'US',
              countyCode: 'tx',
              validated: 1
            }
          }

          const updatedConsignee = {
            ID: order.consignee.ID,
            account: 'retailer',
            updates: {
              phoneNumber: '7928766999',
              address: '1000 Louisiana St Suite 1990',
              city: 'Houston',
              postcode: '77002',
              country: 'US',
              countryCode: 'US',
              countyCode: 'tx',
              validated: 1
            }
          }
          return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
        })
        .then(() => {
          cy.visit(`orders/${order.ID}`)

          // create fulfillment
          cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()

          cy.get(`button#fulfill`).should('be.visible').click()

          cy.fillFulfillmentForm({
            shipFrom: 'Storage #1',
            courier: 'manual'
          })

          // check that retailer is able to edit only fulfillment refernece (since fulfillment already has a shipping label generated)
          cy.get('app-fulfillment a.button[test-id="edit-tracking"]').should('be.visible').click()
          cy.get('app-fulfillment-form ion-card[test-id="shipFrom"]').should('be.visible').click()
          cy.wait(300)
          cy.get('app-address-contact').should('exist')
          cy.get('app-address-contact button[test-id="submit"]').click()


          cy.get('app-fulfillment-form ion-card[test-id="shipTo"]').should('be.visible').click()
          cy.wait(300)
          cy.get('app-address-contact').should('exist')
          cy.get('app-address-contact button[test-id="submit"]').click()


          cy.get('app-fulfillment-form input[formcontrolname="trackingNumber"]').should('be.enabled')

          cy.visit(`orders/${order.ID}`)
          // wait page loads
          cy.get(`app-order-detail ion-list`).should('be.visible')
          // check order line item status
          cy.get(`app-order-detail ion-card[test-id="oli"] span[test-id="oli-status"]`).eq(0).contains('fulfilling')

          // check that item can be manually set as dispatched
          cy.get(`app-order-detail ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
          cy.wait(300)

          cy.get('button#dispatch').should('be.visible')

          // go to fulfillment and scan outbound
          cy.get('button#fulfillment-view').should('be.visible').click()

          for (var oli of order.orderLineItems) {
            cy.get(`ion-card[test-id=${oli.ID}]`).should('be.visible').click()
            cy.get('app-input input').should('be.visible').type(oli.item.barcode)
            cy.get('button[test-id="confirm"]').click()
            cy.wait(500)
          }
        })
  })

  describe("Reseller Fulfill Sale Order and Retailer scans it inbound", () => {
    before(() => {
      cy.task("createShopifyOrder", {account: 'retailer'}).then((orders) => {
      // update addresses to be alid for courier testing
        const updatedConsignor = {
          ID: orders.consignor.consignor.ID,
          account: 'reseller',
          updates: {
            phoneNumber: '7928766999',
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            country: 'US',
            countryCode: 'US',
            countyCode: 'tx',
            validated: 1
          }
        }
  
        const updatedConsignee = {
          ID: orders.consignor.consignee.ID,
          account: 'retailer',
          updates: {
            name: 'The edit',
            surname: 'ldn',
            phoneNumber: '7928766999',
            address: '1000 Louisiana St Suite 1990',
            city: 'Houston',
            postcode: '77002',
            country: 'US',
            countryCode: 'US',
            countyCode: 'tx',
            validated: 1
          }
        }
        return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
      })
    })

    it("Consignor Fulfill consignment sale with courier", () => {
      cy.login('reseller')
      
      let order;
      cy.task('get', 'order_consignor')
      .then(order => {
        cy.visit(`/orders/${order.ID}`)
        // accept items
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#accept').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
          cy.wait(1000)
        })

        // create fulfillment
        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        
        cy.get(`button#fulfill`).should('be.visible').click()

        cy.fillFulfillmentForm({
          courier: 'ups'
        })

        cy.visit(`/orders/${order.ID}`)
        // wait page loads
        cy.get(`app-order-detail ion-list`).should('be.visible')
        // check order line item status
        cy.get(`app-order-detail ion-card[test-id="oli"] span[test-id="oli-status"]`).eq(0).contains('fulfilling')

        // check that item can't be set as delivered or dispatched
        cy.get(`app-order-detail ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        cy.wait(300)
        
        //consignor should not be able to set as delivered
        cy.get('button#deliver').should('not.exist') 
        
        //consignor should not be able to set as dispatched
        cy.get('button#dispatch').should('not.exist')

        // go to fulfillment
        cy.get('button#fulfillment-view').should('be.visible').click()
        cy.get('app-fulfillment ion-list ion-card').eq(0).should('be.visible').click()
        cy.get('app-input input').should('not.exist') // can't assign barcode

        //verify shipping label has been generated
        cy.get('app-fulfillment span[test-id="tracking-number"]').should('be.visible')
        cy.get('app-fulfillment span[test-id="print-shipping-label"]').should('be.visible')

        // check that user is not able to edit destination address (since it doesn't belong to him)
        cy.get('app-fulfillment a.button[test-id="edit-tracking"]').should('be.visible').click()
        cy.get('app-fulfillment-form ion-card[test-id="shipTo"]').should('be.visible').click()
        cy.wait(300)
        cy.get('app-address-contact').should('not.exist')

        // set fulfillment as dispatched
        return cy.task('getOrder', {ID: order.ID, account: 'reseller'}) 
      }).then(_order => {
        order = _order
        return cy.task('scanOutbound', {orderID: order.orderLineItems[0].orderID, fulfillmentID: order.fulfillments[0].ID, orderLineItems: order.orderLineItems.map(oli => {return {ID: oli.ID}}), account: 'reseller'})
      })
      .then(() => {
        cy.visit(`/orders/${order.ID}/fulfillment/${order.fulfillments[0].ID}`)

        // check that reseller is not able to edit destination address since it doesn't belong to him
        cy.get('app-fulfillment a.button[test-id="edit-destination"]').should('not.exist')

        // check that reseller is able to edit only fulfillment refernece (since fulfillment already has a shipping label generated)
        cy.get('app-fulfillment a.button[test-id="edit-tracking"]').should('be.visible').click()
        cy.get('app-fulfillment-form ion-card[test-id="shipFrom"]').should('be.visible').click()
        cy.wait(300)
        cy.get('app-address-contact').should('not.exist')

        cy.get('app-fulfillment-form ion-card[test-id="shipTo"]').should('be.visible').click()
        cy.wait(300)
        cy.get('app-address-contact').should('not.exist')

        cy.get('app-fulfillment-form input[formcontrolname="trackingNumber"]').should('be.disabled')
      })
    })

    it("Retailer Account Set as delivered", () => {
      cy.login('retailer')
      .then(() => cy.task('get', 'order_consignor'))
      .then(order => cy.task('getOrder', {ID: order.ID, key: 'order_consignor', account: 'reseller'}))
      .then(order =>{
        cy.visit(`/orders/${order.siblingOrderID}`)
        // open fulfillment
        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        
        cy.get('button#fulfillment-view').should('be.visible').click()
        
        // set as delivered
        for (var oli of order.orderLineItems.filter(oli => oli.accountID == order.accountID)) {
          cy.wait(1000)
          cy.get('app-fulfillment ion-list ion-card').eq(0).should('be.visible').click()
          cy.get('app-input input').should('be.visible').type(`${Math.random().toString(36).slice(2)}`)
          cy.get('button[test-id="confirm"]').click()
          cy.get('ion-toast').contains('Ok', {matchCase: false, includeShadowDom: true})
        }
      })

      cy.wait(1000)
      cy.get('ion-modal button[test-id="confirm"]').should('be.visible').click()
    })
  })

  it("Reseller should try to fulfill with courier but shipFrom address is not validated", () => {
    cy.login('reseller')
    cy.task("createShopifyOrder", {account: 'retailer'})
    .then((orders) => {
      // update addresses to be alid for courier testing
        const updatedConsignor = {
          ID: orders.consignor.consignor.ID,
          account: 'reseller',
          updates: {
            phoneNumber: '7928766999',
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            country: 'US',
            countryCode: 'US',
            countyCode: 'tx',
            validated: 0
          }
        }
        return cy.task('updateAddress', updatedConsignor)
      })
      .then(() => cy.task('get', 'order_consignor'))
      .then((order) => {
        cy.visit(`orders/${order.ID}`)
        // accept items
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#accept').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
          cy.wait(1000)
        })
        
        // create fulfillment
        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        
        cy.get(`button#fulfill`).should('be.visible').click()

        cy.get('app-fulfillment-form mat-select[test-id="select-service-provider"]').click().get('mat-option[aria-disabled="true"]').should('be.visible')
      })
  })

  it("Reseller fulfill and then cancel order", () => {
    cy.login('reseller')
    cy.task("createShopifyOrder", {account: 'retailer'})
    .then((orders) => {
      // update addresses to be alid for courier testing
        const updatedConsignor = {
          ID: orders.consignor.consignor.ID,
          account: 'reseller',
          updates: {
            phoneNumber: '7928766999',
            address: '504 Lavaca St Suite 1100',
            city: 'Austin',
            postcode: '78701',
            country: 'US',
            countryCode: 'US',
            countyCode: 'tx',
            validated: 1
          }
        }
        return cy.task('updateAddress', updatedConsignor)
      })
      .then(() => cy.task('get', 'order_consignor'))
      .then((order) => {
        cy.visit(`orders/${order.ID}`)
        // accept items
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#accept').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
          cy.wait(1000)
        })
        
        // create fulfillment
        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        cy.get(`button#fulfill`).should('be.visible').click()

        cy.fillFulfillmentForm({
          courier: 'ups'
        })

        cy.visit(`orders/${order.ID}`)
        // wait page loads
        cy.get(`app-order-detail ion-list`, { timeout: 12000 }).should('be.visible')
        // check order line item status
        cy.get(`app-order-detail ion-card[test-id="oli"] span[test-id="oli-status"]`).eq(0).contains('fulfilling')

        // cancel items
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#cancel').should('be.visible').click()
          cy.cancelForm()
          cy.wait(1000)
        })

        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        cy.get(`button#fulfillment`).should('not.exist')
      })
  })
})

describe("Transfer", () => {
  describe("Transfer (reseller => retailer)", () => {
    before(() => {
      cy.login('retailer')
      let inventory
      cy.task("createInventory", {account: 'reseller', setAsDelivered: true})
      .then((_inventory) => {
        inventory = _inventory
        for (var item of inventory.items) {
          cy.task('updateItem', {itemID: item.ID, updates: {barcode: `${Math.random().toString(36).slice(2)}`}, account: 'reseller'})
        }
        return cy.all([() => cy.task('get', 'retailer'), () => cy.task('get', 'reseller')])
      })
      .then((resp) => {
          const destinationWarehouse = resp[0].account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
          const originWarehouse = resp[1].account.warehouses.find(warehouse => warehouse.fulfillmentCentre)
    
          //create transfer
          const transferParams ={
              account: 'reseller',
              consigneeID: destinationWarehouse.addressID,
              consignorID: originWarehouse.addressID,
              type: 'transfer',
              accountID: resp[1].accountID,
              details: inventory.items.map(item => {return {itemID: item.ID}})
          }
          return cy.task('createOrder', transferParams)
        })
        .then((transferOut) => cy.all([() => cy.task('getOrder', {ID: transferOut.ID, key: 'transferOut', account: 'reseller'}), () => cy.task('getOrder', {ID: transferOut.siblingOrderID, key: 'transferIn', account: 'retailer'})]))
        .then((res) => {
          const [transferOut, transferIn] = res
          // update addresses to be alid for courier testing
          const updatedConsignor = {
            ID: transferOut.consignor.ID,
            account: 'reseller',
            updates: {
              phoneNumber: '7928766999',
              address: '504 Lavaca St Suite 1100',
              city: 'Austin',
              postcode: '78701',
              country: 'US',
              countryCode: 'US',
              countyCode: 'tx',
              validated: 1
            }
          }

          const updatedConsignee = {
            ID: transferIn.consignee.ID,
            account: 'retailer',
            updates: {
              phoneNumber: '7928766999',
              address: '1000 Louisiana St Suite 1990',
              city: 'Houston',
              postcode: '77002',
              country: 'US',
              countryCode: 'US',
              countyCode: 'tx',
              validated: 1
            }
          }
          return cy.all([() => cy.task('updateAddress', updatedConsignor), () => cy.task('updateAddress', updatedConsignee)])
        })
    })

    it('Consignor should create fulfillment with courier', () => {
      cy.login('reseller')

      cy.task('get', 'transferOut')
      .then((transferOut) => {
        cy.visit(`orders/${transferOut.ID}`)
  
        // create fulfillment
        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        
        cy.get(`button#fulfill`).should('be.visible').click()
  
        cy.fillFulfillmentForm({
          courier: 'ups'
        })
  
        cy.visit(`orders/${transferOut.ID}`)
        // wait page loads
        cy.get(`app-order-detail ion-list`).should('be.visible')
        // check order line item status
        cy.get(`app-order-detail ion-card[test-id="oli"] span[test-id="oli-status"]`).eq(0).contains('fulfilling')
  
        // check that item can't be set as delivered - user should not be able to set as delivered
        cy.get(`app-order-detail ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        cy.wait(300)
                cy.get('button#deliver').should('not.exist')
  
        // go to fulfillment
        cy.get('button#fulfillment-view').should('be.visible').click()
        cy.get('app-fulfillment ion-list ion-card').eq(0).should('be.visible').click()
        cy.get('app-input input').should('not.exist') // can't assign barcode
  
        //verify shipping label has been generated
        cy.get('app-fulfillment span[test-id="tracking-number"]').should('be.visible')
        cy.get('app-fulfillment span[test-id="print-shipping-label"]').should('be.visible')
  
        return cy.task('getOrder', {ID: transferOut.ID, key: 'transferOut', account: 'reseller'})
      })
      .then((transferOut) => {
        // set fulfillment as dispatched
        cy.task('scanOutbound', {orderID: transferOut.orderLineItems[0].orderID, fulfillmentID: transferOut.fulfillments[0].ID, orderLineItems: transferOut.orderLineItems.map(oli => {return {ID: oli.ID}}), account: 'reseller'})
      })
    })

    it('Retailer should complete fulfillment', () => {
      cy.login('retailer')
      cy.task('get', 'transferIn')
      .then((transferIn) => {
        cy.visit(`orders/${transferIn.ID}`)

        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        
        cy.get(`button#fulfillment-view`).should('be.visible').click()

        //scan inbound
        for (var oli of transferIn.orderLineItems) {
          cy.get(`ion-card[test-id=${oli.ID}]`).should('be.visible').click()
          cy.get('app-input input').should('be.visible').type(oli.item.barcode)
          cy.get('button[test-id="confirm"]').click()
          cy.wait(500)
        }

        cy.get(`app-confirm button[test-id="confirm"]`).should('be.visible').click()
        cy.get(`app-order-detail span[test-id="order-status"]`).should('be.visible').contains('delivered')
      })
    })
  })


  describe("Transfer internal (warehouseA => warehouseB)", () => {
    before(() => {
      let inventory
      cy.task("createInventory", {setAsDelivered: true, account: 'retailer'})
      .then((_inventory) => {
        inventory = _inventory
        for (var item of inventory.items) {
          cy.task('updateItem', {itemID: item.ID, updates: {barcode: `${Math.random().toString(36).slice(2)}`}, account: 'retailer'})
        }
        return cy.task('get', 'retailer')
      })
      .then((retailer) => {
        const destinationWarehouse = retailer.account.warehouses[0]
        const originWarehouse = retailer.account.warehouses[1]
  
  
        const transferParams ={
          account: 'retailer',
          consigneeID: destinationWarehouse.addressID,
          consignorID: originWarehouse.addressID,
          type: 'transfer',
          accountID: retailer.accountID,
          details: inventory.items.map(item => {return {itemID: item.ID}})
        }
    
        return cy.task('createOrder', transferParams)
      })
      .then((transferOut) => cy.all([() => cy.task('getOrder', {ID: transferOut.ID, key: 'transferOut', account: 'retailer'}), () => cy.task('getOrder', {ID: transferOut.siblingOrderID, key: 'transferIn', account: 'retailer'})]))  
    })

    it('Retailer fulfills from warehouseA (outbound)', () => {
      cy.login('retailer')
      cy.task('get', 'transferOut')
      .then((transferOut) => {
        cy.visit(`orders/${transferOut.ID}`)
  
        // create fulfillment
        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        cy.get(`button#fulfill`).should('be.visible').click()
  
        cy.fillFulfillmentForm({
          'shipFrom': 'Storage #1'
        })
  
        cy.visit(`orders/${transferOut.ID}`)
        // wait page loads
        cy.get(`app-order-detail ion-list`).should('be.visible')
        // check order line item status
        cy.get(`app-order-detail ion-card[test-id="oli"] span[test-id="oli-status"]`).eq(0).contains('fulfilling')
  
        // go to fulfillment
        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        cy.get('button#fulfillment-view').should('be.visible').click()

        // set as dispatched
        for (var oli of transferOut.orderLineItems) {
          cy.get(`app-fulfillment ion-list ion-card[test-id=${oli.ID}]`).should('be.visible').click()
          cy.get('app-input input').should('be.visible').type(oli.item.barcode)
          cy.get('button[test-id="confirm"]').click()
          cy.wait(500)
        }

        cy.get(`app-confirm button[test-id="confirm"]`).should('be.visible').click()
        cy.get(`app-order-detail span[test-id="order-status"]`).should('be.visible').contains('dispatched')
      })
    })

    it('Retailer fulfills to warehouseB (inbound)', () => {
      cy.login('retailer')
      cy.task('get', 'transferIn')
      .then((transferIn) => {
        cy.visit(`orders/${transferIn.ID}`)

        cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
        cy.get(`button#fulfillment-view`).should('be.visible').click()

        //scan inbound
        for (var oli of transferIn.orderLineItems) {
          cy.get(`ion-card[test-id=${oli.ID}]`).should('be.visible').click()
          cy.get('app-input input').should('be.visible').type(oli.item.barcode)
          cy.get('button[test-id="confirm"]').click()
          cy.wait(500)
        }

        cy.get(`app-confirm button[test-id="confirm"]`).should('be.visible').click()
        cy.get(`app-order-detail span[test-id="order-status"]`).should('be.visible').contains('delivered')
      })
    })
  })
})

