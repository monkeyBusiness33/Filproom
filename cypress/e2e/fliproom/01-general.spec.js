/// <reference types="Cypress" />

const { ACCOUNT_TYPES } = require('../shared/constants')
describe("Sign Up - Sign In" , () => {
  it("Signup by email", () => {
    cy.visit(`/signup`)

    cy.get(`input[formControlName="name"]`).type(`John`)
    cy.get(`input[formControlName="surname"]`).type(`Doe`)
    cy.get(`input[formControlName="email"]`).type(`${Math.random().toString(36).slice(2)}@gmail.com`)
    cy.get(`input[formControlName="password"]`).type("testPassword")
    cy.get(`input[formControlName="confirmPassword"]`).type("testPassword")

    cy.get(`button[test-id="signup"]`).click()
    cy.wait(2000)
    cy.visit(`/dashboard`)



    cy.url().should('include', '/dashboard')
  })

  it("Signin by email", () => {
    let email = `${Math.random().toString(36).slice(2)}.test4@fliproom.com`
    let password = 'pass1234'
    cy.task('userSignup', {
      name: 'cypress',
      surname: 'Test',
      email: email,
      password: password,
    })
    cy.visit(`/signin`)

    cy.get(`input[formControlName="email"]`).type(email)
    cy.get(`input[formControlName="password"]`).type(password)

    cy.get(`button[test-id="signin"]`).click()

    cy.url().should('include', '/dashboard')
  })

  it("Signup by invite", () => {
    const accountNameInviting = "retailer-guy"
    cy.visit(`/signup?consignInvite=${accountNameInviting}`)

    cy.get(`input[formControlName="name"]`).type(`John`)
    cy.get(`input[formControlName="surname"]`).type(`Doe`)
    cy.get(`input[formControlName="email"]`).type(`${Math.random().toString(36).slice(2)}@gmail.com`)
    cy.get(`input[formControlName="password"]`).type("testPassword")
    cy.get(`input[formControlName="confirmPassword"]`).type("testPassword")

    cy.get(`button[test-id="signup"]`).click()
    cy.wait(2000)

    cy.visit(`integrations/the-edit-ldn?retailerAccountID=3&integrationName=The%20Edit%20LND`)
    cy.get('div.sale-channel-section').find('mat-slide-toggle').its('length').should('be.gte', 1)
  })
})

