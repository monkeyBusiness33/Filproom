/// <reference types="Cypress" />

describe("Creation", () => {
  it("Create a product", () => {
    cy.login('retailer')
   // cy.viewport(2000, 1000)
    // go to products section
    cy.visit('/products')
    cy.wait(100)
    cy.get('ion-button[test-id="options"]').click()
    cy.wait(500)
    //Navigate To Product Creation
    cy.get(`button#add-blank-product`).should('be.visible').click()
    cy.wait(500)

    //FORM CHECKS

    // check that product has default variant present
    cy.get('input[variant="default"]').should('be.visible')

    // check that variant deletion is not possible when there is only one variant
    cy.get('button[variant-delete="default"]').should('be.disabled')


    //fill form
    //upload image logic
    cy.get('input[test-id="image-input"]').attachFile('product-image.jpeg', 'image/jpeg')

    //form body
    cy.get('input[test-id="title"]').type(Math.random().toString(36).slice(2))
    cy.get('input[test-id="code"]').type(Math.random().toString(36).slice(2))
    cy.get('input[test-id="weight"]').type('15')
    cy.get('input[test-id="volume"]').type('15')
    cy.get('mat-select[formcontrolname="status"]').click().get('mat-option').contains('Active').click()

    //test category creation
    cy.get('input[test-id="category"]').type('category_'+ Math.random().toString(36).slice(2))
    cy.wait(300)
    cy.get('mat-option').contains('New Category').click()
    cy.wait(300)
    cy.get('input[formcontrolname="input"]').type('category_'+ Math.random().toString(36).slice(2))
    cy.get('button[test-id="confirm"]').click()
    cy.wait(300)

    //Variants form section
    // add variant
    //try to add multiple variants without names - shouldn't work
    cy.get('a[test-id="add-variant"]').click()
    cy.get('a[test-id="add-variant"]').click()
    cy.wait(300)
    cy.get('div[test-id="variant"]').should('have.length',2)
    cy.get('input[test-id="variant"]').eq(1).type('new-variant')

    // delete variant
    cy.get('button[variant-delete="default"]').click()
    cy.wait(300)
    cy.get('div[test-id="variant"]').should('have.length',1)
    cy.wait(300)
    cy.get('button[test-id="submit"]').click()
    cy.get('ion-toast').contains('Product Created', {matchCase: false, includeShadowDom: true})

  })

  it("Create a product using a template", () => {
    cy.login('retailer')
    cy.task("createProduct", {public: 1})
    .then((product)=> {
      // go to products section
      cy.visit('/products')
      cy.wait(100)
      //Navigate To Product Creation
      cy.get('ion-button[test-id="options"]').click()
      cy.wait(500)
      cy.get(`button#add-blank-product`).should('be.visible').click()
      cy.get('ion-button[test-id="form-options" ]').should('be.visible').click()
      cy.get('button[id="template"]').should('be.visible').click()
      cy.get('app-product-search fliproom-searchbar input').should('be.visible').type(product.code)
      cy.get('app-product-search fliproom-list ion-card').eq(0).click()

      //check that product is synced
      cy.get('mat-slide-toggle[test-id="sync"]').should('have.class', 'mat-checked')
      cy.get('input[test-id="synced-product"]').should('not.equal', null)

      //check that variants are synced
      cy.wait(500)
      cy.get('div[test-id="variant"]').each(
          ($el, index) => {
            cy.get('input[test-id="variant"]').eq(index).clear().type(Math.random().toString(5).slice(2))
            cy.get('mat-select[test-id="sync-variant-select"]').eq(index).should('be.visible')
            cy.get('mat-select[test-id="sync-variant-select"]').eq(index).should('not.equal', null)
            cy.get('input[test-id="variant"]').eq(index).should('be.visible')
            cy.get('input[test-id="variant"]').eq(index).should('not.equal', null)
          }
      )
      //change title
      cy.get('input[test-id="title"]').clear().type(Math.random().toString(36).slice(2))
      cy.wait(300)
      cy.get('button[test-id="submit"]').click()
      cy.get('ion-toast').contains('Product Created', {matchCase: false, includeShadowDom: true})
    })
  })

  it("Public product selected for edit", () => {
    cy.login('retailer')
    cy.task("createProduct", {public: 1})
    .then((product)=> {
      // go to products section
      cy.visit('/products')
      cy.wait(100)
  
      // open actionsheet
      cy.get('ion-button[test-id="options"]').click()
      cy.wait(500)
      // select import product (public products list)
      cy.get(`button#import-product`).should('be.visible').click()
      cy.wait(2000)
      cy.get('app-products fliproom-searchbar input').should('be.visible').type(product.code)
      cy.get('app-products fliproom-list ion-card').eq(0).click()
      cy.wait(500)
      cy.get(`button#customize-product`).should('be.visible').click()
      cy.wait(2000)
  
      //check that product is synced
      cy.get('mat-slide-toggle[test-id="sync"]').should('have.class', 'mat-checked')
      cy.get('input[test-id="synced-product"]').should('not.equal', null)
  
      //check that variants are synced
      cy.wait(500)
      cy.get('div[test-id="variant"]').each(
          ($el, index) => {
            cy.get('input[test-id="variant"]').eq(index).clear().type(Math.random().toString(5).slice(2))
            cy.get('mat-select[test-id="sync-variant-select"]').eq(index).should('be.visible')
            cy.get('mat-select[test-id="sync-variant-select"]').eq(index).should('not.equal', null)
            cy.get('input[test-id="variant"]').eq(index).should('be.visible')
            cy.get('input[test-id="variant"]').eq(index).should('not.equal', null)
          }
      )
  
      //change title
      cy.get('input[test-id="title"]').clear().type(Math.random().toString(36).slice(2))
      cy.wait(300)
      cy.get('button[test-id="submit"]').click()
      cy.get('ion-toast').contains('Product Created', {matchCase: false, includeShadowDom: true})
    })

  })
})

