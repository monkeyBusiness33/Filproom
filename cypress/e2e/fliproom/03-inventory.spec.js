/// <reference types="Cypress" />
const _ = require('lodash');

describe("Creation", () => {
  it("Check Physical Inventory Form Correct Behaviour", () => {
    cy.login('retailer')
    cy.visit('/inventory')

    // CREATE PRODUCT
    cy.task("createProduct").then((product)=> {
      cy.get('app-inventory ion-fab#add-inventory').click()

      // Select product
      cy.get(`app-product-search input[test-id="search"]`).type(product.title)
      cy.wait(500)
      cy.get(`app-product-search ion-card`).eq(0).click()

      // Select physical inventory
      cy.get(`ion-action-sheet button#stock`).click();

      // Open inventory record form
      cy.get('app-inventory-record-form').eq(0).get('[test-id="view"]').click()
      
      //check form validity
      cy.get("app-inventory-record button[test-id='save']").should('be.visible').should('be.disabled')
      cy.wait(500)

      // test quantity limit
      cy.get("app-inventory-record input[formControlName='quantity']").type(200)
      cy.get('ion-toast').contains('maximum quantity reached', {matchCase: false, includeShadowDom: true})
    })
  })

  it("Check Virtual Inventory with market oracle Form Correct Behaviour", () => {
    cy.login('retailer')
    cy.task('getProducts', {'variants.price': '*','status':'!deleted','public': true})
    .then((products) => {
      let firstVariantWithPrice = _.chain(products)
          .flatMap(product => product.variants)
          .find(variant => variant.price !== null)
          .value();

      return cy.task("createProduct", {
        sourceProductID: firstVariantWithPrice.productID,
        variants: [
          {sourceProductVariantID: firstVariantWithPrice.ID}
        ]
      })
    })
    .then((product)=> {
      cy.visit(`/inventory/product/${product.ID}/variants/${product.variants[0].ID}?inventoryType=stock`)
  
      cy.wait(200)
      cy.get('app-inventory-view ion-fab').should('be.visible').click()
      cy.wait(200)
      cy.get('app-inventory-view ion-fab ion-fab-button#add-inventory').should('be.visible').click()

      // Select virtual inventory
      cy.get(`ion-action-sheet button#virtual-inventory`).click();

      // Select all
      cy.get(`app-inventory-bulk ion-content a[test-id="select-all-toggle"]`).click();
      cy.wait(500)

      // Open inventory record form
      cy.get('app-inventory-record-form').eq(0).get('[test-id="view"]').click()
      cy.wait(500)

      // Toggle virtual
      cy.get('mat-slide-toggle[test-id="virtual-toggle"]').should('be.visible').click().click();
  
      // turn on market oracle
      cy.get("mat-slide-toggle[test-id='market-oracle-toggle']").should('be.visible').click()
  
      // Edging margin to over -99 and 99 range
      cy.get("input[formcontrolname='priceSourceMargin']").clear().type('100').blur()
      cy.get("input[formcontrolname='priceSourceMargin']").should('have.value', '99')
      cy.get("input[formcontrolname='priceSourceMargin']").clear().type('-100').blur()
      cy.get("input[formcontrolname='priceSourceMargin']").should('have.value', '-99')

      // save inventory record form
      cy.get('app-inventory-record button[test-id="save"]').click()
      cy.wait(500)

      cy.get("input[formcontrolname='priceSourceMargin']").should('have.value', '-99')

      // save inventory
      cy.get('app-inventory-bulk button[test-id="save"]').click()
      cy.get('ion-toast').contains('Inventory Records Updated', {matchCase: false, includeShadowDom: true})

      return cy.task('getInventory')
    }).then((inventory => {
      const inventoryEdited = inventory[0]
      expect(inventoryEdited.quantity).equals(10)
      expect(inventoryEdited.virtual).equals(true)
      // items
      expect(inventoryEdited.items.length).equals(0)

      //listings
      cy.task('get', 'retailer').then(user => {
        expect(inventoryEdited.listings.length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
        expect(inventoryEdited.listings.filter(listing => listing.priceSourceName !== null).length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
        expect(inventoryEdited.listings.filter(listing => listing.priceSourceMargin == "-99.00").length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
        expect(inventoryEdited.listings.filter(listing => listing.status == "active").length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
      })
    }))
  })

  it("Create Virtual Inventory with payout and status drafted", () => {
    cy.login('retailer')
    cy.visit('/inventory')


    // CREATE PRODUCT
    cy.task("createProduct").then((product)=> {
      cy.get('app-inventory ion-fab#add-inventory').click()

      cy.get(`app-product-search input[test-id="search"]`).type(product.title)
      cy.wait(500)
      cy.get(`app-product-search ion-card`).eq(0).click()
      cy.wait(500)

      // Select virtual inventory
      cy.get(`ion-action-sheet button#virtual`).click();

      // Open inventory record form
      cy.get('app-inventory-record-form').eq(0).get('[test-id="view"]').click()

      //check form validity
      cy.get("app-inventory-record button[test-id='save']").should('be.visible')
      cy.wait(500)

      //set virtual
      cy.get("mat-slide-toggle[test-id='virtual-toggle']").click()

      // payout
      cy.get("app-inventory-record input[formcontrolname='payout']").should('be.visible').type(999)

      // set status
      cy.get("mat-select[formControlName='status']").should('be.visible').click()
      cy.get("mat-option#drafted").click()

      // cost
      cy.get("app-inventory-record input[formControlName='cost']").type(200)
      cy.wait(500)

      //Notes
      cy.get("input[formControlName='notes']").type('Some test notes')

      // save inventory record form
      cy.get('app-inventory-record button[test-id="save"]').click()
      cy.wait(500)

      // save inventory
      cy.get('app-inventory-bulk button[test-id="save"]').click()
      cy.get('ion-toast').contains('Inventory Records Updated', {matchCase: false, includeShadowDom: true})

      cy.task('getInventory').then((inventoryRecords) => {
        const inventoryCreated = inventoryRecords[0]

        expect(inventoryCreated.quantity).equals(10)
        expect(inventoryCreated.cost).equals('200.00')
        expect(inventoryCreated.virtual).equals(true)
        expect(inventoryCreated.notes).equals('Some test notes')
        // items
        expect(inventoryCreated.items.length).equals(0)

        cy.task('get', 'retailer').then(user => {
          expect(inventoryCreated.listings.length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
          expect(inventoryCreated.listings.filter(listing => listing.payout == "999.00").length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
          expect(inventoryCreated.listings.filter(listing => listing.status == "drafted").length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
        })
      })
    })
  })

  it("Create virtual inventory using payout in bulk - bulk level", () => {
    cy.login('retailer').then((res) => {
      cy.visit('/inventory');
      // Create the product
      cy.task("createProduct").then((product)=> {
        // Open add page
        cy.get(`app-inventory ion-fab[id="add-inventory"]`).click();
        
        cy.wait(200);
  
        // Select product
        cy.get(`app-product-search input[test-id="search"]`).type(product.title);
        cy.wait(500);
        cy.get(`app-product-search ion-card`).eq(0).click();
  
        // Select virtual inventory
        cy.get(`ion-action-sheet button#virtual`).click();
  
        // Select all and enter data
        cy.get(`app-inventory-bulk ion-content a[test-id="select-all-toggle"]`).click();
        cy.get(`app-inventory-record-form input[formcontrolname="payout"]`).first().type((140).toString());
  
        // Submit
        cy.get(`button[test-id="save"]`).click();
        
        // Check valid
        cy.get('ion-toast').contains('Inventory Records Updated', {matchCase: false, includeShadowDom: true});

        // Verify
        cy.task("getInventory", {virtual: true, productID: product.ID, productVariantID: product.variants[0].ID}).then((res) => {
          expect(res.length).equals(1);
          expect(res[0].product.title).equals(product.title);
          expect(res[0].quantity).equals(10);
        });
      });
    });
  });

  it("Create physical inventory - bulk level", () => {
    cy.login('retailer').then((res) => {
      cy.visit('/inventory');
      // Create the product
      cy.task("createProduct").then((product)=> {
        // Open add page
        cy.get(`app-inventory ion-fab[id="add-inventory"]`).click();
        
        cy.wait(200);
  
        // Select product
        cy.get(`app-product-search input[test-id="search"]`).type(product.title);
        cy.wait(500);
        cy.get(`app-product-search ion-card`).eq(0).click();
  
        // Select physical inventory
        cy.get(`ion-action-sheet button#stock`).click();
        
        // Select all and enter data
        cy.get(`app-inventory-record-form input[formcontrolname="quantity"]`).first().type((5).toString());
        cy.get(`app-inventory-record-form input[formcontrolname="cost"]`).first().type((100).toString());
        cy.get(`app-inventory-record-form input[formcontrolname="payout"]`).first().type((150).toString());
  
        // Submit
        cy.get(`button[test-id="save"]`).click();

        // Check valid
        cy.get('ion-toast').contains('Inventory Records Updated', {matchCase: false, includeShadowDom: true});
  
        // Verify
        cy.task("getInventory", {virtual: false, productID: product.ID, productVariantID: product.variants[0].ID}).then((res) => {
          expect(res.length).equals(1);
          expect(res[0].product.title).equals(product.title);
          expect(res[0].quantity).equals(5);
          expect(parseInt(res[0].cost)).equals(100);
          expect(parseInt(res[0].listings[0].payout)).equals(150);
        });
      });
    });
  })

  it("Consignor create physical inventory selecting from retailer product", () => {
    cy.login('reseller').then((res) => {
      cy.visit('/inventory');
      cy.task("createProduct", {account: 'reseller'}).then((product)=> {
        // Open add page
        cy.get(`app-inventory ion-fab[id="add-inventory"]`).click();
        
        cy.wait(200);
  
        // Select product
        cy.get(`app-product-search ion-header ion-segment ion-segment-button[ng-reflect-value="consignment"]`).click()
        cy.get(`app-product-search input[test-id="search"]`).type(product.code);
        cy.wait(500);
        cy.get(`app-product-search ion-card`).eq(0).click();
        
        // //check form validity
        cy.get(`app-inventory-record-form input[formcontrolname="quantity"]`).first().type((5).toString());
        cy.get(`app-inventory-record-form input[formcontrolname="cost"]`).first().type((100).toString());
        cy.get(`app-inventory-record-form input[formcontrolname="payout"]`).first().type((150).toString());
  
        cy.get(`button[test-id="save"]`).click()
        cy.get('ion-toast').contains('Inventory Records Updated', {matchCase: false, includeShadowDom: true})
  
        // Verify
        cy.task("getInventory", {account: 'reseller'}).then((inventory) => {
          expect(inventory[0].product.title).equals(product.title);
          expect(inventory[0].quantity).equals(5);
          expect(inventory[0].productID).equals(product.ID);
          expect(inventory[0].listings[0].productID).not.equals(product.ID);
          expect(parseInt(inventory[0].listings[0].payout)).equals(150);
        })
      })
    });
  })

  it("Create virtual sync to market margin and create bulk", () => {
    cy.login('retailer').then((res) => {
      cy.visit('/inventory');
      cy.task('getProducts', {'variants.price': '*','status':'!deleted','public': true}).then((products) => {
        let firstVariantWithPrice = _.chain(products)
          .flatMap(product => product.variants)
          .find(variant => variant.price !== null)
          .value();
        cy.task("createProduct", {sourceProductID: firstVariantWithPrice.productID, variants: [{sourceProductVariantID: firstVariantWithPrice.ID}]}).then((product)=> {
          // Open add page
          cy.get(`app-inventory ion-fab[id="add-inventory"]`).click();
          cy.wait(200);
        
          // Select product
          cy.get(`app-product-search input[test-id="search"]`).type(product.title);
          cy.wait(500);
          cy.get(`app-product-search ion-card`).eq(0).click();
        
          // Select virtual inventory
          cy.get(`ion-action-sheet button#virtual`).click();
        
          // //check form validity
          cy.get(`app-inventory-bulk ion-content a[test-id="select-all-toggle"]`).click();
          cy.get(`app-inventory-record-form input[formcontrolname="cost"]`).first().type((100).toString());
          cy.get(`app-inventory-record-form button[test-id="sync-product"]`).click();
          cy.get(`app-inventory-record-form input[formcontrolname="priceSourceMargin"]`).first().type((10).toString());

          // Save
          cy.get(`button[test-id="save"]`).click()
          cy.get('ion-toast').contains('Inventory Records Updated', {matchCase: false, includeShadowDom: true})

          // Verify
          cy.task("getInventory", {virtual: true, productID: product.ID, productVariantID: product.variants[0].ID}).then((res) => {
            expect(res.length).equals(1);
            expect(res[0].product.title).equals(product.title);
            expect(res[0].quantity).equals(10);
            expect(parseInt(res[0].listings[0].priceSourceMargin)).equals(10);
          });
        })
      })
    });
  })
})

describe("Update", () => {
  it("Check Form Correct Behaviour", () => {
    cy.login('retailer')
    cy.visit('/inventory')

    cy.task('getProducts', {'variants.price': '*','status':'!deleted','public': true}).then((products) => {
      let firstVariantWithPrice = _.chain(products)
          .flatMap(product => product.variants)
          .find(variant => variant.price !== null)
          .value();

      return cy.task("createProduct", {
        sourceProductID: firstVariantWithPrice.productID,
        variants: [
          {sourceProductVariantID: firstVariantWithPrice.ID}
        ]
      })
    })
    .then((product => {
      // create inventory to update
      return cy.task("createInventory", {quantity: 3, setAsDelivered: true, productID: product.ID, productVariantID: product.variants[0].ID})
    }))
    .then((inventory)=> {
      // go to inventory created
      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=stock`)
      cy.wait(2000)
      cy.get(`ion-card#${inventory.ID}`).should('be.visible').eq(0).click()
      cy.get('mat-select[formcontrolname="variant"]').should('not.exist');
      // can't edit location
      cy.get('mat-select[formcontrolname="warehouse"]').should('not.exist');

      // turn on market oracle
      cy.get("mat-slide-toggle[test-id='market-oracle-toggle']").click()
      cy.get("input[formControlName='priceSourceMargin']").clear().type(32)
      //submit
      cy.get('button[test-id="save"]').click()
      cy.get('ion-toast').contains('Inventory Updated', {matchCase: false, includeShadowDom: true})

      return cy.task('getInventoryByID', {ID: inventory.ID})
    }).then((inventory) => {
      // check that sync is on
      expect(inventory.listings.filter(listing => listing.priceSourceName != null).length).equals(inventory.listings.length)
      expect(inventory.listings.filter(listing => listing.priceSourceMargin != null).length).equals(inventory.listings.length)
  
      // turn sync off
      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=stock&inventoryID=${inventory.ID}`)
    
      cy.get("mat-slide-toggle[test-id='market-oracle-toggle']").click()
      cy.get('button[test-id="save"]').click()
      cy.get('ion-toast').contains('Inventory Updated', {matchCase: false, includeShadowDom: true})
      return cy.task('getInventoryByID', {ID: inventory.ID})
    }).then((inventory) => {
      // check that sync is off
      expect(inventory.listings.filter(listing => listing.priceSourceName == null).length).equals(inventory.listings.length)
      expect(inventory.listings.filter(listing => listing.priceSourceMargin == null).length).equals(inventory.listings.length)
    })
  })

  it("Update Physical Inventory - warehousing enabled", () => {
    cy.login('retailer')
    cy.visit('/inventory')

    // create inventory to update
    cy.task("createInventory").then((inventory)=> {
      // go to inventory created
      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=stock`)
      cy.wait(2000)
      cy.get(`ion-card#${inventory.ID}`).should('be.visible').eq(0).click()

      // Check correct behaviour
      // can't change variant
      cy.get('mat-select[formcontrolname="variant"]').should('not.exist');
      // can't edit location
      cy.get('mat-select[formcontrolname="warehouse"]').should('not.exist');
      // can't edit quantity
      cy.get("input[formcontrolname='quantity']").should('be.disabled')
      // Should a warning be displayed at the quantity field
      cy.get("input[formcontrolname='quantity']")
          .parentsUntil("mat-form-field")
          .get("mat-hint")
          .contains("You can't change quantity for inventory at external location", {matchCase: false})

      //change payout
      cy.get("input[formcontrolname='payout']").should('be.visible').clear().type(333)

      //change status
      cy.get("mat-select[formControlName='status']").click()
      cy.get("mat-option").contains('Draft').click()
      cy.wait(500)

      //edit cost and price
      cy.get("input[formControlName='cost']").clear().type(999)
      cy.get("input[formControlName='notes']").clear().type('edited inventory')

      //submit
      cy.get('button[test-id="save"]').click()
      cy.get('ion-toast').contains('Inventory Updated', {matchCase: false, includeShadowDom: true})

      return cy.task('getInventory')
    }).then((inventory => {
      const inventoryEdited = inventory[0]

      expect(inventoryEdited.quantity).equals(1)
      expect(inventoryEdited.cost).equals('999.00')
      expect(inventoryEdited.virtual).equals(false)
      expect(inventoryEdited.notes).equals('edited inventory')
      // items
      expect(inventoryEdited.items.length).equals(1)

      //listings
      cy.task('get', 'retailer').then(user => {
        expect(inventoryEdited.listings.length).equals(user.account.saleChannels.length)
        expect(inventoryEdited.listings.filter(listing => listing.payout == "333.00").length).equals(user.account.saleChannels.length)
        expect(inventoryEdited.listings.filter(listing => listing.status == "drafted").length).equals(user.account.saleChannels.length)
      })
    }))
  })

  it("Update Physical Inventory change quantity - warehousing disabled", () => {

    let reseller;
    cy.login('reseller').then(_reseller => {
      reseller = _reseller
      // create inventory to update
      return cy.task("createInventory", {account: 'reseller', quantity: 3, setAsDelivered: true})
    })
    .then((inventory)=> {
      cy.visit('/inventory')
      // go to inventory created
      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=stock`)
      cy.wait(2000)
      cy.get(`ion-card#${inventory.ID}`).should('be.visible').eq(0).click()

      // // Check correct behaviour
      // // can't change variant
      cy.get('mat-select[formcontrolname="variant"]').should('not.exist');
      // // can't edit location
      cy.get('mat-select[formcontrolname="warehouse"]').should('not.exist');


      // TODO - check not implemented - can't increase quantity
      cy.get("input[formcontrolname='quantity']").clear().type(9)

      // decrease quantity
      cy.get("input[formcontrolname='quantity']").clear().type(0)

      //submit
      cy.get('button[test-id="save"]').click()
      cy.wait(750)
      cy.toastMessage('Inventory Updated')

      return cy.task('getInventoryByID', {account: 'reseller', ID: inventory.ID})
    }).then((inventoryEdited => {
      expect(inventoryEdited.quantity).equals(0)
      // items
      expect(inventoryEdited.items.length).equals(0)
      //listings
      expect(inventoryEdited.listings.length).equals(reseller.account.saleChannels.length )
      expect(inventoryEdited.listings.filter(listing => listing.payout == "999.00").length).equals(reseller.account.saleChannels.length)
      expect(inventoryEdited.listings.filter(listing => listing.status == "active").length).equals(reseller.account.saleChannels.length)
    }))
  })

  it("Update Physical Inventory activate market oracle", () => {
    let retailer;
    cy.login('retailer')
        .then(_retailer => {
          retailer = _retailer
          return cy.task('getProducts', {'variants.price': '*','status':'!deleted','public': true}).then((products) => {
            let firstVariantWithPrice = _.chain(products)
                .flatMap(product => product.variants)
                .find(variant => variant.price !== null)
                .value();

            return cy.task("createProduct", {
              sourceProductID: firstVariantWithPrice.productID,
              variants: [
                {sourceProductVariantID: firstVariantWithPrice.ID}
              ]
            })
          })
        })
        .then((product => {
          // create inventory to update
          return cy.task("createInventory", {quantity: 3, setAsDelivered: true, productID: product.ID, productVariantID: product.variants[0].ID})
        }))
        .then((inventory)=> {
          // go to inventory created
          cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=stock`)
          cy.wait(2000)
          cy.get(`ion-card#${inventory.ID}`).should('be.visible').eq(0).click()

          cy.wait(1000)
          // Check correct behaviour
          cy.get("mat-slide-toggle[test-id='market-oracle-toggle']").should('be.visible').click()
          cy.get("input[formcontrolname='priceSourceMargin']").should('be.visible').clear().type(40)

          cy.wait(500)

          //submit
          cy.get('button[test-id="save"]').click()
          cy.wait(750)
          cy.toastMessage('Inventory Updated')

          return cy.task('getInventoryByID', {ID: inventory.ID})
        }).then((inventoryEdited => {
      expect(inventoryEdited.quantity).equals(3)
      expect(inventoryEdited.items.length).equals(3)

      //listings
      expect(inventoryEdited.listings.length).equals(retailer.account.saleChannels.length)
      expect(inventoryEdited.listings.filter(listing => listing.priceSourceMargin == "40.00").length).equals(retailer.account.saleChannels.length)
      expect(inventoryEdited.listings.filter(listing => listing.priceSourceName == "stockx").length).equals(retailer.account.saleChannels.length)
      expect(inventoryEdited.listings.filter(listing => listing.status == "active").length).equals(retailer.account.saleChannels.length)
      expect(inventoryEdited.listings.filter(listing => listing.price != null).length).equals(retailer.account.saleChannels.length)
    }))
  })

  it("Update Virtual Inventory", () => {
    cy.login('retailer')
    cy.visit('/inventory')

    // create inventory to update
    cy.task('get', 'retailer')
    .then(user => cy.task("createInventory", {virtual: true, saleChannels: user.account.saleChannels.filter(sc => sc.allowVirtualInventory)}))
    .then((inventory)=> {
      // go to inventory created
      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=virtual`)
      cy.wait(2000)
      cy.get(`ion-card#${inventory.ID}`).should('be.visible').eq(0).click()

      /* Remove inventory by toggling virtual */

      // Toggle virtual
      cy.get('mat-slide-toggle[test-id="virtual-toggle"]').should('be.visible').click();

      //submit
      cy.get('button[test-id="save"]').click()
      cy.get('ion-toast').contains('Inventory Updated', {matchCase: false, includeShadowDom: true})

      // Check inventory removed
      cy.get(`ion-card#${inventory.ID}`).should('not.exist')


      /* Recreate inventory */

      // Create one
      cy.get('.button[test-id="create-inventory-record"]').should('be.visible').click()

      // Select virtual inventory
      cy.get('ion-action-sheet button#virtual-inventory').click()

      // Toggle Select all
      cy.get('.button[test-id="select-all-toggle"').click()
      cy.wait(500)

      //submit
      cy.get('button[test-id="save"]').click()
      cy.get('ion-toast').contains('Inventory Updated', {matchCase: false, includeShadowDom: true})



      // go to inventory recreated
      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=virtual`)
      cy.wait(2000)
      cy.get(`ion-card#${inventory.ID}`).should('be.visible').eq(0).click()

      // Check correct behaviour
      // can't change variant
      cy.get('mat-select[formcontrolname="variant"]').should('not.exist');

      //change payout
      cy.get("input[formcontrolname='payout']").should('be.visible').clear().type(999)

      //change status
      cy.get("mat-select[formControlName='status']").click()
      cy.get("mat-option").contains('Draft').click()
      cy.wait(500)

      //edit cost and price
      cy.get("input[formControlName='cost']").clear().type(111)
      cy.get("input[formControlName='notes']").clear().type('edited inventory')

      //submit
      cy.get('button[test-id="save"]').click()
      cy.get('ion-toast').contains('Inventory Updated', {matchCase: false, includeShadowDom: true})

      return cy.task('getInventory')
    }).then((inventory => {
      const inventoryEdited = inventory[0]
      expect(inventoryEdited.quantity).equals(10)
      expect(inventoryEdited.cost).equals('111.00')
      expect(inventoryEdited.virtual).equals(true)
      expect(inventoryEdited.notes).equals('edited inventory')
      // items
      expect(inventoryEdited.items.length).equals(0)

      //listings
      cy.task('get', 'retailer').then(user => {
        expect(inventoryEdited.listings.length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
        expect(inventoryEdited.listings.filter(listing => listing.payout == "999.00").length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
        expect(inventoryEdited.listings.filter(listing => listing.status == "drafted").length).equals(user.account.saleChannels.filter(sc => sc.allowVirtualInventory).length)
      })
    }))
  })

  it("Should not update Inventory quantity at an external location", () => {
    let inventory, editLdnHQ;
    
    // get transfer destination warehouse
    cy.login('retailer')
    .then((user) => {
      editLdnHQ = user.account.warehouses.find(wh => wh.fulfillmentCentre)
      // create inventory to transfer
      return cy.task("createInventory", {account: 'reseller', setAsDelivered: true, quantity: 1})
    }).then((_inventory)=> {
      inventory = _inventory
      return cy.task('createOrder', {
        type: 'transfer',
        account: 'reseller',
        consignorID: inventory.warehouse.addressID,
        consigneeID: editLdnHQ.addressID,
        fulfillment: {
          setAsDispatched: true,
          setAsDelivered: true
        },
        details: [
          {itemID: inventory.items[0].ID}
        ]}
      )
    })
    .then((transferOut) => {
      console.log(transferOut)
      // go to inventory created
      cy.login('reseller')

      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=stock`)
      cy.wait(2000)
      cy.get(`ion-card#${transferOut.orderLineItems[0].item.inventoryID}`).should('be.visible').eq(0).click()

      // shouldn't be able to edit quantity
      cy.get("input[formcontrolname='quantity']").should('be.disabled')
      // Should a warning be displayed at the quantity field
      cy.get("input[formcontrolname='quantity']")
          .parentsUntil("mat-form-field")
          .get("mat-hint")
          .contains("You can't change quantity for inventory at external location", {matchCase: false})

      // should be able to edit payout
      cy.get("input[formcontrolname='payout']")
          .should('not.be.disabled')
          .clear().type("999")

      // submit
      cy.get('button[test-id="save"]').click()
      cy.wait(750)
      cy.toastMessage('Inventory Updated')
    })
  })

  it("Should add a new listing for an existing inventory", () => {
    // get transfer destination warehouse
    cy.login('retailer')
    .then(user => {
      return cy.task("createInventory", {setAsDelivered: true, quantity: 1, saleChannels: user.account.saleChannels.slice(0, 1)})
    })
    .then((inventory) => {
      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=stock`)
      cy.wait(2000)
      cy.get(`ion-card#${inventory.ID}`).should('be.visible').eq(0).click()

      cy.wait(2000)

      cy.get(`a.button[test-id="add-listing"]`).eq(0).should('be.visible').click()

      cy.get('mat-select[formcontrolname="status"]')

      cy.get("app-listing-form mat-select[formControlName='status']").click()
      cy.get("mat-option").contains('Active').click()
      cy.wait(500)

      cy.get('app-listing-form input[formcontrolname="payout"]').type(999)
      cy.get('button[test-id="submit"]').click()
      cy.wait(750)

      //submit
      cy.get('button[test-id="save"]').click()
      cy.get('ion-toast').contains('Inventory Updated', {matchCase: false, includeShadowDom: true})
      return cy.task('getInventory')
    })
    .then((inventory => {
      const inventoryEdited = inventory[0]
      expect(inventoryEdited.quantity).equals(1)
      // items
      expect(inventoryEdited.items.length).equals(1)

      //listings
      expect(inventoryEdited.listings.length).equals(2)
      expect(inventoryEdited.listings.filter(listing => listing.payout == "999.00").length).equals(2)
      expect(inventoryEdited.listings.filter(listing => listing.status == "active").length).equals(2)
    }))
  })

  it("Should add a new listing for external channel", () => {
    let inventory, saleChannel;

    cy.task("createProduct")
      .then((product) => {
        return cy.task("createInventory", {account: 'reseller', quantity: 1, productID: product.ID, productVariantID: product.variants[0].ID})
      })
      .then((_inventory) => {
        inventory = _inventory
        // Create a new sale channel for retailer
        return cy.task('createSaleChannel')
      })
      .then((_saleChannel) => {
        saleChannel = _saleChannel
        cy.task('login', 'reseller')
      })
      .then((reseller) => {
        // Add sale channel to the reseller
        return cy.task('addAccountToSaleChannel', {accountID: reseller.accountID, saleChannelID: saleChannel.ID})
      })
      .then(() => {
        cy.login('reseller')
        cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=stock`)
        cy.wait(2000)
        cy.get(`ion-card#${inventory.ID}`).should('be.visible').eq(0).click()
        cy.wait(2000)

        cy.get(`a.button[test-id="add-listing"]`).eq(0).should('be.visible').click()

        cy.get('mat-select[formcontrolname="status"]')

        cy.get("app-listing-form mat-select[formControlName='status']").click()
        cy.get("mat-option").contains('Active').click()
        cy.wait(500)

        cy.get('app-listing-form input[formcontrolname="payout"]').type(999)
        cy.get('button[test-id="submit"]').click()
        cy.wait(750)

        //submit
        cy.get('button[test-id="save"]').click()
        cy.get('ion-toast').contains('Inventory Updated', {matchCase: false, includeShadowDom: true})
        return cy.task('getInventory', {account: 'reseller'})
      })
      .then((_inventory => {
        const inventoryEdited = _inventory[0]
        expect(inventoryEdited.listings.filter(listing => listing.saleChannelID === saleChannel.ID && listing.payout === "999.00").length).equals(1)
        expect(inventoryEdited.listings.filter(listing => listing.saleChannelID === saleChannel.ID && listing.status === "active").length).equals(1)
      }))
  })

  it("Consignment Store Tries to update Physical Inventory of consignor", () => {
    let inventory, editLdnHQ, gTansferOut;
    
    // get transfer destination warehouse
    cy.login('retailer')
    .then((user) => {
      editLdnHQ = user.account.warehouses.find(wh => wh.fulfillmentCentre)
      // create inventory to transfer
      return cy.task("createInventory", {account: 'reseller', setAsDelivered: true, quantity: 1})
    }).then((_inventory)=> {
      inventory = _inventory
      return cy.task('createOrder', {
        type: 'transfer',
        account: 'reseller',
        consignorID: inventory.warehouse.addressID,
        consigneeID: editLdnHQ.addressID,
        fulfillment: {
          setAsDispatched: true,
          setAsDelivered: true
        },
        details: [
          {itemID: inventory.items[0].ID}
        ]}
      )
    })
    .then((transferOut) => {
      // go to inventory created
      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=consignment`)
      cy.wait(2000)
      cy.get(`ion-card#${transferOut.orderLineItems[0].item.inventoryID}`).should('be.visible').eq(0).click()
      gTansferOut = transferOut
      // Check correct behaviour

      // shouldn't be able to edit quantity
      cy.get("input[formcontrolname='quantity']").should('be.disabled')
      // Should a warning be displayed at the quantity field
      cy.get("input[formcontrolname='quantity']")
          .parentsUntil("mat-form-field")
          .get("mat-hint")
          .contains("You can't change quantity for inventory at external location", {matchCase: false})

      cy.get("input[formcontrolname='payout']").invoke('val').then(val => {
        const newPayout = Number(val) + 100;
        // should be able to edit payout
        cy.get("input[formcontrolname='payout']").clear().type(newPayout)
        // shouldn't be able to update and shows error message
        cy.get('button[test-id="save"]').click({force: true})
        cy.get('ion-toast').contains('This is consignor stock. You can only update the status of your listings', {matchCase: false, includeShadowDom: true})
        cy.wait(500)
        
        cy.get("input[formcontrolname='payout']").clear().type(val)
        // should be able to update status
        cy.get("mat-select[formcontrolname='status']").should('be.visible').click().get(`mat-option`).eq(1).click()
        // should be able to update and shows success message
        cy.get('button[test-id="save"]').click({force: true})
        cy.wait(500)
        cy.get('ion-toast').contains('Inventory Updated', {matchCase: false, includeShadowDom: true})
      })
    })
    .then(() => { // Check Inventory bulk update
      // go to inventory created
      cy.visit(`/inventory/product/${inventory.productID}/variants/${inventory.productVariantID}?inventoryType=consignment`)
      cy.wait(2000)
      cy.get(`ion-card#${gTansferOut.orderLineItems[0].item.inventoryID}`).should('be.visible').eq(0).click()
      cy.get('.listings-section ion-card').each(($el) => {
        cy.wrap($el).get('.tags-list .tag').should("contain.text", 'drafted')
      })
      cy.get('button[test-id="save"]').click({force: true})
      cy.wait(500)

      cy.get('ion-fab-button').eq(0).click().get('ion-fab-button#bulk-edit').click();
      cy.get("input[formcontrolname='payout']").invoke('val').then(val => {
        const newPayout = Number(val) + 100;
        // should be able to edit payout
        cy.get("input[formcontrolname='payout']").clear().type(newPayout)
        // shouldn't be able to update and shows error message
        cy.get('button[test-id="save"]').click({force: true})
        cy.wait(500)
        cy.get('ion-toast').contains('This is consignor stock. You can only update the status of your listings', {matchCase: false, includeShadowDom: true})
        // reset payout value        
        cy.get("input[formcontrolname='payout']").clear().type(val)
        cy.get('#inventory-record-form-wrapper app-inventory-record-form').eq(0).get('ion-chip[test-id="view"]').click({ force: true });
        cy.get("mat-select[formcontrolname='status']").should('be.visible').click({ force: true }).get(`mat-option`).eq(0).click({ force: true })
        // should be able to update and shows success message
        cy.get('app-inventory-bulk button[test-id="save"]').click({force: true})
        cy.wait(500)
        cy.get('ion-toast').contains('Inventory Records Updated', {matchCase: false, includeShadowDom: true})
      })
    })
  })

  it("Update virtual inventory - bulk level", () => {
    cy.login('retailer').then((res) => {
      cy.task("createProduct", {account: 'retailer'}).then((res) => {
        let productTitle = res.title;
        cy.task("createInventory", {productID: res.ID, productVariantID: res.variants[0].ID, virtual: true, account: 'retailer'}).then((res) => {
          let inventoryID = res.ID;
          cy.visit('/inventory');

          // Open existing product
          cy.get(`app-inventory fliproom-searchbar input[test-id="search"]`).type(productTitle);
          cy.wait(500);
          cy.get(`app-inventory ion-card`).eq(0).should('be.visible').click();
          // Click the variant
          cy.get(`ion-card ion-list ion-item`).should('be.visible').click();
          // Click listing
          cy.get(`app-inventory-variant ion-list ion-card`).find(`button`).click({force: true});
    
          cy.get(`input[formcontrolname="payout"]`).clear().type((250).toString());
          cy.get(`input[formcontrolname="cost"]`).clear().type((199).toString());
    
          cy.get(`button[test-id="save"]`).click();
    
          cy.get(`ion-toast`).contains('Inventory Updated', {matchCase: false, includeShadowDom: true});

          cy.wait(500);

          cy.task("getInventoryByID", {ID: inventoryID, account: 'retailer'}).then((res) => {
            expect(res.product.title).equals(productTitle);
            expect(parseInt(res.cost)).equals(199);
            console.log(res.listings)
            expect(parseInt(res.listings.find(li=> li.saleChannel.platform =='shopify').payout)).equals(250);
          });
        })
      })

    });
  });

  it("Update physical inventory - bulk level", () => {
    cy.login('retailer').then((res) => {
      cy.task("createProduct").then((res) => {
        let productTitle = res.title;
        cy.task("createInventory", {productID: res.ID, productVariantID: res.variants[0].ID, virtual: false}).then((res) => {
          let inventoryID = res.ID;
          cy.visit('/inventory');

          // Open existing product
          cy.get(`app-inventory fliproom-searchbar input[test-id="search"]`).type(productTitle);
          cy.wait(500);
          cy.get(`app-inventory ion-card`).should('be.visible').eq(0).click();
          // Click the variant
          cy.get(`ion-card ion-list ion-item`).should('be.visible').click();
          // Click listing
          cy.get(`app-inventory-variant ion-list ion-card`).find(`button`).click({force: true});
    
          cy.get(`input[formcontrolname="payout"]`).clear().type((250).toString());
          cy.get(`input[formcontrolname="cost"]`).clear().type((199).toString());
    
          cy.get(`button[test-id="save"]`).click();
    
          cy.get(`ion-toast`).contains('Inventory Updated', {matchCase: false, includeShadowDom: true});

          cy.wait(500);

          cy.task("getInventoryByID", {ID: inventoryID}).then((res) => {
            expect(res.product.title).equals(productTitle);
            expect(parseInt(res.cost)).equals(199);
            expect(parseInt(res.quantity)).equals(1);
            expect(parseInt(res.listings.find(li=> li.saleChannel.platform =='shopify').payout)).equals(250);
          });
        })
      })

    });
  })
})
