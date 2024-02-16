const expect  = require('chai').expect;
const axios = require('axios');
const request = require('request');
const moment = require('moment')
const server = require('../app.js');
const fs = require("fs");


describe("Run Tests", function() {
    before(function() {
    });

    it('Location Barcodes', async () => {
        const body = {
            templateData: [
                {
                    companyLogoUrl: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', 
                    barcodeValue: 'WALL-001-0'
                },
                {
                    companyLogoUrl: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', 
                    barcodeValue: 'FLOOR-001-0'
                },
                {
                    companyLogoUrl: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', 
                    barcodeValue: 'F15-A-001-0'
                }
            ]
        }

        try {
            const resp = await axios.post('http://localhost:8080/generate/barcodes/location-barcode', body, {responseType: 'arraybuffer'})
            expect(resp.status).to.equal(200)
            fs.writeFileSync("./tests/data/location-barcodes.pdf", resp.data, 'binary', (err) => console.log("Error: " + err)); 
            return Promise.resolve()
        } catch (e) {
            console.log(e.message)
            return Promise.reject()
        }
        
    }).timeout(60000)

    it('Item Barcodes', async () => {
        const body = {
            templateData: [
                {
                    companyLogoUrl: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', 
                    barcodeValue: 'WMS1ATRAZ00000123456'
                },
                {
                    companyLogoUrl: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', 
                    barcodeValue: 'WMS1ATRAZ00000123456'
                },
                {
                    companyLogoUrl: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', 
                    barcodeValue: 'WMS1ATRAZ00000123456'
                }
            ]
        }

        try {
            const resp = await axios.post('http://localhost:8080/generate/barcodes/item-barcode', body, {responseType: 'arraybuffer'})
            expect(resp.status).to.equal(200)
            fs.writeFileSync("./tests/data/item-barcodes.pdf", resp.data, 'binary', (err) => console.log("Error: " + err)); 
            return Promise.resolve()
        } catch (e) {
            console.log(e.message)
            return Promise.reject()
        }
        
    }).timeout(60000)

    it('Packing List', async () => {
        const headers = {
        }

        const body = {
            templateData: {
                companyLogoUrl: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png',
                ID: 1, 
                quantity: 1,
                deliveryDate: '',
                weight: 1,
                volume: 1,
                consignee: {
                    fullName: 'helo motherfuckakaaa',
                    address: '251 southwark bridge road',
                    postcode: 'SE1 6FJ'
                },
                inventoryRecords: [
                    {code: 'code 1', description: 'description 1', quantity: 1},
                    {code: 'code 1', description: 'description 1', quantity: 5},
                    {code: 'code 1', description: 'description 1', quantity: 3},
                    {code: 'code 1', description: 'description 1', quantity: 3}
                ]
            }
        }

        try {
            const resp = await axios.post('http://localhost:8080/generate/packing-list', body, {headers: headers, responseType: 'arraybuffer'})
            expect(resp.status).to.equal(200)

            const pdfBuffer = resp.data
            const data = {
                receivers: ['s.rosa@wiredhub.io'],
                subject : '<TEST> Packing List Order 1111',
                message: 'hello',
                attachments: [{
                    content: pdfBuffer.toString('base64'),
                    filename: "packing-list.pdf",
                    type: "application/pdf",
                    disposition: "attachment"
                }]
            }

            await axios.post('https://staging-email-6dwjvpqvqa-nw.a.run.app/', data)
            return Promise.resolve()
        } catch (e) {
            console.log(e.message)
            return Promise.reject()
        }
        
    }).timeout(60000)

    it('Order Barcode', async () => {
        const body = {
            templateData: [
                {
                    companyLogoUrl: 'https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png', 
                    productCode: '550GENVARII', 
                    reference1: {
                        name: 'CLIENT REF.',
                        value: 'MANU REF'
                    }, 
                    barcodeValue: 'WMS0ATRAS0002039006',
                    reference2: {
                        name: 'MANUFACTURER',
                        value: 'BOFFI UK LTD -WIGMORE-'
                    },
                    reference3: {
                        name: 'DOCUMENT REF',
                        value: 'BOFFI UK LTD -WIGMORE-'
                    },
                    reference4: {
                        name: 'MANUFACTURER REF',
                        value: 'BOFFI UK LTD -WIGMORE-'
                    },
                    counter: '1/4'
                }

            ]
        }

        try {
            const resp = await axios.post('http://localhost:8080/generate/barcodes/order-barcode', body, {responseType: 'arraybuffer'})
            expect(resp.status).to.equal(200)
            fs.writeFileSync("./tests/data/order-barcodes.pdf", resp.data, 'binary', (err) => console.log("Error: " + err)); 
            return Promise.resolve()
        } catch (e) {
            console.log(e.message)
            return Promise.reject()
        }
        
    }).timeout(60000)

    it('QRCode Generation', async () => {
        const body = {
            barcodeType: 'qrcode',
            templateSize: {
                height: '2.9cm',
                width: '6.2cm'
            },
            templateData: [
                {
                    accountLogoUrl: 'https://storage.googleapis.com/production-wiredhub/resources/c9905b60807611ecaec5eb1074e03e55.png', 
                    barcodeValue: 'duu18186bc65c5',
                },
                {
                    accountLogoUrl: 'https://storage.googleapis.com/production-wiredhub/resources/53f0b700799011eeabf7512e8bbe2690.png', 
                    barcodeValue: 'duu18186bc65c5',
                },
                {
                    accountLogoUrl: 'https://storage.googleapis.com/production-wiredhub/resources/c9905b60807611ecaec5eb1074e03e55.png', 
                    barcodeValue: 'duu18186bc65c5',
                },
                {
                    accountLogoUrl: 'https://storage.googleapis.com/production-wiredhub/resources/c9905b60807611ecaec5eb1074e03e55.png', 
                    barcodeValue: 'duu18186bc65c5',
                }
            ]
        }

        try {
            const resp = await axios.post(`http://localhost:8080/generate/barcodes/barcode-item`, body, {responseType: 'arraybuffer'})
            expect(resp.status).to.equal(200)
            fs.writeFileSync("./tests/data/qr-code.pdf", resp.data, 'binary', (err) => console.log("Error: " + err)); 
            return Promise.resolve()
        } catch (e) {
            console.log(e.message)
            return Promise.reject()
        }
        
    }).timeout(60000)

    it('Invoice Sale Order', async () => {


        const data =  {
            fileType: 'png',
            templateData: {
                //images
                bannerImage: 'https://storage.googleapis.com/production-wiredhub/company_assets/head_banner_black.png',
                accountLogo: 'https://storage.googleapis.com/production-wiredhub/company_assets/personal_shopping_logo.png',
                //invoice header
                invoiceTitle: 'Shopping with The Edit Ldn',
                invoiceSubTitle: 'Invoiced by Wiredhub Limited',
                //invoice data
                invoiceID: '15063',
                invoiceDate: '01/01/2024',
                invoiceReference: `Order #9999 - 863735`,
                //Sender Info
                senderAccountName: 'The Edit Ldn',
                senderVATNumber: '352795667',
                senderName: 'The Edit Ldn',
                senderAddressLine1: 'Labs House 15-19 Bloomsbury Way',
                senderPostcode: 'WC1 2TH',
                senderCityAndCountry: 'London, GB',
                //Recipient Info
                recipientName: 'Lois Chesworth',
                recipientAddressLine1:  '61 High Street',
                recipientPostcode: 'TS20 1AQ',
                recipientCityAndCountry: 'Stockton-on-tees, United Kingdom',
                //Line Items
                lineItems: [
                    {
                        title: 'Nike Dunk Low Two-toned Grey (GS)',
                        code: 'DS3425-100',
                        variant: 'UK 10 - US 9 - EU 44',
                        amount: '150.00',
                        currency: '£'

                    },
                    {
                        title: 'Nike Dunk Low Two-toned Grey (GS)',
                        code: 'DS3425-100',
                        variant: 'UK 10 - US 9 - EU 44',
                        amount: '150.00',
                        currency: '£'
                    },

                    {
                        title: 'Shipping Costs',
                        amount: '15.00',
                        currency: '£'
                    }
                ],
                //Totals
                currency: '£',
                subTotal: '315.00',
                VATRate: '10',
                VATAmount: '31.50',
                totalAmount: '315.00',
                notes: null
            }
        }

        try {
            const resp = await axios.post(`http://localhost:8080/generate/invoice-v2`, data, {responseType: 'arraybuffer'})
            expect(resp.status).to.equal(200)
            fs.writeFileSync(`./tests/data/invoice_example.${data.fileType}`, resp.data, 'binary', (err) => console.log("Error: " + err));
            return Promise.resolve()
        } catch (e) {
            console.log(e.message)
            return Promise.reject()
        }
    }).timeout(60000)

    it.only('Invoice Consignment Sale Order', async () => {
        const data =  {
            fileType: 'png',
            templateData: {
                //images
                accountLogo: 'https://storage.googleapis.com/production-wiredhub/resources/c9905b60807611ecaec5eb1074e03e55.png',
                //invoice data
                invoiceID: '15063',
                invoiceDate: '6/9/2022',
                invoiceReference:        `Order #9999 - 863735`,
                //Sender Info
                senderAccountName: 'edit ldn',
                senderVATNumber: '352795667',
                senderAddressLine1: 'labs house 15-19 bloomsbury way\nwc1a 2th, london\ngb',
                senderPostcode: 'WC1 2TH',
                senderCityAndCountry: 'London, GB',
                //Recipient Info
                recipientName: 'lois chesworth',
                recipientAddressLine1: 'stockton-on-tees 61 high street',
                recipientPostcode: 'TS20 1AQ',
                recipientCityAndCountry: 'Stockton-on-tees, United Kingdom',
                //Line Items
                lineItems: [
                    { 
                        title: 'Vans Classic tumble old skool shoe',
                        code: '123456',
                        variant: 'Size 5us',
                        amount: '159.99',
                        currency: '£'
                    },
                    {  
                        title: '',
                        code: '',
                        variant: '',
                        amount: '-28.99',
                        currency: '£'
                    }
                ],
                //Totals
                currency: '£',
                subTotal: '159.99',
                VATRate: 0,
                VATAmount: '0.00',
                totalAmount: '159.99',
                notes: null
            }
        }

        try {
            const resp = await axios.post(`http://localhost:8080/generate/invoice-v2`, data, {responseType: 'arraybuffer'})
            expect(resp.status).to.equal(200)
            fs.writeFileSync(`./tests/data/invoice_example.${data.fileType}`, resp.data, 'binary', (err) => console.log("Error: " + err)); 
            return Promise.resolve()
        } catch (e) {
            console.log(e.message)
            return Promise.reject()
        }
    }).timeout(60000)

    it.only('Invoice Purchase Order', async () => {


        const data =  {
            fileType: 'png',
            templateData: {
                //images
                accountLogo: 'https://storage.googleapis.com/production-wiredhub/resources/c9905b60807611ecaec5eb1074e03e55.png',
                //invoice data
                invoiceID: '15063',
                invoiceDate: '01/01/2024',
                issueDate: '01/01/2024',
                invoiceReference: `Order #9999 - 863735`,
                //Sender Info
                senderAccountName: '',
                senderVATNumber: '',
                senderName: 'Lois Chesworth',
                senderAddressLine1: '61 High Street',
                senderPostcode: 'TS20 1AQ',
                senderCityAndCountry: 'Stockton-on-tees, United Kingdom',
                //Recipient Info
                recipientName: 'The Edit LDN',
                recipientAddressLine1:  'Labs House 15-19 Bloomsbury Way',
                recipientPostcode: 'WC1 2TH',
                recipientCityAndCountry: 'London, GB',
                //Line Items
                lineItems: [
                    {
                        title: 'Nike Dunk Low Two-toned Grey (GS)',
                        code: 'DS3425-100',
                        variant: 'UK 10 - US 9 - EU 44',
                        itemId: 1004,
                        amount: '150.00',
                        currency: '£'

                    }
                ],
                //Totals
                currency: '£',
                subTotal: '315.00',
                VATRate: '10',
                VATAmount: '31.50',
                totalAmount: '315.00',
                notes: null,
                VATNumber: ''
            }
        }

        try {
            const resp = await axios.post(`http://localhost:8080/generate/purchase-order`, data, {responseType: 'arraybuffer'})
            expect(resp.status).to.equal(200)
            fs.writeFileSync(`./tests/data/invoice_example.${data.fileType}`, resp.data, 'binary', (err) => console.log("Error: " + err));
            return Promise.resolve()
        } catch (e) {
            console.log(e.message)
            return Promise.reject()
        }
    }).timeout(60000)


    it('Receipt', async () => {
        const data =  {
            fileType: 'png',
            templateData: {
                salePointName: 'edit ldn',
                salePointAddressLine1: '6-8 standard place',
                salePointAddressLine2: 'ec2a 3be, london',
                orderNumber: 47905,
                orderReference: 'nbcwd6ddjz',
                orderDate: '2022-11-21T14:28:59.000Z',
                lineItems: [
                    { quantity: 4, title: 'dwy61ye6s7f', amount: 400 },
                    { quantity: 2, title: 'kd5bhzedl8', amount: 200 }
                ],
                subTotal: 600,
                currency: '£',
                notes: 'Thank you and see you again!'
            }
        }

        try {
            const resp = await axios.post(`http://localhost:8080/generate/receipt`, data, {responseType: 'arraybuffer'})
            expect(resp.status).to.equal(200)
            fs.writeFileSync(`./tests/data/receipt_example.${data.fileType}`, resp.data, 'binary', (err) => console.log("Error: " + err)); 
            return Promise.resolve()
        } catch (e) {
            console.log(e.message)
            return Promise.reject()
        }
    }).timeout(60000)

    after(function() {
    })
})