describe("Settings", () => {
  it("Change Password", () => {
    const email = `${Math.random().toString(36).slice(2)}.test4@fliproom.com`
    const password = 'pass1234'
    const newPassword = 'newpassword'

    cy.task('userSignup', {
      name: 'cypress',
      surname: 'Test',
      email: email,
      password: password,
    })
    cy.visit(`/signin`)

    cy.get(`input[formControlName="email"]`).type(email)
    cy.get(`input[formControlName="password"]`).type(password)

    cy.get(`button[test-id="signin"]`).click()
    cy.wait(2000)

    // Change password

    cy.visit('/settings')
    cy.get('ion-item[test-id="general"]').click()
    cy.get('button[test-id="change-password"]').should('be.visible').click()

    cy.get(`input[formControlName="password"]`).type(newPassword)
    cy.get(`input[formControlName="confirmPassword"]`).type(newPassword)
    cy.get('button[test-id="confirm"]').click()

    cy.get('app-alert button').click()
    cy.url().should('include', '/signin')

    // Sign in with new password

    cy.get(`input[formControlName="email"]`).type(email)
    cy.get(`input[formControlName="password"]`).type(newPassword)
    cy.get(`button[test-id="signin"]`).click()

    cy.url().should('include', '/dashboard')
  })
  it("Update Invoicing Information", () => {
    cy.login('reseller')
    cy.visit('/settings')
    cy.get('ion-item[test-id="invoicing"]').click()

    cy.get('input[formControlName="vatNumber"]').type('123456789')
    cy.get('input[formControlName="taxRate"]').type('10')
    cy.get('input[test-id="billing-address"]').click()
    cy.fillAddressForm()
    cy.wait(1000)
    cy.get('button[test-id="submit"]').should('be.visible').click()
    cy.wait(1000)
    cy.toastMessage('Settings Updated')
  })

  it("Create Store Sale Channel", () => {
    const newSaleChannelName = `${Math.random().toString(36).slice(2)}`

    cy.login('retailer')
    cy.visit('/settings')

    cy.get('ion-item[test-id="sale-channels"]').click()
    cy.get('a.button[test-id="add-sale-channel"]').click()
    cy.get('ion-action-sheet button#store').should('be.visible').click()

    cy.get('app-sale-channel-form input[formcontrolname="title"]').type(newSaleChannelName)
    cy.get('app-sale-channel-form button[test-id="submit"]').click()

    cy.wait(1000)
    cy.get('ion-list.sale-channels ion-card span[test-id="sale-channel-title"]').should('be.visible').contains(newSaleChannelName.toUpperCase())
  })

  it("Edit Store Sale Channel Info and Transaction Rates", () => {
    cy.login('retailer')
    cy.task('createSaleChannel').then(saleChannel => {
      cy.visit('/settings')
      cy.get('ion-item[test-id="sale-channels"]').click()
      cy.get(`ion-list.sale-channels ion-card[test-id="${saleChannel.ID}"]`).should('be.visible').click()

      cy.get('app-sale-channel-form a.button[test-id="consignment-fees-add"]').click()

      cy.get('app-consignment-settings-form a.button').click()
      //add
      cy.get('app-consignment-settings-form input[formcontrolname="minPrice"]').eq(0).type(0)
      cy.get('app-consignment-settings-form input[formcontrolname="maxPrice"]').eq(0).type(100)
      cy.get('app-consignment-settings-form input[formcontrolname="value"]').eq(0).type(20)

      //add and delete
      cy.get('app-consignment-settings-form a.button').click()
      cy.get('app-consignment-settings-form input[formcontrolname="minPrice"]').eq(1).type(101)
      cy.get('app-consignment-settings-form input[formcontrolname="maxPrice"]').eq(1).type(299)
      cy.get('app-consignment-settings-form input[formcontrolname="value"]').eq(1).type(15)
      cy.get(`app-consignment-settings-form span[test-id="remove"]`).eq(1).click()

      //save
      cy.get(`app-consignment-settings-form button[test-id="submit"]`).click()

      cy.get(`div.consignment-rates div.info-grid`).should('be.visible').should('have.length', 1)

      cy.get('app-sale-channel-form input[formcontrolname="title"]').type(" edited")
      cy.get('app-sale-channel-form input[formcontrolname="markup"]').clear().type(10)
      cy.get('app-sale-channel-form input[formcontrolname="taxRate"]').clear().type(10)

      cy.get(`app-sale-channel-form button[test-id="submit"]`).click()

      return cy.task('getSaleChannelByID', {ID: saleChannel.ID})
    }).then((saleChannel) => {
      expect(saleChannel.markup).equals("10.00")
      expect(saleChannel.taxRate).equals("10.00")
      expect(saleChannel.fees.length).equals(1)
    })
  })

  it("Add Warehouse", () => {
    const newWarehouseName = `${Math.random().toString(36).slice(2)}`

    cy.login('reseller-2')
    cy.visit('/settings')

    cy.get('ion-item[test-id="warehouses"]').click()
    cy.get('button[id="add-warehouse"]').click()

    cy.get('app-warehouse-form input[formcontrolname="name"]').type(newWarehouseName)
    cy.get('app-warehouse-form input[formcontrolname="address"]').click()
    cy.fillAddressForm()
    cy.wait(1000)
    cy.get('app-warehouse-form button[test-id="submit"]').should('be.visible').click()
    cy.wait(1000)


    // check if warehouse is visible abd accountID on warehouse
    cy.task('login', 'reseller-2').then((user) => {
      const newWarehouse = user.account.warehouses.find(wh => wh.name == newWarehouseName)
      console.log(user.account.warehouses)
      expect(newWarehouse).to.not.equal(null)
      expect(newWarehouse.accountID).not.equals(null)
    })


  })

  it("Turn On/Off Warehousing", () => {
    cy.visit(`/signup`)
    const email =`${Math.random().toString(36).slice(2)}@gmail.com`

    cy.get(`input[formControlName="name"]`).type(`John`)
    cy.get(`input[formControlName="surname"]`).type(`Doe`)
    cy.get(`input[formControlName="email"]`).type(email)
    cy.get(`input[formControlName="password"]`).type("testPassword")
    cy.get(`input[formControlName="confirmPassword"]`).type("testPassword")

    cy.get(`button[test-id="signup"]`).click()
    cy.wait(2000)
    cy.visit(`/dashboard`)

    cy.url().should('include', '/dashboard')
    cy.visit('/settings')

    //turn ON warehousing
    cy.get('ion-item[test-id="advanced-features"]').click()
    cy.get('mat-slide-toggle[formControlName="warehousing"]').click()
    cy.get('app-input input').should('be.visible').type('enable')
    cy.get('app-input button[test-id="confirm"]').click()

    cy.get('app-alert button').click()
    cy.url().should('include', '/signin')

    cy.get(`input[formControlName="email"]`).type(email)
    cy.get(`input[formControlName="password"]`).type("testPassword")
    cy.get(`button[test-id="signin"]`).click()
    cy.wait(2000)

    cy.visit('/settings')
    cy.get('ion-item[test-id="advanced-features"]').click()
    cy.get('ion-item[test-id="warehousing"]').should('be.visible')

    //turn OFF warehousing
    cy.get('mat-slide-toggle[formControlName="warehousing"]').click()
    cy.get('app-input input').should('be.visible').type('disable')
    cy.get('app-input button[test-id="confirm"]').click()

    cy.get('app-alert button').click()
    cy.url().should('include', '/signin')

    cy.get(`input[formControlName="email"]`).type(email)
    cy.get(`input[formControlName="password"]`).type("testPassword")
    cy.get(`button[test-id="signin"]`).click()
    cy.wait(2000)
    cy.visit('/settings')
    cy.get('ion-item[test-id="advanced-features"]').click()
    cy.get('mat-slide-toggle[formControlName="warehousing"]').should('not.be.checked');
    cy.get('ion-item[test-id="warehousing"]').should('not.exist')
  })

  it("Turn On/Off Transfers", () => {
    cy.visit(`/signup`)
    const email =`${Math.random().toString(36).slice(2)}@gmail.com`

    cy.get(`input[formControlName="name"]`).type(`John`)
    cy.get(`input[formControlName="surname"]`).type(`Doe`)
    cy.get(`input[formControlName="email"]`).type(email)
    cy.get(`input[formControlName="password"]`).type("testPassword")
    cy.get(`input[formControlName="confirmPassword"]`).type("testPassword")

    cy.get(`button[test-id="signup"]`).click()
    cy.wait(2000)
    cy.visit(`/dashboard`)

    cy.url().should('include', '/dashboard')
    cy.visit('/settings')

    //Turn On Transfers
    cy.get('ion-item[test-id="advanced-features"]').click()
    cy.get('mat-slide-toggle[formControlName="transfer"]').click()
    cy.get('app-input input').type('enable')
    cy.get('app-input button[test-id="confirm"]').click()

    cy.get('app-alert button').click()
    cy.url().should('include', '/signin')

    //turn OFF Transfers
    cy.get(`input[formControlName="email"]`).type(email)
    cy.get(`input[formControlName="password"]`).type("testPassword")    
    cy.get(`button[test-id="signin"]`).click()
    cy.wait(2000)
    cy.visit('/settings')
    cy.get('ion-item[test-id="advanced-features"]').click()
    cy.get('mat-slide-toggle[formControlName="transfer"]').click()
    cy.get('app-input input').type('disable')
    cy.get('app-input button[test-id="confirm"]').click()

    cy.get('app-alert button').click()
    cy.url().should('include', '/signin')

    cy.get(`input[formControlName="email"]`).type(email)
    cy.get(`input[formControlName="password"]`).type("testPassword")
    cy.get(`button[test-id="signin"]`).click()
    cy.wait(2000)
    cy.visit('/settings')
    cy.get('ion-item[test-id="advanced-features"]').click()
    cy.get('mat-slide-toggle[formControlName="transfer"]').should('not.be.checked');
  })
})

