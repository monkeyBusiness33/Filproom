  /// <reference types="Cypress" />
const { ACCOUNT_TYPES } = require('../shared/constants');
const { generateRandomString } = require('../shared/utils')
describe("Inbound Orders", () => {
  it("Create Fulfillment, Scan Inbound", () => {
    cy.login('retailer')
    cy.task("createOrder", {type: 'inbound', autoCreateFulfillment: false, productQty: [1,1,1]})

    cy.task("get", "order").then(order => {
      cy.visit(`/orders/${order.ID}`)

      cy.get('ion-card[test-id="oli"]').should('be.visible').eq(0).click()
      cy.get('button#fulfill').should('be.visible').eq(0).click()
      cy.fillFulfillmentForm(
        {shipTo: 'storage #1'}
      )

      cy.get('app-fulfillment span[test-id="view-order"]').should('be.visible').eq(0).click()

      //Order should have status fulfilling
      cy.get('span[test-id="order-status"]').should('contain.text', 'fulfilling');

      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'fulfilling')
      })

      //Scan Inbound
      cy.task("getOrder", {ID: order.ID}).then(order => cy.scanInbound(order, order.fulfillments[0]))

      cy.visit(`/orders/${order.ID}`)

      //Order should have status DELIVERED
      cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'delivered')
      })
    })
  })

  it("Should create manual fulfillment with set as delivered", () => {
    cy.login('retailer')
    cy.task("createOrder", {type: 'inbound', productQty: [5]})
    cy.task("get", "order").then(order => cy.visit(`/orders/${order.ID}`))

    cy.get('ion-card[test-id="oli"]').should('be.visible').eq(0).click()
    cy.get('button#fulfill').should('be.visible').eq(0).click()
    cy.fillFulfillmentForm({shipTo: 'storage #1', skip: true})

    //Order should have status DELIVERED
    cy.get('app-fulfillment span[test-id="view-order"]').should('be.visible').eq(0).click()

    cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

    //Order Line Items should have status Delivered
    cy.get('span[test-id="oli-status"]').each(($el) => {
      cy.wrap($el).should('contain.text', 'delivered')
    })
  })

  it("Cancel while fulfilling", () => {
    cy.login('retailer')
    cy.task("createOrder", {type: 'inbound', fulfillment: {}, productQty: [1,1,1]})

    cy.task("get", "order").then((order) => {
      cy.visit(`/orders/${order.ID}`)
      order.orderLineItems.map(oli => {
        cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
        cy.get('button#cancel').should('be.visible').click()
        cy.cancelForm({reason: 'test'})
        cy.wait(500)
      })
    })

    //Check order status
    cy.get('span[test-id="order-status"]').should('contain.text', 'deleted');

    //Check Order Line Items status
    cy.get('span[test-id="oli-status"]').each(($el) => {
      cy.wrap($el).should('contain.text', 'deleted')
    })
  })

  it('Add a purchase transaction to a purchase order', () => {

    /**
    * TEST CONFIRM CHECKS
    *
    * - Retailer add stock
    * - Retailer goes to the purchase order of the added stock
    * - Click in Transaction Add
    * - Open Transaction Data Modal
    * - Fill Purchase Transaction Data (Set as paid checkbox)
    * - Finally Check in transaction list if payment is present (with status paid)
    */

    cy.login('retailer')
    cy.task("createOrder", { type: 'inbound', fulfillment: {}, productQty: [1], account: 'retailer' })
    cy.task("get", "order").then(order => {
      cy.visit(`/orders/${order.ID}`);

      // Open Add Transaction form modal
      cy.get('a[test-id="add-transaction"]').should('be.visible').eq(0).click()

      // Complete and submit purchase transaction form
      cy.get('input[formControlName="grossAmount"]').type('250')
      cy.get('input[formControlName="reference"]').type('test')
      cy.get('mat-checkbox[formControlName="setAsPaid"]').should('be.visible').click()
      cy.get('mat-select[formControlName="paymentMethod"]').should('be.visible').click().get(`mat-option`).eq(1).click()
      cy.get('button[test-id="submit"]').should('be.visible').click()

      // Check if purchase was created
      cy.get('table[test-id="tx-list"]').should('be.visible')
      cy.get('table[test-id="tx-list"] tbody tr').should((rows) => {
        expect(rows.length).to.equal(1);
      });

      // get order updated and check if was paid
      cy.task("get", "order").then(order => cy.task('getOrder', { ID: order.ID })).then((order) => {
        console.log(order.transactions[0].ID)
        cy.get(`table tr[test-id="tx-${order.transactions[0].ID}"]`).should('be.visible')
        cy.get(`table tr[test-id="tx-${order.transactions[0].ID}"] span`).contains('paid').should('exist');
      })
    })
  })

  it('Checking that tx can\'t be created for inbound orders coming from consignment sale', () => {

    /**
    * TEST CONFIRM CHECKS
    *
    * - createShopifyOrder
    * - fulfill reseller order
    * - check inbound retailer order that user can't add a tx
    */
    cy.login('retailer')
    cy.task("createShopifyOrder")

    cy.login('reseller')
    cy.task('get', 'order_consignor').then(order => cy.visit(`/orders/${order.ID}`))
    // check order state
    // Order should have status pending
    cy.get('span[test-id="order-status"]').should('contain.text', 'pending');

    // Order Line Items should have status pending
    cy.get('span[test-id="oli-status"]').each(($el) => {
      cy.wrap($el).should('contain.text', 'pending')
    })

    cy.task('get', 'order_consignor').then(order => {
      order.orderLineItems.map(oli => {
        cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
        cy.get('button#accept').should('be.visible').click()
        cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
        cy.wait(1000)
        cy.toastMessage('Order Line Item Updated')
        cy.wait(1000)
      })
    })

    // create fulfillment
    cy.get('ion-card[test-id="oli"]').should('be.visible').eq(0).click()
    cy.get('button#fulfill').should('be.visible').eq(0).click()
    cy.fillFulfillmentForm()

    cy.wait(1000)

    // Open Add Transaction expect to be invisible
    cy.task('get', 'order_consignor').then(order => cy.visit(`/orders/${order.ID}`))
    cy.get('a[test-id="add-transaction"]').should('not.exist')


  })


})

