let envFileName = ""
if (process.argv.includes("production")) {
    envFileName = "production"
} else if (process.argv.includes("staging")) {
    envFileName = "staging"
}
require('dotenv').config({ path: `./${envFileName}.env` })
const configs = require('../configs.js')
configs.sql.connection_name = null //this shouldn;t be set when running staging or production locally. otherwise doesn't allow connection

const axios = require('axios')
const path = require('path')
const moment = require('moment')
const fs = require('fs')
const XMLparser = require('fast-xml-parser')
const convert = require('xml-js');
const { v1: uuidv1 } = require('uuid');
const jwt = require('jsonwebtoken');
const utils = require('./utils.js')
const csv = require('csvtojson')
const objectsToCsv = require('objects-to-csv')
const algoliasearch = require("algoliasearch");


const {google, transcoder_v1beta1} = require('googleapis');

const auth = new google.auth.GoogleAuth({
    keyFile: './libs/content-api-key.json',
    scopes: ['https://www.googleapis.com/auth/content'],
});
google.content({
    version: 'v2.1',
    auth: auth
});


const db = require('../libs/db')
const service = require('../services/main')
const {Op, where} = require("sequelize");
const apiUtils = require('../libs/utils.js')
const logger = require("../libs/logger");

let shopifyOrders;
async function run() {
    try {
        console.log('Starting Sync')
        if (!process.argv.includes("staging") && !process.argv.includes("production")) {
            await db.sequelize.query("SET GLOBAL sql_mode = '';")
            await db.sequelize.query("SET GLOBAL sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''));")
            //await db.sequelize.query("SET FOREIGN_KEY_CHECKS=0;")
        }
        if(process.argv.includes("tables")) {
            console.log('Add tables - if any')

            console.log('Add tables - if any')
            const tablesToAdd = []
            for (tableName of tablesToAdd) {
                try {
                    await db.sequelize.queryInterface.createTable(tableName, {
                        ID: {type: db.Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
                        createdAt: {type: db.Sequelize.DATE, allowNull: false},
                        updatedAt: {type: db.Sequelize.DATE, allowNull: false},
                    })
                    console.log(`>> <OK>    Added table ${tableName}`)
                } catch (e) {
                    console.log(`>> <ERROR> Impossible to add table ${tableName}`)
                }
            }

            console.log('Remove tables - if any')
            const tablesToRemove = []
            for (tableName of tablesToRemove) {
                try {
                    await db.sequelize.queryInterface.dropTable(tableName)
                    console.log(`>> <OK>    Removed table ${tableName}`)
                } catch (e) {
                    console.log(`>> <ERROR> Impossible to remove table ${tableName}`)
                }
            }

            console.log('Add new columns - if any')
            const columnsToAdd = [
                //ps v1.5
                {table: 'transaction', name: 'stripeID', type: db.Sequelize.STRING(200), allowNull: true},
                {table: 'order', name: 'basketStartedAt', type: db.Sequelize.DATE, allowNull: true},
                {table: 'order', name: 'linkFirstSharedAt', type: db.Sequelize.DATE, allowNull: true},
                {table: 'order', name: 'linkFirstOpenedAt', type: db.Sequelize.DATE, allowNull: true},
                {table: 'order', name: 'fulfillmentStartedAt', type: db.Sequelize.DATE, allowNull: true},
                {table: 'order', name: 'fulfillmentCompletedAt', type: db.Sequelize.DATE, allowNull: true},
                {table: 'transaction', name: 'processingAt', type: db.Sequelize.DATE, allowNull: true},
                //RBAC
                {table: 'user_role', name: 'userID', type: db.Sequelize.BIGINT, allowNull: false},
                {table: 'user_role', name: 'roleID', type: db.Sequelize.BIGINT, allowNull: false},
                {
                    table: 'permission',
                    name: 'rule',
                    type: db.Sequelize.STRING(200),
                    allowNull: false,
                    defaultValue: '*'
                },
                {table: 'transaction', name: 'accountID', type: db.Sequelize.BIGINT, allowNull: true},
            ]

            for (column of columnsToAdd) {
                try {
                    await db.sequelize.queryInterface.addColumn(column.table, column.name, {
                        type: column.type,
                        allowNull: column.allowNull
                    })
                    console.log(`>> <OK>    Added column ${column.table}.${column.name}`)
                } catch (e) {
                    console.log(`>> <ERROR> Impossible to add column ${column.table}.${column.name}`)
                }
            }

            console.log('Remove columns - if any')
            const columnsToRemove = [
                {table: 'account', name: 'stripeID'},
                {table: 'account', name: 'stripeOnBoardingURL'},
                {table: 'account', name: 'stripeClientID'},
                {table: 'user', name: 'roleID'},
            ]
            for (column of columnsToRemove) {
                try {
                    await db.sequelize.queryInterface.removeColumn(column.table, column.name)
                    console.log(`>> <OK>    Removed column ${column.name}`)
                } catch (e) {
                    console.log(`>> <ERROR> Impossible to remove column ${column.name}`)
                }
            }
        }


        if(process.argv.includes("update")){
            console.log('Running sync updates')

            await main()

            //await createUser()
            //await deleteAccount('samichaudhry174@gmail.com')

            //await importStocksheet()
            //await recordGoogleAdsUsage()
            console.log("Completed sync updates")
        }

        //await milanoStoreProductImport('milanostore_product_import.csv')
        //await initClient()
        console.log('DONE')

    } catch (e) {
        console.log(e)
    }
}

async function recordGoogleAdsUsage() {
    const timestamp = moment().subtract(1, 'days')
    await service.bridge.stripe.subscription.addUsage('sub_1Nwjm4HbuRALpV8OMeP4dQT9', 8238, timestamp)
}

async function main() {   

    /*
    //Revton product/created event test
    //const data = await service.fulfillment.getOne(null, 223)
    //const data = await service.product.getOne(null, 223) // product/created
    const data = await service.inventoryListing.getByID(null, 477277) // sale_channel_listing/changed
    const timestamp = new Date().getTime()
    const eventName = 'sale_channel_listing/changed' //'fulfillment/created' //'product/created'
    const endpoint = 'https://theeditldn-admin.revton.com/rest/V1/ldn/inventory' //'https://m246-ldn.revton.com/rest/ldn/order/update' //'https://m246-ldn.revton.com/rest/V1/ldn/products'
    const crypto = require('crypto')
    const sha256EventSignature = crypto.createHmac('sha256', 'd3tsii4ef728q55z').update(`${timestamp}.${eventName}`).digest("hex");
    fs.writeFileSync('./scripts/data/request.json', JSON.stringify({
        timestamp: timestamp,
        eventName: eventName,
        data: JSON.parse(JSON.stringify(data))
    }, null, 4))
    try {
        const resp = await axios({
            method: 'post',
            url: endpoint,
            headers: {
                'fliproom-signature': sha256EventSignature,
                'CF-Access-Client-Secret': '32ff33825790797af2a8fc20ea0145ee215b6c7a79309b8a5adc1e3c289c2fc3',
                'CF-Access-Client-Id': 'cda842a06bd9d52c72302308b9772045.access',
                'Authorization': `Bearer 4g36tq6klqy5j1h1co2ppqaipq20bvv4`,
                'Content-Type': 'application/json'
            },
            data: {
                timestamp: timestamp,
                eventName: eventName,
                data: JSON.parse(JSON.stringify(data))
            }
        })
        console.log(resp.data)
    } catch (e) {
        console.log(e.response)
    }
    */
    console.log("DONE")
}


async function importStocksheet() {
    const filepath = "./scripts/data/belfagorsneakers_2.csv"
    const fileDict = {
        sku: 'CODICE',
        variant: 'Tg',
        variantSizeCountrySymbol: 'EU',
        cost: 'prezzo pagato',
        payout: 'prezzo negozio',
        warehouse: 'DOVE SI TROVA?',
        currencySymbol: '€'
    }

    //2211
    const account = await db.account.findOne({where: {ID: 2211}})
    const serviceUser = await db.user.findOne({where: {accountID: account.ID, surname: '(Service User)'}})
    const dbWarehouses = await db.warehouse.findAll({where: {accountID: account.ID}})
    const accountSaleChannels = await db.saleChannel.findAll({where: {accountID: account.ID}})

    let stockRecords =  await csv().fromFile(filepath);

    // add uploaded column if missing
    stockRecords = stockRecords.map(record => {
        record.uploaded = record.uploaded || ""
        return record
    })

    // find product
    let _uniqueSkus = [...new Set(stockRecords.map(record => record[fileDict.sku].toLowerCase()))]
    const dbProducts = await db.product.findAll({
        where: {public: 1, code: _uniqueSkus},
        include: [
            {model: db.productVariant, as: 'variants'},
            {model: db.productCategory, as: 'category'},
            {model: db.productImage, as: 'images'},
        ]
    })
    
    stockRecords = stockRecords.map(record => {
        record.productMatch = ""
        record.variantMatch = ""

        let fileProductCode = record[fileDict.sku].toLowerCase().trim()
        const _dbProduct = dbProducts.find(dbprod => dbprod.code.toLowerCase().trim() == fileProductCode)
        if (_dbProduct) {
            record.productMatch = _dbProduct.code
            record.productMatchID = _dbProduct.ID

            let _dbVariant = _dbProduct.variants.find(dbVariant => {
                let fileVariantName = record[fileDict.variant]
                //preprocessing variant name
                fileVariantName = fileVariantName.replace("\"", "").trim().replace(",", ".")
                fileVariantName = `${fileDict.variantSizeCountrySymbol} ${fileVariantName}`.toLowerCase()
                //console.log(dbVariant.name, fileVariantName)

                return dbVariant.name.includes(fileVariantName)
            })

            // try with approximation
            if (!_dbVariant) {
                _dbVariant = _dbProduct.variants.find(dbVariant => {
                    let fileVariantName = record[fileDict.variant]
                    //preprocessing variant name
                    fileVariantName = fileVariantName.replace("\"", "").trim().replace(",", ".")
                    fileVariantName = `${fileDict.variantSizeCountrySymbol} ${fileVariantName}`.toLowerCase()

                    //map us size to eu size
                    let dbUssize = dbVariant.name.toLowerCase().replace("y", "").replace("us", "").trim()
                    dbEUsize = `eu ${parseFloat(dbUssize) + 33.5}`
                    return `${dbEUsize}`.includes(fileVariantName)
                })
            }

            if (_dbVariant) {
                record.variantMatch = _dbVariant.name
                record.variantMatchID = _dbVariant.ID
            }
        }
        return record
    })

    //find warehouse
    stockRecords = stockRecords.map(record => {
        record.warehouseMatch = ""

        let fileWarehouse = record[fileDict.warehouse].toLowerCase().trim()
        fileWarehouse = (fileWarehouse == "inarrivo" || fileWarehouse == "casamilano") ? "milano" : fileWarehouse
        const _dbWarehouse = dbWarehouses.find(wh => wh.name.toLowerCase().trim() == fileWarehouse)
        if (_dbWarehouse) {
            record.warehouseMatch = _dbWarehouse.name
            record.warehouseID = _dbWarehouse.ID
        }
        return record
    })

    // preprocess quantity, cost and payout
    stockRecords = stockRecords.map(record => {
        record.quantity = 1
        record.cost = parseFloat(record[fileDict.cost].replace(/\D/g,''))/100
        record.payout = parseFloat(record[fileDict.payout].replace(/\D/g,''))/100
        record.formattedNotes = `${record['acquistata da']} ${record['note']} ${record['caricata sul sito'].trim().toLowerCase() == "si" ? '[sito]' : ''} ${record['TITOLARITA']}`
        return record
    })
    
    // import products to account - remove skus already imporyed
    accountProducts = await db.product.findAll({where: {accountID: account.ID}})
    _uniqueSkus = _uniqueSkus.filter(sku => !accountProducts.find(prod => prod.code == sku))
    console.log(accountProducts.length, _uniqueSkus.length)
    let idx = 0
    for (var sku of _uniqueSkus) {
        console.log(`>> ${idx}/${_uniqueSkus.length} - ${sku}`)
        try {
            const dbProd = dbProducts.find(prod => prod.code.toLowerCase().trim() == sku.toLowerCase().trim())
            await axios.post(
                `${apiURL}api/product`,
                {
                    sourceProductID: dbProd.ID,
                    accountID:   account.ID,
                    category:    dbProd.category.name,
                    code:        dbProd.code,
                    title:       dbProd.title,
                    description: dbProd.description,
                    volume:      0.001,
                    weight:      0.001,
                    pieces:      1,
                    stockxId:    dbProd.stockxId,
                    variants: dbProd.variants.map(dbVariant => {return {
                        sourceProductVariantID: dbVariant.ID,
                        variant: dbVariant.name,
                        variant_weight: 0.001,
                        variant_volume: 0.001,
                        variant_position: dbVariant.position
                    }}),
                    images: dbProd.images.map(dbImage => {return {
                        src: dbImage.src, 
                        position: dbImage.position
                    }})
                },
                {
                    headers: {
                        Authorization: `Bearer ${serviceUser.apiKey}`,
                    }
                }
            )
        } catch (e) {
            console.log(e)
        }
        idx += 1
    }
    accountProducts = await db.product.findAll({
        where: {accountID: account.ID},
        include: [
            {model: db.productVariant, as: 'variants'}
        ]
    })

    // add inventory
    for (var i = 0; i < stockRecords.length; i++) {
        const record = stockRecords[i]
        console.log(`>> (${i}/${stockRecords.length}) ${record[fileDict.sku]} (${record.uploaded})`)
        const dbProd = accountProducts.find(prod => prod.sourceProductID == record.productMatchID)
        const dbVariant = dbProd ? dbProd.variants.find(variant => variant.sourceProductVariantID == record.variantMatchID) : null
        const warehouse = dbWarehouses.find(wh => wh.ID == record.warehouseID)
        if (dbProd && dbVariant && warehouse && record.uploaded != "YES") {
            try {
                await axios.post(
                    `${apiURL}api/inventory`,
                    {
                        accountID: account.ID,
                        productID: dbProd.ID,
                        productVariantID: dbVariant.ID,
                        quantity:    record.quantity,
                        virtual:     false,
                        cost:        record.cost,
                        notes:       record.formattedNotes,
                        status:      'active',
                        setAsDelivered: true,
                        warehouseID:  warehouse.ID,
                        listings: accountSaleChannels.map(sc => {return {
                            saleChannelID: sc.ID,
                            productID:        dbProd.ID,
                            productVariantID: dbVariant.ID,
                            status: 'active',
                            payout: record.payout,
                        }})
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${serviceUser.apiKey}`,
                        }
                    }
                )
                stockRecords[i].uploaded = "YES"
                record.uploaded = "YES"
            } catch (e) {
                console.log(e)
            }
        }
    }

    reportCsv = new objectsToCsv(stockRecords)
    await reportCsv.toDisk(filepath)

    const report = {
        'records': stockRecords.length,
        'productsMissing': stockRecords.filter(record => record.productMatch == "").length,
        'productsVariants': stockRecords.filter(record => record.variantMatch == "").length,
        'warehouse': stockRecords.filter(record => record.warehouseMatch == "").length,
    }
    console.log(report)
}

async function createUser() {
    const accountID = 4405

    const templates = {
        'personal-shopper': {
            name: 'personal shopper', 
            type: 'personal-shopper', 
            resources: [
                'order.create',
                'order.cancel',
                'order.view',
                'order.update',
                'product.create',
                'service.warehousing',
                'transaction.view'
            ]
        }
    }

    // create roles
    const customRoles = [
        templates['personal-shopper']
    ]
    // create users
    const usersList = [
        {name: 'joe', surname: 'doe', email: 'personal-shopper@fliproom.io', accountID: accountID, roleName: 'personal shopper'},
    ]

    // check if users already exist
    const currentUsers = await db.user.findAll({where: {accountID: accountID}})
    for (var user of usersList) {
        if (currentUsers.find(u => u.email == user.email)) {
            console.log(`User ${user.email} already exists`)
            return
        }
    }

    const resources = await db.resource.findAll({where: {}})
    for (var roleReq of customRoles) {
        const role = await db.role.create({
            name: roleReq.name,
            type: roleReq.type,
            accountID: accountID,
            notes: ''
        })

        await Promise.all(resources.filter(resource => roleReq.resources.find(r => r == resource.name)).map(resObj => db.permission.create({roleID: role.ID, resourceID: resObj.ID})))
    }

    const accountRoles = await db.role.findAll({where: {accountID: accountID}})
    const generatedUsers = await Promise.all(usersList.map(user => {
        const role = accountRoles.find(r => r.name == user.roleName)
        return db.user.create({
            name: user.name.toLowerCase(),
            surname: user.surname.toLowerCase(),
            password: `${Math.random().toString(36).slice(2)}`,
            email: user.email.toLowerCase(),
            activatedAt: new Date(),
            roleID: role.ID,
            accountID: user.accountID,
    
        })
    }))
    await Promise.all(generatedUsers.map(user => db.account_user.findOrCreate({where: {accountID: user.accountID, userID: user.ID}, defaults: {accountID: user.accountID, userID: user.ID}})))

    // send emails
    const serviceUser = await service.account.serviceUser(accountID)
    for (var u of generatedUsers) {
        const user = await service.user.getOne(serviceUser, u.ID)
    
        const _configs = {
            accountLogoUrl: `https://app.fliproom.io/assets/fliproom_logo-text.png`,
            nameCapitalized: user.name.charAt(0).toUpperCase() + user.name.slice(1),
            welcomeMessage: "We are happy to welcome you on our platform",
            temporaryPassword: user.password
        }
        const emailTemplateString = apiUtils.buildEmailMessage('welcome-email-template', _configs)
    
        const data = {
            to: [user.email],
            subject: `Welcome to Fliproom!`,
            body: emailTemplateString,
            attachments: [] 
        }
    
        await service.bridge.sendGrid.sendEmail(data)
    }
}

async function addPersonalShopper() {
    const accountID = 3


    
}

async function deleteAccount(email, accountID = null) {
    if (!accountID) {
        const user = await db.user.findOne({where: {accountID: ID}})
        if (!user) {
            console.log(`User with email ${email} NOT FOUND`)
            return
        }
        accountID = user.accountID
    }
    console.log(`Deleting account ${accountID}`)
    const orders = await db.order.findAll({where: {accountID: accountID}})
    await db.order.destroy({where: {accountID: accountID}})
    await db.orderLineItem.destroy({where: {accountID: accountID}})
    await db.item.destroy({where: {accountID: accountID}})
    await db.inventory.destroy({where: {accountID: accountID}})
    await db.transaction.destroy({where: {orderID: orders.map(o => o.ID)}})
    await db.address.destroy({where: {accountID: accountID}})
    await db.saleChannel.destroy({where: {accountID: accountID}})


    const products = await db.product.findAll({where: {accountID: accountID}})
    await db.productMatchLookup.destroy({where: {productID: products.map(p => p.ID)}})
    await db.productMatchLookup.destroy({where: {externalProductID: products.map(p => p.ID)}})
    await db.productVariant.destroy({where: {productID: products.map(p => p.ID)}})
    await db.productImage.destroy({where: {productID: products.map(p => p.ID)}})
    await db.product.destroy({where: {accountID: accountID}})
    
    await db.notification.destroy({where: {accountID: accountID}})
    const warehouses = await db.warehouse.findAll({where: {accountID: accountID}})
    await db.warehouse.destroy({where: {ID: warehouses.map(w => w.ID)}})
    await db.account_warehouse.destroy({where: {accountID: accountID}})
    const users = await db.user.findAll({where: {accountID: accountID}})
    await db.marketplaceListing.destroy({where: {userID: users.map(u => u.ID)}})
    await db.marketplaceOffer.destroy({where: {userID: users.map(u => u.ID)}})
    await db.job.destroy({where: {accountID: accountID}})
    await db.user.destroy({where: {accountID: accountID}})
    await db.role.destroy({where: {accountID: accountID}})
    await db.account_user.destroy({where: {accountID: accountID}})
    await db.account.destroy({where: {ID: accountID}})
    console.log("Account deleted")
}

async function r2rPromotion() {
    const shopifyProducts = await service.bridge.shopify.account.getProducts(2830)
    const serviceUser = await service.account.serviceUser(2830)
    console.log(shopifyProducts.length)
    const inventoryListings = await db.inventoryListing.findAll({
        where: {
            accountID: 2830
        },
        include: [
            {model: db.productVariant, as: 'variant'},
            {model: db.saleChannel, as: 'saleChannel', where: {platform: 'shopify', accountID: 2830}, required: true}
        ]
    })
    const {shopify, shopifySession} = await service.bridge.shopify.client( serviceUser.accountID)

    const urls = [
'https://reseller2reseller.com/products/new-balance-core-run-tee-black?_pos=3&_psq=new+balance+co&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/new-balance-core-run-tee-green?_pos=2&_psq=new+balance&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/copy-of-new-balance-core-run-tee-blue?_pos=1&_psq=new+balance&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-black-dri-fit-adv-aeroswift-pants?_pos=1&_psq=dri+fit++adv&_ss=e&_v=1.0&variant=42210072297516',
'https://reseller2reseller.com/products/nike-1-4-aqua-blue?_pos=1&_psq=aqua+blue&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-1-4-zip-turqoise?_pos=1&_psq=turqui&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-quarter-zip-black-textured?_pos=1&_psq=black+1%2F4&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-aerolayer-coat-black?_pos=2&_psq=aerolayer&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-black-camo-1-4-zip?_pos=5&_psq=camo&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-boonie-bucket-hat-beige?_pos=1&_psq=boonie&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-breath-tee-black?_pos=1&_psq=breath+tee&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-under-armour-launch-shorts-black-green',
'https://reseller2reseller.com/products/nike-under-armour-launch-shorts-grey-orange?_pos=2&_psq=under&_ss=e&_v=1.0&variant=41876989411372',
'https://reseller2reseller.com/products/under-armour-tech-reflect-t-shirt-form-orange?_pos=3&_psq=under+armour+t-shirt&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-womens-downfill-running-gilet-light-menta?_pos=1&_psq=womens+gilet&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-windrunner-cream-orange?_pos=1&_psq=cream+ora&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-windrunner-brown-blue?_pos=2&_psq=beige&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/copy-of-nike-run-shorts-5-green?_pos=2&_psq=run+shorts&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-run-tshirt-black?_pos=1&_psq=black+run&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-run-tshirt-blue?_pos=2&_psq=run+blue&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-run-tshirt-white?_pos=1&_psq=white+run&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/copy-of-nike-run-tshirt-green?_pos=1&_psq=green+run&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-running-division-miler-black?_pos=2&_psq=MILER+GREY&_ss=e&_v=1.0&variant=40857938329644',
'https://reseller2reseller.com/products/nike-running-division-navy-rise-365?_pos=1&_psq=NAVY+RISE+365&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-running-division-spiral-tee-black?_pos=2&_psq=spiral&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-running-division-tee?_pos=3&_psq=nike+running+division+&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-running-division-tee-grey-1?_pos=7&_psq=nike+running+diviso&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-running-division-tee-brown?_pos=8&_psq=nike+running+diviso&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-running-division-tee-baby-blue?_pos=2&_psq=baby+blue&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-running-divison-therma-1-4-blue?_pos=15&_sid=db06002ad&_ss=r',
'https://reseller2reseller.com/products/nike-running-hybrid-pants-grey?_pos=1&_psq=hybrid+p&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-stride-flex-shorts-baby-blue-5inch?_pos=1&_sid=ccad2afd4&_ss=r&variant=41677482328108',
'https://reseller2reseller.com/products/copy-of-nike-tech-fleece-jacket-red?_pos=1&_psq=tech+fleece&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-tech-fleece-pants-red?_pos=2&_psq=tech+fleece&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-tech-fleece-marina-blue-pants?_pos=3&_psq=tech+fleece&_ss=e&_v=1.0&variant=40813355663404',
'https://reseller2reseller.com/products/nike-techknit-tshirt-beetroot?_pos=2&_psq=beetroot&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-techknit-tshirt-bright-cactus?_pos=1&_psq=bright+cactu&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-techknit-tshirt-olive?_pos=1&_psq=olive&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-techknit-tshirt-royal-blue?_pos=4&_psq=royal+blue&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-therma-jacket-black-black?_pos=1&_psq=therma+black&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-therma-zip-jacket-black?_pos=1&_sid=120ba287f&_ss=r',
'https://reseller2reseller.com/products/nike-training-t-shirt-camo?_pos=1&_psq=camo&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-1-0-sulphur-yellow?_pos=1&_psq=sulphur+yellow&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-1-0-beetroot?_pos=1&_psq=sangria&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-1-0-vivid-purple?_pos=1&_psq=vivid&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-neon?_pos=3&_psq=volt&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-neon-long-sleeve?_pos=1&_psq=longs&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-2-0-black?_pos=1&_psq=miler+2.0&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-2-0-volt?_pos=2&_psq=miler+2.0&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-2-0-white?_pos=3&_psq=miler+2.0&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-mens-repel-running-jacket-black?_pos=4&_psq=repel+miler&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-vest-1-0-purple?_pos=1&_psq=vest+purple&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-orange-uve?_pos=1&_psq=orange+uv&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-rise-tee-pink?_pos=1&_psq=rise+tee+pin&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-challenger-lightweight-pants-grey?_pos=2&_psq=lightweigh&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-challenger-pants-snake-skin?_pos=1&_psq=snakes&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-challenger-running-pants-black?_pos=15&_sid=306ead2cc&_ss=r&variant=40733406986284',
'https://reseller2reseller.com/products/nike-element-1-4-zip-salmon?_pos=1&_psq=salmon&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-1-0-red-1?_pos=1&_psq=red+miler&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-flex-7-inch-shorts-green?_pos=1&_psq=flex+green&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-1-4-baby-blue?_pos=1&_psq=ash+green&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-flex-7-inch-shorts-volt?_pos=1&_psq=flex+volt&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-flex-7-inch-shorts-orange?_pos=5&_psq=orange&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-rise-365-light-menta-heather?_pos=1&_psq=rise+365&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-run-division-gilet-black?_pos=1&_psq=run+division+gilet&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-run-division-khaki-camo-shorts?_pos=1&_psq=camo+short&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-royal-blue?_pos=1&_psq=royal+blue&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-1-0-ghost-green?_pos=1&_psq=ghost+green&_ss=e&_v=1.0&variant=41499702755372',
'https://reseller2reseller.com/products/nike-miler-1-0-bright-crimson?_pos=1&_psq=bright+c&_ss=e&_v=1.0&variant=41499673362476',
'https://reseller2reseller.com/products/nike-d-y-e-miler-black?_pos=2&_psq=D.Y.E&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-d-y-e-miler-blue?_pos=1&_psq=D.Y.E&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-challenger-lightweight-pants-black?_pos=3&_psq=lightweight&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-challenger-lightweight-pants-grey?_pos=2&_psq=lightweight&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-challenger-woven-patterned-pants-teal?_pos=3&_psq=teal&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-rd-miler-cracked-swoosh-khaki?_pos=1&_psq=khaki+cracked&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-challenger-5-inch-shorts-blue-black?_pos=1&_psq=blue%2Fblack&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-challenger-7-inch-shorts-grey-white?_pos=2&_psq=grey%2Fwhite&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-challenger-7-inch-shorts-light-blue?_pos=1&_psq=light+blue&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-drifit-black?_pos=1&_psq=drifit+black&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-drifit-pink?_pos=1&_psq=pink&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-1-0-purple',
'https://reseller2reseller.com/products/nike-gilet-navy-chest?_pos=3&_psq=navy&_ss=e&_v=1.0&variant=40845419675692',
'https://reseller2reseller.com/products/nike-dna-windrunner-black?_pos=1&_psq=dna&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-dna-windrunner-white?_pos=1&_psq=dna+whit&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-d-y-e-miler-photon-dust?_pos=2&_psq=photon+dust&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-dri-fit-black?_pos=1&_psq=DRI-FIT&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-dri-fit-uv-grey?_pos=3&_psq=DRI-FIT&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-miler-1-0-kiwi?_pos=1&_psq=KIWI&_ss=e&_v=1.0',
'https://reseller2reseller.com/products/nike-running-division-navy-rise-365?_pos=2&_psq=rise+365&_ss=e&_v=1.0',
    ]

    for (const i=0; i < urls.length; i++) {
        const url = urls[i]
        const shopifyProduct = shopifyProducts.find(prod => url.includes(prod.handle))
        if (!shopifyProduct) {
            console.log(`Product not found ${url}`)
            continue
        }
        console.log(`${i}/${urls.length} ${url} ${shopifyProduct.id}`)
        for (const variant of shopifyProduct.variants) {
            const variantListings = inventoryListings.filter(listing => listing.variant.foreignID == variant.id)

            if (variant.compare_at_price == null) continue

            let newPrice, comparedAtPrice;
            // apply promotion
            if (variant.compare_at_price < variant.price) {
                newPrice = variant.compare_at_price
                comparedAtPrice = variant.price //apply promotion => set to variant.price | remove promotion => set to null
            //remove promotion
            } else if (variant.compare_at_price > variant.price) {
                newPrice = variant.compare_at_price
                comparedAtPrice = null
            }
            shopifyVariant = new shopify.rest.Variant({session: shopifySession});
            shopifyVariant.id = variant.id;
            shopifyVariant.compare_at_price = comparedAtPrice 
            shopifyVariant.price = newPrice
            await shopifyVariant.save({update: true});
            await db.inventoryListing.update({payout: newPrice, price: newPrice}, {where: {ID: variantListings.map(l => l.ID)}})
            console.log(variant.id, `price ${variant.price} => ${newPrice} | compared at ${variant.compare_at_price} => ${comparedAtPrice}`)
            await utils.sleep(550)
        }
    }

}

/**
 * INTEGRATIONS : REMOVE WHEN NOT NEEDED
 */


//R2R Account ID 2830/ warehouse ID 2801
//Primo AccountID 25588

//init r2r
async function initClient() {

    //1. untrack products that belong to other vendors
    await addUntrackedTags(2830)
    //2. create products on db from shopify
    //await importShopifyProducts(3791)
    //3. create inventory on db from shopify
    //await initiateInventory(2830,2801)
    //4. add shopify webhooks
    //await service.bridge.shopify.account.setupWebhooks(25588)
    //5. Set up consignment

}

// create products on db from shopify
async function importShopifyProducts(accountID) {
    // GET https://{shop}.myshopify.com/admin/api/2023-04/products.json
    //get saleChannel
    const saleChannel = await db.saleChannel.findOne({where: {accountID: accountID}})
    //get shopify products
    const shopifyProducts = await utils.getShopifyProducts(saleChannel.accountID,true)
    //filter out products that already exist
    const existingProducts = await db.product.findAll({where: {accountID: accountID}})
    const existingProductIDs = existingProducts.map(prod => prod.foreignID)

    const newProducts = shopifyProducts.filter(prod => !existingProductIDs.includes(prod.id))
    console.log(`Found ${newProducts.length} new products to create on db`)

    //get account service user
    const serviceUser = await service.account.serviceUser(accountID)

    //create products on db
    for (let prod of newProducts){
        await service.bridge.shopify.webhook.productCreated(serviceUser, prod)
        await utils.sleep(1000)
    }
    console.log('Products created on db')

}

// add wiredhub-untracked to products that belong to other vendors
async function addUntrackedTags(accountID) {
    const saleChannel = await db.saleChannel.findOne({where: {accountID: accountID}})
    //get shopify products
    const shopifyProducts = await utils.getShopifyProducts(saleChannel.accountID,true)
    //prod.vendor.toLowerCase() == 'montirex'
    const productsToUntrack =  shopifyProducts.filter(prod => !prod.tags.includes('wiredhub-untracked')  && prod.vendor !== 'Reseller 2 Reseller')
    console.log(`Found ${productsToUntrack.length} products to untrack`)
    let untrackCount = 0
    for (let prod of productsToUntrack){


        let resp
        try {
            console.log(`Products untracked ${untrackCount}/${productsToUntrack.length} | ${prod.id}`)
            //get account service user
            const serviceUser = await service.account.serviceUser(accountID)
            const {shopify, shopifySession} = await service.bridge.shopify.client( accountID)
            const shopifyProduct = new shopify.rest.Product({session: shopifySession});
            shopifyProduct.id = prod.id;
            shopifyProduct.tags = prod.tags ==''? 'wiredhub-untracked': prod.tags + ', wiredhub-untracked'
            await shopifyProduct.save({update: true,});
            untrackCount++
            await utils.sleep(1000)
        } catch (e) {
            throw new Error(`Impossile Update Shopify Product ${prod.id} | ${e}`)
        }
    }
    console.log('Products untracked')
}

// create inventory listings to be inbounded
async function initiateInventory(accountID, warehouseID) {
    //get saleChannel
    const saleChannel = await db.saleChannel.findOne({where: {accountID: accountID}})
    //get shopify products
    const shopifyProducts = await utils.getShopifyProducts(saleChannel.accountID,true)
    //make a list of all shopify variants
    const shopifyVariants = []
    for (let prod of shopifyProducts){
        for (let variant of prod.variants){
            shopifyVariants.push(variant)
        }
    }
    //get account service user
    const serviceUser = await service.account.serviceUser(accountID)
    //get all variants including product object
    const dbVariants = await db.productVariant.findAll({where: { untracked: false}, include: [{model: db.product, as: 'product', required:true, where: {untracked: false, accountID: accountID,}}]})

    const variantsWithVirtualInventory = []
    const variantsWithPhysicalInventory = []

    // cycle through all variants and create inventory listings
    for (let variant of dbVariants){
        //find shopify variant
        const shopifyVariant = shopifyVariants.find(shopifyVariant => shopifyVariant.id == variant.foreignID)
        //if shopify variant does not exist, skip
        if (!shopifyVariant){
            console.log(`Shopify Variant ${variant.foreignID} does not exist`)
        }
        //if shopify variant exists, create inventory listing
        else{

            // if shopify variant has no inventory, skip
            if (shopifyVariant.inventory_quantity == 0){
                console.log(`Shopify Variant ${variant.foreignID} has no inventory`)
            }
            // if shopify variant has negative inventory, skip
            else if (shopifyVariant.inventory_quantity < 0){
                console.log(`Shopify Variant ${variant.foreignID} has negative inventory`)
            }
            // if shopify variant has positive inventory, create inventory listing
            else{
                const virtualInventoryThreshold = 500
                // create inventory and items
                const _inventoryRecord = {
                    accountID: accountID,
                    productID: variant.productID,
                    productVariantID: variant.ID,
                    virtual: false,
                    quantity: shopifyVariant.inventory_quantity,
                    cost: variant.cost,
                    notes: 'AUTO INIT',
                    status: 'active',
                }
                let inventoryRecord
                // if shopify variant has more than 500 inventory, create a virtual inventory
                if (shopifyVariant.inventory_quantity > virtualInventoryThreshold){
                    console.log(`Shopify Variant ${variant.foreignID} is virtual`)
                    _inventoryRecord.virtual = true
                    _inventoryRecord.quantity = 10
                    inventoryRecord = await service.inventory.create(serviceUser, _inventoryRecord)
                    variantsWithVirtualInventory.push(variant)
                }
                // if shopify variant has less than 500 inventory, create a physical inventory
                else{
                    console.log(`Shopify Variant ${variant.foreignID} is physical`)
                    inventoryRecord = await service.inventory.create(serviceUser, _inventoryRecord)
                    variantsWithPhysicalInventory.push(variant)
                    const warehouse = await service.warehouse.getByID(serviceUser, warehouseID)
                    const _inboundOrder = {
                        accountID:accountID,
                        reference1: 'auto-init',
                        type: 'inbound',
                        consigneeID: warehouse.addressID,
                        fulfillment: {
                            setAsDelivered: false
                        },
                        details: inventoryRecord.items.map(item => {return {itemID: item.ID}})
                    }
                    const inboundOrder = await service.order.create(serviceUser, _inboundOrder)
                    // TODO - temporary solution - if setAsDelivered: return the new inbound inventory record and not the first generated
                    if (false) {
                        inventoryRecord = await db.inventory.findOne({where: {ID: inboundOrder.orderLineItems[0].item.inventoryID}})
                    }
                }
                // create listings
                const _newListings = [{
                    saleChannelID:       saleChannel.ID,
                    accountID:           accountID,
                    inventoryID:         inventoryRecord.ID,
                    productID:           variant.productID,
                    productVariantID:    variant.ID,
                    status:              'active',
                    payout:              shopifyVariant.price,
                    priceSourceName:     null,
                    priceSourceMargin:   null,
                    price:               shopifyVariant.price
                }]
                await service.inventoryListing.create(serviceUser, _newListings)
                // TODO: ENABLE ON PROD -> sync shopify variant
                //await service.product.variantSync(inventoryRecord.productVariantID)
            }




        }
    }

}

//

/**
 * MILANO STORE PRODUCT IMPORT
 */

async function milanoStoreProductImport(productFileName, accountID= 2548) {
    console.log('Milano Store Product Import - Starting')
    //convert csv to json from scripts/imports
    const report = await csv().fromFile('scripts/imports/' + productFileName)
    let products = []
    let serviceUser = await service.account.serviceUser(accountID)

    //find or create product category
    const category = await db.productCategory.findOrCreate({where: {name: 'Abbigliamento', accountID: accountID}})

    //For each product
    for (let lineItem of report){

        // Assuming the CSV columns are: Codice,Variante,Descrizione,Fornitore,Tipo taglia,Prezzo acq,Prezzo ven
        const { Codice, Variante, Descrizione, Fornitore, 'Tipo taglia': TipoTaglia } = lineItem;

        // Create the product object
        const product = {
            code: Codice,
            title: `${Descrizione} (${Variante})`,
            category: 'Abbigliamento',
            accountID: accountID,
            sourceProductID: null,
            eanCode: null,
            description: Descrizione,
            volume: 1,
            weight: 1,
            pieces: 1,
            status: 'active',
            variants: [],
        };


        // Parse the 'Tipo taglia' field to extract variants
        if (TipoTaglia) {
            let variant = {
                name: null,
                foreignID: null,
                weight: 1,
                volume: 1,
                sourceProductVariantID: null,

            }
            if (TipoTaglia === 'UN') {
                variant.name = 'UN';
                variant.foreignID = null;
                product.variants.push(variant);
            } else {
                const sizes = TipoTaglia.split(' - ');
                sizes.forEach(size => {
                    variant.name = size;
                    variant.foreignID = null;
                    product.variants.push({...variant});
                });
            }
        }
        // Add the product to the list
        products.push(product);

    }

    // Create the products on the database
    let productsCreated = 0;
    for (let product of products) {
        const existingProduct = await db.product.findOne({where: {code: product.code, accountID: accountID}});
        if (existingProduct) {
            console.log(`Product ${product.code} already exists`);
            continue;
        }
        await service.product.create(serviceUser, product);
        productsCreated++;
        console.log(`Product ${product.code} created - ${productsCreated}/${products.length}`)
    }

    console.log('Milano Store Product Import - Done')
}


run()
