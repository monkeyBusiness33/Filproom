/// <reference types="Cypress" />

describe("Inbounding", () => {
  beforeEach(() => {
    cy.login('retailer')
    cy.visit('/warehousing/inbound')
  })

  it("General Functionality Checks", () => {
    //Search by product code
    cy.wait(1000)
    cy.get('ion-list ion-card span[test-id="title"]').eq(0).invoke('text').then(value => {
      const [productCode, variant] = value.split(" ")
      cy.get('input[test-id="search"]').type(productCode)
      cy.wait(1000)

      cy.get('ion-list ion-card span[test-id="title"]').each($el => cy.wrap($el).contains(productCode))

      //clear search
      cy.get('fliproom-searchbar mat-icon[test-id="close"]').should('be.visible').click()
    })

    // tabs work
    cy.get('ion-segment-button[value="all"]').click()
    cy.wait(300)
    cy.get('ion-list ion-card').should('be.visible')
    cy.get('ion-segment-button[value="sold"]').click()
    cy.wait(300)
    cy.url().should('include', 'type=sold')
    cy.get('ion-segment-button[value="stock"]').click()
    cy.wait(300)
    cy.url().should('include', 'type=stock')

    // change location
    cy.get('ion-button[test-id="warehouseButton"]').should('be.visible').click()
    cy.get('ion-action-sheet button#923').should('be.visible').click()
    cy.get('app-inbound p[test-id="warehouseName"]').should('be.visible').contains('Harrods')
  })

  it("Assign Barcode to incoming items", () => {
    cy.get('ion-segment-button[value="stock"]').click()
    cy.get('ion-list ion-card').eq(0).should('be.visible')

    cy.task('createInventory', {quantity: 3}).then(inventory => {
      cy.get('input[test-id="search"]').type(inventory.product.code)
      cy.wait(1000)

      inventory.items.map(item => {
        cy.get('ion-list ion-card').should('be.visible').eq(0).click()
        cy.wait(500)
        cy.get('app-input input').should('be.visible').type(Math.random().toString(36).slice(10) + (new Date()).getTime().toString(16))
        cy.wait(500)
        cy.get('app-input button[test-id="confirm"]').should('be.visible').click()
    
        cy.get('ion-toast').contains('Ok', {matchCase: false, includeShadowDom: true})
        cy.wait(1500)
      })

    })
  })

  it("Scan incoming items", () => {
    cy.task('createInventory', {quantity: 3}).then(inventory => {
      for (var item of inventory.items) {
        cy.task('updateItem', {itemID: item.ID, updates: {barcode: `${Math.random().toString(36).slice(2)}`}})
      }

      cy.get('ion-segment-button[value="stock"]').click()
      cy.wait(500)
      cy.get('input[test-id="search"]').should('be.visible').type(inventory.product.code)
      cy.get('ion-list ion-card').eq(0).should('be.visible')

      for (var i=0; i<inventory.items.length; i++) {
        cy.get('ion-list ion-card span.barcode').eq(0).then((value) => {
          const barcode = value.text()
          cy.scan(barcode)
        })
      }
    })
  })

  it("Should info that the barcode can't be used", () => {
    const barcode = `${Math.random().toString(36).slice(2)}`
    cy.task('createInventory', {quantity: 1, setAsDelivered: true})
    .then(inventory => {
      cy.task('updateItem', {itemID: inventory.items[0].ID, updates: {barcode: barcode}})
      cy.get('ion-segment-button[value="stock"]').should('be.visible').click()
      cy.get('ion-fab-button[test-id="scan-barcode"]').should('be.visible').eq(0).click()
      cy.get('app-input input').should('be.visible').type(barcode)
      cy.get('app-input button[test-id="confirm"]').should('be.visible').click()

      cy.wait(750)
      cy.toastMessage('Barcode is not linked to any inbounding item')
    })
  })

})

