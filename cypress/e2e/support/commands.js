// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

//File Upload
import 'cypress-file-upload';

Cypress.Commands.add('login', (accountName) => {
    cy.task("login", accountName).then((user => {
        localStorage.setItem('fliproom-jwt', user.apiKey);
        localStorage.setItem('wiredhub-consignor-app-jwt', user.apiKey);
    }))
})


Cypress.Commands.add('mobile', () => {
    cy.viewport('iphone-x')
    cy.visit('/', {qs: {timestamp: new Date().getTime(), retryOnStatusCodeFailure: true}})
    cy.reload(true)
})

Cypress.Commands.add('web', () => {
    cy.viewport('macbook-16')
    cy.visit('/', {qs: {timestamp: new Date().getTime(), retryOnStatusCodeFailure: true}})
    cy.reload(true)
})

Cypress.Commands.add('scan', (barcode, successMessage = 'Ok') => {
    cy.get("ion-fab-button[test-id='scan-barcode']").should('be.visible').click()
    cy.wait(250)
    cy.get('app-input input').should('be.visible').type(barcode.toLowerCase())
    cy.wait(250)
    cy.get('app-input button[test-id="confirm"]').should('be.visible').click()
    cy.get('ion-toast').contains(successMessage, {matchCase: false, includeShadowDom: true})
    cy.wait(2500)
})

Cypress.Commands.add('fillFulfillmentForm', (params = {}) => {
    /**
     * courier: string [manual, ups] | required
     * reference1: string
     * trackingNumber: string
     * fulfillmentCentre: string
     * skip: boolean
     * details: number // number of details to fulfill. -1 (all) by default
     */

    const _params = {
        courier: params.courier || 'manual',
        reference1: params.reference1 || null,
        fulfillmentCentre: params.fulfillmentCentre || null,
        skip: params.skip || false,
        details: params.details === undefined ? -1 : params.details // if you want to edit a form pass 0 here
    }

    if (params.shipFrom) {
        cy.get('app-fulfillment-form mat-select[formcontrolname="shipFromAddress"]').click().get('mat-option').contains(new RegExp(params.shipFrom, 'i')).click()
    }

    if (params.shipTo) {
        cy.get('app-fulfillment-form mat-select[formcontrolname="shipToAddress"]').click().get('mat-option').contains(new RegExp(params.shipTo, 'i')).click()
    }

    cy.get('app-fulfillment-form mat-select[test-id="select-service-provider"]').click().get('mat-option').contains(_params.courier.toUpperCase()).click()

    if (_params.reference1) {
        cy.get('app-fulfillment-form input[formcontrolname="reference1"]').type(_params.reference1)
    }

    if (_params.trackingNumber) {
        cy.get('app-fulfillment-form input[formcontrolname="trackingNumber"]').type(_params.trackingNumber)
    }

    if (_params.skip == true) {
        cy.get('mat-checkbox[formcontrolname="skip"]').click()
    }

    if (_params.details == -1) {
        cy.get('app-fulfillment-form ion-list ion-card mat-checkbox').each(($el) => {
            cy.wrap($el).click()
        })
    } else if (_params.details != 0) {
        cy.get('app-fulfillment-form table tbody mat-checkbox').each(($el, idx) => {
            if (idx < _params.details) {
                cy.wrap($el).click()
            }
        })
    }
    
    cy.get('app-fulfillment-form button[test-id="submit"]').should('be.visible').click()
})