describe("Sales Orders", () => {
  describe("Admin Order", () => {
    before(() => {
      cy.login('retailer')
      cy.task("createOrder", {type: "outbound", productQty: [2,2]})
    })

    beforeEach( () => {
      cy.login('retailer')
      cy.task("get", "order").then((order) => cy.visit(`/orders/${order.ID}`))
    })

    it("Should create fulfillment & scan outbound", () => {
      // check order state
      // Order should have status pending
      cy.get('span[test-id="order-status"]').should('contain.text', 'fulfill');

      //Order Line Items should have status pending
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'fulfill')
      })

      cy.get('ion-card[test-id="oli"]').should('be.visible').eq(0).click()
      cy.get('button#fulfill').should('be.visible').eq(0).click()
      cy.fillFulfillmentForm({shipFrom: 'Storage #1'})

      //Order should have status fulfilling
      cy.get('app-fulfillment span[test-id="view-order"]').should('be.visible').eq(0).click()
      cy.get('span[test-id="order-status"]').should('contain.text', 'fulfilling');

      //Order Line Items should have status pending
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'fulfilling')
      })

      // update order
      cy.task("get", "order").then(order => cy.task('getOrder', {ID: order.ID})).then((order) => {
        cy.scanOutbound(order, order.fulfillments[0])
      })
    })

    it("Order should be dispatched", () => {
      //Order should have status dispatched
      cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'dispatched')
      })
    })

    it("Order should be delivered", () => {
      cy.task("get", "order").then((order) => {
        order.orderLineItems.map((oli, index) => {

          cy.get('ion-card[test-id="oli"]').eq(index).should('be.visible').click({force: true})
          cy.get('button[id="deliver"]').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
          cy.wait(1000)
          cy.toastMessage('Order Line Item Updated')

        })

      })

      //Check order status
      cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

      //Check Order Line Items status
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'delivered')
      })
    })

    it("Should return a delivered order", () => {

      /**
       * 1. Create order
       * 2. Fulfill order
       * 3. Cancel order
       * 4. Check order status
       */

      const orderOutParams = {
        account: 'retailer',
        type: 'outbound',
        foreignID: null,
        productQty: [2],
        fulfillment: {
          setAsDispatched: true,
          setAsDelivered: true
        }
      }
      //create order
      cy.task('createOrder', orderOutParams)
          .then((order) => {
            expect(order.quantity).equals(2) //check quantity
            expect(order.status.name).equals("delivered") //check status
            expect(order.orderLineItems.length).equals(2) //orderLineItems

            //check orderLineItems
            order.orderLineItems.forEach(oli => {
              expect(oli.status.name).equals("delivered")
              expect(oli.fulfillment.status.name).equals("delivered")
            })

            const saleTx = order.transactions.find(tx => tx.type == "sale")
            const oliTotalSaleAmount = order.orderLineItems.reduce((total, orderLineItem) => total += parseFloat(orderLineItem.price), 0).toFixed(2)
            expect(saleTx.grossAmount).equals(oliTotalSaleAmount)

            cy.visit(`/orders/${order.ID}`)
            //check orderLineItems
            order.orderLineItems.map((oli, index) => {
              //if index is odd then refund
              cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
              cy.get('button#cancel').should('be.visible').click()
              if (index % 2 == 0) {
                cy.get('mat-checkbox[formControlName="restock"]').should('be.visible').click()
                cy.cancelForm({reason: 'test', selectWarehouse: true})
              } else {
                cy.cancelForm({reason: 'test'})
              }

              cy.wait(2000)
              cy.toastMessage('Order Line Item Updated')
              cy.wait(1000)
            })

            //Refund order

            order.orderLineItems.forEach(oli => {
              cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
              cy.get('button#replace').should('be.visible').click()
              cy.get('button#refund').should('be.visible').click()
              cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
              cy.wait(1000)
              cy.toastMessage('Order Line Item Updated')
              cy.wait(1000)
            })

            //Fetch order to check data
            return cy.task('getOrder', {ID: order.ID})
          }).then((order) => {
        expect(order.quantity).equals(0) //check quantity - updated now quantity gets adjusted to reflect deleted items
        expect(order.status.name).equals("deleted") //check status
        expect(order.orderLineItems.length).equals(2) //orderLineItems


        let restockedItems = 0

        //check orderLineItems
        order.orderLineItems.forEach(oli => {
          if (oli.restocked) {
            restockedItems++
          }
          expect(oli.status.name).equals("deleted")
          expect(oli.fulfillmentID).equals(null)
        })
        //check items restocked
        expect(restockedItems).equals(1)

        const saleTx = order.transactions.find(tx => tx.type == "sale")
        const oliTotalSaleAmount = order.orderLineItems.reduce((total, orderLineItem) => total += parseFloat(orderLineItem.price), 0).toFixed(2)
        expect(saleTx.grossAmount).equals(oliTotalSaleAmount)
      })
    })
  })

  describe("Consignor Order - Items at external location", () => {
    before(() => {
      cy.login('retailer')
      cy.task("createShopifyOrder")
    })

    it('Admin User shouldn\'t be able to accept consignor items', () => {
      cy.task('get', 'order_admin').then(order => cy.visit(`/orders/${order.ID}`))
      // check order state
      cy.get('span[test-id="order-status"]').should('contain.text', 'partially-confirmed');

      cy.task('get', 'order_admin').then(order => {
        order.orderLineItems.filter(oli => oli.item.accountID != order.accountID).map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#accept').should('be.visible').click()
          cy.wait(2000)

          cy.toastMessage("Can't Accept Order Line Item. The Item Doesn't Belong To You")
          cy.wait(1000)
        })
      })
    })

    it('Consignor User should accept and fulfill', () => {
      cy.login('reseller')
      cy.task('get', 'order_consignor').then(order => cy.visit(`/orders/${order.ID}`))
      // check order state
      // Order should have status pending
      cy.get('span[test-id="order-status"]').should('contain.text', 'pending');

      // Order Line Items should have status pending
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'pending')
      })

      cy.task('get', 'order_consignor').then(order => {
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#accept').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
          cy.wait(1000)
          cy.toastMessage('Order Line Item Updated')
          cy.wait(1000)
        })
      })

      // create fulfillment
      cy.get('ion-card[test-id="oli"]').should('be.visible').eq(0).click()
      cy.get('button#fulfill').should('be.visible').eq(0).click()
      cy.fillFulfillmentForm()

      // check order state
      cy.get('app-fulfillment span[test-id="view-order"]').should('be.visible').eq(0).click()
      //Order should have status dispatched
      cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

      //Order Line Items should have status dispatched
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'dispatched')
      })

      // check that it can't deliver
      cy.wait(1000)
      cy.get(`ion-card[test-id="oli"]`).eq(0).should('be.visible').click()
      cy.get('button#deliver').should('not.exist')
    })

    it('Admin User should scan inbound consignor items', () => {
      // refresh consignor order to fetch sibling orderr ID
      cy.task('get', 'order_consignor')
      .then(order => cy.task('getOrder', {ID: order.ID, key: 'order_consignor', account: 'reseller'}))
      .then(order => cy.task('getOrder', {ID: order.siblingOrderID, key: 'admin_inbound', account: 'retailer'}))

      cy.login('retailer')
      cy.task('get', 'admin_inbound').then(order => cy.visit(`/orders/${order.ID}`))

      //Order should have status DISPATCHED
      cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

      //Order Line Items should have status DISPATCHED
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'dispatched')
      })
    })

    it("Scan Items inbound", () => {
      cy.task('get', 'admin_inbound').then(order => cy.scanInbound(order, order.fulfillments[0]))
    })

    it('Consignor Outbound Order should be Delivered', () => {
      cy.login('reseller')
      cy.task('get', 'order_consignor').then(order => cy.visit(`/orders/${order.ID}`))

      //Order should have status dispatched
      cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

      //Order Line Items should have status dispatched
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'delivered')
      })
    })

    it('Admin Inbound Order Should be Delivered', () => {
      cy.login('retailer')
      cy.task('get', 'order_consignor').then(order => cy.visit(`/orders/${order.siblingOrderID}`))

      //Order should have status DELIVERED
      cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

      //Order Line Items should have status Delivered
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'delivered')
      })
    })

    it('Admin User - Process Order Outbound', () => {
      cy.login('retailer')
      cy.task('get', 'order_admin').then(order => cy.visit(`/orders/${order.ID}`))
      // Check Order State
      // Order should have status Delivered
      cy.get('span[test-id="order-status"]').should('contain.text', 'fulfill');

      // Order Line Items should have status Delivered
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'fulfill')
      })

      // Should Create Fulfillment & process outbound
      cy.get('ion-card[test-id="oli"]').should('be.visible').eq(0).click()
      cy.get('button#fulfill').should('be.visible').eq(0).click()
      cy.fillFulfillmentForm({shipFrom: 'Storage #1'})

      cy.wait(500)
      cy.task('get', 'order_admin')
      .then(order => cy.task('getOrder', {ID: order.ID, key:'order_admin'}))
      .then(order => cy.scanOutbound(order, order.fulfillments[0]))

      cy.task('get', 'order_admin').then(order => cy.visit(`/orders/${order.ID}`))
      // check order state
      //Order should have status dipatched
      cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

      //Order Line Items should have status dispatched
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'dispatched')
      })
    })

    it('Admin User -  Pay consignor with stripe', () => {
      cy.login('retailer')
      cy.task('get', 'order_admin').then(order => {
        cy.visit(`/orders/${order.ID}`)
        const payoutTx = order.transactions.find(tx => tx.type == "payout")
        cy.get(`div.payments-section tbody tr[test-id=tx-${payoutTx.ID}]`).click()
        cy.get('app-payout-form mat-select[formcontrolname="paymentMethod"]').should('be.visible').click().get(`mat-option`).eq(1).click()
        cy.get('button[test-id="submit"]').should('be.visible').click()
        cy.wait(5000) // wait for stripe
        cy.get('button[test-id="submit"]').should('not.exist')
        return cy.task('getOrder', {ID: order.ID})
      }).then(order => {
      })
    })
  })

  describe("Payouts", () => {
    it('Pay a consignor tx that failed previously', () => {
      let adminOrder, payoutTx;
      cy.login('retailer')
      cy.task("createShopifyOrder")
      .then((order) => {
        adminOrder = order.admin
        payoutTx = adminOrder.transactions.find(tx => tx.type == "payout")
        return cy.task('updateTransaction', {ID: payoutTx.ID, updates: {status: "reverted"}})
      })
      .then(() => {
        cy.visit(`/orders/${adminOrder.ID}`)
        cy.get(`table tr[test-id="tx-${payoutTx.ID}"]`).click()

        cy.get('app-payout-form mat-form-field mat-select[formcontrolname="paymentMethod"]')
        .should('be.visible').click()
        .get(`mat-option`).contains('Stripe').click()

        cy.get('app-payout-form button[test-id="submit"]').should('be.visible').click()
        return cy.visit(`/orders/${adminOrder.ID}`)
      })
      .then(() => {
        cy.get(`table tr[test-id="tx-${payoutTx.ID}"]`).should('be.visible').click()

        cy.get('app-payout-form button[test-id="submit"]').should('not.exist')
      })
    })
  })

  describe("Cancellation tx and pay", () => {
    /**
      * TEST CONFIRM CHECKS
      *
      * - createShopifyOrder
      * - Cancel a consignor item and add cancellation fee
      * - Set the Cancellation Payout payment method as Revolut
      * - Assure the cancellation fee tx has been set as processing
      */
    before(() => {
      cy.login('retailer')
      cy.task("createShopifyOrder")
    })

    it("Cancel a consignor item and add cancellation fee", () => {
      cy.login('reseller')
      cy.task('get', 'order_consignor').then(order => {
        cy.visit(`/orders/${order.ID}`)
        // check order state
        // Order should have status pending
        cy.get('span[test-id="order-status"]').should('contain.text', 'pending');
        // Order Line Items should have status pending
        cy.get('span[test-id="oli-status"]').each(($el) => {
          cy.wrap($el).should('contain.text', 'pending')
        })
        order.orderLineItems.map((oli, index) => {
          if(index > 0) return;
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#cancel').should('be.visible').click()
          cy.cancelForm({ reason: '' })
          cy.wait(2000)
          cy.toastMessage('Order Line Item Updated')
          cy.wait(1000)
        })
      })

      cy.task("get", "order_admin").then((order) => {
        cy.login('retailer')
        cy.visit(`/orders/${order.ID}`)
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').then((card) => {
            //Only click if oli has DELETED status
            if (card.find('span[test-id="oli-status"]').text().includes('deleted')) {
              cy.wrap(card).click();
              cy.get('button#add-cancellation-fee').should('be.visible').click()
              //Complete and submit cancellation form
              cy.get('input[formControlName="grossAmount"]').type('299')
              cy.get('input[formControlName="reference"]').type('Cancellation fee ref')
              cy.get('button[test-id="submit"]').should('be.visible').click()
              cy.wait(2000)
              cy.toastMessage('Transaction generated')
            }
          });
        })
      })
    })

    it("Set the Cancellation Payout payment method as Revolut", () => {
      cy.login('retailer')

      cy.task("get", "order_admin").then(order => cy.task('getOrder', { ID: order.ID })).then((order) => {
        cy.visit(`/orders/${order.ID}`)
        order.transactions.map(transaction => {
          if(transaction.type !== "cancellation fee" && transaction.status === 'unpaid') {
            cy.get(`table tr[test-id="tx-${transaction.ID}"]`).should('be.visible').click();
            cy.wait(2000)
            cy.get('mat-select[formControlName="paymentMethod"]').should('be.visible').click().get(`mat-option`).eq(1).click()
            cy.get('button[test-id="submit"]').should('be.visible').click()
            cy.wait(5000)
            cy.toastMessage('Payment Generated')
          }
        })
      })
    })

    it("Assure the cancellation fee tx has been set as paid", () => {
      cy.login('retailer')

      cy.task("get", "order_admin").then(order => cy.task('getOrder', { ID: order.ID })).then((order) => {
        cy.visit(`/orders/${order.ID}`)
        cy.get('table[test-id="tx-list"] tr')
          .filter(':has(span:contains("processing"))')
          .should('have.length', 2);
        cy.get('table[test-id="tx-list"] tr')
          .filter(':has(span:contains("canceled"))')
          .should('have.length', 1);
      })
    })
  })

  describe("Consignor Order - Items at admin location that is not a fulfillment centre", () => {
    // consignor items at admin location that is not a fulfillment centre
    before(() => {
      let harrodsWarehouse
      cy.task('login', 'retailer')
      .then((user) => {
        harrodsWarehouse = user.account.warehouses.find(wh => !wh.fulfillmentCentre)
        // cgenerate consignor items
        return cy.task('createInventory', {quantity: 2, account: 'reseller', key: 'consignorInventory', setAsDelivered: true})
      })
      .then((inventory) => {
        // transfer to not fulfilling location
        return cy.task('createOrder', {
          type: 'transfer',
          account: 'reseller',
          consignorID: inventory.warehouse.addressID,
          consigneeID: harrodsWarehouse.addressID,
          fulfillment: {
            setAsDispatched: true,
            setAsDelivered: true
          },
          details: inventory.items.map(item => {return {itemID: item.ID}})}
        )
      })
      .then((order) => cy.task('getOrder', {ID: order.siblingOrderID}))
      .then((order) => cy.task('createShopifyOrder', {
          line_items: [
            {'variant_id': order.orderLineItems[0].variant.foreignID, 'product_id': order.orderLineItems[0].product.foreignID, 'quantity': 2, 'price': 9999}
          ]}))
    })

    it('Consignor User - Check Outbound State', () => {
      cy.login('reseller')
      cy.task('get', 'order_consignor').then(order => cy.visit(`/orders/${order.ID}`))
      // Check order state
      cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

      //Order Line Items should have status pending
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'delivered')
      })
    })

    it('Admin Order should be ready to be fulfilled', () => {
      cy.login('retailer')
      cy.task('get', 'order_admin').then(order => cy.visit(`/orders/${order.ID}`))

      // Order should have status pending
      cy.get('span[test-id="order-status"]').should('contain.text', 'fulfill');

      //Order Line Items should have status pending
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'fulfill')
      })
    })

    it('Should Transfer to fulfillment centre', () => {
      cy.login('retailer')
      cy.task('get', 'order_admin').then(order => {
        cy.visit(`/orders/${order.ID}`)

        const orderLineItemToTransfer = order.orderLineItems.find(oli => !oli.item.warehouse.fulfillmentCentre)
        cy.get(`ion-card#${orderLineItemToTransfer.ID}`).should('be.visible').click({ force: true })
        cy.get('button#transfer').should('be.visible').click()
        cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
        cy.wait(500)
        cy.get(`ion-card[test-id="oli"]`).should('be.visible').eq(0).click({ force: true })

        // fulfill transfer out
        cy.get('button#fulfill').should('be.visible').eq(0).click()
        cy.fillFulfillmentForm({shipFrom: orderLineItemToTransfer.item.warehouse.name, skip: true})

        // go to transfer in
        cy.get(`ion-card[test-id="oli"]`).should('be.visible').eq(0).click({ force: true })
        cy.get('button#orders').should('be.visible').click()
        cy.get('div.list-item').should('be.visible').eq(3).click()

        // complete transfer in - problem with oli
        cy.wait(1000)
        cy.get(`ion-card[test-id="oli"]`).filter(':visible').eq(0).should('be.visible').click({ force: true })
        cy.get('button#deliver').should('be.visible').click()
        cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
        cy.wait(1000)
        cy.get(`ion-card[test-id="oli"]`).filter(':visible').eq(1).should('be.visible').click({ force: true })
        cy.get('button#deliver').should('be.visible').click()
        cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
        cy.wait(1000)
      })
    })

    it('Admin User - Should Fulfill Order Outbound', () => {
      cy.login('retailer')
      cy.task('get', 'order_admin').then(order => {
        cy.visit(`/orders/${order.ID}`)

        cy.get(`ion-card[test-id="oli"]`).should('be.visible').eq(0).click({ force: true })
        cy.get('button#fulfill').should('be.visible').click()
        cy.fillFulfillmentForm({shipFrom: 'storage #1'})

        // Order should have status fulfilling
        cy.get('app-fulfillment span[test-id="view-order"]').should('be.visible').click()

        cy.get('span[test-id="order-status"]').should('contain.text', 'fulfilling');

        //Order Line Items should have status pending
        cy.get('span[test-id="oli-status"]').each(($el) => {
          cy.wrap($el).should('contain.text', 'fulfilling')
        })

        // scan outbound
        cy.task('getOrder', {ID: order.ID}).then(order => cy.task('scanOutbound', {orderID: order.orderLineItems[0].orderID, fulfillmentID: order.orderLineItems[0].fulfillmentID, orderLineItems: order.orderLineItems}))

        cy.reload(true)

        // Order should have status DISPATCHED
        cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

        //Order Line Items should have status Dispatched
        cy.get('span[test-id="oli-status"]').each(($el) => {
          cy.wrap($el).should('contain.text', 'dispatched')
        })
      })
    })
  })

  describe("Consignor Rejects - Replacement item is sourced", () => {
    before(() => {
      cy.task("createShopifyOrder")
    })

    it('Consignor User - Should reject Order Line Items', () => {
      cy.login('reseller')
      cy.task('get', 'order_consignor').then(order => cy.visit(`/orders/${order.ID}`))

      //Order should have status pending
      cy.get('span[test-id="order-status"]').should('contain.text', 'pending');

      //Order Line Items should have status pending
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'pending')
      })

      cy.task('get', 'order_consignor').then(order => {
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#cancel').should('be.visible').click()
          cy.get('mat-checkbox[formControlName="restock"]').should('be.visible').click()
          cy.cancelForm({reason: 'test', selectWarehouse: true})
          cy.wait(2000)
          cy.toastMessage('Order Line Item Updated')
          cy.wait(1000)
        })
      })

      //Order should have status rejected
      cy.get('span[test-id="order-status"]').should('contain.text', 'deleted');

      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'deleted')
      })


      cy.get('span[test-id="restocked"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'RESTOCKED')
      })
    })

    it('Admin User - Select Source Replacements', () => {
      cy.login('retailer')
      cy.task('get', 'order_admin').then(order => cy.visit(`orders/${order.ID}`))

      // Should source Order Line Items
      //refetch the updated order
      cy.task('get', 'order_admin').then(order => cy.task('getOrder', {ID: order.ID, key: 'order_admin'})).then(order => {
        order.orderLineItems.filter(oli => oli.item.accountID != order.accountID).map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.wait(500)
          cy.get('button#replace').should('be.visible').click()
          cy.get('button#source').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
          cy.wait(1000)
          cy.toastMessage('Order Line Item Updated')
          cy.wait(500)
        })
      })
    })

    it('Admin User - Should Fulfill Inbound Order and Outbound Order', () => {
      cy.login('retailer')

      // complete fulfillment for all sourcing inbound orders (2 items)
      for (let i = 0; i < 2; i++) {
        cy.visit(`/orders?type=inbound&status=all`)
        //refetch the updated order
        cy.task('get', 'order_admin').then(order => cy.get('fliproom-searchbar input').should('be.visible').type(order.reference1))
        cy.get('ion-list ion-card').should('be.visible').eq(i).click()

        cy.get('ion-card[test-id="oli"]').should('be.visible').eq(0).click()
        cy.get('button#fulfill').should('be.visible').eq(0).click()
        cy.fillFulfillmentForm({shipTo: 'Storage #1', skip: true})

        //Sourcing Order should have status DELIVERED
        cy.get('app-fulfillment span[test-id="view-order"]').should('be.visible').eq(0).click()

        cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

        //Sourcing Order Line Items should have status Delivered
        cy.get('span[test-id="oli-status"]').each(($el) => {
          cy.wrap($el).should('contain.text', 'delivered')
        })
      }

      // go to outbound order
      cy.get('ion-card[test-id="oli"]').eq(0).click()
      cy.get('button#orders').should('be.visible').click()
      cy.get('app-orders-list div.list-item').eq(1).should('be.visible').click()
      cy.wait(500)

      // Should accept sourced olis, fulfill and dispatch
      cy.task('get', 'order_admin').then(order => cy.task('getOrder', {ID: order.ID})).then(order => { // accept sourced order line items
        order.orderLineItems.filter(oli => oli.status.name == "pending" && oli.item.accountID == oli.accountID ).map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#accept').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
          cy.wait(500)
        })

        cy.get(`ion-card#${order.orderLineItems.find(oli => oli.status.name == "pending" && oli.item.accountID == oli.accountID).ID}`).should('be.visible').click({force: true})
      })

      cy.get('button#fulfill').should('be.visible').eq(0).click()
      cy.fillFulfillmentForm({shipFrom: 'Storage #1', skip: true})

      //Order should have status dispatched
      cy.get('app-fulfillment span[test-id="view-order"]').should('be.visible').eq(0).click()
      cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

      //Order Line Items should have status dispatched
      cy.task('get', 'order_admin').then(order => cy.task('getOrder', {ID: order.ID})).then(order => {
        expect(order.orderLineItems.filter(oli => oli.status.name == "dispatched").length).equal(4)
        expect(order.orderLineItems.filter(oli => oli.fulfillmentID != null).length).equal(4)
        expect(order.orderLineItems.filter(oli => oli.status.name == "deleted").length).equal(2)
      })
    })
  })

  describe("Consignor Rejects - Replacement item from another consignor is selected", () => {
    before(() => {
      cy.task("createShopifyOrder")
    })

    it('Consignor User - Should reject Order Line Items', () => {
      cy.login('reseller')
      cy.task('get', 'order_consignor').then(order => cy.visit(`/orders/${order.ID}`))

      //Order should have status pending
      cy.get('span[test-id="order-status"]').should('contain.text', 'pending');

      //Order Line Items should have status pending
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'pending')
      })

      cy.task('get', 'order_consignor').then(order => {
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#cancel').should('be.visible').click()
          cy.get('mat-checkbox[formControlName="restock"]').should('be.visible').click()
          cy.cancelForm({reason: 'test', selectWarehouse: true})
          cy.wait(2000)
          cy.toastMessage('Order Line Item Updated')
          cy.wait(1000)
        })
      })

      //Order should have status rejected
      cy.get('span[test-id="order-status"]').should('contain.text', 'deleted');

      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'deleted')
      })

      cy.get('span[test-id="restocked"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'RESTOCKED')
      })
    })

    it('Admin User - Select Replace Replacements', () => {
      let replacementStock, adminOrder, orderLineItemsToReplace;

      cy.task('get', 'order_admin')
      .then(order => cy.task('getOrder', {ID: order.ID, key: 'order_admin'}))
      .then(order => {
        adminOrder = order
        orderLineItemsToReplace = order.orderLineItems.filter(oli => oli.canceledAt)
        //add replaceent stock
        return cy.task('createInventory', {quantity: 2, productID: orderLineItemsToReplace[0].productID, productVariantID: orderLineItemsToReplace[0].productVariantID, account:'reseller-2'})
      })
      .then(inv => {
        replacementStock = inv
        return cy.login('retailer')
      }).then(() => {
        cy.visit(`orders/${adminOrder.ID}`)

        // Should replace Order Line Items canceled
        for (var idx=0; idx < orderLineItemsToReplace.length; idx++) {
          const oli = orderLineItemsToReplace[idx]
          const itemReplacing = replacementStock.items[idx]
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#replace').should('be.visible').click()
          cy.wait(1000)
          cy.get('button#replace').should('be.visible').click()
          cy.wait(1000)
          cy.get(`app-select-item ion-list ion-card[test-id="${itemReplacing.ID}"]`).should('be.visible').click()
          cy.wait(1000)
        }
      })
    })
  })

  describe("Manual POS Order", () => {
    //POS Manual Orders
    describe("General", () => {
      beforeEach(() => {
        cy.login('retailer')
        cy.visit(`/orders/create/checkout`)
      })

      it("Should Not be able to submit without items", () => {
        cy.get('ion-action-sheet button').eq(0).click()
        cy.get('button[test-id="pay"]').should('be.visible').click()
        cy.wait(500)
        cy.toastMessage('No Items in the basket')
      })
    })

    describe ("Should Generate a Manual Order with multiple accounts Items", () => {
      before(() => {
        let harrodsWarehouse
        cy.task('login', 'retailer').then((user) => {
          harrodsWarehouse = user.account.warehouses.find(wh => !wh.fulfillmentCentre)
          return cy.task('createInventory', {quantity: 2, warehouseID: harrodsWarehouse.ID, key: 'adminInventory', setAsDelivered: true})
        })
        .then((inventory) => cy.task('createInventory', {quantity: 2, account: 'reseller', key: 'consignorInventory', setAsDelivered: true}))
        .then((inventory) => {
          return cy.task('createOrder', {
            type: 'transfer',
            account: 'reseller',
            consignorID: inventory.warehouse.addressID,
            consigneeID: harrodsWarehouse.addressID,
            fulfillment: {
              setAsDispatched: true,
              setAsDelivered: true
            },
            details: inventory.items.map(item => {return {itemID: item.ID}})
          })}
        )
        .then((transfer) => cy.task('set', {key: 'retailerStore', data: harrodsWarehouse}))
      })

      it("Should Generate a Manual Order", () => {
        cy.login('retailer')
        cy.visit(`/orders/create/checkout`)
        cy.get('ion-action-sheet button').eq(0).click()

        //add by clicking
        cy.task('get', 'adminInventory').then((inventory) => {
          for(var item of inventory.items) {
            cy.get('button[test-id="product-search"]').should('be.visible').click()
            cy.wait(300)
            cy.get('app-product-search fliproom-searchbar input').should('be.visible').type(inventory.product.title)
            cy.wait(500)
            cy.get(`app-product-search ion-list ion-card ion-card-content[test-id=${inventory.product.ID}]`).eq(0).should('be.visible').click()
            cy.get('app-select-item mat-select[test-id="select-variant"]').should('be.visible').click().get(`mat-option`).eq(0).click()
            cy.wait(200)
            cy.get(`app-select-item ion-card[test-id="${item.ID}"]`).should('be.visible').click()
            cy.toastMessage('Item added to basket')
            cy.wait(500)
          }
        })


        //add by barcode
        cy.task('get', 'consignorInventory').then((inventory) => {
          const records = inventory.items.map(item => {return {itemID: item.ID, barcode: `${Math.random().toString(36).slice(2)}`}})
          for (var record of records) {
            cy.task('updateItem', {itemID: record.itemID, updates: {barcode: record.barcode}, account: 'reseller'})
          }
          for(var item of inventory.items) {
            const barcode = records.find(r => r.itemID == item.ID).barcode
            cy.get('button[test-id="scan-barcode"]').should('be.visible').click()
            cy.get('input[type="text"]').should('be.visible').type(barcode)
            cy.get('button[test-id="confirm"]').click()
            cy.toastMessage('Item added to basket')
            cy.wait(500)
          }
        })
        cy.get('a.button[test-id="reference-btn"]').should('be.visible').click()
        cy.get('app-input input').should('be.visible').type('reference1')
        cy.get('app-input button[test-id="confirm"]').should('be.visible').click()

        // complete payment
        cy.get('button[test-id="pay"]').should('be.visible').click()
        cy.get('div.payment-methods-grid ion-card').eq(0).should('be.visible').click()
        cy.get('button[test-id="confirm"]').should('be.visible').click()
        cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()

        cy.wait(3000)
        cy.toastMessage('Order generated')
      })

      it("Check State Admin Order", () => {
        cy.login('retailer')
        cy.task('getOrders', {offset: 0, limit: 2, sort: 'id:desc', typeID: 4, accountID: 3, account: 'retailer'}).then(orders => {
          const adminOrder = orders.find(order => order.account.isConsignor == false)
          return cy.task('getOrder', {key: 'manual_admin', ID: adminOrder.ID})
        }).then((order) => {
          // Order should have status dispatched
          expect(order.status.name).equals('delivered')
          expect(order.basketStartedAt).not.equals(null)

          //Order Line Items should have status Dispatched
          order.orderLineItems.map(oli => {
            expect(oli.status.name).equals('delivered')
          })

          //Fulfillment should have status transit
          order.fulfillments.map(fulfillment => {
            expect(fulfillment.status.name).equals('delivered')
          })

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

      it("Check State Consignor Order", () => {
        cy.login('reseller')
        cy.task('getOrders', {offset: 0, limit: 2, sort: 'id:desc', typeID: 4, account: 'reseller'}).then(orders => {
          const consignorOrder = orders.find(order => order.account.isConsignor == true)
          return cy.task('getOrder', {key: 'manual_consignor', ID: consignorOrder.ID, account: 'reseller'})
        }).then((order) => {
          // Order should have status dispatched
          expect(order.status.name).equals('delivered')

          //Order Line Items should have status Dispatched
          order.orderLineItems.map(oli => {
            expect(oli.status.name).equals('delivered')
          })

          //Fulfillment should have status transit
          order.fulfillments.map(fulfillment => {
            expect(fulfillment.status.name).equals('delivered')
          })
        })
      })
    })

    describe("Should Generate a Manual Order with just admin items", () => {
      before(() => {
        let harrodsWarehouse
        cy.task('login', 'retailer').then((user) => {
          harrodsWarehouse = user.account.warehouses.find(wh => !wh.fulfillmentCentre)
          return cy.task('createInventory', {quantity: 2, warehouseID: harrodsWarehouse.ID, key: 'adminInventory', setAsDelivered: true})
        })
        .then((transfer) => cy.task('set', {key: 'retailerStore', data: harrodsWarehouse}))
      })

      it("Should Generate a Manual Order", () => {
        cy.login('retailer')
        cy.visit(`/orders/create/checkout`)
        cy.get('ion-action-sheet button').eq(0).click()

        cy.task('get', 'adminInventory').then((inventory) => {
          for(var item of inventory.items) {
            cy.get('button[test-id="product-search"]').should('be.visible').click()
            cy.wait(200)
            cy.get('app-product-search fliproom-searchbar input').should('be.visible').type(inventory.product.title)
            cy.get(`ion-card-content[test-id="${item.productID}"]`).should('be.visible').click()
            cy.get('mat-select[test-id="select-variant"]').should('be.visible').click().get(`mat-option[test-id="${item.productVariantID}"]`).click()
            cy.get(`ion-card[test-id="${item.ID}"]`).should('be.visible').click()
            cy.wait(500)

            // update price
            cy.get(`ion-card[test-id="${item.ID}"]`).should('be.visible').click()
            cy.get('button#price').should('be.visible').click()
            cy.get('app-input input').should('be.visible').type(999)
            cy.get('app-input button[test-id="confirm"]').should('be.visible').click()
            cy.wait(500)
          }
        })

        cy.get('a.button[test-id="reference-btn"]').should('be.visible').click()
        cy.get('app-input input').should('be.visible').type('reference1')
        cy.get('app-input button[test-id="confirm"]').should('be.visible').click()

        // complete payment
        cy.get('button[test-id="pay"]').should('be.visible').click()
        cy.get('div.payment-methods-grid ion-card').eq(0).should('be.visible').click()
        cy.get('button[test-id="confirm"]').should('be.visible').click()
        cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()

        cy.wait(2000)
        cy.toastMessage('Order generated')
      })

      it("Check State Admin Order", () => {
        cy.login('retailer')

        cy.task('getOrders', {offset: 0, limit: 2, sort: 'id:desc', typeID: 4, accountID: 3}).then(orders => {
          const adminOrder = orders.find(order => order.account.isConsignor == false)
          return cy.task('getOrder', {key: 'manual_admin', ID: adminOrder.ID, account: 'retailer'})
        }).then((order) => {
          // Order should have status dispatched
          expect(order.status.name).equals('delivered')

          //Order Line Items should have status Dispatched
          order.orderLineItems.map(oli => {
            expect(oli.status.name).equals('delivered')
          })

          //Fulfillment should have status transit
          order.fulfillments.map(fulfillment => {
            expect(fulfillment.status.name).equals('delivered')
          })
        })
      })
    })

    describe("Should Create a return for a manual order", () => {
      /**
       * 1. Create a manual order:
       *    - 1 item to be returned and not restocked
       *    - 1 item to be returned and restocked at location of sale
       * 2. Set items as delivered
       *    a. check order status is delivered
       * 3. Create return for manual order items:
       *   a. check items have been cancelled
       *   b. check items have been restocked at location of sale
       *   c. check items have been cancelled and not restocked
       *   d. check that order totals have adjusted
       *   c. check order status is cancelled
       *
       */


    })

    describe("Should create a manual order with sourced item and barcoded admin item ", () => {
      before(() => {
        cy.task('login', 'retailer').then((user) => {
          const harrodsWarehouse = user.account.warehouses.find(wh => !wh.fulfillmentCentre)
          return cy.task('createInventory', {quantity: 1, warehouseID: harrodsWarehouse.ID, key: 'adminInventory', setAsDelivered: true})
        }).then((res) => {
          //create product that will be used to add virtual inventory
          return cy.task("createProduct", {foreignID: 1234567890, code: '0001', key: 'variant1',  key: 'sourceItemProduct'})
        })
      })

      it("Should Generate a Manual Order", () => {
        cy.login('retailer')
        cy.visit(`/orders/create/checkout`)
        cy.get('ion-action-sheet button').should('be.visible').eq(0).click()

        cy.all([() => cy.task('get', "adminInventory"), () => cy.task('get', 'sourceItemProduct')]).then((res) => {
          const inventory = res[0]
          const product = res[1]

          const records = inventory.items.map(item => {return {itemID: item.ID, barcode: `${Math.random().toString(36).slice(2)}`}})
          for (var record of records) {
            cy.task('updateItem', {itemID: record.itemID, updates: {barcode: record.barcode}})
          }

          for(var item of inventory.items) {
            const barcode = records.find(r => r.itemID == item.ID).barcode
            cy.get('button[test-id="scan-barcode"]').should('be.visible').click()
            cy.get('input[type="text"]').should('be.visible').type(barcode)
            cy.get('button[test-id="confirm"]').click()
            cy.wait(750)
            cy.toastMessage('Item added to basket')
            cy.wait(500)
          }

          // Add sourced-item
          cy.get('button[test-id="product-search"]').should('be.visible').click()
          cy.get('fliproom-searchbar input').should('be.visible').type(product.title)
          cy.get(`ion-card-content[test-id="${product.ID}"]`).should('be.visible').click()
          cy.get('mat-select[test-id="select-variant"]').should('be.visible').click().get(`mat-option`).eq(0).click()
          cy.get('a.button[test-id="sourcing-btn"]').click()
          cy.get('app-input input').type(999)
          cy.get('app-input button[test-id="confirm"]').click()
          cy.wait(750)
          cy.toastMessage('Item to Source Created', {matchCase: false, includeShadowDom: true})

          cy.get('ion-list ion-card').should('have.length', 2)

          cy.get('a.button[test-id="reference-btn"]').should('be.visible').click()
          cy.get('app-input input').should('be.visible').type('reference1')
          cy.get('app-input button[test-id="confirm"]').should('be.visible').click()

          // complete payment
          cy.get('button[test-id="pay"]').should('be.visible').click()
          cy.get('div.payment-methods-grid ion-card').eq(0).should('be.visible').click()
          cy.get('button[test-id="confirm"]').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()

          cy.wait(3000)
          cy.toastMessage('Order generated')
        })
      })

      //partially sourced order check
      it("Check State Admin Order", () => {
        cy.login('retailer')

        cy.task('getOrders', {offset: 0, limit: 2, sort: 'id:desc', typeID: 4}).then(orders => {
          const adminOrder = orders.find(order => order.account.isConsignor == false)
          cy.task('getOrder', {key: 'manual_admin', ID: adminOrder.ID})
        })
        cy.all([() => cy.task('get', 'manual_admin'), () => cy.task('get', 'sourceItemProduct')]).then((res) => {
          const order = res[0]
          const sourcedProduct =  res[1]
          // Order should have status dispatched
          expect(order.status.name).equals('partially-delivered')

          //Order Line Items should have status Dispatched
          order.orderLineItems.map(oli => {
            if (oli.productID == sourcedProduct.ID){
              expect(oli.status.name).equals('pending')
            }
            else{
              expect(oli.status.name).equals('delivered')
            }
          })

          //Fulfillment should have status delivered
          order.fulfillments.map(fulfillment => {
            expect(fulfillment.status.name).equals('delivered')
          })
        })
      })
    })

    describe("Should create a manual order with sourced item", () => {
      before(() => {
        cy.login('retailer')
        cy.task('get', 'retailer').then((user) => {
          const harrodsWarehouse = user.account.warehouses.find(wh => !wh.fulfillmentCentre)
          return cy.task('createInventory', {quantity: 1, warehouseID: harrodsWarehouse.ID, key: 'adminInventory', setAsDelivered: true})
        }).then((res) => {
          //create product that will be used to add virtual inventory
          return cy.task("createProduct", {foreignID: 1234567890, code: '0001', key: 'variant1',  key: 'sourceItemProduct'})
        })
      })

      it("Should Generate a Manual Order", () => {
        cy.login('retailer')
        cy.visit(`/orders/create/checkout`)
        cy.get('ion-action-sheet button').should('be.visible').eq(0).click()

        cy.task('get', 'sourceItemProduct').then((product) => {

          // Add sourced-item
          cy.get('button[test-id="product-search"]').should('be.visible').click()
          cy.get('fliproom-searchbar input').should('be.visible').type(product.title)
          cy.get(`ion-card-content[test-id="${product.ID}"]`).should('be.visible').click()
          cy.get('mat-select[test-id="select-variant"]').should('be.visible').click().get(`mat-option`).eq(0).click()
          cy.get('a.button[test-id="sourcing-btn"]').click()
          cy.get('app-input input').type(999)
          cy.get('app-input button[test-id="confirm"]').click()
          cy.wait(750)
          cy.toastMessage('Item to Source Created', {matchCase: false, includeShadowDom: true})

          cy.get('ion-list ion-card').should('have.length', 1)

          cy.get('a.button[test-id="reference-btn"]').should('be.visible').click()
          cy.get('app-input input').should('be.visible').type('reference1')
          cy.get('app-input button[test-id="confirm"]').should('be.visible').click()

          // complete payment
          cy.get('button[test-id="pay"]').should('be.visible').click()
          cy.get('ion-action-sheet button').eq(0).click()
          cy.wait(500)
          cy.get('div.payment-methods-grid ion-card').eq(0).should('be.visible').click()
          cy.get('button[test-id="confirm"]').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()

          cy.wait(3000)
          cy.toastMessage('Order generated')
        })
      })

      //partially sourced order check
      it("Check State Admin Order", () => {
        cy.login('retailer')

        cy.task('getOrders', {offset: 0, limit: 2, sort: 'id:desc', typeID: 4}).then(orders => {
          const adminOrder = orders.find(order => order.account.isConsignor == false)
          cy.task('getOrder', {key: 'manual_admin', ID: adminOrder.ID})
        })
        cy.all([() => cy.task('get', 'manual_admin'), () => cy.task('get', 'sourceItemProduct')]).then((res) => {
          const order = res[0]
          const sourcedProduct =  res[1]
          // Order should have status dispatched
          expect(order.status.name).equals('pending')

          //Order Line Items should have status Dispatched
          order.orderLineItems.map(oli => {
            if (oli.productID == sourcedProduct.ID){
              expect(oli.status.name).equals('pending')
            }
          })
        })
      })
    })

    describe("Should create a personal shopping sale with multiple items", () => {
      before(() => {
        let harrodsWarehouse
        cy.task('login', 'retailer')
          .then((user) => {
            harrodsWarehouse = user.account.warehouses.find(wh => !wh.fulfillmentCentre)
            return cy.task('createInventory', {
              quantity: 2,
              warehouseID: harrodsWarehouse.ID,
              key: 'adminInventory',
              setAsDelivered: true
            })
          })
          .then(() => cy.task('createInventory', {quantity: 2, account: 'reseller', key: 'consignorInventory', setAsDelivered: true}))
          .then((inventory) => {
            return cy.task('createOrder', {
              type: 'transfer',
              account: 'reseller',
              consignorID: inventory.warehouse.addressID,
              consigneeID: harrodsWarehouse.addressID,
              fulfillment: {
                setAsDispatched: true,
                setAsDelivered: true
              },
              details: inventory.items.map(item => {return {itemID: item.ID}})
            })}
          )
          .then(() => {
            return cy.task("createProduct", {key: 'sourceItemProduct'})
          })
      })

      it("Should Generate a Manual Order", () => {
        cy.login('personal-shopper')
        cy.visit(`/orders/create/checkout`)
        cy.get('ion-action-sheet button').eq(0).click()

        cy.all([() => cy.task('get', 'adminInventory'), () => cy.task('get', 'consignorInventory'), () => cy.task('get', 'sourceItemProduct')])
        .then((res) => {
          const [adminInventory, consignorInventory, sourceItemProduct] = res
          let item

          // Add retailer stock by clicking
          item = adminInventory.items[0]
          cy.get('button[test-id="product-search"]').should('be.visible').click()
          cy.wait(300)
          cy.get('app-product-search fliproom-searchbar input').should('be.visible').type(adminInventory.product.title)
          cy.wait(500)
          cy.get(`app-product-search ion-list ion-card ion-card-content[test-id=${adminInventory.product.ID}]`).eq(0).should('be.visible').click()
          cy.get('app-select-item mat-select[test-id="select-variant"]').should('be.visible').click().get(`mat-option`).eq(0).click()
          cy.wait(200)
          cy.get(`app-select-item ion-card[test-id="${item.ID}"]`).should('be.visible').click()
          cy.toastMessage('Item added to basket')
          cy.wait(500)

          // Add reseller stock by barcode
          const records = consignorInventory.items.slice(0, 1).map(item => {return {itemID: item.ID, barcode: `${Math.random().toString(36).slice(2)}`}})
          for (const record of records) {
            cy.task('updateItem', {itemID: record.itemID, updates: {barcode: record.barcode}, account: 'reseller'})
          }
          item = consignorInventory.items[0]
          const barcode = records.find(r => r.itemID == item.ID).barcode
          cy.get('button[test-id="scan-barcode"]').should('be.visible').click()
          cy.get('input[type="text"]').should('be.visible').type(barcode)
          cy.get('button[test-id="confirm"]').click()
          cy.toastMessage('Item added to basket')
          cy.wait(500)

          // Add sourced-item
          cy.get('button[test-id="product-search"]').should('be.visible').click()
          cy.get('fliproom-searchbar input').should('be.visible').type(sourceItemProduct.title)
          cy.get(`ion-card-content[test-id="${sourceItemProduct.ID}"]`).should('be.visible').click()
          cy.get('mat-select[test-id="select-variant"]').should('be.visible').click().get(`mat-option`).eq(0).click()
          cy.get('a.button[test-id="sourcing-btn"]').click()
          cy.get('app-input input').type(999)
          cy.get('app-input button[test-id="confirm"]').click()
          cy.wait(750)
          cy.toastMessage('Item to Source Created', {matchCase: false, includeShadowDom: true})


          // Add Reference
          cy.get('a.button[test-id="reference-btn"]').should('be.visible').click()
          cy.get('app-input input').should('be.visible').type('reference1')
          cy.get('app-input button[test-id="confirm"]').should('be.visible').click()

          // Add Shipping
          cy.get('a.button[test-id="shipping-btn"]').should('be.visible').click()
          cy.get('app-input input').should('be.visible').type('29')
          cy.get('app-input button[test-id="confirm"]').should('be.visible').click()

          // Add Customer
          cy.get('a.button[test-id="customer-btn"]').should('be.visible').click()
          cy.get('app-address-contact ion-card').eq(0).click({force: true})
          cy.get('app-address-contact button[test-id="submit"]').should('be.visible').click()

          // complete payment
          cy.get('button[test-id="pay"]').should('be.visible').click()
          cy.get('div.payment-methods-grid ion-card[test-id="unpaid-btn"]').should('be.visible').click()

          cy.get('button[test-id="confirm"]').should('be.visible').click()
          cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()

          cy.wait(3000)
          cy.toastMessage('Order generated')
        })
      })

      it("Check State Order", () => {
        let adminInventory, consignorInventory, sourceItemProduct
        cy.all([() => cy.task('get', 'adminInventory'), () => cy.task('get', 'consignorInventory'), () => cy.task('get', 'sourceItemProduct')])
        .then((res) => {
          [adminInventory, consignorInventory, sourceItemProduct] = res
          return cy.task('getOrders', {account: 'personal-shopper', offset: 0, limit: 2, sort: 'id:desc', typeID: 4, accountID: 3})
        })
        .then(orders => {
          const adminOrder = orders.find(order => order.account.isConsignor == false)
          return cy.task('getOrder', {ID: adminOrder.ID, account: 'retailer'})
        })
        .then((order) => {
          const oliTotalSaleAmount = order.orderLineItems.reduce((total, orderLineItem) => total + parseFloat(orderLineItem.price), 0)

          // Check items
          expect(order.orderLineItems.filter((item) => item.item.productID === adminInventory.productID && item.item.productVariantID === adminInventory.productVariantID).length).equals(1)
          expect(order.orderLineItems.filter((item) => item.item.productID === consignorInventory.productID && item.item.productVariantID === consignorInventory.productVariantID).length).equals(1)
          expect(order.orderLineItems.filter((item) => item.item.productID === sourceItemProduct.ID && item.item.productVariantID === sourceItemProduct.variants[0].ID).length).equals(1)

          // Check sale transaction
          const saleTx = order.transactions.find(tx => tx.type == "sale")
          expect(saleTx.grossAmount).equals(oliTotalSaleAmount.toFixed(2))

          // Check personal-shopping tag
          expect(order.tags).contains('personal-shopping')

          // Check shipping transaction
          const shippingTx = order.transactions.find(tx => tx.type == "shipping")
          expect(shippingTx.grossAmount).equals("29.00")

          // Check total grossAmount
          expect(order.totalAmount).equals((oliTotalSaleAmount + parseFloat(shippingTx.grossAmount)).toFixed(2))

          // Check payout transaction
          const consignmentLineItem = order.orderLineItems.find((item) => item.item.accountID !== order.accountID)
          const consignmentPayoutTx = order.transactions.find(tx => tx.type == "payout" && tx.toAccountID == consignmentLineItem.item.accountID)
          expect(consignmentPayoutTx.status).equals("unpaid")
          expect(consignmentPayoutTx.grossAmount).equals(consignmentLineItem.cost)
        })
      })
    })

    // Create POS with personal-shopper account
    describe("Create a sale with a express product", () => {
      beforeEach(() => {
        cy.login(ACCOUNT_TYPES.PERSONAL_SHOPPER)
        cy.visit(`/orders/create/checkout`)
      })

      it("Create order", () => {
        cy.get('ion-action-sheet button').eq(1).click()

        cy.get('button[test-id="product-search"]').should('be.visible').click()
        cy.wait(300)
        const searchStr = generateRandomString(15);
        cy.get('app-product-search fliproom-searchbar input').should('be.visible').type(searchStr)
        cy.wait(500)
        cy.get('app-product-search a[test-id="create-button"]').should('be.visible').click({force: true})
        cy.wait(300)

        // Input some info for Product Order
        const productTitle = generateRandomString(10);
        const productCode = generateRandomString(5);
        const productDescription = generateRandomString(30);
        cy.get('mat-form-field input[test-id="title"]').should('be.visible').clear().type(productTitle)
        cy.get('mat-form-field input[test-id="code"]').should('be.visible').clear().type(productCode)
        cy.get('mat-form-field input[test-id="description"]').should('be.visible').clear().type(productDescription)
        // Save Product Order
        cy.get('ion-footer button[test-id="submit"]').should('be.visible').click();
        cy.wait(500)
        cy.get('ion-toast').contains('Product Created', {matchCase: false, includeShadowDom: true});
        // Make source Item Price
        cy.get('ion-modal a[test-id="sourcing-btn"]').should('be.visible').click();

        cy.get('mat-form-field input[formcontrolname="input"]').should('be.visible').clear().type(1000);
        cy.get('app-input button[test-id="confirm"]').should('be.visible').click();


        // Add Customer info
        cy.get('ion-card-content a[test-id="customer-btn"]').should('be.visible').click();
        // Find Validated Customer Address and click

        cy.get('app-address-contact ion-card').eq(0).click({force: true})
        cy.get('app-address-contact button[test-id="submit"]').should('be.visible').click()

        // Add Shpping Value
        cy.get('ion-card-content a[test-id="shipping-btn"]').should('be.visible').click();
        cy.get('mat-form-field input[formcontrolname="input"]').should('be.visible').clear().type(20);
        cy.get('app-input button[test-id="confirm"]').should('be.visible').click();

        // Finally click Pay button
        cy.get('button[test-id="pay"]').should('be.visible').click();
        cy.wait(500)
        // Input Order Reference
        const orderReference = generateRandomString(10);
        cy.get('mat-form-field input[formcontrolname="input"]').should('be.visible').clear().type(orderReference);
        cy.get('app-input button[test-id="confirm"]').should('be.visible').click();
        cy.get('ion-action-sheet button').eq(0).click();
        cy.wait(200);

        cy.get('div.payment-methods-grid ion-card[test-id="unpaid-btn"]').should('be.visible').click()

        // Click pay now button in Checkout Modal
        cy.get('app-checkout-payment-review button[test-id="confirm"]').should('be.visible').click();
        cy.wait(200);

        // Click Confirm button to create an order
        cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click();
        cy.wait(500);
        cy.toastMessage('Order Generated')

        // Check Order created successfuly
        cy.get('.items-section ion-list ion-card').contains('span', productTitle, {matchCase: false, includeShadowDom: true});
      })
    })

    it("Customer pays for order", () => {
      cy.all([
        () => cy.login('personal-shopper'),
        () => cy.task('createInventory')
      ])
      .then((result) => {
        const [user, inventory] = result

        const _saleChannel = user.account.saleChannels[0]
        const _saleChannelID = _saleChannel.ID
        const _saleChannelListing = inventory.listings.find(listing => listing.saleChannelID === _saleChannelID)
        const details = [{
          inventoryListingID: _saleChannelListing.ID,
          quantity: 1,
          price: _saleChannelListing.payout
        }]
        const reference1 = `${Math.random().toString(36).slice(2)}`
        const transactions = [
          // sale transaction
          {
            type: 'sale',
            grossAmount: details.reduce((acc, detail) => acc + detail.price * (detail.quantity || 1), 0),
            currency: user.account.currency,
            toAccountID: _saleChannel.accountID,
            reference: reference1,
            status: 'unpaid'
          },
          // shipping transaction
          {
            type: 'shipping',
            grossAmount: 29,
            currency: user.account.currency,
            toAccountID: _saleChannel.accountID,
            reference: reference1,
            status: 'unpaid'
          }
        ]
        const orderParams = {
          type: 'outbound',
          account: 'personal-shopper',
          tags: 'personal-shopping',
          consignee: null,
          fulfillment: {
            setAsDispatched: false,
            setAsDelivered: false
          },
          reference1,
          details,
          transactions
        }
        return cy.task('createOrder', orderParams)
      })
      .then((order) => {
        cy.login('personal-shopper')
        cy.visit(`/orders/${order.ID}`)

        cy.get('[test-id="actions"]').click()
        cy.get('button#share-order').click()
        return cy.task('getOrder', {ID: order.ID})
      })
      .then((order) => {
        cy.visit(`share/order/${order.ID}?accessToken=${order.accessToken}`)

        // Add address
        cy.get('[test-id="edit-customer"]').click()
        cy.fillAddressForm()
        cy.wait(500)
        cy.toastMessage('Address Updated')

        // Edit address
        cy.get('[test-id="edit-customer"]').click()
        cy.get('app-address-contact input[formcontrolname="name"]').should('be.visible').clear().type('new name')
        cy.get('app-address-contact input[formcontrolname="surname"]').should('be.visible').clear().type('new surname')
        cy.get('app-address-contact button[test-id="submit"]').should('be.visible').click()
        cy.wait(500)
        cy.toastMessage('Address Updated')

        // Add notes
        cy.get('[test-id="edit-notes"]').click()
        cy.get('app-input input[formcontrolname="input"]').should('be.visible').clear().type('notes')
        cy.get('app-input button[test-id="confirm"]').should('be.visible').click()
        cy.wait(500)
        cy.toastMessage('Notes Updated')

        cy.get('button#payment-redirect-btn').should('be.visible').click()

        return cy.get('app-checkout-container iframe').its('0.contentDocument.body').should('not.be.empty')
      })
      .then((body) => {
        cy.wrap(body).find('input[name="email"]').type('test@gmail.com')
        cy.wrap(body).find('button[data-testid="card-tab-button"]').click()
        cy.wrap(body).find('input[name="cardNumber"]').type('4242424242424242')
        cy.wrap(body).find('input[name="cardExpiry"]').type('1234')
        cy.wrap(body).find('input[name="cardCvc"]').type('567')
        cy.wrap(body).find('input[name="billingName"]').type('Test')
        cy.wrap(body).find('input[name="billingPostalCode"]').type('SE11 5AR')
        cy.wrap(body).find('button[type="submit"]').click()

        cy.url().should('include', 'sessionID=')
      })
    })
  })

  describe("Cancellation Fees", () => {
    it('Consignor cancel order and admin adds cancellation fee', () => {

      /**
      * TEST CONFIRM CHECKS
      *
      * - createShopifyOrder
      * - Reseller cancel item
      * - Check reseller can't create cancellation fee
      * - Retailer creates cancellation fee as unpaid
      */
      cy.login('retailer')
      cy.task("createShopifyOrder")

      cy.login('reseller')
      cy.task('get', 'order_consignor').then(order => cy.visit(`/orders/${order.ID}`))
      // check order state
      // Order should have status pending
      cy.get('span[test-id="order-status"]').should('contain.text', 'pending');

      // Order Line Items should have status pending
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'pending')
      })

      cy.task('get', 'order_consignor').then(order => {
        console.log(order.ID)
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#cancel').should('be.visible').click()
          cy.get('mat-checkbox[formControlName="restock"]').should('be.visible').click()
          cy.cancelForm({ reason: 'test' })
          cy.wait(2000)
          cy.toastMessage('Order Line Item Updated')
          cy.wait(1000)
        })
      })

      //Check reseller can´t create cancellation fee
      cy.task('get', 'order_consignor').then(order => {
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').click()
          cy.get('button#add-cancellation-fee').should('not.exist')
          cy.get('ion-action-sheet ion-backdrop').should('be.visible').click()
          cy.wait(1000)
        })
      })

      //Retailer creates cancellation fee as unpaid
      cy.login('retailer')
      cy.task("get", "order_admin").then((order) => {
        cy.visit(`/orders/${order.ID}`)
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').then((card) => {
            //Only click if oli has DELETED status
            if (card.find('span[test-id="oli-status"]').text().includes('deleted')) {
              cy.wrap(card).click();
              cy.get('button#add-cancellation-fee').should('be.visible').click()
              //Complete and submit cancellation form
              cy.get('input[formControlName="grossAmount"]').type('10')
              cy.get('input[formControlName="reference"]').type('test fee')
              cy.get('button[test-id="submit"]').should('be.visible').click()
              cy.wait(1000)
            }
          });
        })
        // get order updated and check if the unpaid fees are visible
        cy.task("get", "order").then(order => cy.task('getOrder', { ID: order.ID })).then((order) => {
          cy.get('table[test-id="tx-list"] tr')
            .filter(':has(span:contains("unpaid"))')
            .should('have.length', 2);
        })
      })

    })

    it('Admin cancel order and admin adds cancellation fee', () => {

      /**
      * TEST CONFIRM CHECKS
      *
      * - createShopifyOrder
      * - Retailer cancel consignor item
      * - Retailer adds cancellation fee unpaid
      */

      // Create Shopify order
      cy.login('reseller')
      cy.task("createShopifyOrder")

      // Retailer cancel consignor items with status pending
      cy.login('retailer')
      cy.task('get', 'order_admin').then(order => {
        cy.visit(`/orders/${order.ID}`)
        order.orderLineItems.map(oli => {

          cy.get(`ion-card#${oli.ID}`).should('be.visible').then((card) => {
            //Only click if oli has PENDING tag
            if (card.find('span[test-id="oli-status"]').text().includes('pending')) {
              cy.wrap(card).click();
              cy.get('button#cancel').should('be.visible').click()
              cy.get('mat-checkbox[formControlName="restock"]').should('be.visible').click()
              cy.cancelForm({ reason: 'test', selectWarehouse: true })
              cy.wait(2000)
              cy.toastMessage('Order Line Item Updated')
              cy.wait(1000)
            }
          })
        })
      })

      //Retailer creates cancellation fee unpaid
      cy.task("get", "order_admin").then((order) => {
        cy.visit(`/orders/${order.ID}`)
        order.orderLineItems.map(oli => {
          cy.get(`ion-card#${oli.ID}`).should('be.visible').then((card) => {
            //Only click if oli has DELETED status
            if (card.find('span[test-id="oli-status"]').text().includes('deleted')) {
              cy.wrap(card).click();
              cy.get('button#add-cancellation-fee').should('be.visible').click()
              //Complete and submit cancellation form
              cy.get('input[formControlName="grossAmount"]').type('10')
              cy.get('input[formControlName="reference"]').type('test fee')
              cy.get('button[test-id="submit"]').should('be.visible').click()
              cy.wait(1000)
            }
          });
        })
        // get order updated and check if the unpaid fees are visible
        cy.task("get", "order").then(order => cy.task('getOrder', { ID: order.ID })).then((order) => {
          cy.get('table[test-id="tx-list"] tr')
            .filter(':has(span:contains("unpaid"))')
            .should('have.length', 2);
        })
      })

    })
  })
})