describe("Tours", () => {
  it("First session and sell item (consignment)", () => {

    //create product on retailer-guy account for consignment
    cy.task('createProduct')

    const accountNameInviting = "retailer-guy"
    cy.visit(`/signup?consignInvite=${accountNameInviting}`)
    cy.get(`input[formControlName="name"]`).type(`John`)
    cy.get(`input[formControlName="surname"]`).type(`Doe`)
    cy.get(`input[formControlName="email"]`).type(`${Math.random().toString(36).slice(2)}@gmail.com`)
    cy.get(`input[formControlName="password"]`).type("testPassword")
    cy.get(`input[formControlName="confirmPassword"]`).type("testPassword")

    cy.get(`button[test-id="signup"]`).click()

    cy.get(`div[test-id="sell-item"]`, { timeout: 12000 }).should('be.visible').click()

    //wait for tour to start
    cy.wait(3000)

    //step 1/6 - click
    cy.get(`div.introjs-helperLayer`).click()

    cy.wait(1000)
    //step 2/6 - next
    cy.get(`a.introjs-nextbutton`).click()
    cy.wait(300)

    //step 3/6 - next
    cy.get(`a.introjs-nextbutton`).click()

    //select product
    cy.wait(2000)
    cy.get(`ion-list ion-card`).eq(0).click()

    //add inventory
    cy.wait(2000)
    cy.get(`div.introjs-helperLayer`).click().type(2)
    cy.get(`a.introjs-nextbutton`).click()

    cy.wait(2000)
    cy.get(`div.introjs-helperLayer`).click().type(999)
    cy.get(`a.introjs-nextbutton`).click()

    cy.wait(2000)
    cy.get(`div.introjs-helperLayer`).click()

    // rate tour
    cy.wait(2000)
    cy.get(`#\\34 `).click()
    cy.get(`#mat-checkbox-2`).click()
    cy.get('button[test-id="confirm"]').click()
    cy.wait(500)
    cy.toastMessage('Your opinion matters to us, thank you!')


  })

  it("Should be able to dismiss and not start anymore", () => {
    cy.login('reseller')
    cy.visit(`inventory?warehouse=all&tour=sell-item`)

    cy.wait(1000)

    //step 1/6 - click
    cy.get(`div.introjs-helperLayer`).click()
    cy.wait(1000)

    //step 2/6 - next
    cy.get(`a.introjs-nextbutton`).click()
    cy.wait(300)

    //close the tour
    cy.get(`a.introjs-skipbutton`).click()

    //wait to dismiss feedback
    cy.wait(4000)
    cy.get('app-feedback-interface ion-header ion-button').click()

    //select product
    cy.wait(1000)
    cy.get(`fliproom-list ion-list ion-card`).eq(0).click({force: true})

    //tour should not restart
    cy.wait(2000)
    cy.get('div.introjs-tooltip').should('not.exist')
  })

  it("Should be able to dismiss and tour start again", () => {
    cy.login('reseller')
    cy.visit(`inventory?warehouse=all&tour=sell-item`)

    cy.wait(2000)

    //step 1/6 - click
    cy.get(`div.introjs-helperLayer`).click()
    cy.wait(1000)

    //step 2/6 - next
    cy.get(`a.introjs-nextbutton`).click()
    cy.wait(500)

    //close the tour
    cy.get(`a.introjs-skipbutton`).click()

    //resume the tour
    cy.wait(2000)
    cy.get('ion-toast').should('exist').shadow().get('button.toast-button').click()

    //check tour resumed
    cy.wait(2000)
    cy.get('div.introjs-tooltip').should('be.visible')
  })
})