Cypress.Commands.add('fillAddressForm', (params = {}) => {
    /**
     * name: string
     * surname: string
     */

    const _params = {
        name: params.name || 'test',
        surname: params.surname || 'test',
        phoneCountryCode: params.phoneCountryCode || 'United States',
        phoneNumber: params.phoneNumber || '9765762635',
        country: params.country || 'United States',
        address: params.address || '3005 Tasman Dr, Santa Clara',
        addressOnly: params.addressOnly | false,
    }

    cy.wait(300)
    if(!_params.addressOnly){
        cy.get('app-address-contact input[formcontrolname="name"]').should('be.visible').type(_params.name)
        cy.get('app-address-contact input[formcontrolname="surname"]').should('be.visible').type(_params.surname)
    
        cy.get('app-address-contact mat-select[formcontrolname="phoneCountryCode"]').click().get('mat-option').contains(_params.phoneCountryCode).click()
        cy.get('app-address-contact input[formcontrolname="phoneNumber"]').should('be.visible').type(_params.phoneNumber)
    }

    cy.get('app-address-contact mat-select[formcontrolname="countryCode"]').click().get('mat-option').contains(_params.country).click()
    cy.get('app-address-contact input[formcontrolname="address"]').should('be.visible').type(_params.address)
    cy.wait(500) // this waits for google to display the suggested addresses
    cy.get('mat-option[test-id="address-suggestion"]').eq(0).click({force: true})
    cy.wait(5000) // this waits for the address selected to be formatted in the form, otherwise api call breaks

    cy.get('app-address-contact button[test-id="submit"]').should('be.visible').click()
})

Cypress.Commands.add('toastMessage', (message) => {
    cy.wait(500)
    cy.get('ion-toast').should('exist').shadow().invoke('text').then((text) => {
        expect(text.toString().toLowerCase()).include(message.toString().toLowerCase())
    })
})

Cypress.Commands.add('cancelForm', (params = {}) => {
    /**
     * reason: string
     * replaceAction: string
     * selectWarehouse: boolean
     */

    const _params = {
        reason: params.reason || null,
        selectWarehouse: params.selectWarehouse || null,
    }

    if (_params.reason) {
        cy.get('app-cancel-order input[formcontrolname="reason"]').type(_params.reason)
    }

    if(_params.selectWarehouse){
        cy.get('mat-select[formControlName="warehouse"]').click().get('mat-option').eq(0).click()
    }
    
    cy.get('app-cancel-order button[test-id="submit"]').should('be.visible').click()

    cy.get('app-confirm button[test-id="confirm"]').should('be.visible').click()
})

Cypress.Commands.add('scanOutbound', (order, fulfillment, params = {}) => {
    // be sure all fulfillments have been fetched and available on the mobile
    cy.task('getFulfillments', {
        offset:0, 
        limit: 500, 
        sort:'id:desc', 
        status: 'created', 
        type:'outbound,transfer-out',
        originAddressID: fulfillment.addressID
    }).then(fulfillmentsList => {
        const match = fulfillmentsList.find(f => f.ID == fulfillment.ID)
        expect(match).to.not.be.null
        return cy.task('getFulfillment', {orderID: order.ID, ID: fulfillment.ID})
    })
    .then((fulfillment) => {
        // call api to scan
        const outboundOlis = fulfillment.orderLineItems.filter(oli => (oli.orderType.name == "outbound" || oli.orderType.name == "transfer-out"))
        cy.task('scanOutbound', {orderID: order.ID, fulfillmentID: fulfillment.ID, orderLineItems: outboundOlis})
    })
})

Cypress.Commands.add('scanInbound', (order, fulfillment, params = {}) => {
    // be sure all fulfillments have been fetched and available on the mobile
    cy.task('getFulfillments', {
        offset:0, 
        limit: 500, 
        sort:'id:desc', 
        status: 'transit', 
        type:'inbound,transfer-in',
        destinationAddressID: fulfillment.destinationAddressID
    }).then(fulfillmentsList => {
        const match = fulfillmentsList.find(f => f.ID == fulfillment.ID)
        expect(match).to.not.be.null
        return cy.task('getFulfillment', {orderID: order.ID, ID: fulfillment.ID})
    })
    .then((fulfillment) => {
        // call api to scan
        const inboundOlis = fulfillment.orderLineItems.filter(oli => (oli.orderType.name == "inbound" || oli.orderType.name == "transfer-in"))
        cy.task('scanInbound', {orderID: order.ID, fulfillmentID: fulfillment.ID, orderLineItems: inboundOlis})
    })
})

/**
 * @param cypressCommandFns An array of functions that return Cypress commands
 * @returns A Cypress chainable whose `.then()` passes an array of jQuery-wrapped DOM nodes
 */
Cypress.Commands.add('all', (cypressCommandsFns) =>
    cypressCommandsFns.reduce(
        (results, command) =>
            results.then((bucket) => command().then((res) => [...bucket, res])),
        cy.wrap([])
    )
)