describe("Transfer Orders", () => {
  describe("Internal Transfer", () => {
    before(() => {
      cy.login('retailer')
      cy.task("createInventory", {quantity: 2, setAsDelivered: true})
      .then(inventory => {
        for (var item of inventory.items) {
          cy.task('updateItem', {itemID: item.ID, updates: {barcode: `${Math.random().toString(36).slice(2)}`}})
        }
        return cy.task('getInventoryByID', {ID: inventory.ID})
      })
    })

    beforeEach( () => {
      cy.login('retailer')
      cy.visit(`transfers`)
    })

    it("Should Generate Transfer Order", () => {
      cy.get('app-transfers ion-fab').click()
      cy.wait(200)
      cy.get('app-transfers ion-fab ion-fab-button#add-transfer').click()

      cy.get('app-transfer-header mat-select[formcontrolname="origin"]').should('be.visible').click()
      cy.get('mat-option').contains('Storage #1').should('be.visible').click()

      cy.get('app-transfer-header mat-select[formcontrolname="destination"]').should('be.visible').click()
      // all warehosue savailable besides the origin selected
      cy.task('get', 'retailer').then(user => {
        cy.get('mat-option').should('have.length', user.account.warehouses.length - 1).contains('Harrods').should('be.visible').click()
      })

      cy.get('app-transfer-header input[formcontrolname="reference1"]').should('be.visible').type('test reference')
      cy.get('app-transfer-header button[test-id="next"]').click()

      // details
      cy.task('get', 'inventory').then(inventory => {
        for (var item of inventory.items) {
          cy.get('app-transfer-details ion-fab-button[test-id="barcode"]').click()
          cy.wait(500)
          cy.get('app-input input[formcontrolname="input"]').should('be.visible').type(item.barcode)
          cy.get('app-input button[test-id="confirm"]').click()
          cy.wait(500)
        }
      })
      cy.get('app-transfer-details button[test-id="next"]').click()

      // review and submit
      cy.get('app-transfer-review button[test-id="submit"]').should('be.visible').click()

      cy.wait(1000)
      cy.toastMessage('Transfer Order Created')
      cy.url().then((url) => {
        const orderTransferID = url.split("/")[url.split("/").length -1]
        return cy.task("getOrder", {ID: orderTransferID})
      })

    })

    it('Check Transfer-In State', () => {
      cy.task('get', 'order').then((order) => cy.visit(`/orders/${order.siblingOrderID}`))
      //Order should have status fulfill
      cy.get('span[test-id="order-status"]').should('contain.text', 'fulfill');

      //Order Line Items should have status fulfill
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'fulfill')
      })
    })

    it('Check Transfer-out state, create Fulfillment & fulfill', () => {
      cy.task('get', 'order').then((order) => {
        cy.visit(`/orders/${order.ID}`)

        // Order should have status fulfill
        cy.get('span[test-id="order-status"]').should('contain.text', 'fulfill');

        //Order Line Items should have status fulfill
        cy.get('span[test-id="oli-status"]').each(($el) => {
          cy.wrap($el).should('contain.text', 'fulfill')
        })

        //Should create manual fulfillment
        cy.get('span[test-id="oli-status"]').should('be.visible').eq(0).click()
        cy.get('button#fulfill').should('be.visible').click()
        cy.fillFulfillmentForm({shipFrom: 'storage #1', skip: true})


        // Order should have status created
        cy.get('app-fulfillment span[test-id="view-order"]').should('be.visible').click()
        cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

        //Order Line Items should have status dispatched
        cy.get('span[test-id="oli-status"]').each(($el) => {
          cy.wrap($el).should('contain.text', 'dispatched')
        })
      })
    })

    it('Check State Transfer-in after scan outbound', () => {
      cy.task('get', 'order').then((order) => cy.visit(`/orders/${order.siblingOrderID}`))

      //Order should have status dispatched
      cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

      //Order Line Items should have status dispatched
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'dispatched')
      })
    })

    it('Check Transfer-in state after scan inbound', () => {
      // change location
      cy.task('get', 'order')
      .then((order) => cy.task('getOrder', {ID: order.ID}))
      .then((order) => cy.task('getOrder', {ID: order.siblingOrderID}))
      .then((order) => {
        cy.scanInbound(order, order.fulfillments[0])
      })
      cy.task('get', 'order').then((order) => cy.visit(`/orders/${order.siblingOrderID}`))

      //Order should have status delivered
      cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

      //Order Line Items should have status dispatched
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'delivered')
      })
    })

    it('Check State Transfer-out after scan inbound', () => {
      cy.task('get', 'order').then((order) => cy.visit(`/orders/${order.ID}`))

      //Order should have status delivered
      cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

      //Order Line Items should have status dispatched
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'delivered')
      })
    })
  })

  describe("Consignment Transfer", () => {
    before(() => {
      cy.task('createInventory', {quantity: 2, setAsDelivered: true, account: 'reseller'})
    })

    it("Should Generate Transfer Order", () => {
      cy.login('reseller')
      cy.visit(`transfers`)

      cy.get('app-transfers ion-fab').click()
      cy.wait(200)
      cy.get('app-transfers ion-fab ion-fab-button#add-transfer').click()

      cy.get('app-transfer-header mat-select[formcontrolname="origin"]').should('be.visible').click()
      cy.get('mat-option').eq(0).should('be.visible').click()

      cy.get('app-transfer-header mat-select[formcontrolname="destination"]').should('be.visible').click()
      // all consignment warehouses available
      cy.get('mat-option').eq(0).should('be.visible').click()

      cy.get('app-transfer-header input[formcontrolname="reference1"]').should('be.visible').type('test reference')
      cy.get('app-transfer-header button[test-id="next"]').click()

      // details
      cy.task('get', 'inventory').then(inventory => {
        for (var item of inventory.items) {
          cy.get('app-transfer-details ion-fab-button[test-id="product-search"]').click()
          cy.get('fliproom-searchbar input').should('be.visible').clear().type(inventory.product.title)
          cy.wait(500)
          cy.get('app-product-search ion-list ion-card').eq(0).should('be.visible').click()
          cy.get(`app-select-item ion-card[test-id="${item.ID}"]`).should('be.visible').click()
          cy.wait(500)
        }
      })
      cy.get('app-transfer-details button[test-id="next"]').click()

      // review and submit
      cy.get('app-transfer-review button[test-id="submit"]').should('be.visible').click()

      cy.wait(500)
      cy.toastMessage('Transfer Order Created')
      cy.url().then((url) => {
        const orderTransferID = url.split("/")[url.split("/").length -1]
        return cy.task("getOrder", {ID: orderTransferID, account: 'reseller'})
      })
    })

    it('Check Transfer-out State and create fulfillment', () => {
      cy.login('reseller')

      cy.task('get', 'order').then((order) => {
        cy.visit(`/orders/${order.ID}`)

        // Order should have status created
        cy.get('span[test-id="order-status"]').should('contain.text', 'fulfill');

        //Order Line Items should have status fulfill
        cy.get('span[test-id="oli-status"]').each(($el) => {
          cy.wrap($el).should('contain.text', 'fulfill')
        })

        //Should create manual fulfillment
        cy.get('span[test-id="oli-status"]').should('be.visible').eq(0).click()
        cy.get('button#fulfill').should('be.visible').click()
        cy.fillFulfillmentForm()

        cy.get('app-fulfillment span[test-id="view-order"]').should('be.visible').click()
        // Order should have status created
        cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

        //Order Line Items should have status dispatched
        cy.get('span[test-id="oli-status"]').each(($el) => {
          cy.wrap($el).should('contain.text', 'dispatched')
        })
      })
    })

    it('Check Transfer-in State, scan inbound & check state updated', () => {
      cy.login('retailer')
      cy.task('get', 'order').then((order) => cy.visit(`/orders/${order.siblingOrderID}`))

      //Order should have status delivered
      cy.get('span[test-id="order-status"]').should('contain.text', 'dispatched');

      //Order Line Items should have status dispatched
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'dispatched')
      })

      cy.task('get', 'order').then((order) => cy.task('getOrder', {ID: order.siblingOrderID, account: 'retailer'})).then((order) => cy.scanInbound(order, order.fulfillments[0]))

      cy.reload(true)

      //Order should have status delivered
      cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

      //Order Line Items should have status dispatched
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'delivered')
      })
    })

    it('Check Transfer-out State', () => {
      cy.login('reseller')
      cy.task('get', 'order').then(order => cy.visit(`/orders/${order.siblingOrderID}`))

      //Order should have status delivered
      cy.get('span[test-id="order-status"]').should('contain.text', 'delivered');

      //Order Line Items should have status dispatched
      cy.get('span[test-id="oli-status"]').each(($el) => {
        cy.wrap($el).should('contain.text', 'delivered')
      })
    })
  })
})