describe("Integrations", () => {
  it("Add bank account", () => {
    cy.login('reseller-2')
    cy.visit('/integrations/the-edit-ldn?retailerAccountID=3&integrationName=The%20Edit%20LND')
    cy.get('ion-segment-button#payouts').should('be.visible').click()

    // Bank Account creation modal
    cy.get('a[test-id="connect-bank-account"').should('be.visible').click()
    cy.get('form[test-id="payout-form"').should('be.visible')
    cy.get('input[formControlName="companyName"]').type('Test Company')
    cy.get('input[formControlName="accountNumber"]').type('12345678')
    cy.get('input[formControlName="sortCode"]').type('123456')
    cy.get('span[test-id="bank-account-address"]').click()
    cy.fillAddressForm({addressOnly: true})
    cy.wait(1000)
    cy.get('button[test-id="submit"]').should('be.visible').click()

    // Check if account was created and fulfilled
    cy.get('div[test-id="bank-account-details"').should('be.visible')
    cy.get('span[test-id="bank-account-name"').should('contain.text', 'Test Company');
    cy.get('span[test-id="bank-account-number"').should('contain.text', '12345678');
    cy.get('span[test-id="bank-account-sort-code"').should('contain.text', '123456');

  })
})

describe("Reports", () => {
  it("Disconnected Listings Report - Delete & reconnect", () => {
    let adminUser, inventory, adminNewProduct;
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
    .then(() => cy.task('login', 'reseller'))
    .then(user => {
      return cy.request({
        headers: {
          authorization: `Bearer ${user.apiKey}`
        },
        method: 'POST',
        url: Cypress.env('api') + `/api/account/${user.accountID}/reports/disconnected-listings`,
        timeout: 60000000,
      })
    }).then((resp) => {
      return cy.task('createProduct')
    })
    .then((adminNewProduct) => {
      cy.login('reseller')
      cy.visit(`/`)

      cy.get(`#main > app-dashboard > ion-content > div.insights > ion-card`).eq(0).should('be.visible').click()
      cy.wait(2000)
      //delete item
      cy.get(`ion-list ion-card`).eq(0).click().get('button#delete-disconnected-listing').click()
      cy.wait(1000)
      cy.toastMessage('Listing Deleted')

      cy.wait(3000)

      cy.get(`ion-list ion-card`).eq(1).click().get('button#reconnect-disconnected-listing').click()
      cy.wait(1000)
      cy.get('app-product-search fliproom-searchbar input').should('be.visible').type(adminNewProduct.title)
      cy.wait(1000)
      cy.get(`app-product-search ion-list ion-card ion-card-content[test-id=${adminNewProduct.ID}]`).eq(0).should('be.visible').click()
      cy.get('button[test-id="save"]').click()
      cy.wait(1000)
      cy.toastMessage('Listing Reconnected')

    })
  })

  it("Best Selling Products Report", () => {
    let report, reportItems
    cy.all([() => cy.task('login', ACCOUNT_TYPES.RETAILER), () => cy.task('login', ACCOUNT_TYPES.RESELLER)])
      .then(([retailer, reseller]) => {
        return cy.request({
          headers: {
            authorization: `Bearer ${reseller.apiKey}`
          },
          method: 'POST',
          url: Cypress.env('api') + `/api/account/${reseller.account.ID}/reports/best-selling-products`,
          body: {
            retailerAccountID: retailer.account.ID
          }
        })
      })
      .then((resp) => {
        report = resp.body
        reportItems = report.data

        cy.login(ACCOUNT_TYPES.RESELLER)
        cy.visit('/')

        // Click Best Selling Products Report
        cy.get(`ion-card[test-report-type="best-selling-products"]`).should('be.visible').eq(0).click()

        // Click item of the report
        cy.get(`app-view-report ion-list ion-card[test-product-id="${reportItems[0].productID}"]`).should('be.visible').eq(0).click()

        // Click View Product Action
        cy.get('button#view-product').should('be.visible').click()

        /**
         * Add Physical Inventory
         */

        cy.get('app-inventory-view ion-fab').should('be.visible').click()
        cy.get('app-inventory-view ion-fab ion-fab-button#add-inventory').should('be.visible').click()

        // Enter data
        cy.get(`app-inventory-record-form input[formcontrolname="quantity"]`).first().type((5).toString());
        cy.get(`app-inventory-record-form input[formcontrolname="cost"]`).first().type((100).toString());
        cy.get(`app-inventory-record-form input[formcontrolname="payout"]`).first().type((150).toString());

        // Submit
        cy.get(`button[test-id="save"]`).click();

        // Check valid
        cy.get('ion-toast').contains('Inventory Records Updated', {matchCase: false, includeShadowDom: true});

        // Verify
        cy.task("getInventory", {account: ACCOUNT_TYPES.RESELLER})
      })
      .then((inventory) => {
        expect(inventory[0].quantity).equals(5);
        expect(inventory[0].cost).equals('100.00');
        expect(inventory[0].listings[0].productID).equals(reportItems[0].productID);
        expect(parseInt(inventory[0].listings[0].payout)).equals(150);
      })
  })
})