describe("Update", () => {
  it("Update Product", () => {
    cy.login('retailer')
    //cy.viewport(2000, 1000)

    // go to products section
    cy.visit('/products')
    // create product to update
    cy.task("createProduct").then((product)=> {
      //search for prod in table
      cy.get('fliproom-searchbar[test-id="fliproom-list-search"] input').should('be.visible').type(product.ID)
      cy.wait(2000)
      cy.get('ion-card').eq(0).click()
      //upload image logic
      cy.get('input[test-id="image-input"]').attachFile('product-image.jpeg', 'image/jpeg')
      //form body
      cy.get('input[test-id="title"]').type(Math.random().toString(36).slice(2))
      cy.get('input[test-id="code"]').type(Math.random().toString(36).slice(2))
      cy.get('input[test-id="weight"]').type('15')
      cy.get('input[test-id="volume"]').type('15')
      cy.get('mat-select[formcontrolname="status"]').click().get('mat-option').contains('Active').click()

      //variant update
      cy.get('a[test-id="add-variant"]').click()
      cy.get('input[test-id="variant"]').eq(1).type('new-variant')

      //submit
      cy.get('button[test-id="save"]').click()
      cy.get('ion-toast').contains('Product Updated', {matchCase: false, includeShadowDom: true})
    })
  })

  it("Add Template to an existing product", () => {
    cy.login('retailer')
    // create product to update
    cy.task("createProduct")
    .then((product)=> {
      // go to products section
      cy.visit('/products')
      //search for prod in table
      cy.get('fliproom-searchbar[test-id="fliproom-list-search"] input').should('be.visible').type(product.ID)
      cy.wait(2000)
      cy.get('ion-card').eq(0).click()
      //upload image logic
      cy.get('input[test-id="image-input"]').attachFile('product-image.jpeg', 'image/jpeg')
      cy.wait(500)

      return cy.task("createProduct", {public: 1, code: product.code})
    })
    .then((product)=> {
      //toggle sync
      cy.get('mat-slide-toggle[formControlName="sync"]').click()
      cy.wait(1000)
      //open modal and search for template to sync
      cy.get('app-product-search fliproom-searchbar input').should('be.visible')
      cy.get('app-product-search fliproom-list ion-card').should('be.visible').eq(0).click()

      cy.get('mat-select[test-id="sync-variant-select"]').click().get('mat-option').eq(0).click()

      //check that product is synced
      cy.get('mat-slide-toggle[test-id="sync"]').should('have.class', 'mat-checked')
      cy.get('input[test-id="synced-product"]').should('not.equal', null)

      //check that variants are synced
      cy.wait(500)
      cy.get('div[test-id="variant"]').each(
          ($el, index) => {
            cy.get('input[test-id="variant"]').eq(index).clear().type(Math.random().toString(5).slice(2))
            cy.get('mat-select[test-id="sync-variant-select"]').eq(index).should('be.visible')
            cy.get('mat-select[test-id="sync-variant-select"]').eq(index).should('not.equal', null)
            cy.get('input[test-id="variant"]').eq(index).should('be.visible')
            cy.get('input[test-id="variant"]').eq(index).should('not.equal', null)

          }
      )
  
      //submit
      cy.get('button[test-id="save"]').click()
      cy.get('ion-toast').contains('Product Updated', {matchCase: false, includeShadowDom: true})
    })
  })
})