describe("Outbounding", () => {
  beforeEach(() => {
    cy.login('retailer')
    cy.visit('/warehousing/outbound')
  })

  it("Scan outbounding items", () => {
    cy.task('createOrder', {type: 'outbound', productQty: [1,2], fulfillment: {}})
    .then(order => {
      for (var oli of order.orderLineItems) {
        cy.task('updateItem', {itemID: oli.itemID, updates: {barcode: `${Math.random().toString(36).slice(2)}`}})
      }

      cy.get('input[test-id="search"]').type(order.fulfillments[0].ID)
      cy.wait(1000)
      cy.get('ion-list ion-card').should('have.length', 1)
      cy.get('ion-list ion-card').should('be.visible').click()

      // wait that fulfillment loads
      cy.get(`ion-list ion-card span.barcode`).should('be.visible')
      cy.get('ion-list ion-card span.barcode').each($el => {
        const barcode = $el.text()
        cy.scan(barcode)
      })

      // should appear modal to ask to return to order page
      cy.get('app-confirm').should('be.visible')
      cy.get('app-confirm [test-id="confirm"]').should('be.visible').click()
    })
  })
})

/**
 * STOCK TAKE SERVICE TESTS
 */

describe("Stock Takes", () => {
  beforeEach(() => {
    cy.login('retailer')
    cy.visit('/warehousing/stock-take')
  })

  it("Create a stock take", () => {
    // navigate to create page
    cy.get("ion-fab-button[test-id='create']").click()

    //fill out form
    cy.get("mat-form-field[ test-id='warehouse-select']").click()
    cy.get("mat-option").contains('STORAGE #1').click()
    cy.get("input[test-id='notes']").type('Some test notes')
    cy.get("button[test-id='submit']").click()

    // Check creation status
    cy.get('ion-toast').contains('Job created', {matchCase: false, includeShadowDom: true})
  })

  it("Process a stock take", () => {
    cy.task('createStockTake')
    .then(job => {
      //cy.visit(`/warehousing/stock-take/${job.ID}`)
      /**
       * TEST CONFIRM CHECKS
       *
       * - Scan Barcode x 10
       * - Confirm Manually
       * - Create Inspection Anomaly
       * - Mark Item as not found x 2
       * - check item info can be accessed
       * - Edit job notes
       * - Check general search works
       * - scan item that has a different location
       * - scan item that has sold
       * - scan item in transfer
       * - scan deleted item
       */

      //navigate to confirmation checks
      cy.visit(`/warehousing/stock-take/${job.ID}/job-line-items?jobID=${job.ID}&checkType=confirm`)
      cy.wait(2000)
        let itemsToBarcode = 10
        cy.get('div[test-id="jli-card"]').each($li => {
            cy.wrap($li).invoke('attr', 'itemID').then((itemID) => {
                if(itemsToScan>0){
                    //Assign barcode items
                    cy.task('updateItem', {itemID: itemID, updates: {barcode: `${Math.random().toString(36).slice(2)}`}})
                    itemsToBarcode --
                }
                else {
                    return false
                }
            });
        })

        cy.wait(2000)


        cy.visit(`/warehousing/stock-take/${job.ID}/job-line-items?jobID=${job.ID}&checkType=confirm`)


      //scan items
      let itemsToScan = 3
      cy.get('ion-list ion-card span.barcode').each($el => {
        if(itemsToScan>0){
          const barcode = $el.text()
          cy.scan(barcode, 'Item Confirmed Successfully')
          itemsToScan --
        }
        else {
          return false
        }
      })

      //confrim manually
      cy.get('ion-list ion-card span.barcode').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="mark-confirmed"]').click({force:true})
      cy.get('button[test-id="confirm"]').click({force:true})
      cy.get('ion-toast').contains('Item confirmed successfully', {matchCase: false, includeShadowDom: true})
      cy.wait(3000)

      //create anomaly not found
      cy.get('ion-list ion-card span.barcode').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="item-not-found"]').click({force:true})
        cy.wait(500)
      cy.get('button[test-id="confirm"]').click({force:true})
      cy.get('ion-toast').contains('item moved to anomalies', {matchCase: false, includeShadowDom: true})
      cy.wait(3000)


      //create anomaly not found -  for deletion
      cy.get('ion-list ion-card span.barcode').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="item-not-found"]').click({force:true})
        cy.wait(500)
      cy.get('button[test-id="confirm"]').click({force:true})
      cy.get('ion-toast').contains('item moved to anomalies', {matchCase: false, includeShadowDom: true})
      cy.wait(3000)


      //create anomaly inspection
      cy.get('ion-list ion-card span.barcode').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="create-inspection-anomaly"]').click({force:true})
        cy.wait(500)
      cy.get('button[test-id="confirm"]').click({force:true})
      cy.get('ion-toast').contains('item moved to anomalies', {matchCase: false, includeShadowDom: true})
      cy.wait(3000)


      //create anomaly inspection - to be auto completed
      cy.get('ion-list ion-card span.barcode').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="create-inspection-anomaly"]').click({force:true})
        cy.wait(500)
      cy.get('button[test-id="confirm"]').click({force:true})
      cy.get('ion-toast').contains('item moved to anomalies', {matchCase: false, includeShadowDom: true})
      cy.wait(3000)


      // check item info
      cy.get('ion-list ion-card span.barcode').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="item-info"]').click({force:true})
      cy.visit(`/warehousing/stock-take/${job.ID}/job-line-items?jobID=${job.ID}&checkType=confirm`)
      cy.wait(3000)

      //edit notes
      cy.get('ion-list ion-card span.barcode').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="edit-notes"]').click({force:true})
      cy.get('input[formcontrolname="input"]').type('Some notes')
      cy.get('button[test-id="confirm"]').click({force:true})
      cy.get('ion-toast').contains('Job Item notes updated', {matchCase: false, includeShadowDom: true})
      cy.wait(3000)

      //test general search
      cy.get('input[test-id="search"]').type('nike')
      cy.get('ion-toast').should('not.exist')
      cy.get('input[test-id="search"]').clear()


      /**
       * TEST ANOMALY CHECKS
       *
       * - Inspect-case: Mark as resolved
       * - find-item: delete item not found
       * - find-item: mark as resolved
       * - complete-sale: mark as resolved
       * - complete-transfer: mark as resolved
       * - change-location: complete location change
       * - add-to-inventory: mark as resolved
       */

      //navigate to anomaly checks
      cy.visit(`/warehousing/stock-take/${job.ID}/job-line-items?jobID=${job.ID}&checkType=anomaly`)
      cy.wait(2000)

      cy.get('ion-list ion-card span[action="find-item"]').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="delete-item"]').click({force:true})
      cy.get('button[test-id="confirm"]').click({force:true})
      cy.get('ion-toast').contains('Item removed and anomaly marked as resolved', {matchCase: false, includeShadowDom: true})
      cy.wait(3000)

      cy.get('ion-list ion-card span[action="find-item"]').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="resolve-anomaly"]').click({force:true})

      cy.get('ion-toast').contains('Anomaly Marked as Resolved', {matchCase: false, includeShadowDom: true})
      cy.wait(3000)

      cy.get('ion-list ion-card span[action="inspect-case"]').eq(0).click({force:true})
      cy.wait(500)
      cy.get('button[id="resolve-anomaly"]').click({force:true})

      cy.get('ion-toast').contains('Anomaly Marked as Resolved', {matchCase: false, includeShadowDom: true})
      cy.wait(3000)

      // Mark a stock take as completed

      //navigate to overview
      cy.visit(`/warehousing/stock-take/${job.ID}`)
      cy.wait(2000)

      cy.wait(100)
      cy.get('ion-fab-button[test-id="options"]').click()
      cy.wait(500)
      //Complete
      cy.get('ion-fab-button[id="complete"]').click()
      cy.wait(500)
      //check success
      cy.get('button[test-id="confirm"]').click({force:true})
      cy.get('ion-toast').contains('Job manually completed', {matchCase: false, includeShadowDom: true})

    })
  })
})
