const fs = require('fs')
require('dotenv').config({ path: `./.env` })

const axios = require('axios')
const db = require('../libs/db')
const service = require('../services/main')
const configs = require('../configs')
const jwt = require('jsonwebtoken')

async function seedDatabase() {
    await db.sequelize.query("SET GLOBAL sql_mode = '';")
    await db.sequelize.query("SET GLOBAL sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''));")
    await db.sequelize.sync({force: true})
    
    console.log(`Seed Order Types`)
    const orderTypes = JSON.parse(fs.readFileSync('./scripts/seed_data/orderTypes.json', 'utf-8'))
    await Promise.all(orderTypes.map(orderTypeRecord => db.orderType.findOrCreate({defaults: orderTypeRecord, where: orderTypeRecord})))
    await db.type.findOrCreate({defaults: {name: 'stock-take', description: '[job] Type for stock checks and reconciliation'}, where: {name: 'stock-take'}})

    console.log(`Seed Resources`)
    const resources = JSON.parse(fs.readFileSync('./scripts/seed_data/resources.json', 'utf-8'))
    await Promise.all(resources.map(resourceRecord => db.resource.findOrCreate({defaults: resourceRecord, where: resourceRecord})))

    console.log(`Seed Statuses`)
    const statuses = JSON.parse(fs.readFileSync('./scripts/seed_data/statuses.json', 'utf-8'))
    await Promise.all(statuses.map(statusRecord => db.status.findOrCreate({defaults: statusRecord, where: statusRecord})))

    console.log(`Seed Products`)
    const resp = await axios.get('https://production-stockx-api-6dwjvpqvqa-nw.a.run.app/api/products', {params: {
        offset:  0,
        limit:  100,
        sort: 'id:desc'
    }})
    const stockxProducts = resp.data.rows
    await Promise.all(stockxProducts.map(sproduct => {
        const body = {
            code:                             sproduct.styleId,
            title:                            sproduct.title,
            description:                      sproduct.description,
            stockxId:                         sproduct.stockxId,
            public:                           1,  
            category:                         sproduct.category,
            brand:                            sproduct.brand,
            category2:                        sproduct.category2,
            releaseDate:                      sproduct.releaseDate,
            gender:                           sproduct.gender,
            color:                            sproduct.color,
            retailPrice:                      sproduct.retailPrice,
            salesLast72Hours:                 sproduct.salesLast72Hours,
            salesLast72HoursChangePercentage: sproduct.salesLast72HoursChangePercentage,
            lastSalePrice:                    sproduct.lastSalePrice,
            lastSaleChangePercentage:         sproduct.lastSaleChangePercentage,
            volatilityScore:                  sproduct.volatilityScore,
            volatilityScoreChangePercentage:  sproduct.volatilityScoreChangePercentage,
            variants: sproduct.variants.map(variant => {return {
                name:      `${variant.baseSize} ${variant.baseType}`,
                weight:    variant.weight,
                volume:    variant.volume,
                usSize:    variant.usSize,
                ukSize:    variant.ukSize,
                jpSize:    variant.jpSize,
                euSize:    variant.euSize,
                usmSize:   variant.usmSize,
                uswSize:   variant.uswSize,
                price:     variant.lowestAsk,
                gtin:      variant.gtin,
                position:  variant.position,
                status:    variant.status,
                stockxId:  variant.stockxId
            }}),
            images:  [{src: sproduct.imageReferenceUrl}]
        }
        return service.product.create(null, body)
    }))

    console.log(`Seed retailer Account`)

    const retailerAccountData = {
        email: 'demo@fliproom.io',
        name: 'retailer',
        surname: 'guy',
        password: 'Fliproom2022!'
    }
    const user = await service.account.create(retailerAccountData)
    await db.account.update({
        taxRate: 0,
        vatNumber: 'GB9329387238'
    }, {where: {name: 'retailer guy'}})
    const serviceUser = await service.account.serviceUser(user.accountID)

    const billingAddressRetailer = await service.address.create(serviceUser, {
        accountID: serviceUser.accountID,
        name: 'retailer',
        surname: 'billing',
        phoneNumber: '7928766929',
        address: '1000 Louisiana St Suite 1990',
        city: 'Houston',
        postcode: '77002',
        country: 'US',
        countryCode: 'US',
        countyCode: 'tx',
        validated: 1
    })

    await db.account.update({billingAddressID: billingAddressRetailer.ID}, {where: {ID: serviceUser.accountID}})

    // add advanced features
    await db.permission.create({roleID: 1, resourceID: 131}) //service.warehouse
    await db.permission.create({roleID: 1, resourceID: 110}) //service.transfer
    await db.permission.create({roleID: 1, resourceID: 100}) //order.pay
    await db.permission.create({roleID: 1, resourceID: 135}) //service.consignment
    await db.permission.create({roleID: 1, resourceID: 113}) //service.marketOracle
    await db.permission.create({roleID: 1, resourceID: 130}) //inventory.virtual


    // add a second warehouse
    const address = await service.address.create(serviceUser, {
        accountID: serviceUser.accountID,
        name: 'warehouse',
        surname: 'address',
        phoneNumber: '7928766999',
        address: '1000 Louisiana St Suite 1990',
        city: 'Houston',
        postcode: '77002',
        country: 'US',
        countryCode: 'US',
        countyCode: 'tx',
        validated: 1
    })
    await service.warehouse.create(serviceUser, {
        name: 'harrods',
        fulfillmentCentre: 0,
        accountID: serviceUser.accountID,
        addressID: address.ID,
    })
    await db.warehouse.update({ID: 923}, {where: {name: 'harrods'}})

    // validate account address
    await service.address.update(serviceUser, address.ID, {
        name: 'The edit',
        surname: 'ldn',
        phoneCountryCode: '1',
        phoneNumber: '7928766999',
        address: '504 Lavaca St Suite 1100',
        city: 'Austin',
        postcode: '78701',
        country: 'US',
        countryCode: 'US',
        countyCode: 'tx',
        validated: 1
    })
    await db.account.update({billingAddressID: address.ID}, {where: {ID: serviceUser.accountID}})

    console.log(`Seed Couriers`)
    await db.courier.create({
        accountID:             serviceUser.accountID,
        code:                  'ups',
        name:                  'UPS',
        foreignID:             'se-111135',
        courierBillingAccount: '12345',
        nationalServices:      'ups_next_day_air,ups_2nd_day_air_am,ups_3_day_select',
        internationalServices: 'ups_next_day_air_international',
    })

    //set integrations 
    await db.account.update({
        stripeAPIKey:            "sk_test_51KRbEbHLPsP0JKdRgV3GFiG43U1RZKqgS3nQLmwqSTk7OHvCoH40rxpUwGgq5akJeorWmWA9GoyVjyfVFzDJKwhm00yGH3iZB8",
        stripeAccountID:                'acct_1KRbEbHLPsP0JKdR',
        stripeClientID:          'ca_L7rQJu7ZHaV0xzJ2MzBw9z20vq5ZbxIe',
        defaultStripeDestinationID: '',
        revolutJWT:          'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmbGlwcm9vbS5pbyIsInN1YiI6Imdieml1bkIweVNuNW9yUnlZTHRBSTVsU1JsN3U5ZTlvNUUyWHQ5eU9TcHMiLCJhdWQiOiJodHRwczovL3Jldm9sdXQuY29tIiwiZXhwIjoxODUzMDYzMzAzLCJpYXQiOjE2OTUyMTgwMzR9.W_YgPatC0jIKpLNI22HCfzm7d201qUTtjCdi4ziaPcA3xZ4mrKsqs5UXxHiFscsLhYgkHBkrWZQSuBDCl9VOEnrcK_QGHFJhP8GVTFLFoBx-hD4z6TtLTU2TXE-txhmrnhUTaTjgkeLWoCHqY2k8RG0daKHQS971wVMVqNdoXaqylIO9KkHwjTmxgvvkPpZ9t0hYHpqqWIvlOYYkEXzkiq89OX8tTIibLyfFN7u0x2xTpPqP3HILCD5BzolvPJKnIAG7nbK7s5iHQbMCs_k0fy85fm-rdigmkSJv-TszDnP5mWv-1PwCw3GK7guRHwJMCsxWafgYHSSLZxpCkuGDZw',
        revolutRefreshToken:          'oa_sand_pISgNxPhxW7F_GgszsdGPrCDbS8dIF1BbalqOmEeT1M',
        stripeConnectAccountID: 'acct_1OCQWvI07b66sfG3',
        stripeConnectAccountIDSetupCompleted: 1
    }, {where: {ID: serviceUser.accountID}})

    console.log(`Generate Shopify Sale Channel for retailer Account`)
    await service.saleChannel.create(serviceUser, {
        title: 'shopify',
        description: 'shopify store',
        platform: 'shopify',
        shopifyStoreName: "fliproom-dev",
        shopifyAPIAuth: `https://6ac5a5c6cc192f5265dc90d946475efd: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@fliproom-dev.myshopify.com/admin/api/2021-04/`,
        allowVirtualInventory: 1,
        markup: 0,
        taxRate: 0,
        sameDayDelivery: true,
        sameDayDeliveryInternalPriorityMargin: 10
    })
    await db.warehouse.update({foreignID: 79822291251}, {where: {ID: 1}})
    console.log(`Generate Second store Sale Channel for retailer Account`)
    await service.saleChannel.create(serviceUser, {
        title: 'harrods',
        description: 'harrods store',
        platform: 'store',
        allowVirtualInventory: 0,
        markup: 0,
        taxRate: 0
    })

    console.log(`Generate Consignment fees for retailer Sale Channels`)
    await db.transactionRate.findOrCreate({defaults: {saleChannelID: 1, minPrice: 0, maxPrice: 9999999, value: 10, type: 'percentage'}, where: {saleChannelID: 1}})
    await db.transactionRate.findOrCreate({defaults: {saleChannelID: 2, minPrice: 0, maxPrice: 9999999, value: 10, type: 'percentage'}, where: {saleChannelID: 2}})

    console.log(`Add personal shopper user to retailer account`)
    const psRole = await db.role.create({
        name: 'personal shopper',
        type: 'personal-shopper',
        accountID: serviceUser.accountID,
        notes: ''
    })
    const resourcesPS = ([
        {ID: 96, name: ''},
        {ID: 98, name: 'order.cancel'},
        {ID: 107, name: 'inventory.create'},
        {ID: 120, name: ''},
        {ID: 121, name: 'order.update'},
        {ID: 125, name: ''},
        {ID: 128, name: 'inventory.view'},
        {ID: 131, name: 'service.warehousing'},
        {ID: 133, name: ''},
        {ID: 134, name: ''},
        {ID: 136, name: 'product.view'},
        {ID: 138, name: ''},
        {ID: 144, name: 'address.view'},
        {ID: 145, name: 'address.create'},
        {ID: 146, name: 'address.update'},
    ])
    await Promise.all(resourcesPS.map(resource => db.permission.findOrCreate({where: {roleID: psRole.ID, resourceID: resource.ID}, defaults: {roleID: psRole.ID, resourceID: resource.ID}})))

    //create personal shopper user
    const psUser = await service.user.create_v2({
        accountID: serviceUser.accountID,
        name: 'personal',
        surname: 'shopper',
        password: 'Fliproom2022!',
        email: 'personal-shopper@fliproom.io',
        roles: ['personal shopper']
    }, 'custom')

    //add retailer limited user to test account permission checks
    const limitedRole = await db.role.create({
        name: 'limited',
        type: 'custom',
        accountID: serviceUser.accountID,
        notes: ''
    })
    const resourcesLimitedRole = ([
        {ID: 128, name: 'inventory.view'},
        {ID: 136, name: 'product.view'},
    ])
    await Promise.all(resourcesLimitedRole.map(resource => db.permission.findOrCreate({where: {roleID: limitedRole.ID, resourceID: resource.ID}, defaults: {roleID: limitedRole.ID, resourceID: resource.ID}})))

    //create limited user 
    const limitedUser = await service.user.create_v2({
        accountID: serviceUser.accountID,
        name: 'limited',
        surname: 'user',
        password: 'Fliproom2022!',
        email: 'limited-user@fliproom.io',
        roles: ['limited']
    }, 'custom')

    console.log(`Seed reseller Account`)
    const resellerAccountData = {
        email: 'reseller@fliproom.io',
        name: 'reseller',
        surname: 'guy',
        password: 'Fliproom2022!',
        consignInvite: `${retailerAccountData.name} ${retailerAccountData.surname}`
    }
    const resellerUser =  await service.account.create(resellerAccountData)
    //this is temporary until the invoice .isCOnsignor limitation has been fixed
    await db.account.update({
        isConsignor: 1,
        stripeAccountID: 'acct_1KZ2UQQYMyEkvfv2',
        defaultStripeDestinationID: 'ba_1KZ2VAQYMyEkvfv2dfL0cykv'
    }, {where: {ID: resellerUser.accountID}})

    await db.saleChannel.update({allowVirtualInventory: 1}, {where: {accountID: resellerUser.accountID}})

    //Add Laced account
    console.log(`Seed Laced Account`)
    await service.saleChannel.create(resellerUser, {
        title: 'laced',
        description: '',
        platform: 'laced',
        email: 'a.singhania@wiredhub.io',
        password: 'LacedFliproom@98',
        allowVirtualInventory: 0,
        markup: 15,
        taxRate: 0
    })

    ////add service.transfer to reseller for testing
    const resellerAdminRole = resellerUser.roles.find(r => r.type == 'organization')
    await db.permission.create({roleID: resellerAdminRole.ID, resourceID: 110}) //service.transfer


    console.log(`Seed reseller2 Account`)
    const reseller2AccountData = {
        email: 'reseller2@fliproom.io',
        name: 'reseller 2',
        surname: 'guy',
        password: 'Fliproom2022!',
        consignInvite: `${retailerAccountData.name} ${retailerAccountData.surname}`
    }
    const reseller2User = await service.account.create(reseller2AccountData)
    //this is temporary until the invoice .isCOnsignor limitation has been fixed
    await db.account.update({isConsignor: 1}, {where: {ID: reseller2User.accountID}})

    //shift accounts IDs to not break mobile-consignor
    await db.account.update({ID: 5}, {where: {ID: reseller2User.accountID}})
    await db.account.update({ID: 4}, {where: {ID: resellerUser.accountID}})
    await db.account.update({ID: 3}, {where: {ID: serviceUser.accountID}})
    await db.consignment.update({accountID: 3}, {where: {}})
    await db.consignment.update({consignorAccountID: 4, revolutCounterpartyID: '2dbb19d9-2647-47cb-9d2c-b0c1bfd2eca6', stripeAccountID: 'acct_1KZ2UQQYMyEkvfv2', stripeDefaultDestinationID: 'ba_1KZ2VAQYMyEkvfv2dfL0cykv'}, {where: {ID: 1}})
    await db.consignment.update({consignorAccountID: 5}, {where: {ID: 2}})

    //update apiKeys since the have the old account IDs
    const serviceUsers = await db.user.findAll({where: {surname: '(Service User)'}})
    for (const serviceUser of serviceUsers) {
        console.log(serviceUser.ID, serviceUser.accountID)
        const superAdminRole = await db.role.findOne({where: {name: 'super admin'}})
        const jwtToken = jwt.sign(
            {
              user: {
                ID: serviceUser.ID,
                updatedAt: serviceUser.updatedAt,
                accountID: serviceUser.accountID,
                name: serviceUser.name,
                surname: serviceUser.surname,
                email: serviceUser.email,
                role: {
                    ID: superAdminRole.ID,
                    type: superAdminRole.type,
                    name: superAdminRole.name
                },
                resources: []
              }
            },
            configs.jwt.secret
        )
        console.log(jwtToken)
        await db.user.update({ apiKey: jwtToken }, { where: { ID: serviceUser.ID } })
    }
    console.log(`\n\nSEED COMPLETED\n\n`)
}

seedDatabase()
