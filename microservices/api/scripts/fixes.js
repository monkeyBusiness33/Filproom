let envFileName = ""
if (process.argv.includes("production")) {
    console.log('PRODUCTION CONFIGURATION ENABLED')
    envFileName = "production"
} else if (process.argv.includes("staging")) {
    console.log('STAGING CONFIGURATION ENABLED')
    envFileName = "staging"
}
require('dotenv').config({ path: `./${envFileName}.env` })
const configs = require("../configs");
configs.sql.connection_name = null //this shouldn;t be set when running staging or production locally. otherwise doesn't allow connection

const axios = require('axios')
const path = require('path')
const csv = require('csvtojson')
const fs = require('fs')
const utils = require('./utils');
let converter = require('json-2-csv');
const moment = require('moment')
const {v1: uuidv1} = require("uuid");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const db = require('../libs/db')
const service = require('../services/main')
const { Op } = require("sequelize");
const {fulfillment, transaction} = require("../services/main");
const apiUtils = require('../libs/utils');

const objectsToCsv = require("objects-to-csv");
const logger = require("../libs/logger");
const {json2csv} = require("json-2-csv");


// Fetched Data
let accounts;
let accountIDs;
let dbProducts;
let dbVariants;
let dbInventory;
let physicalInventory;
let virtualInventory;
let transactions;
let stockxProducts
let stockxVariants
let ordersOut;
let ordersIn;
let dbItems;



async function main() {

    //await service.workflows.bestSellingProductsReport()

   // await fixProductUntracking(2830)
    //await getAffectedProducts(2830)


    await general()
    //await nukeInventory()

    //await mergeProducts(39611,76548)

    //await deleteProduct(83345,3)

    //await importShopifyOrder(4959174164524, 'reseller-2-reseller')

    //TODO: fix below
    // await addShopifyOrderLineItem(4869035131128, 12324092412152)
    //fixAccountSaleChannelNames()

    //await deleteOrder(6869)
    //await forceDeleteInboundOrder(6869)
    //await fixProducts()

    // await invoiceFixes()

    //EXTRAS
    //await editShopifyInventorySync()
    //await syncStockXVariantSizeCharts()
    //await removeUnusedAddresses()
     //await nukeProduct()
    // await syncShopifyInventory()
    //await syncStripeBanking()
    //await fetchShopifyProductByID('7672927781042')


    //UTILS

    //await inboundConsignorStock()
    //await completeCourierFulfillments()
    //await setAccountOnVacationMode(3635,3497)

    //await fixInventoryListingStatuses()

    //await adjustOrderInvoice(invoiceID)
    //await syncShopifyVariant(40752)
    //await fetchShopifyProductByForeignID(8344363401553)
    //await checkStripeBalance(3)

    //await fixInventoryIDReferenceProblem()
    //await deactivateAccountWarehousing(2830) // R2R: 2830

    //await triggerOrderNotification(120538)
    //await adjustConsignorPermissions()
    //await addMissingAccountNotifications()
    //await fetchAccountProductMatches(2830)

    //await updateBestPrices(3, 1044741, 1)
    //await updateBestPrices(3, 1044740, 1)




    console.log('FIXES TASKS COMPLETE')
}

async function fixProductUntracking(accountID = 2830) {
    const saleChannel = await db.saleChannel.findOne({where: {accountID: accountID, platform: 'shopify'}})
    //get shopify products
    const shopifyProducts = await utils.getShopifyProducts(saleChannel.accountID,true)
    //prod.vendor.toLowerCase() == 'montirex'
    const productsToUntrack =  shopifyProducts.filter(prod => prod.tags.includes(', wiredhub-untracked')  && prod.vendor == 'Reseller 2 Reseller')
    console.log(`Found ${productsToUntrack.length} products to fix`)
    let retrackCount = 0
    for (let prod of productsToUntrack){


        let resp
        try {
            console.log(`Products untracked ${retrackCount}/${productsToUntrack.length} | ${prod.id}`)
            //get account service user
            const serviceUser = await service.account.serviceUser(accountID)
            const {shopify, shopifySession} = await service.shopify.client(serviceUser, accountID)
            const shopifyProduct = new shopify.rest.Product({session: shopifySession});
            shopifyProduct.id = prod.id;
            //remove ', wiredhub-untracked' from tags
            let newTags = prod.tags
            newTags = newTags.replace(', wiredhub-untracked', '')
            shopifyProduct.tags = newTags
            await shopifyProduct.save({update: true,});
            console.log(prod.tags)

            retrackCount++
            await utils.sleep(1000)
        } catch (e) {
            throw new Error(`Impossile Update Shopify Product ${prod.id} | ${e}`)
        }
    }
    console.log('Products untracked')

}

async function getAffectedProducts(accountID) {
   //find all products that have accountID 2830 and updated at between 2024-02-09 15:16:01 and 2024-02-09 15:12:00
    let products = await db.product.findAll({where: {accountID: accountID,
            //updatedAt: {[Op.between]: ['2024-02-09 15:12:00', '2024-02-09 15:16:01']}
            },
        include: {model: db.productCategory, as: 'category'}})
    console.log('products ', products.length)
    //store product object in a csv file

    let reportData = []
    for (let product of products){
        //push if product is not tracked
        if(product.untracked){
            reportData.push({
                ID: product.ID,
                title: product.title,
                code: product.code,
                foreignID: product.foreignID,
                category: product.category ? product.category.name : null,
                status: product.status,
                updatedAt: product.updatedAt
            })
        }

    }

    let csv = new objectsToCsv(reportData)
    await csv.toDisk('./scripts/reports/untrackedProducts.csv')




}

async function setAccountOnVacationMode(accountID, saleChannelID) {
    // fetch service user
    const serviceUser = await service.account.serviceUser(accountID)

    await service.account.updateConsignorSaleChannelStatus(serviceUser, accountID,saleChannelID, 'vacation')



}


async function fixInventoryListingStatuses() {
    // fetch all inventory listings with status 'draft'
    const inventoryListings = await db.inventoryListing.findAll({where: { status: 'draft'}})
    console.log('inventoryListings ', inventoryListings.length)
    //update status to 'drafted'
    await db.inventoryListing.update({status: 'drafted'}, {where: {ID: inventoryListings.map(inventoryListing => inventoryListing.ID)}})

}
async function completeCourierFulfillments() {
    //fix consignor orders with dpd and status "fulfill"

    const orders = await db.order.findAll({
        where: {
            accountID: {[Op.not]: 3},
            '$account.isConsignor$': 1,
            //statusID should be 12 or 26
            [Op.or]: [{statusID: 12}, {statusID: 26}],
        },
        include: [
            {model: db.orderLineItem, as: 'orderLineItems', required: true, include: [
                    {model: db.fulfillment, as: 'fulfillment', required: true, where: {courierServiceCode: 'dpd_next_day'}}
                    //courierServiceCode: 'ups_standard', courierServiceCode: 'dpd_two_day', 'dpd_next_day'
                ]},
            {model: db.account, as: 'account'},
        ]
    })


    let referencesAffected = ['27103' ]


    for (var order of orders) {
        //console.log(order.ID)
        if (referencesAffected.includes(order.reference1)) {
            const serviceUser = await service.account.serviceUser(order.accountID)
            //dispatch fulfillment of orderLineItems with statusID 12
            console.log(order.ID)

            const orderLineItems = order.orderLineItems.filter(oli => oli.statusID == 12)

            for (var orderLineItem of orderLineItems) {

                await service.fulfillment.dispatch(serviceUser, {
                    fulfillmentID: orderLineItem.fulfillment.ID,
                    orderLineItems: [{ID: orderLineItem.ID}]
                })
            }


        }
    }
}



async function getStatusesByResource() {

    const orders = await db.order.findAll({include: [{model: db.status, as: 'status'}]})
    const fulfillments = await db.fulfillment.findAll({include: [{model: db.status, as: 'status'}]})
    const olis = await db.orderLineItem.findAll({include: [{model: db.status, as: 'status'}]})

    const orderStatuses =  new Set()
    const fulfillmentStatuses =  new Set()
    const orderLineItemStatuses =  new Set()

    orders.map(order => {
        orderStatuses.add(order.status.name)
    })

    fulfillments.map(fulfillment => {
        fulfillmentStatuses.add(fulfillment.status.name)
    })

    olis.map(oli => {
        orderLineItemStatuses.add(oli.status.name)
    })

    console.log('orders ',orderStatuses)
    console.log('fulfillments ',fulfillmentStatuses)
    console.log('olis ',orderLineItemStatuses)


}

async function updateBestPrices(accountID, productVariantID, saleChannelID) {
    //fetch product variant
    const productVariant = await db.productVariant.findOne({where: {ID: productVariantID}, include: [{model: db.product, as: 'product'}]})
    console.log(`Updating best prices for: `, productVariant.product.title, productVariant.name)
    const systemUser = await service.account.serviceUser(accountID)
    await service.inventoryListing.activeListing(systemUser, productVariantID,saleChannelID)


}


// Used to inbound consignor stock into their own warehouse because they toggled warehousing on
async function inboundConsignorStock() {
    //fetch all inbound orders that belong to account with isConsignor = 1
    const inboundOrders = await db.order.findAll({where: {typeID: 3, statusID: 12}, include: [{model: db.account, as: 'account', required : true, where: {isConsignor: true}}]})
    console.log('inboundOrders ', inboundOrders.length)
    //Loop through orders and check how many different accounts are involved
    const accountIDs = new Set()
    inboundOrders.map(order => {
        accountIDs.add(order.accountID)
    })
    //fetch users for those accounts that have an email address from users table. Include account object and inside that include the saleChannels for that account
    let users = await db.user.findAll({where: {accountID: {[Op.in]: Array.from(accountIDs)}, email: {[Op.ne]: null}}, include: [{model: db.account, as: 'account', include: [{model: db.saleChannel, as: 'saleChannels'}]}, {model: db.role, as: 'role', include: [{model: db.permission, as: 'permissions'}]}]})
    //filter out the users that dont have a salechannel for account with ID 3
    users = users.filter(user => {
        const saleChannels = user.account.saleChannels
        const saleChannel = saleChannels.find(saleChannel => saleChannel.accountID == 3)
        return saleChannel
    })


    //export users to csv only with email and name and surname
    let report = users.map(user => {
        return {
            email: user.email,
            name: user.name,
            surname: user.surname,
            password: user.password
        }
    })

   for (let user of users){
           await deactivateAccountWarehousing(user.accountID)
   }





    //console.log('users ', users)

}




//trigger an order created event
async function triggerOrderNotification(orderID){
    let order = await db.order.findOne({where: {ID: orderID}, include: [{model: db.account, as: 'account'}]})
    //get service user
    const serviceUser = await service.account.serviceUser(order.account.ID)
    //get order
    order = await service.order.getOne(serviceUser, orderID)

    //publish event 
    await service.gcloud.publishEvent(serviceUser, 'order-out/created', order)

    console.log('published')
}

//remove permissions from consignors
async function adjustConsignorPermissions(){
    let excludedAccountIDs = [3, 2830]

    //permissions to remove
    const resourcesToRemove = ['inventory.virtual']

    //fetch resources from db
    const resources = await db.resource.findAll({where: {name: {[Op.in]: resourcesToRemove}}})

    //get all consignors
    const consignorAccounts= await db.account.findAll({where: {isConsignor: true, ID: {[Op.notIn]: excludedAccountIDs}}})

    //fetch all consignor account roles
    const consignorAccountRoles = await db.role.findAll({where: {accountID: {[Op.in]: consignorAccounts.map(account => account.ID)}}})

    const permissions = await db.permission.findAll({where: {roleID: {[Op.in]: consignorAccountRoles.map(role => role.ID)}, resourceID: {[Op.in]: resources.map(resource => resource.ID)}}, include: [{model: db.resource, as: 'resource'}]})

    let permissionRecords = new Set()
    let accountsAffected = new Set()

    for (let permission of permissions){
        permissionRecords.add(permission.resource.name)
        //accountsAffected.add(permission.role.accountID)
    }

    //console.log('accounts affected: ',accountsAffected.size)
    console.log('permission records affected: ',permissionRecords)

    console.log('permission records to remove: ',permissions.length)

    //delete permissions for found role IDs on permission table
    await db.permission.destroy({where: {roleID: {[Op.in]: consignorAccountRoles.map(role => role.ID)}, resourceID: {[Op.in]: resources.map(resource => resource.ID)}}})

    console.log('consignorAccountRoles ',consignorAccountRoles.length)

    console.log('consignorAccounts ',consignorAccounts.length)
    console.log('resources ',resources.length)
}

async function addMissingAccountNotifications(orderID){
    // get all notifications
    const notifications = await db.notification.findAll({include: [{model: db.user, as: 'user'}]})

    //get all users with emails
    //get all users with emails
    const users = await db.user.findAll({where: {email: {[Op.ne]: null}}})

    let addedNotifications = 0

    const requiredNotificationEvents = [
        'order-out/created',
        'sale-order/canceled'
    ]

    //create map of accountID to notification events
    const accountNotificationEvents = {}

    for (let notification of notifications){
        if(notification.user.email){
            if(!accountNotificationEvents[notification.user.accountID]){
                accountNotificationEvents[notification.user.accountID] = new Set()
            }
            accountNotificationEvents[notification.user.accountID].add(notification.eventName)
        }
    }


    //loop through users and add missing notifications
    for (let user of users){
            //check if there are any missing notifications

            //convert to array
            const userAccountNotificationEvents = accountNotificationEvents[user.accountID] ? Array.from(accountNotificationEvents[user.accountID]) : []
            //check if any required notifications are missing
            const missingNotifications = requiredNotificationEvents.filter(requiredNotificationEvent => !userAccountNotificationEvents.includes(requiredNotificationEvent))
            //add missing notifications
            for (let missingNotification of missingNotifications){
                addedNotifications  += 1
                // find or create notification for user
                const notification = await db.notification.findOrCreate({
                    where: {
                        userID: user.ID,
                        eventName: missingNotification,
                        accountID: user.accountID
                    },
                    defaults: {
                        userID: user.ID,
                        eventName: missingNotification,
                        accountID: user.accountID
                    }
                })

            }
    }
    console.log('Added ', addedNotifications, 'missing notifications')





}

/**
 * Turn off an accounts warehousing service
 *
 * 1. Deactivate account warehousing by removing account's users permission
 * 2. Complete inbounding for all transited inventory
 * 3. Remove all account's item barcodes
 */


async function deactivateAccountWarehousing(accountID) {
    /**
     * Turn off an accounts warehousing service
     *
     * 1. Deactivate account warehousing by removing account's users permission
     * 2. Complete inbounding for all transited inventory
     * 3. OPTIONAL - Remove all account's item barcodes
     */
    //1. Deactivate account warehousing by removing account's users permission

    //fetch account's users roles
    const accountRoles =  await db.role.findAll({where: {accountID: accountID}})

    //get account service user
    const serviceUser = await service.account.serviceUser(accountID)

    console.log(serviceUser.ID)

    console.log(`Fetched ${accountRoles.length} account roles`)

    //find warehousing Resource
    const warehousingResource =  await db.resource.findOne({where: {name: 'service.warehousing'}})

    //Remove relations in the permissions table
    await db.permission.destroy({where: {roleID: accountRoles.map(role=> role.ID), resourceID: warehousingResource.ID}})
    console.log('Permission removed successfully')

    //fetch all inbound order line items that are with status fulfilling
    console.log('fetching all inbound order line items')
    const orders = await db.order.findAll({where: {typeID: 3, statusID: 12, accountID: accountID}, include: [{model: db.fulfillment, as: 'fulfillments', where: {statusID: 7}}, {model: db.orderLineItem, as: 'orderLineItems'}]})

    let fulfillments  = []
    let orderLineItems  = []

    orders.map(order =>{
        fulfillments = fulfillments.concat(order.fulfillments)
        orderLineItems = orderLineItems.concat(order.orderLineItems)
    })



    // 2. Complete inbounding for all transited inventory
    console.log(`Total fulfillments to update ${fulfillments.length}`)
    //const fulfillmentStatuses = new Set()
    for (let fulfillment of fulfillments){
        //console.log(fulfillment)
        //fulfillmentStatuses.add(fulfillment.statusID)
        const fulfillmentOrderLineItems =  orderLineItems.filter(oli => oli.fulfillmentID == fulfillment.ID )
        const body = {
            fulfillmentID: fulfillment.ID,
            orderLineItems: fulfillmentOrderLineItems.map(oli => {
                return {ID: oli.ID}
            })
        }

        ///api/fulfillment/80154/complete
        try {
            await axios.post(`${configs.microservices.api}/api/fulfillment/${fulfillment.ID}/deliver`,body, {
                headers: {
                    authorization: `Bearer ${serviceUser.apiKey}`
                }
            })
        }
        catch (e) {
            console.log(e)
        }

        // const updatedFulfillment = await service.fulfillment.complete(serviceUser, body)
        // // update variant on e-shop for when items are set to active from a drafted state during transfer
        // await service.product.syncEgress(updatedFulfillment.orderLineItems.map(oli => oli.productVariantID))
        await utils.sleep(1000)
    }

    console.log(`Completed all fulfillments`)

    // //3. Remove all account's item barcodes
    // console.log(`Removing item barcodes`)
    // await db.item.update({barcode: null}, {where: {accountID: accountID}})
    // console.log(`Successfully removed item barcodes`)

}

async function syncShopifyVariant(variantID) {
    await service.bridge.shopify.variant.sync({variantID })
    console.log('done')
}

//get a shopify product
async function fetchShopifyProductByForeignID(foreignID) {
    const product = await db.product.findOne({where: {foreignID}})
    const user = await service.account.serviceUser(product.accountID)
    const {shopify, shopifySession} = await service.bridge.shopify.client( product.accountID)
    const variant = await shopify.rest.Product.find( {id:foreignID, session: shopifySession});
    console.log(variant)
}

async function startShopifyClient() {
    const user = await service.account.serviceUser(3)
    const {shopify, shopifySession} = await service.bridge.shopify.client(3)

    const deprecatedApi = await shopify.rest.DeprecatedApiCall.all({session: shopifySession});
    //console.log(deprecatedApi)
    try {
        const variant = new shopify.rest.Variant({session: shopifySession});
        variant.product_id = 7672927781042;
        variant.option1 = "Yellow";
        variant.price = "1.00";
        await variant.save({
            update: true,
        });
        console.log(variant)
    } catch (e) {
        console.log(e.response.code, e.response.statusText)
    }
}

//Temp Fix
async function fixInventoryIDReferenceProblem(){
    //fetch all listings
    const listings = await db.inventoryListing.findAll()
    //fetch all inventory
    const inventory = await db.inventory.findAll()

    console.log(`Listings: ${listings.length} | Inventory: ${inventory.length}`)

    //create a dictionary of inventory with ID as key
    const inventoryDict = {}
    for (var inv of inventory) {
        inventoryDict[inv.ID] = inv
    }

    //loop through listings and check if inventoryID is present in inventory showing iteration progress in 1000s
    let counter = 0
    for (var listing of listings) {
        if (counter % 10000 == 0) {
            console.log(`Processed ${counter} listings`)
        }
        const inventoryRecord = inventoryDict[listing.inventoryID]
        if (!inventoryRecord) {
            console.log(`Inventory record not found for listing ${listing.ID}`)
            //if not found, delete listing
            //await db.inventoryListing.destroy({where: {ID: listing.ID}})
        }
        counter++
    }


}

async function general() {
    // used to initilaize queries vairbale used for batch queries on the db to speed up the whole thing
    let queries = []

    let productsCatalogueUpdates = false //if this one is set to true. Reindex products on algolia

    if (fs.existsSync('./scripts/checksReports/shopifyInventoryReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/shopifyInventoryReport.csv');

        // fix quantity and/or prices missmatch - by re-sync
        const variantsToSync = new Set()
        records
            .filter(record => record.variantID != '' && (record.quantityMissmatch || record.priceMissmatch))
            .map(record => variantsToSync.add(record.variantID))
        console.log(`>> Shopify Inventory Report - Shopify Variants to re-sync ${variantsToSync.size}`)
        let i = 0
        for (let variantID of Array.from(variantsToSync)){
            const taskId = uuidv1()
            console.log(`${i}/${variantsToSync.size} ${taskId} | ${variantID}`)
            if (configs.environment != 'prod') {
                console.log(`SKIP SYNC SHOPIFY PROD`)
                continue
            }

            await service.gcloud.addTask(
                'shopify-jobs',
                'POST',
                `https://production-api-6dwjvpqvqa-nw.a.run.app/api/bridge/egress/shopify/variant/sync`,
                {provenance: 'scripts - fixes'},
                taskId,
                {
                    variantID: variantID
                })
            i += 1
        }

        /*
        // skip this - now it's their responsability t manage stock not tracked on fliproom. We will just not create the order
        // if we can't find the stock
        // set quantities to 0 for shopify variants without inventory records available
        const shopifyVariantsToManuallySync = new Set()
        records.filter(record => record.variantID == '').map(record => shopifyVariantsToManuallySync.add(record['shopify_variant_id']))
        console.log(`>> Shopify Inventory Report - Shopify Variants without inventory to re-sync ${shopifyVariantsToManuallySync.size}`)
        const warehouses = await db.warehouse.findAll({where: {foreignID: {[Op.not]: null}}})
        const shopifySaleChannels = await db.saleChannel.findAll({where: {platform: 'shopify'}})
        const shopifyChannelAccountIDs = shopifySaleChannels.map(sc => sc.accountID)
        //get service users
        const serviceUsers = await Promise.all(shopifyChannelAccountIDs.map(accID=> service.account.serviceUser(accID)))
        let idx = 0

        for (var shopifyVariantID of shopifyVariantsToManuallySync) {
            const record = records.find(record => record.variantID == '' && record['shopify_variant_id'] == shopifyVariantID)
            const shopifySC =  shopifySaleChannels.find(sc => sc.shopifyStoreName == record['shopify_shop'])
            console.log(idx+1, shopifyVariantsToManuallySync.size)
            const warehouse = warehouses.find(wh => wh.accountID == shopifySC.accountID)
            const serviceUser = serviceUsers.find(user => user.accountID == shopifySC.accountID)
            try {
                // get shopify client and session
                const {shopify, shopifySession} = await service.bridge.shopify.client( serviceUser.accountID)
                const inventory_level = new shopify.rest.InventoryLevel({session: shopifySession});
                await inventory_level.set({
                    body: {
                        location_id: warehouse.foreignID,
                        inventory_item_id: record['shopify_variant_inventory_item_id'],
                        available: 0
                    },
                });

                await sleep(250)
            } catch(e) {
                console.log(e.response)
            }
            idx += 1
        }
        */
    }

    if (fs.existsSync('./scripts/checksReports/shopify_orders.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/shopify_orders.csv');

        const missingShopifyOrder = records.filter(r => r.missingShopifyOrder && (r['Untracked products'] != r.shopify.quantity))
        console.log(`>> Shopify Orders Report - missingShopifyOrder ${missingShopifyOrder.length}`)
        const shopifySaleChannels = await db.saleChannel.findAll({where: {platform: 'shopify'}})
        for (var record of missingShopifyOrder) {
            console.log(`\nImporting order ${record.shopify.id} (${record.shopify.order_number}) - ${record.saleChannel}`)
            const saleChannel = shopifySaleChannels.find(sc => sc.shopifyStoreName == record.saleChannel)
            const serviceUser = await service.account.serviceUser(saleChannel.accountID)
            const {shopify, shopifySession} = await service.bridge.shopify.client( saleChannel.accountID)
            const shopifyOrder =  await shopify.rest.Order.find({session: shopifySession, id: record.shopify.id,});
            try {
                await service.bridge.shopify.webhook.orderCreated(serviceUser, shopifyOrder)
                console.log(` order ${record.shopify.id} (${record.shopify.order_number}) => imported`)
            } catch (e) {
                console.log(e)
            }
        }
        return

        const duplicatedShopifyOrder = records.filter(r => r.duplicatedShopifyOrder)
        console.log(`>> Shopify Orders Report - duplicatedShopifyOrder ${duplicatedShopifyOrder.length}`)
        for (var record of duplicatedShopifyOrder) {
            let duplicatedOrder;
            const orders = await db.order.findAll({
                where: {
                    ID: record.orderIds.split(","),
                },
                include: [
                    {model: db.orderLineItem, as: 'orderLineItems', include: [
                        {model: db.item, as: 'item'}
                    ]},
                    {model: db.transaction, as: 'transactions'},
                ]
            })

            console.log(record.shopify.order_number, orders.map(o => o.statusID))

            //deleted vs pending
            if (record.saleChannel == "the-edit-man-london-online" && orders[0].statusID == 3 && orders[1]?.statusID == 10) {
                //if on shopify the order has been cancelled - delete the order with status pending
                if (record['Financial Status'] == 'voided' || record['Financial Status'] == 'refunded') {
                    duplicatedOrder = orders.find(o => o.statusID == 10)
                    duplicatedConsignmentOrders = await db.order.findAll({
                        where: {parentOrderID: duplicatedOrder.ID}, 
                        include: [
                            {model: db.orderLineItem, as: 'orderLineItems'}
                        ]
                    })
                } else {
                    console.log("NEW SCENARIO")
                }
            }

            //pending vs fulfill
            if (record.saleChannel == "the-edit-man-london-online" && ((orders[0].statusID == 10 && orders[1]?.statusID == 31) || (orders[0].statusID == 31 && orders[1]?.statusID == 10))) {
                //console.log(orders[0].reference1, record['Financial Status'])
                if (record['Financial Status'] == 'paid') {
                    duplicatedOrder = orders.find(o => o.statusID == 10)
                    duplicatedConsignmentOrders = await db.order.findAll({
                        where: {parentOrderID: duplicatedOrder.ID}, 
                        include: [
                            {model: db.orderLineItem, as: 'orderLineItems'}
                        ]
                    })
                }else {
                    console.log("NEW SCENARIO")
                }
            }

            //pending vs dispatched
            if (record.saleChannel == "the-edit-man-london-online" && ((orders[0].statusID == 10 && orders[1]?.statusID == 13) || (orders[0].statusID == 13 && orders[1]?.statusID == 10))) {
                console.log(orders[0].reference1, record['Financial Status'])
                if (record['Financial Status'] == 'paid') {
                    duplicatedOrder = orders.find(o => o.statusID == 10)
                    duplicatedConsignmentOrders = await db.order.findAll({
                        where: {parentOrderID: duplicatedOrder.ID}, 
                        include: [
                            {model: db.orderLineItem, as: 'orderLineItems'}
                        ]
                    })
                }else {
                    console.log("NEW SCENARIO")
                }
            }

            //fulfill vs fulfill
            if (record.saleChannel == "the-edit-man-london-online" && (orders[0].statusID == 31 && orders[1]?.statusID == 31)) {
                console.log(orders[0].reference1, record['Financial Status'])
                if (record['Financial Status'] == 'paid') {
                    duplicatedOrder = orders[1]
                    duplicatedConsignmentOrders = await db.order.findAll({
                        where: {parentOrderID: duplicatedOrder.ID}, 
                        include: [
                            {model: db.orderLineItem, as: 'orderLineItems'}
                        ]
                    })
                }else {
                    console.log("NEW SCENARIO")
                }
            }

            //pending vs dispatched
            if (record.saleChannel == "the-edit-man-london-online" && ((orders[0].statusID == 31 && orders[1]?.statusID == 13) || (orders[0].statusID == 13 && orders[1]?.statusID == 31))) {
                console.log(orders[0].reference1, record['Financial Status'])
                if (record['Financial Status'] == 'paid') {
                    duplicatedOrder = orders.find(o => o.statusID == 31)
                    duplicatedConsignmentOrders = await db.order.findAll({
                        where: {parentOrderID: duplicatedOrder.ID}, 
                        include: [
                            {model: db.orderLineItem, as: 'orderLineItems'}
                        ]
                    })
                }else {
                    console.log("NEW SCENARIO")
                }
            }

            if (record.saleChannel == "reseller-2-reseller") {
                duplicatedOrder = orders[1]
            }

            if (!duplicatedOrder) {
                continue
            }

            if (duplicatedOrder.reference1 != "9157") {
                continue
            } 

            for (var oli of duplicatedOrder.orderLineItems) {
                console.log(oli.statusID, oli.itemID, oli.item.accountID, duplicatedOrder.accountID)
                if (((oli.statusID == 10) || (oli.statusID == 31 && oli.item.warehouseID == null)) && oli.item.accountID == duplicatedOrder.accountID) {
                    console.log("sourcin item to delete")
                    await db.item.destroy({where: {ID: oli.itemID}})
                    await db.orderLineItem.destroy({where: {itemID: oli.itemID, orderTypeID: 3}})
                } else if (oli.statusID == 3 && oli.item.accountID != duplicatedOrder.accountID) {
                    //consignor already deleted its order. waiting action
                    let olis = await db.orderLineItem.findAll({where: {itemID: oli.itemID}, include: [
                        {model: db.item, as: 'item'}
                    ]})
                    olis = olis.filter(oli => !(oli.orderTypeID == 3 && oli.accountID == oli.item.accountID))
                    await db.orderLineItem.destroy({where: {ID: olis.map(oli => oli.ID)}})
                    const order = await db.order.findOne({where: {ID: olis.find(oli => oli.orderTypeID == 4 && oli.accountID == oli.item.accountID).orderID}})
                    if (order.quantity == 1) {
                        await db.order.destroy({where: {ID: order.ID}})
                    }
                } else if (oli.statusID == 31 && oli.item.accountID != duplicatedOrder.accountID) {
                    // consignor accepted but not fulfilled yet
                    ////set inventoryID to items sold
                    await db.item.update({inventoryID: oli.inventoryID}, {where: {ID: oli.itemID}})
                    ////update inventory qty
                    await db.inventory.update({quantity: db.sequelize.literal(`quantity + 1`)}, {where: {ID: oli.inventoryID}})
                    // delete all olis besides consignor inbound and delete sale consignor order if only that item in the order
                    let olis = await db.orderLineItem.findAll({where: {itemID: oli.itemID}, include: [
                        {model: db.item, as: 'item'}
                    ]})
                    olis = olis.filter(oli => !(oli.orderTypeID == 3 && oli.accountID == oli.item.accountID))
                    await db.orderLineItem.destroy({where: {ID: olis.map(oli => oli.ID)}})
                    const order = await db.order.findOne({where: {ID: olis.find(oli => oli.orderTypeID == 4 && oli.accountID == oli.item.accountID).orderID}})
                    if (order.quantity == 1) {
                        await db.order.destroy({where: {ID: order.ID}})
                    }
                } else if (oli.statusID == 31 && oli.item.accountID == duplicatedOrder.accountID) {
                    await db.item.update({statusID: 3, deletedAt: new Date(), warehouseID: null, warehouseID: null}, {where: {ID: oli.itemID}})
                } else {
                }
            }

            //delete transaction
            await db.transaction.destroy({where: {ID: duplicatedOrder.transactions.map(tx => tx.ID)}})

            //delete order
            await db.order.destroy({where: {ID: duplicatedOrder.ID}})

            //delete order line items
            await db.orderLineItem.destroy({where: {orderID: duplicatedOrder.ID}})
        }

        const fulfillmentStatusMissmatch = records.filter(r => r.fulfillmentStatusMissmatch)
        console.log(`>> Shopify Orders Report - fulfillmentStatusMissmatch ${fulfillmentStatusMissmatch.length}`)
        for (const record of fulfillmentStatusMissmatch) {
            if (record.sorder.fulfillment_status == "fulfilled" && record.status.name == "deleted") {
                //todo

                sorder
            }

            if (record.sorder.fulfillment_status == "fulfilled" && record.status.name == "fulfilling") {
                //todo
            }
        }


    }

    if (fs.existsSync('./scripts/checksReports/shopifyFulfillmentReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/shopifyFulfillmentReport.csv');

        const missingShopifyFulfillment = records.filter(r => r.missingShopifyFulfillment)
        console.log(`>> Shopify Orders Report - missingShopifyFulfillment ${missingShopifyFulfillment.length}`)
        for (const record of missingShopifyFulfillment) {
            const ids = record.fulfillment.ids.split(",").filter(id => id != "")
            if (ids.length > 1) {
                //const serviceUser = await service.account.serviceUser(record.account.id)
                //const {shopify, shopifySession} = await service.bridge.shopify.client( serviceUser.accountID)
                //let shopifyFulfillment = await shopify.rest.Fulfillment.all({
                //    session: shopifySession,
                //    order_id: record.shopify.order_id,
                //});
                //shopifyFulfillment = shopifyFulfillment.data.find(sf => sf.id == record.shopify.id)
                //await service.bridge.shopify.webhook.fulfillmentCreated(serviceUser, shopifyFulfillment)
                continue
            } else if (ids.length == 0) {
                console.log(`Importing fulfillment ${record.shopify.id} for shopify order id ${record.shopify.order_id}`)
                // no fulfillment on the platform. Trigger creation
                const serviceUser = await service.account.serviceUser(record.account.id)
                const {shopify, shopifySession} = await service.bridge.shopify.client( serviceUser.accountID)
                let shopifyFulfillment = await shopify.rest.Fulfillment.find({
                    session: shopifySession,
                    order_id: record.shopify.order_id,
                    id: record.shopify.id,
                });
                await service.bridge.shopify.webhook.fulfillmentCreated(serviceUser, shopifyFulfillment)
            } else {
                console.log(`Connecting shopify fulfillment ${record.shopify.id} to db fulfillment ${record.shopify.order_id}`)
                //fulfillment on platform exist. just not linked. link it
                await db.fulfillment.update({foreignID: record.shopify.id}, {where: {ID: ids[0]}})
            }
        }
    }

    if (fs.existsSync('./scripts/checksReports/productReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/productReport.csv');
        console.log(`Product Report Problems ${records.length}`)
        productsCatalogueUpdates = true
        queries = []

        //privateProductWithoutAccountID
        const privateProductWithoutAccountID = records.filter(r => r.privateProductWithoutAccountID)
        console.log(`>> Product Report - privateProductWithoutAccountID ${privateProductWithoutAccountID.length}`)
        const dbInventoryPrivateProductWithoutAccountID = await db.inventory.findAll({where: {productID: privateProductWithoutAccountID.map(record => record.productID)}})
        const dbItemsPrivateProductWithoutAccountID = await db.inventory.findAll({where: {productID: privateProductWithoutAccountID.map(record => record.productID)}})
        for (var record of privateProductWithoutAccountID) {
            const inventoryRecords = dbInventoryPrivateProductWithoutAccountID.filter(inv => inv.productID == record.productID)
            const itemRecords = dbItemsPrivateProductWithoutAccountID.filter(item => item.productID == record.productID)
            if (inventoryRecords.length == 0 && itemRecords.length == 0) {
                queries.push(db.product.destroy({where: {ID: record.productID}}))
            } else {
                console.log(`Can't delete product ${record.productID} | inventory: ${inventoryRecords.length} items: ${itemRecords.length}`)
            }
        }

        //productMissingImage - private products with image reference available
        const privateProductsMissingImages = records.filter(r => r.productMissingImage)
        console.log(`>> Product Report - privateProductsMissingImages ${privateProductsMissingImages.length}`)
        const privproducts = await db.product.findAll({where: {ID: privateProductsMissingImages.map(record => record.productID)}})
        privproducts.filter(p => (p.imageReference != null || p.imageReference != "")).map(product => queries.push(db.productImage.create({
            productID: product.ID,
            src: product.imageReference,
            position: 0
        })))


        //productMissingVariants
        const productMissingVariants = records.filter(r => r.productMissingVariants)
        console.log(`>> Product Report - productMissingVariants ${productMissingVariants.length}`)
        for (var record of productMissingVariants) {
            const inventory = await db.inventory.findAll({where: {productID: record.productID}})
            const items = await db.item.findAll({where: {productID: record.productID}})
            if (inventory.length == 0 && items.length == 0) {
                queries.push(db.product.destroy({where: {ID: record.productID}}))
            }
        }

        //unexpectedStockxId
        const unexpectedStockxId = records.filter(r => r.unexpectedStockxId)
        console.log(`>> Product Report - unexpectedStockxId ${unexpectedStockxId.length}`)
        queries.push(db.product.update({stockxId: null}, {where: {ID: unexpectedStockxId.map(record => record.productID)}}))

        /**
         * This fix has been deprecated because too difficult now to use. Problem is mainly fixed. 
         * Solution is not running the fix but to allow on the interface to manage products better
        //accountDuplicatedProduct
        const accountDuplicatedProduct = records.filter(r => r.accountDuplicatedProduct)
        console.log(`>> Product Report - accountDuplicatedProduct ${accountDuplicatedProduct.length}`)
        const productIDswhitelisted = [
            '84756,92085',
            '91178,92150',
            '79518,92536',
            '91104,92926',
            '93215,93216'
        ]
        for (var record of accountDuplicatedProduct) {
            const products = await db.product.findAll({
                where: {ID: record.duplicatedIDs.split(",")},
                include: [
                    {model: db.productVariant, as: "variants"}
                ]
            })
            const items = await db.item.findAll({where: {productID: record.duplicatedIDs.split(",")}})
            const productCodes = [... new Set(products.map(product => product.code))]
            const productSourceIDs = [... new Set(products.map(product => product.sourceProductID))]

            if (products.length == 1) {
                continue
            }

            if (productCodes[0].includes('MOSES') || productCodes[0].includes('EDIT')) {
                console.log("skip moses. do this later")
                continue
            }

            //SCENARIO 1 - 1 product has 1 variant "default", the other product has multiple variants
            if (products[0].variants.length == 1 && products[1].variants.length > 1) {
                console.log(`SCENARIO 1 A\n`)
                console.log(`Items ${items.length}`)
                await db.productVariant.destroy({where: {ID: products[0].ID}})
                await db.product.destroy({where: {ID: products[0].ID}})
                continue
            } else if (products[0].variants.length > 1 && products[1].variants.length == 1) {
                console.log(`SCENARIO 1 B\n`)
                console.log(products[0].ID, products[1].ID)
                console.log(`Items ${items.length}`)
                await db.productVariant.destroy({where: {ID: products[1].ID}})
                await db.product.destroy({where: {ID: products[1].ID}})
                continue
            }

            
            console.log(`AccountID ${record.accountID} | Product IDs ${record.duplicatedIDs} | codes ${productCodes.length} | ${productSourceIDs.length} | Variants ${products.map(p => p.variants.length)}`)

            const originalProduct = products[0]
            for (var product2 of products.slice(1)) {
                const product2Items = items.filter(item => item.productID == product2.ID)
                console.log(`Items found ${product2Items.length}`)

                // SCENARIO2 - same products and no stock to move over and same sourceProductIDs OR whitelisted productIDs (manually checked that same product but only one has sourceProductID)
                if (product2Items.length == 0 && productCodes.length == 1 && (productSourceIDs.length == 1 || productIDswhitelisted.includes(record.duplicatedIDs))) {
                    console.log(`SCENARIO 2 - TODO\n`)
                    let productToDelete = product2
                    if (product2.sourceProductID == null) {
                        await db.productMatchLookup.destroy({where: {productID: product2.ID}})
                        await db.productVariant.destroy({where: {ID: product2.ID}})
                        await db.product.destroy({where: {ID: product2.ID}})
                    }
                }

                //SCENARIO4 - same products and no stock to move over - but different sourceProductIDs

                //SCENARIO 3 - same products and stock to move over
                if (product2Items.length > 0 && productCodes.length == 1 && productSourceIDs.length == 1) {
                    console.log(`SCENARIO 3\n`)
                    const queries = []
                    for (item of product2Items) {
                        const product2Variant = product2.variants.find(variant => variant.ID == item.productVariantID)
                        let product1Variant = originalProduct.variants.find(variant => variant.sourceProductVariantID == product2Variant.sourceProductVariantID)

                        // this can be triggered if products don;t have the same number of variants. In this case, just move the variant to the other product
                        if (!product1Variant) {
                            await db.productVariant.update({productID: originalProduct.ID}, {where: {ID: product2Variant.ID}})
                            product1Variant = product2Variant
                        }

                        queries.push(db.item.update({productVariantID: product1Variant.ID, productID: originalProduct.ID}, {where: {productVariantID: product2Variant.ID}}))
                        queries.push(db.orderLineItem.update({productVariantID: product1Variant.ID, productID: originalProduct.ID}, {where: {productVariantID: product2Variant.ID}}))
                        queries.push(db.inventory.update({productVariantID: product1Variant.ID, productID: originalProduct.ID}, {where: {productVariantID: product2Variant.ID}}))
                        queries.push(db.inventoryListing.update({productVariantID: product1Variant.ID, productID: originalProduct.ID}, {where: {productVariantID: product2Variant.ID}}))
                        queries.push(db.productMatchLookup.update({productVariantID: product1Variant.ID, productID: originalProduct.ID}, {where: {productVariantID: product2Variant.ID}}))
                    }

                    await Promise.all(queries)
                    await db.productMatchLookup.destroy({where: {productID: product2.ID}})
                    await db.productVariant.destroy({where: {ID: product2.ID}})
                    await db.product.destroy({where: {ID: product2.ID}})
                }
            }
        }
         */

        //unexpectedShopifyID
        const unexpectedShopifyID = records.filter(r => r.unexpectedShopifyID)
        console.log(`>> Product Report - unexpectedShopifyID ${unexpectedShopifyID.length}`)
        queries.push(db.product.update({status: 'deleted'}, {where: {ID: unexpectedShopifyID.map(record => record.productID)}}))

        //missingShopifyID
        const missingShopifyID = records.filter(r => r.missingShopifyID)
        console.log(`>> Product Report - missingShopifyID ${missingShopifyID.length}`)
        for (var record of missingShopifyID) {
            const serviceUser = await service.account.serviceUser(record.accountID)
            const dbProduct = await service.product.getById(serviceUser, record.productID)
            await service.bridge.shopify.product.create(serviceUser, dbProduct)
        }

        //brandMissmatch
        const brandMissmatch = records.filter(r => r.brandMissmatch)
        console.log(`>> Product Report - brandMissmatch ${brandMissmatch.length}`)
        for (var idx=0; idx<brandMissmatch.length; idx++) {
            console.log(`>> Product Report - brandMissmatch ${idx}/${brandMissmatch.length}`)
            const record = brandMissmatch[idx]
            console.log(record.publicProduct.brand, record.productID)
            await db.product.update({brand: record.publicProduct.brand}, {where: {ID: record.productID}})
        }

        //category2Missmatch
        const category2Missmatch = records.filter(r => r.category2Missmatch)
        console.log(`>> Product Report - category2Missmatch ${category2Missmatch.length}`)
        for (var idx=0; idx<category2Missmatch.length; idx++) {
            console.log(`>> Product Report - category2Missmatch ${idx}/${category2Missmatch.length}`)
            const record = category2Missmatch[idx]
            await db.product.update({category2: record.publicProduct.category2}, {where: {ID: record.productID}})
        }

        //genderMissmatch
        const genderMissmatch = records.filter(r => r.genderMissmatch)
        console.log(`>> Product Report - genderMissmatch ${genderMissmatch.length}`)
        for (var idx=0; idx<genderMissmatch.length; idx++) {
            console.log(`>> Product Report - gender ${idx}/${genderMissmatch.length}`)
            const record = genderMissmatch[idx]
            await db.product.update({gender: record.publicProduct.gender}, {where: {ID: record.productID}})
        }

        //colorMissmatch
        const colorMissmatch = records.filter(r => r.colorMissmatch)
        console.log(`>> Product Report - colorMissmatch ${colorMissmatch.length}`)
        for (var idx=0; idx<colorMissmatch.length; idx++) {
            console.log(`>> Product Report - color ${idx}/${colorMissmatch.length}`)
            const record = colorMissmatch[idx]
            queries.push(db.product.update({color: record.publicProduct.color === "" ? null : record.publicProduct.color}, {where: {ID: record.productID}}))
        }

        //releaseDateInvalid
        const releaseDateInvalid = records.filter(r => r.releaseDateInvalid)
        console.log(`>> Product Report - releaseDateInvalid ${releaseDateInvalid.length}`)
        for (var idx=0; idx<releaseDateInvalid.length; idx++) {
            console.log(`>> Product Report - release date ${idx}/${releaseDateInvalid.length}`)
            const record = releaseDateInvalid[idx]
            queries.push(db.product.update({releaseDate: record.publicProduct.releaseDate ? moment(record.publicProduct.releaseDate).format() : null}, {where: {ID: record.productID}}))
        }

        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (fs.existsSync('./scripts/checksReports/variantsReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/variantsReport.csv');
        console.log(`\n\nVariants Report Problems ${records.length}`)
        queries = []
        productsCatalogueUpdates = true

        //unexpectedStockxId
        const unexpectedStockxId = records.filter(r => r.unexpectedStockxId)
        console.log(`>> Variants Report - unexpectedStockxId ${unexpectedStockxId.length}`)
        queries.push(db.productVariant.update({stockxId: null}, {where: {ID: unexpectedStockxId.map(record => record.ID)}}))

        //usSizeChartMissmatch
        const usSizeChartMissmatch = records.filter(r => r.usSizeChartMissmatch)
        console.log(`>> Variants Report - usSizeChartMissmatch ${usSizeChartMissmatch.length}`)
        for (var record of usSizeChartMissmatch) {
            await db.productVariant.update({usSize: record.publicVariant.usSize === "" ? null : record.publicVariant.usSize}, {where: {ID: record.ID}})
        }

        //ukSizeChartMissmatch
        const ukSizeChartMissmatch = records.filter(r => r.ukSizeChartMissmatch)
        console.log(`>> Variants Report - ukSizeChartMissmatch ${ukSizeChartMissmatch.length}`)
        for (var record of ukSizeChartMissmatch) {
            await db.productVariant.update({ukSize: record.publicVariant.ukSize === "" ? null : record.publicVariant.ukSize}, {where: {ID: record.ID}})
        }

        //euSizeChartMissmatch
        const euSizeChartMissmatch = records.filter(r => r.euSizeChartMissmatch)
        console.log(`>> Variants Report - euSizeChartMissmatch ${euSizeChartMissmatch.length}`)
        for (var record of euSizeChartMissmatch) {
            await db.productVariant.update({euSize: record.publicVariant.euSize === "" ? null : record.publicVariant.euSize}, {where: {ID: record.ID}})
        }

        //jpSizeChartMissmatch
        const jpSizeChartMissmatch = records.filter(r => r.jpSizeChartMissmatch)
        console.log(`>> Variants Report - jpSizeChartMissmatch ${jpSizeChartMissmatch.length}`)
        for (var record of jpSizeChartMissmatch) {
            await db.productVariant.update({jpSize: record.publicVariant.jpSize === "" ? null : record.publicVariant.jpSize}, {where: {ID: record.ID}})
        }

        //usmSizeChartMissmatch
        const usmSizeChartMissmatch = records.filter(r => r.usmSizeChartMissmatch)
        console.log(`>> Variants Report - usmSizeChartMissmatch ${usmSizeChartMissmatch.length}`)
        for (var record of usmSizeChartMissmatch) {
            await db.productVariant.update({usmSize: record.publicVariant.usmSize === "" ? null : record.publicVariant.usmSize}, {where: {ID: record.ID}})
        }

        //uswSizeChartMissmatch
        const uswSizeChartMissmatch = records.filter(r => r.uswSizeChartMissmatch)
        console.log(`>> Variants Report - uswSizeChartMissmatch ${uswSizeChartMissmatch.length}`)
        for (var record of uswSizeChartMissmatch) {
            await db.productVariant.update({uswSize: record.publicVariant.uswSize === "" ? null : record.publicVariant.uswSize}, {where: {ID: record.ID}})
        }

        //gtinMissmatch
        const gtinMissmatch = records.filter(r => r.gtinMissmatch)
        console.log(`>> Variants Report - gtinMissmatch ${gtinMissmatch.length} - SKIP FOR NOW`)
        for (var record of gtinMissmatch) {
            //await db.productVariant.update({gtin: record.publicVariant.gtin === "" ? null : record.publicVariant.gtin}, {where: {ID: record.ID}})
        }

        const gtinMissing = records.filter(r => r.gtinMissing)
        console.log(`>> Variants Report - gtinMissing ${gtinMissing.length}`)
        for (var record of gtinMissing) {
            queries.push(db.productVariant.update({gtin: record.publicVariant.gtin === "" ? null : record.publicVariant.gtin}, {where: {ID: record.ID}}))
        }

        //missingShopifyID
        const missingShopifyID = records.filter(r => r.missingShopifyID)
        console.log(`>> Variants Report - missingShopifyID ${missingShopifyID.length}`)
        for (var record of missingShopifyID) {
            console.log("TODO")
        }

        //unexpectedShopifyID
        const unexpectedShopifyID = records.filter(r => r.unexpectedShopifyID)
        console.log(`>> Variants Report - unexpectedShopifyID ${unexpectedShopifyID.length}`)
        queries.push(db.productVariant.update({status: 'deleted'}, {where: {ID: unexpectedShopifyID.map(record => record.ID)}}))

        /*
        //duplicatedPublicVariant - keep this one comment because sometimes the problem is due to stockx duplicating the same variant
        const duplicatedPublicVariant = records.filter(r => r.duplicatedPublicVariant)
        console.log(`>> Variants Report - duplicatedPublicVariant ${duplicatedPublicVariant.length}`)
        for (var record of duplicatedPublicVariant) {
            const records = await db.productVariant.findAll({where: {stockxId: record.stockxId}})
            const duplicatedPublicVariants = records.slice(1)
            const realPublicVariant = records[0]
            console.log(realPublicVariant.ID, duplicatedPublicVariants.map(v => v.ID))
            // if any private variant is using the duplicated public variant, move it to the real public variant 
            await db.productVariant.update({sourceProductVariantID: realPublicVariant.ID}, {where: {sourceProductVariantID: duplicatedPublicVariants.map(v => v.ID)}})
            await db.marketplaceListing.update({productVariantID: realPublicVariant.ID}, {where: {productVariantID: duplicatedPublicVariants.map(v => v.ID)}})
            await db.marketplaceListing.update({productVariantID: realPublicVariant.ID}, {where: {productVariantID: duplicatedPublicVariants.map(v => v.ID)}})
            await db.productVariant.destroy({where: {ID: duplicatedPublicVariants.map(v => v.ID)}})
        }
        */

        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (fs.existsSync('./scripts/checksReports/productsMatchReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/productsMatchReport.csv');
        console.log(`\n\nProducts Match Report Problems ${records.length}`)

        //duplicatedMatches
        const duplicatedMatches = records.filter(r => r.duplicatedMatches)
        console.log(`>> Products Match Report - duplicatedMatches ${duplicatedMatches.length}`)
        for (var record of duplicatedMatches) {
            const recordMatches = await db.productMatchLookup.findAll({
                where: {
                    externalProductVariantID: record['externalVariantID'],
                    'accountID': record.variant.accountID
                },
                include: [
                    {model: db.productVariant, as: 'variant', include: [
                        {model: db.product, as: 'product'}
                    ]},
                    {model: db.productVariant, as: 'externalVariant', include: [
                        {model: db.product, as: 'product'}
                    ]}
                ]}
            )

                
            const [record1, record2, others] = recordMatches
            
            console.log(`recordMatches: ${recordMatches.length}`)
            console.log(`>> Origin productIDs ${recordMatches.map(r => r.variant.product.ID).join(",")} || code ${recordMatches.map(r => r.variant.product.code).join(",")}         || variantIDs ${recordMatches.map(r => r.variant.ID).join(",")}         || accountID ${recordMatches.map(r => r.variant.product.accountID).join(",")}`)
            console.log(`>> Destin productIDs ${recordMatches.map(r => r.externalVariant.product.ID).join(",")} || code ${recordMatches.map(r => r.externalVariant.product.code).join(",")} || variantIDs ${recordMatches.map(r => r.externalVariant.ID).join(",")} || accountID ${recordMatches.map(r => r.externalVariant.product.accountID).join(",")}`)
            if (recordMatches.length == 0 || recordMatches.length == 1) {
            } else if (recordMatches.length == 2) {
                if (record1.variant.ID == record2.variant.ID && record1.externalVariant.ID == record2.externalVariant.ID) {
                    await db.productMatchLookup.destroy({where: {ID: record2.ID}})
                }
            }

            /*
            } else if (recordMatches.length > 2) {
                console.log(`recordMatches: ${recordMatches.length}`)
                console.log(`RecordIDs ${recordMatches.map(record => record.ID).join(",")}`)
                console.log(`Matching Variant ${recordMatches[0].externalVariant.name} (${recordMatches[0].externalVariant.ID}) accountID ${recordMatches[0].externalAccountID}`)
                console.log(`Variants\n${recordMatches.map(record => record.variant.name).join(",\n")}`)

                // scenario where there are duplicates records. Multiple records with same productVariantID and externalProductVariantID
                const duplicatedRecords =  [... new Set(recordMatches.map(record => record.productVariantID))]
                if (duplicatedRecords.length < recordMatches.length) { // there is some duplicate
                    for (var variantID of duplicatedRecords) {
                        const records = recordMatches.filter(r => r.productVariantID == variantID)
                        if (records.length > 1) {
                            await db.productMatchLookup.destroy({where: {ID: records.slice(1).map(r => r.ID)}})
                        }
                    }
                }

                // scenario where multiple productVariant are linked to the same externalProductVariantID
                // get only the correct one. Remove the others
                // try fullMatch
                const correctMatch1 = recordMatches.find(r => r.variant.name.trim().toLowerCase() == recordMatches[0].externalVariant.name.trim().toLowerCase())
                const correctMatch2 = recordMatches.find(r => {
                    const euSize1 = utils.parseSizeChart(recordMatches[0].externalVariant.name, "eu")
                    const usSize1 = utils.parseSizeChart(recordMatches[0].externalVariant.name, "us")
                    const euSize2 = utils.parseSizeChart(r.variant.name, "eu")
                    const usSize2 = utils.parseSizeChart(r.variant.name, "us")
                    return (euSize1 == euSize2 || usSize1 == usSize2)
                }) 
                const correctMatch = (correctMatch1 || correctMatch2)
                if (correctMatch) {
                    console.log(`Correct Variant is ${correctMatch.variant.name}`)
                    const matchesToRemove = recordMatches.filter(r => r.ID != correctMatch.ID)
                    await db.productMatchLookup.destroy({where: {ID: matchesToRemove.map(r => r.ID)}})

                }
                console.log("\n")
            } else if (record1.variant.product.accountID == 3) {
                console.log("SKIP EDIT LDN PRODUCT. SHOULD NOT BE HERE")
            }
            else if (record1.variant.productID == record2.variant.productID) {
                if (record1.variant.ID == record2.variant.ID) {
                    //remove matching record
                    await db.productMatchLookup.destroy({where: {ID: record1.ID}})
                } else {
                    // different variant ID but refer to the same size. Keep the first, remove the second
                    await db.item.update({productVariantID: record1.variant.ID}, {where: {productVariantID: record2.variant.ID}})
                    await db.inventory.update({productVariantID: record1.variant.ID}, {where: {productVariantID: record2.variant.ID}})
                    await db.inventoryListing.update({productVariantID: record1.variant.ID}, {where: {productVariantID: record2.variant.ID}})
                    await db.jobLineItem.update({productVariantID: record1.variant.ID}, {where: {productVariantID: record2.variant.ID}})
                    await db.orderLineItem.update({productVariantID: record1.variant.ID}, {where: {productVariantID: record2.variant.ID}})

                    await db.productMatchLookup.destroy({where: {productVariantID: record2.variant.ID}})
                    await db.productVariant.destroy({where: {ID: record2.variant.ID}})
                }

                // remove duplicated variants
                const product = await db.product.findOne({
                    where: {ID: record1.variant.productID},
                    include: [
                        {model: db.productVariant, as: 'variants'}
                    ]
                })


                const variantsWithStockxSync = product.variants.filter(variant => variant.sourceProductVariantID != null)
                const variantsWithoutStockxSync = product.variants.filter(variant => variant.sourceProductVariantID == null)
                // variantsWithStockxSync might be empty. Or not complete, starting from this assumption, iterate through this list. 
                // if a match is found, remove the match. If a match is not found, keep it
                const variantsToRemove = variantsWithoutStockxSync.filter(v1 => {
                    const match = variantsWithStockxSync.find(v2 => {
                        const euSize1 = (v1.name.split("-").find(c => c.trim().toLowerCase().includes("eu")) || '').replace("eu", "").trim()
                        const euSize2 = (v2.euSize || '').trim().toLowerCase().replace("eu", "").trim() // since synced wth stockx
                        const euMatch = (euSize1 != null && euSize1 == euSize2)

                        const usSize1 = (v1.name.split("-").find(c => c.trim().toLowerCase().includes("us")) || '').replace("us", "").trim()
                        const usSize2 = (v2.usSize || '').trim().toLowerCase().replace("us", "").trim()
                        const usMatch = (usSize1 != null && usSize1 == usSize2)
                        return euMatch || usMatch
                    })

                    // if there is a same variant matched Then remove it. Meaning: we keep the variant synced with stockx and remove the other one
                    return match
                })
                const variantsToKeep = product.variants.filter(variant => !variantsToRemove.find(v => v.ID == variant.ID))

                variantsToKeep.map(variant => console.log(`KEEP - ${variant.name}`))
                variantsToRemove.map(variant => console.log(`REMOVE - ${variant.name}`))
                console.log("")
            } else { //different products
                console.log(`${record1.ID}-${record2.ID} | different products`)
                const product1 = await db.product.findOne({
                    where: {ID: record1.variant.productID},
                    include: [
                        {model: db.productVariant, as: 'variants'}
                    ]
                })
                const product2 = await db.product.findOne({
                    where: {ID: record2.variant.productID},
                    include: [
                        {model: db.productVariant, as: 'variants'}
                    ]
                })

                //remove duplicate variants - TODO: return the match to use to replace
                const variantsToDelete = []
                const variantsToReplaceWith = []
                product2.variants.map(v2 => {
                    const v1Match = product1.variants.find(v1 => {
                        const euSize1 = (v1.name.split("-").find(c => c.trim().toLowerCase().includes("eu")) || '').toLowerCase().replace("eu", "").trim()
                        const euSize2 = (v2.euSize || '').trim().toLowerCase().replace("eu", "").trim() // since synced wth stockx
                        const euMatch = (euSize1 != null && euSize1 == euSize2)

                        const usSize1 = (v1.name.split("-").find(c => c.trim().toLowerCase().includes("us")) || '').toLowerCase().replace("us", "").trim()
                        const usSize2 = (v2.usSize || '').trim().toLowerCase().replace("us", "").trim()
                        const usMatch = (usSize1 != null && usSize1 == usSize2)
                        return euMatch || usMatch
                    })

                    if (v1Match) {
                        variantsToDelete.push(v1Match)
                        variantsToReplaceWith.push(v2)
                    }
                })

                //move all variants left from product 2 to product 1
                const variantsToMove = product1.variants.filter(v1 => !variantsToDelete.find(v => v.ID == v1.ID))

                variantsToMove.map(variant => console.log(`MOVE - ${variant.name}`))
                variantsToDelete.map(variant => console.log(`REMOVE - ${variant.name}`))
                console.log("")

                //product1.variants.map(v => console.log(`${v.name} ${v.position} ${v.sourceProductVariantID}`))
                //console.log("----")
                //product2.variants.map(v => console.log(`${v.name} ${v.position} ${v.sourceProductVariantID}`))
                //console.log(product1.variants.length, variantsToMove.length, variantsToDelete.length, variantsToMove.map(v => v.ID))

                // update records accordingly. Update and delete variantsToDelete, Update product for variants to move
                //>>Update and delete variantsToDelete
                let idx = 0
                for (var i = 0;i < variantsToDelete.length; i++) {
                    const replacingVariant = variantsToReplaceWith[i]
                    await db.item.update({productID: product2.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
                    await db.inventory.update({productID: product2.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
                    await db.inventoryListing.update({productID: product2.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
                    await db.jobLineItem.update({productID: product2.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
                    await db.orderLineItem.update({productID: product2.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
                }

                await db.productMatchLookup.destroy({where: {productVariantID: variantsToDelete.map(v => v.ID)}})
                await db.productVariant.destroy({where: {ID: variantsToDelete.map(v => v.ID)}})
                
                //>>Update product for variants to move
                await db.item.update({productID: product2.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
                await db.inventory.update({productID: product2.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
                await db.inventoryListing.update({productID: product2.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
                await db.jobLineItem.update({productID: product2.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
                await db.orderLineItem.update({productID: product2.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
                await db.productVariant.update({productID: product2.ID}, {where: {ID: variantsToMove.map(v => v.ID)}})

                await db.product.destroy({where: {ID: product1.ID}})
            }
            */
        }

        //sameAccountID
        const sameAccountMatches = records.filter(r => r.sameAccountID)
        console.log(`>> Products Match Report - sameAccountMatches ${sameAccountMatches.length}`)
        await db.productMatchLookup.destroy({where: {ID: sameAccountMatches.map(record => record['recordID'])}})

        /*
        These tests are deprecated because not clear how to handle them now
        //variantNameMissmatch
        const variantNameMissmatch = records.filter(r => r.variantNameMissmatch)
        console.log(`>> Products Match Report - variantNameMissmatch ${variantNameMissmatch.length}`)
        for (var record of variantNameMissmatch) {
            await db.productMatchLookup.destroy({where: {ID: record.recordID}})
            await db.inventoryListing.destroy({where: {productVariantID: record.externalVariantID, accountID: record.variant.accountID}})
        }

        //productNameMissmatch
        const productNameMissmatch = records.filter(r => r.productNameMissmatch)
        console.log(`>> Products Match Report - productNameMissmatch ${productNameMissmatch.length}`)
        for (var record of productNameMissmatch) {
            await db.productMatchLookup.destroy({where: {productID: record.productID, externalProductID: record.externalProductID}})
            await db.inventoryListing.destroy({where: {productID: record.externalProductID, accountID: record.variant.accountID}})
        }

        //wrongProduct
        const wrongProduct = records.filter(r => r.wrongProduct)
        console.log(`>> Products Match Report - wrongProduct ${wrongProduct.length}`)
        await db.productMatchLookup.destroy({where: {ID: wrongProduct.map(record => record['recordID'])}})
        */
        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (fs.existsSync('./scripts/checksReports/StockxProductReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/StockxProductReport.csv');
        console.log(`\n\nStockx Report Problems ${records.length}`)
        productsCatalogueUpdates = true
        
        const publicProductMissing = records.filter(record => record.publicProductMissing)
        console.log(`Importing ${publicProductMissing.length} stockx products as public products`)
        for (var record of publicProductMissing) {
            if (!process.argv.includes("production")) {
                console.log(`SKIP STOCK PRODUCT IMMPORT ON PROD`)
                continue
            }
            console.log(record.url)

            try {
                const resp = await axios.get(`https://production-stockx-api-6dwjvpqvqa-nw.a.run.app/api/products/${record.stockxId}`)
                const product = resp.data
                const body = {
                    styleId: product.styleId,
                    title: product.title,
                    description: product.description,
                    category: product.category,
                    imageReferenceUrl: product.imageReferenceUrl,
                    stockxId: product.stockxId,
                    variants: [],
                }

                product.variants.map((variant, idx) => {
                    body.variants.push({
                        baseSize:   variant.baseSize,
                        baseType:   variant.baseType,
                        extraSizes: variant.extraSizes,
                        extraTypes: variant.extraTypes,
                        lowestAsk: variant.lowestAsk,
                        position: variant.position,
                        stockxId: variant.stockxId,
                        gtin:   variant.gtin,
                        usSize: variant.usSize ,
                        ukSize: variant.ukSize,
                        jpSize: variant.jpSize,
                        euSize: variant.euSize,
                        usmSize: variant.usmSize,
                        uswSize: variant.uswSize,
                    })
                })

                await axios.post('https://production-api-6dwjvpqvqa-nw.a.run.app/api/webhooks/stockx/product/created', body)
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                console.log(e)
                console.log(e.response.status, e.response.statusText)
                continue
            }

        }

        const publicProductBrandMissmatch = records.filter(record => record.brandMissmatch)
        console.log(`publicProductBrandMissmatch ${publicProductBrandMissmatch.length}`)
        await Promise.all(publicProductBrandMissmatch.map(record => db.product.update({brand: record.brand}, {where: {ID: record.productID}})))

        const publicProductCategory2Missmatch = records.filter(record => record.category2Missmatch)
        console.log(`publicProductCategory2Missmatch ${publicProductCategory2Missmatch.length}`)
        await Promise.all(publicProductCategory2Missmatch.map(record => db.product.update({category2: record.category2}, {where: {ID: record.productID}})))

        const publicProductGenderMissmatch = records.filter(record => record.genderMissmatch)
        console.log(`publicProductGenderMissmatch ${publicProductGenderMissmatch.length}`)
        await Promise.all(publicProductGenderMissmatch.map(record => db.product.update({gender: record.gender}, {where: {ID: record.productID}})))

        const publicProductColorMissmatch = records.filter(record => record.colorMissmatch)
        console.log(`publicProductColorMissmatch ${publicProductColorMissmatch.length}`)
        await Promise.all(publicProductColorMissmatch.map(record => db.product.update({color: record.color}, {where: {ID: record.productID}})))

        const publicProductretailPriceMissmatch = records.filter(record => record.retailPriceMissmatch)
        console.log(`publicProductretailPriceMissmatch ${publicProductretailPriceMissmatch.length}`)
        await Promise.all(publicProductretailPriceMissmatch.map(record => db.product.update({retailPrice: record.retailPrice}, {where: {ID: record.productID}})))

        const publicProductReleaseDateMissmatch = records.filter(record => record.releaseDateMissmatch)
        console.log(`publicProductReleaseDateMissmatch ${publicProductReleaseDateMissmatch.length}`)
        await Promise.all(publicProductReleaseDateMissmatch.map(record => {
            const formattedDate = moment(record.releaseDate).format() 
            console.log(record.stockxId, formattedDate)
            return db.product.update({releaseDate: formattedDate == "Invalid date" ? null : formattedDate}, {where: {ID: record.productID}})
        }))

        const publicProductSalesLast72HoursMissmatch = records.filter(record => record.salesLast72HoursMissmatch)
        console.log(`publicProductSalesLast72HoursMissmatch ${publicProductSalesLast72HoursMissmatch.length}`)
        await Promise.all(publicProductSalesLast72HoursMissmatch.map(record => db.product.update({salesLast72Hours: record.salesLast72Hours}, {where: {ID: record.productID}})))

        const salesLast72HoursChangePercentageMissmatch = records.filter(record => record.salesLast72HoursChangePercentageMissmatch)
        console.log(`salesLast72HoursChangePercentageMissmatch ${salesLast72HoursChangePercentageMissmatch.length}`)
        await Promise.all(salesLast72HoursChangePercentageMissmatch.map(record => db.product.update({salesLast72HoursChangePercentage: record.salesLast72HoursChangePercentage}, {where: {ID: record.productID}})))

        const lastSalePriceMissmatch = records.filter(record => record.lastSalePriceMissmatch)
        console.log(`lastSalePriceMissmatch ${lastSalePriceMissmatch.length}`)
        await Promise.all(lastSalePriceMissmatch.map(record => db.product.update({lastSalePrice: record.lastSalePrice}, {where: {ID: record.productID}})))

        const lastSaleChangePercentageMissmatch = records.filter(record => record.lastSaleChangePercentageMissmatch)
        console.log(`lastSaleChangePercentageMissmatch ${lastSaleChangePercentageMissmatch.length}`)
        await Promise.all(lastSaleChangePercentageMissmatch.map(record => db.product.update({lastSaleChangePercentage: record.lastSaleChangePercentage}, {where: {ID: record.productID}})))

        const volatilityScoreMissmatch = records.filter(record => record.volatilityScoreMissmatch)
        console.log(`volatilityScoreMissmatch ${volatilityScoreMissmatch.length}`)
        await Promise.all(volatilityScoreMissmatch.map(record => db.product.update({volatilityScore: record.volatilityScore}, {where: {ID: record.productID}})))

        const volatilityScoreChangePercentageMissmatch = records.filter(record => record.volatilityScoreChangePercentageMissmatch)
        console.log(`volatilityScoreChangePercentageMissmatch ${volatilityScoreChangePercentageMissmatch.length}`)
        await Promise.all(volatilityScoreChangePercentageMissmatch.map(record => db.product.update({volatilityScoreChangePercentage: record.volatilityScoreChangePercentage}, {where: {ID: record.productID}})))
    }

    if (fs.existsSync('./scripts/checksReports/StockxProductVariantReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/StockxProductVariantReport.csv');
        console.log(`\n\nStockx Report Problems ${records.length}`)
        productsCatalogueUpdates = true

        /*
        //missingDBVariant
        const missingDBVariants = records.filter(record => record.publicVariantMissing)
        console.log(`missingDBVariant ${missingDBVariants.length}`)
        for (var record of missingDBVariants) {
            const product = await db.product.findOne({where: {stockxId: record.product.stockxId}})
            if (product) {
                console.log(product.ID)
                const body = {
                    name: '',
                    status: 'active',
                    untracked: 0,
                    position: record.position,
                    stockxId: record.stockxId,
                    gtin:   record.gtin,
                    usSize: record.usSize ,
                    ukSize: record.ukSize,
                    jpSize: record.jpSize,
                    euSize: record.euSize,
                    usmSize: record.usmSize,
                    uswSize: record.uswSize,
                }

                if (record.extraSizes == '' && record.baseSize != '') {
                    body.name = record.baseSize + record.baseType
                } else if (record.extraSizes != '' && record.extraSizes != null) {
                    body.name = record.extraSizes.replace(/,/g, ' - ')
                }

                await service.product.addVariants(null, product.ID, [body])
            } else {
                console.log("Missing product for ", record.product.stockxId)
            }
        }
        */
        
        //usSizeMissmatch
        const usSizeMissmatch = records.filter(record => record.usSizeMissmatch)
        console.log(`usSizeMissmatch ${usSizeMissmatch.length}`)
        const usSizeMissmatchQueries = usSizeMissmatch.map(record => db.productVariant.update({usSize: record.usSize === "" ? null : record.usSize}, {where: {ID: record.variant.ID}}))
        const usSizeMissmatchBatch = utils.batchArray(usSizeMissmatchQueries, 100)
        for (var batch of usSizeMissmatchBatch) {
            await Promise.all(batch)
        }
        //ukSizeMissmatch
        const ukSizeMissmatch = records.filter(record => record.ukSizeMissmatch)
        console.log(`ukSizeMissmatch ${ukSizeMissmatch.length}`)
        const ukSizeMissmatchQueries = ukSizeMissmatch.map(record => db.productVariant.update({ukSize: record.ukSize === "" ? null : record.ukSize}, {where: {ID: record.variant.ID}}))
        const ukSizeMissmatchBatch = utils.batchArray(ukSizeMissmatchQueries, 100)
        for (var batch of ukSizeMissmatchBatch) {
            await Promise.all(batch)
        }

        //jpSizeMissmatch
        const jpSizeMissmatch = records.filter(record => record.jpSizeMissmatch)
        console.log(`jpSizeMissmatch ${jpSizeMissmatch.length}`)
        const jpSizeMissmatchQueries = jpSizeMissmatch.map(record => db.productVariant.update({jpSize: record.jpSize === "" ? null : record.jpSize}, {where: {ID: record.variant.ID}}))
        const jpSizeMissmatchBatch = utils.batchArray(jpSizeMissmatchQueries, 100)
        for (var batch of jpSizeMissmatchBatch) {
            await Promise.all(batch)
        }

        //euSizeMissmatch
        const euSizeMissmatch = records.filter(record => record.euSizeMissmatch)
        console.log(`euSizeMissmatch ${euSizeMissmatch.length}`)
        const euSizeMissmatchQueries = euSizeMissmatch.map(record => db.productVariant.update({euSize: record.euSize === "" ? null : record.euSize}, {where: {ID: record.variant.ID}}))
        const euSizeMissmatchBatch = utils.batchArray(euSizeMissmatchQueries, 100)
        for (var batch of euSizeMissmatchBatch) {
            await Promise.all(batch)
        }

        //usmSizeMissmatch
        const usmSizeMissmatch = records.filter(record => record.usmSizeMissmatch)
        console.log(`usmSizeMissmatch ${usmSizeMissmatch.length}`)
        const usmSizeMissmatchQueries = usmSizeMissmatch.map(record => db.productVariant.update({usmSize: record.usmSize === "" ? null : record.usmSize}, {where: {ID: record.variant.ID}}))
        const usmSizeMissmatchBatch = utils.batchArray(usmSizeMissmatchQueries, 100)
        for (var batch of usmSizeMissmatchBatch) {
            await Promise.all(batch)
        }

        //uswSizeMissmatch
        const uswSizeMissmatch = records.filter(record => record.uswSizeMissmatch)
        console.log(`uswSizeMissmatch ${uswSizeMissmatch.length}`)
        const uswSizeMissmatchQueries = uswSizeMissmatch.map(record => db.productVariant.update({uswSize: record.uswSize === "" ? null : record.uswSize}, {where: {ID: record.variant.ID}}))
        const uswSizeMissmatchBatch = utils.batchArray(uswSizeMissmatchQueries, 100)
        for (var batch of uswSizeMissmatchBatch) {
            await Promise.all(batch)
        }

        //gtinMissmatch
        const gtinMissmatch = records.filter(record => record.gtinMissmatch)
        console.log(`gtinMissmatch ${gtinMissmatch.length}`)
        const gtinMissmatchQueries = gtinMissmatch.filter(record => !record.publicv.gtin).map(record => db.productVariant.update({gtin: record.gtin}, {where: {ID: record.publicvID}}))
        const gtinMissmatchBatch = utils.batchArray(gtinMissmatchQueries, 100)
        for (var batch of gtinMissmatchBatch) {
            await Promise.all(batch)
        }
        
        //price Missmatch
        const priceMissmatch = records.filter(record => record.priceMissmatch)
        console.log(`priceMissmatch ${priceMissmatch.length}`)
        const uniqueStockxProductIds = [...new Set(priceMissmatch.map(record => record.product.stockxId))]
        for (var idx=0; idx < uniqueStockxProductIds.length; idx++) {
            const stockxId = uniqueStockxProductIds[idx]
            //fetch stockx product
            console.log(`${stockxId}  (${idx}/${uniqueStockxProductIds.length})`)

            const resp1 = await axios({
                method: 'get',
                url: `https://production-stockx-api-6dwjvpqvqa-nw.a.run.app/api/products/${stockxId}`,
            })
            const stockxProduct = resp1.data

            //create task
            await axios.post('https://production-api-6dwjvpqvqa-nw.a.run.app/api/webhooks/stockx/product/updated', stockxProduct)
        }


    }

    if (fs.existsSync('./scripts/checksReports/shopify_product.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/shopify_product.csv');
        console.log(`\n\nShopify Products Report Problems ${records.length}`)
        queries = []
        productsCatalogueUpdates = true

        //missingDBProduct
        const missingDBProduct = records.filter(r => r.missingDBProduct)
        console.log(`>> Shopify Products Report - missingDBProduct ${missingDBProduct.length}`)
        const shopifySaleChannels = await db.saleChannel.findAll({where: {platform: 'Shopify'}})
        const shopifyChannelAccountIDs = shopifySaleChannels.map(sc => sc.accountID)
        //get service users
        const requests = shopifyChannelAccountIDs.map(accID=> service.account.serviceUser(accID))
        const serviceUsers = await Promise.all(requests)
        for (var record of missingDBProduct) {
            //delete record from shopify
            const shopifySC = shopifySaleChannels.find(sc => sc.shopifyStoreName == record['Shopify Store'])
            if (!process.argv.includes("production")) {
                console.log(`SKIP - RUNNING SCRIPT WITHOUT PRODUCTION ENV`)
                continue
            }

            try {
                const serviceUser = serviceUsers.find(su => su.accountID == shopifySC.accountID)
                const {shopify, shopifySession} = await service.bridge.shopify.client( shopifySC.accountID)
                const shopifyProduct = await shopify.rest.Product.find({session: shopifySession, id: record['Shopify ID']});

                await service.bridge.shopify.webhook.productCreated(serviceUser, shopifyProduct)
                await new Promise(resolve => setTimeout(resolve, 550))
            } catch (e) {
                console.log(e)
                continue
            }

        }

        /*
        //multipleDBProducts
        const multipleDBProducts = records.filter(r => r.multipleDBProducts)
        console.log(`>> Shopify Products Report - multipleDBProducts ${multipleDBProducts.length}`)
        for (var record of multipleDBProducts) {
            console.log(record.shopify.url, record.product.code)
            const [productID1, productID2] = record['Multiple DB Products IDs'].split(",")
            const inventory1 = await db.inventory.findAll({where: {productID: productID1}})
            const inventory2 = await db.inventory.findAll({where: {productID: productID2}})
            const items = await db.item.findAll({where: {productID: [productID1, productID2]}})

            console.log(productID1, productID2)
            console.log(inventory1.length)
            console.log(inventory2.length)
        }
        */

        //statusMissmatch
        const statusMissmatch = records.filter(r => r.statusMissmatch)
        console.log(`>> Shopify Products Report - statusMissmatch ${statusMissmatch.length}`)
        for (var record of statusMissmatch) {
            if (record.shopify.status == "archived") {
                const serviceUser = await service.account.serviceUser(record.product.accountID)
                const {shopify, shopifySession} = await service.bridge.shopify.client( serviceUser.accountID)
                const shopifyProduct = await shopify.rest.Product.find({session: shopifySession, id: record['Shopify ID']});
                await service.bridge.shopify.webhook.productUpdated(serviceUser, shopifyProduct)
            } else {
                queries.push(db.product.update({status: record.shopify.status},{where: {ID: record.product.ID}}))
            }
        }

        //descriptionMismatch - skip because we don't support emoji in our db rn
        /*
        const descriptionMismatch = records.filter(r => r.descriptionMismatch)
        console.log(`>> Shopify Products Report - descriptionMismatch ${descriptionMismatch.length}`)
        for (var record of descriptionMismatch) {
            queries.push(db.product.update({description: record.shopify.description},{where: {ID: record.product.ID}}))
        }
        */

        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }

    }

    // if shopifyProductReport exist - don't run these since they most likley being fixed in shopifyProductReport
    if (fs.existsSync('./scripts/checksReports/shopify_variant.csv') && !fs.existsSync('./scripts/checksReports/shopify_product.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/shopify_variant.csv');
        console.log(`Shopify Variants Report Problems ${records.length}`)
        let queries = []
        productsCatalogueUpdates = true
        // get and store shopify channels and service users - used to run shopify udpates later
        const shopifySaleChannels = await db.saleChannel.findAll({where: {platform: 'shopify'}})
        const shopifyChannelAccountIDs = shopifySaleChannels.map(sc => sc.accountID)
        const requests = shopifyChannelAccountIDs.map(accID=> service.account.serviceUser(accID))
        const serviceUsers = await Promise.all(requests)

        /*
        // multipleVariants - db variant deleted but shopify product active or draft
        const multipleVariants = []//records.filter(r => r.multipleVariants)
        console.log(`>> Shopify Variants Report - multipleVariants ${multipleVariants.length} - SKIP`)
        for (var record of multipleVariants) {
            // same product - dufferet variant ID - one variant has status deleted
            const productVariants = await db.productVariant.findAll({where: {
                foreignID: record['Shopify Variant ID'] 
            }})
            console.log(`variants found with same foreignID: ${productVariants.length}`)


            let originalVariant, duplicatedVariant

            const activeVariants = productVariants.filter(v => v.status == "active")
            if (activeVariants.length != productVariants.length) {
                console.log("Vairants have different status!")
                continue
            }

            if (productVariants[0].productID == productVariants[1].productID) {
                console.log("Vairants have same product!")
                continue
            }

            //merge variant
            //await db.inventoryListing.update({productID: originalVariant.productID, productVariantID: originalVariant.ID}, {where: {productVariantID: duplicatedVariant.ID}})
            //await db.inventory.update({productID: originalVariant.productID, productVariantID: originalVariant.ID}, {where: {productVariantID: duplicatedVariant.ID}})
            //await db.item.update({productID: originalVariant.productID, productVariantID: originalVariant.ID}, {where: {productVariantID: duplicatedVariant.ID}})
            //await db.orderLineItem.update({productID: originalVariant.productID, productVariantID: originalVariant.ID}, {where: {productVariantID: duplicatedVariant.ID}})
            //await db.jobLineItem.update({productID: originalVariant.productID, productVariantID: originalVariant.ID}, {where: {productVariantID: duplicatedVariant.ID}})
            //await db.productMatchLookup.update({productID: originalVariant.productID, productVariantID: originalVariant.ID}, {where: {productVariantID: duplicatedVariant.ID}})
            //await db.productMatchLookup.update({externalProductID: originalVariant.productID, externalProductVariantID: originalVariant.ID}, {where: {externalProductVariantID: duplicatedVariant.ID}})
            //await db.productVariant.destroy({where: {ID: duplicatedVariant.ID}})
        }
        */

        // missingDBVariant
        const missingDBVariant = records.filter(r => r.missingDBVariant)
        console.log(`>> Shopify Variants Report - missingDBVariant ${missingDBVariant.length}`)
        for (const record of missingDBVariant) {
            console.log(record['Shopify Product ID'])
            const product = await db.product.findOne({
                where: {foreignID: record['Shopify Product ID']},
                include: [
                    {model: db.productVariant, as: 'variants'}
                ]
            })
            if (!product) continue
            //if ([].includes(product.ID)) continue
            const variant = product.variants.find(v => v.name == record.shopify.title)
            await db.productVariant.update({foreignID: record.shopify.id}, {where: {ID: variant.ID}})
            console.log(product.ID, record['Shopify Product ID'], variant.ID, variant.foreignID, record.shopify.id)
        }

        // nameMismatch - send the variant name to shopify
        const nameMismatch = records.filter(r => r.nameMismatch)
        console.log(`>> Shopify Variants Report - nameMismatch ${nameMismatch.length}`)
        for (var record of nameMismatch) {
            if (configs.environment != 'prod') {
                console.log(`SKIP SYNC SHOPIFY PROD`)
                continue
            }

            const shopifyStoreName = new URL(record.shopify.url).hostname.split('.')[0];
            const shopifySalechannel = shopifySaleChannels.find(sc => sc.shopifyStoreName == shopifyStoreName)
            try {
                const serviceUser = serviceUsers.find(user => user.accountID == shopifySalechannel.accountID)
                // get shopify client and session
                const {shopify, shopifySession} = await service.bridge.shopify.client( shopifySalechannel.accountID)
                const shopifyVariant = new shopify.rest.Variant({session: shopifySession});
                shopifyVariant.id = record.shopify.id;
                shopifyVariant.title= record.variant.name
                shopifyVariant.option1= record.variant.name
                await shopifyVariant.save({update: true});

                await new Promise((resolve) => setTimeout(resolve, 550))
            } catch (e) {
                console.log(e.response)
            }
        }

        // untrackedMissmatch - 
        const untrackedMissmatch = records.filter(r => r.untrackedMissmatch)
        console.log(`>> Shopify Variants Report - untrackedMissmatch ${untrackedMissmatch.length}`)
        for (var record of untrackedMissmatch) {
            queries.push(db.productVariant.update({untracked: record.shopify.untracked == "YES"}, {where: {ID: record.variant.ID}}))
        }

        //missingImage
        const missingImage = records.filter(r => r.missingImage)
        console.log(`>> Shopify Variants Report - missingImage ${missingImage.length}`)
        for (var idx=0; idx < missingImage.length; idx ++) {
            const record = missingImage[idx]
            if (configs.environment != 'prod') {
                console.log(`SKIP SYNC SHOPIFY PROD`)
                continue
            }

            console.log(`>> Shopify Variants Report - missingImage ${idx} ${record.shopify.id} ${record.sproduct.image.id}`)

            const shopifyStoreName = new URL(record.shopify.url).hostname.split('.')[0];
            const shopifySalechannel = shopifySaleChannels.find(sc => sc.shopifyStoreName == shopifyStoreName)
            const serviceUser = serviceUsers.find(user => user.accountID == shopifySalechannel.accountID)
            const {shopify, shopifySession} = await service.bridge.shopify.client(serviceUser.accountID)
            try {
                // get shopify client and session
                const shopifyVariant = new shopify.rest.Variant({session: shopifySession});
                shopifyVariant.id = record.shopify.id;
                shopifyVariant.image_id= record.sproduct.image.id
                await shopifyVariant.save({update: true});

                await new Promise((resolve) => setTimeout(resolve, 550))
            } catch (e) {
                console.log(e)
            }
        }
        
        //gtinMissmatch
        const gtinMissmatch = records.filter(r => r.gtinMissmatch)
        console.log(`>> Shopify Variants Report - gtinMissmatch ${gtinMissmatch.length}`)
        for (var idx=0; idx < gtinMissmatch.length; idx ++) {
            const record = gtinMissmatch[idx]
            if (configs.environment != 'prod') {
                console.log(`SKIP SYNC SHOPIFY PROD`)
                continue
            }
            console.log(`>> Shopify Variants Report - gtinMissmatch ${idx} ${record.shopify.id} ${record.variant.gtin}`)


            const shopifyStoreName = new URL(record.shopify.url).hostname.split('.')[0];
            const shopifySalechannel = shopifySaleChannels.find(sc => sc.shopifyStoreName == shopifyStoreName)
            const serviceUser = serviceUsers.find(user => user.accountID == shopifySalechannel.accountID)
            try {
                // get shopify client and session
                const {shopify, shopifySession} = await service.bridge.shopify.client( serviceUser.accountID)
                const shopifyVariant = new shopify.rest.Variant({session: shopifySession});
                shopifyVariant.id = record.shopify.id;
                shopifyVariant.barcode= record.variant.gtin
                await shopifyVariant.save({update: true});

                await new Promise((resolve) => setTimeout(resolve, 550))
            } catch (e) {
                console.log(e)
            }
        }

        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (fs.existsSync('./scripts/checksReports/algoliaProductReport.csv')) {
        productsCatalogueUpdates = true
    }

    if (fs.existsSync('./scripts/checksReports/itemsReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/itemsReport.csv');
        console.log(`\n\nItems Report Problems ${records.length}`)
        queries = []

        //itemMissingInboundOrderLineItem
        const itemsMissingInboundOrderLineItem = records.filter(r => r.itemMissingInboundOrderLineItem == 1)
        console.log(`>> Items Report - Items Missing Inbound Order Line Items ${itemsMissingInboundOrderLineItem.length}`)
        // if item not linked to any order - delete it
        const itemsNotLinkedToAnything = itemsMissingInboundOrderLineItem.filter(r => r.inboundOrdersAssociated == 0 && r.outboundOrdersAssociated == 0 && r.transferInOrdersAssociated == 0)
        await db.item.destroy({where: {ID: itemsNotLinkedToAnything.map(r => r.itemID)}})

        // itemInventoryLocationMissmatch
        const itemInventoryLocationMissmatch = records.filter(r => r.itemInventoryLocationMissmatch == 1)
        console.log(`>> Items Report - itemInventoryLocationMissmatch ${itemInventoryLocationMissmatch.length}`)
        for (var record of itemInventoryLocationMissmatch) {

            await db.item.update({warehouseID: record.inventoryWarehouseID}, {where: {ID: record.itemID}})
        }


        // itemProductAccountMissmatch - 
        const itemProductAccountMissmatch = records.filter(r => r.itemProductAccountMissmatch)
        console.log(`>> Items Report - itemProductAccountMissmatch ${itemProductAccountMissmatch.length}`)
        for (var record of itemProductAccountMissmatch) {
            //check if exist products with the same code in the correct account
            let accountProducts = await db.product.findAll({
                where: {
                    accountID: record.accountID,
                    code: record.product.code
                },
                include: [
                    {model: db.productVariant, as: 'variants'}
                ]
            })

            if (accountProducts.length == 0) {
                console.log(`Account ${record.accountID} doesn't have product ${record.product.code} - generating it`)
                continue
            } else if (accountProducts.length > 1) {
                if (record.productID == 73617) {
                    accountProducts = accountProducts.filter(p => p.ID == 75611)
                } else {
                    console.log(`Account ${record.accountID} have ${accountProducts.length} products with code ${record.product.code}: (${accountProducts.map(p => p.ID).join(",")})`)
                    continue
                }
            }

            //product found - find variant
            let correctVariant = accountProducts[0].variants.find(v => utils.areVariantsEqual(v.name, record.variant.name))

            if (!correctVariant) {
                switch (record.variantID) {
                    case '665446':
                        correctVariant = accountProducts[0].variants.find(v => v.ID == 692923)
                        break;
                    case '37801': //need to generate the variant
                        const serviceUser = await service.account.serviceUser(accountProducts[0].accountID)
                        correctVariant = await service.product.createVariants(serviceUser, accountProducts[0].ID, [{            
                            productID: accountProducts[0].ID,
                            name: "UK 11- EU 46- US 12",
                            weight: 0.1,
                            volume: 0.1,
                            position: 16,
                            }])
                        break;
                    default:
                        console.log(`Product ${accountProducts[0].code} (${accountProducts[0].ID}) - doesn't have variant ${record.variant.name} (${record.variantID})`)
                        continue
                }
            }

            queries.push(db.item.update({
                productID: correctVariant.productID, 
                productVariantID: correctVariant.ID}, 
            {where: {ID: record['itemID']}}))
        }

        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (fs.existsSync('./scripts/checksReports/inventoryReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/inventoryReport.csv');
        console.log(`\n\nInventory Report Records ${records.length}`)

        //inventoryQuantityItemsMissmatch - set items quantity
        const inventoryQuantityItemsMissmatch = records.filter(record => record.inventoryQuantityItemsMissmatch)
        console.log(`>>Inventory Report - Inventory Items Quantity Missmatch ${inventoryQuantityItemsMissmatch.length}`)
        for (var record of inventoryQuantityItemsMissmatch) {
            await db.inventory.update({quantity: record['Items Quantity']}, {where: {ID: record.inventoryID}})
        }

        //inventoryQuantityItemsMissmatch - set items quantity
        const virtualInventoryQuantityMissmatch = records.filter(record => record.virtualInventoryQuantityMissmatch)
        console.log(`>>Inventory Report - Inventory Items Quantity Missmatch ${virtualInventoryQuantityMissmatch.length}`)
        for (var record of virtualInventoryQuantityMissmatch) {
            await db.inventory.update({quantity: 0}, {where: {ID: record.inventoryID}})
        }

        // virtualInventoryDuplicateRecords
        const virtualInventoryDuplicateRecords = records.filter(record => record.virtualInventoryDuplicateRecords)
        console.log(`>>Inventory Report - Duplicate Virtual Inventory Records ${virtualInventoryDuplicateRecords.length}`)
        const queriesVirtualInventoryDuplicateRecords = []
        const inventoryRecordsForVirtualInventoryDuplicateRecords = await db.inventory.findAll({
            where: {productVariantID: virtualInventoryDuplicateRecords.map(record => record.variant.ID), virtual: 1},
            include: [
                {model: db.inventoryListing, as: 'listings'}
            ]
        })
        for (var record of virtualInventoryDuplicateRecords) {
            const inventoryRecords = inventoryRecordsForVirtualInventoryDuplicateRecords.filter(r => r.productVariantID == record.variant.ID && r.accountID ==record['accountID'])
            //get only with quantity 10
            const matches = inventoryRecords.filter(r => r.quantity == 10)
            if (matches.length > 1) {
                const inventoryWithoutListings = matches.filter(r => r.listings.length == 0)
                if (inventoryWithoutListings.length > 0) {
                    queriesVirtualInventoryDuplicateRecords.push(db.inventory.destroy({where: {ID: inventoryWithoutListings.map(record => record.ID)}}))
                    continue
                }
                const stockxSyncedRecord = matches.find(r => r.listings[0].priceSourceName != null)
                if (stockxSyncedRecord) {
                    // if stockx synced record exist, remove the ones not synced
                    queriesVirtualInventoryDuplicateRecords.push(db.inventory.destroy({where: {ID: matches.filter(record => record.ID != stockxSyncedRecord.ID).map(record => record.ID)}}))
                } else {
                    queriesVirtualInventoryDuplicateRecords.push(db.inventory.destroy({where: {ID: matches.slice(1).map(record => record.ID)}}))
                }
            } else if (matches.length == 1){
                console.log(`Destory ${inventoryRecords.filter(r => r.ID != matches[0].ID).map(r => r.ID)}`)
                // if 1 record with qty = 10 - delete all inventory records besides the one with quantity 10
                queriesVirtualInventoryDuplicateRecords.push(db.inventory.destroy({where: {ID: inventoryRecords.filter(r => r.ID != matches[0].ID).map(r => r.ID)}}))
            } else {
                console.log(`Destory ${inventoryRecords.slice(1).map(r => r.ID)}`)
                // if 0 records with qty = 10 - delete all inventory records besides the first one
                queriesVirtualInventoryDuplicateRecords.push(db.inventory.destroy({where: {ID: inventoryRecords.slice(1).map(r => r.ID)}}))
            }
        }
        await Promise.all(queriesVirtualInventoryDuplicateRecords)

        // inventoryProductAccountMissmatch - 
        const inventoryProductAccountMissmatch = records.filter(record => record.inventoryProductAccountMissmatch)
        console.log(`>>Inventory Report - inventoryProductAccountMissmatch Records ${inventoryProductAccountMissmatch.length}`)
        for (var inventory of inventoryProductAccountMissmatch) {
            //check if exist products with the same code in the correct account
            let accountProducts = await db.product.findAll({
                where: {
                    accountID: inventory.accountID,
                    code: inventory.product.code
                },
                include: [
                    {model: db.productVariant, as: 'variants'}
                ]
            })

            if (accountProducts.length == 0) {
                console.log(`Account ${inventory.accountID} doesn't have product ${inventory.product.code}`)
                continue
            } else if (accountProducts.length > 1) {
                if (inventory.product.ID == 73617) {
                    accountProducts = accountProducts.filter(p => p.ID == 75611)
                } else {
                    console.log(`Account ${inventory.accountID} have ${accountProducts.length} products with code ${inventory.product.code}: (${accountProducts.map(p => p.ID).join(",")})`)
                    continue
                }
            }

            //product found - find variant
            let correctVariant = accountProducts[0].variants.find(v => utils.areVariantsEqual(v.name, inventory.variant.name))

            if (!correctVariant) {
                if (inventory.variant.ID == 665446) {
                    correctVariant = accountProducts[0].variants.find(v => v.ID == 692923)
                } else {
                    console.log(`Product ${accountProducts[0].code} (${accountProducts[0].ID}) - doesn't have variant ${inventory.variant.name} (${inventory.variant.ID})`)
                    continue
                }
            }

            queries.push(db.inventory.update({productID: correctVariant.productID, variantID: correctVariant.ID}, {where: {ID: inventory['inventoryID']}}))
        }

        // variantLinkedToWrongProduct - the inventory.productVariantID doesn't belong to the inventory.productID
        const variantLinkedToWrongProduct = records.filter(record => record['variantLinkedToWrongProduct'])
        console.log(`>>Inventory Report - variantLinkedToWrongProduct ${variantLinkedToWrongProduct.length}`)
        for (var inventory of variantLinkedToWrongProduct) {
            console.log("")
            if (inventory.accountID != inventory.product.accountID) {
                console.log("WRONG PRODUCT - TODO")
                continue
            }

            console.log(`>> inventory.variant.productID ${inventory.variant.productID} inventory.productID ${inventory.product.ID}`)
            //get variants of the correct product
            const inventoryProduct = await db.product.findOne({
                where: {
                    ID: inventory.product.ID
                },
                include: [
                    {model: db.productVariant, as: 'variants'}
                ]
            })
            const inventoryVariantProduct = await db.product.findOne({
                where: {
                    ID: inventory.variant.productID
                },
            })

            if (inventoryProduct.code.trim().toLowerCase() != inventoryVariantProduct.code.trim().toLowerCase()) {
                console.log(`inventory.product.code != inventory.variant.product.code | ${inventoryProduct.code} != ${inventoryVariantProduct.code}`)
                continue
            }

            let matchVariant = inventoryProduct.variants.find(v => utils.areVariantsEqual(v.name, inventory.variant.name))

            if (!matchVariant) {
                switch (inventory.variant.ID) {
                    case '665446': //UK 5 - EU 38.5 US 7.5W
                        matchVariant = await db.productVariant.findOne({where: {ID: 692923}})
                        break;
                    default:
                        //case '37801': // (UK 11- EU 46- US 12) productID: 75360 - MISSIN EU 46!!
                        console.log(`ATTENTION - Impossible to manually match variantID (${inventory.variant.ID}) ${inventory.variant.name} variant to right variant on productID ${inventory.product.ID}`)
                        continue
                }

            }

            console.log(`>> inventory.productID         ${inventory.product.ID}  => ${inventoryProduct.ID}`)
            console.log(`>> inventory.variant.productID ${inventory.variant.productID}  => ${matchVariant.productID}`)
            console.log(`>> inventory.variant.name      ${inventory.variant.name}  => ${matchVariant.name}`)
            console.log("")

            await db.inventory.update({productVariantID: matchVariant.ID}, {where: {ID: inventory.inventoryID}})
        }
    }

    if (fs.existsSync('./scripts/checksReports/listingsReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/listingsReport.csv');
        console.log(`Inventory Listings Report Records ${records.length}`)
        queries = []

        //listingPriceMissmatch
        const listingPriceMissmatch = records.filter(record => record['listingPriceMissmatch'])
        console.log(`>>Inventory Listings Report - listingPriceMissmatch ${listingPriceMissmatch.length}`)
        for (var invListing of listingPriceMissmatch) {
            queries.push(db.inventoryListing.update({price: invListing.listingPriceComputed}, {where: {ID: invListing.inventoryListingID}}))
        }

        //payoutHigherThanPrice - recompute price from payout
        const payoutHigherThanPrice = records.filter(record => record.payoutHigherThanPrice)
        console.log(`>>Inventory Listings Report - payoutHigherThanPrice ${payoutHigherThanPrice.length}`)
        payoutHigherThanPrice.map(record => queries.push(db.inventoryListing.update({price: record.payout}, {where: {ID: record.inventoryListingID}})))

        //price@0 - set listing to draft
        const listingsPricedAt0 = records.filter(record => record['price@0'])
        console.log(`>>Inventory Listings Report - listingsPricedAt0 ${listingsPricedAt0.length}`)
        listingsPricedAt0.map(record => queries.push(db.inventoryListing.update({status: 'drafted'}, {where: {ID: record.inventoryListingID}})))

        //duplicateListing - 
        const duplicateListing = records.filter(record => record['duplicateListing'])
        console.log(`>>Inventory Listings Report - duplicateListing ${duplicateListing.length}`)
        for (var invListing of duplicateListing) {
            console.log("")
            const records = await db.inventoryListing.findAll({
                where: {
                    accountID: invListing.accountID, 
                    saleChannelID: invListing.saleChannel.ID, 
                    inventoryID: invListing.inventoryID
                },
                include: [
                    {model: db.product, as: 'product'},
                    {model: db.inventory, as: 'inventory'}
                ]
            })

            console.log(records.map(record => record.ID))

            if (records.length == 1) {
                continue
            } else {
                const prices = records.map(record => parseFloat(record.price))
                const highestNumber = Math.max(...prices);
                const indexOfHighestNumber = prices.indexOf(highestNumber);
                const listingRecordsToRemove = records.filter(record => record.ID != records[indexOfHighestNumber].ID)
                queries.push(db.inventoryListing.destroy({where: {ID: listingRecordsToRemove.map(record => record.ID)}}))
            }
        }

        // saleChannelProductAccountMissmatch  - listing has a product that doesn't belong to the sale channel on which the listing is on
        const saleChannelProductAccountMissmatch = records.filter(record => record['saleChannelProductAccountMissmatch'])
        console.log(`>>Inventory Listings Report - saleChannelProductAccountMissmatch ${saleChannelProductAccountMissmatch.length}`)
        for (var listing of saleChannelProductAccountMissmatch) {
            let correctAccountProduct = await db.product.findAll({
                where: {
                    code: listing.product.code,
                    accountID: listing.saleChannel.accountID
                },
                include: [
                    {model: db.productVariant, as: 'variants'}
                ]
            })

            if (correctAccountProduct.length != 1) {
                if (listing.product.ID == 54081) {
                    await db.inventoryListing.destroy({where: {productID: listing.product.ID, saleChannelID: listing.saleChannel.ID}})
                } else if (listing.product.ID == 84832) {
                    correctAccountProduct = correctAccountProduct.filter(p => p.ID == 82680)
                }
                else {
                    console.log(`More ${correctAccountProduct.length} products available for accountID ${listing.saleChannel.accountID} and product code ${listing.product.code} (${listing.product.ID})`)
                    continue
                }
            }

            let correctVariant = correctAccountProduct[0].variants.find(variant => utils.areVariantsEqual(variant.name, listing.variant.name))
            if (!correctVariant) {
                if (listing.variant.ID == 796027) {
                    correctVariant = correctAccountProduct[0].variants.find(v => v.ID == 420228)
                } else {
                    console.log(`Impossible to find variant ${listing.variant.name} (${listing.variant.ID}) on productID ${correctAccountProduct[0].ID}`)
                    continue
                }
            }

            console.log(`>> moving listing (productID,variantID) ${listing.product.ID},${listing.variant.ID} => ${correctAccountProduct[0].ID},${correctVariant.ID}`)

            queries.push(db.inventoryListing.update({productID: correctAccountProduct[0].ID, productVariantID: correctVariant.ID}, {where: {ID: listing.inventoryListingID}}))
        }

        //marketPriceError - set listing to draft
        const marketPriceError = records.filter(record => record['marketPriceError'])
        console.log(`>>Inventory Listings Report - marketPriceError ${marketPriceError.length}`)
        marketPriceError.map(record => queries.push(db.inventoryListing.update({payout: record['marketPriceComputed'], price: record['marketPriceComputed']}, {where: {ID: record.inventoryListingID}})))

        // variantLinkedToWrongProduct - the listing.productVariantID doesn't belong to the listing.productID
        const variantLinkedToWrongProduct = records.filter(record => record['variantLinkedToWrongProduct'])
        console.log(`>>Inventory Listings Report - variantLinkedToWrongProduct ${variantLinkedToWrongProduct.length}`)
        for (var invListing of variantLinkedToWrongProduct) {
            console.log("")

            console.log(`>> invListing.variant.productID ${invListing.variant.productID} invListing.productID ${invListing.product.ID}`)
            //get variants of the correct product
            const invListingProduct = await db.product.findOne({
                where: {
                    ID: invListing.product.ID
                },
                include: [
                    {model: db.productVariant, as: 'variants'}
                ]
            })

            const invListingVariantProduct = await db.product.findOne({
                where: {
                    ID: invListing.variant.productID
                },
            })

            if (invListingProduct.code.trim().toLowerCase() != invListingVariantProduct.code.trim().toLowerCase()) {
                console.log(`invListing.product.code != invListing.variant.product.code | ${invListingProduct.code} != ${invListingVariantProduct.code}`)
                continue
            }

            let matchVariant = invListingProduct.variants.find(v => utils.areVariantsEqual(v.name, invListing.variant.name))
            
            if (!matchVariant) {
                console.log(`Impossible to manually match variantID ${invListing.variant.ID} variant to right variant on productID ${invListing.product.ID}`)
                switch (inventory.variant.ID) {
                    case '42265': //UK 5 - EU 38.5 US 7.5W
                        matchVariant = await db.productVariant.findOne({where: {ID: 680308}})
                        break;
                    default:
                        //case '37801': // (UK 11- EU 46- US 12) productID: 75360 - MISSIN EU 46!!
                        continue
                }

            }

            console.log(`>> inventory.productID         ${invListing.product.ID}  => ${invListingProduct.ID}`)
            console.log(`>> inventory.variant.productID ${invListing.variant.productID}  => ${matchVariant.productID}`)
            console.log(`>> inventory.variant.name      ${invListing.variant.name}  => ${matchVariant.name}`)
            console.log("")

            await db.inventoryListing.update({productVariantID: matchVariant.ID}, {where: {ID: invListing.inventoryListingID}})
        }

        //missingVariantMatch
        const missingVariantMatchScenario1 = records.filter(record => record['missingVariantMatch'] && !record['deadListing'])
        console.log(`>>Inventory Listings Report - missingVariantMatchScenario1 ${missingVariantMatchScenario1.length}`)
        for (var invListing of missingVariantMatchScenario1) {
            const body = {
                accountID: invListing.accountID,
                productID: invListing.inventory.productID,
                productVariantID: invListing.inventory.variantID,
                externalAccountID: invListing.saleChannel.accountID,
                externalProductID: invListing.product.ID,
                externalProductVariantID: invListing.variant.ID,
            }
            await db.productMatchLookup.findOrCreate({defaults: body, where: body})
        }

        /*
        // if listing variant is deleted - try to move it to an active one if the product has been re-created
        const missingVariantMatchScenario2 = records.filter(record => record['missingVariantMatch'] && record['deadListing'])
        console.log(`>>Inventory Listings Report - missingVariantMatchScenario2 ${missingVariantMatchScenario2.length}`)
        for (var invListing of missingVariantMatchScenario2) {
            const body = {
                accountID: invListing.accountID,
                productID: invListing.inventory.productID,
                productVariantID: invListing.inventory.variantID,
                externalAccountID: invListing.saleChannel.accountID,
                externalProductID: invListing.product.ID,
                externalProductVariantID: invListing.variant.ID,
            }

            const existingRecord = await db.productMatchLookup.findOne({
                where: {productVariantID: invListing.inventory.variantID},
                include: [
                    {model: db.productVariant, as: 'variant', include: [
                        {model: db.product, as: 'product'}
                    ]},
                    {model: db.productVariant, as: 'externalVariant', include: [
                        {model: db.product, as: 'product'}
                    ]},
                ]
            })
            if (!existingRecord) {
                await db.productMatchLookup.findOrCreate({defaults: body, where: body})
            } else {
                console.log(`>> existingRecord for ${invListing.inventory.variant.name} (${invListing.inventory.variantID}) | ${existingRecord.variant.name} => ${existingRecord.externalVariant.name} (${existingRecord.variant.ID},${existingRecord.externalVariant.ID})`)
                // the variant in the match record is linked to a different product than the product on the listing
                if (invListing.product.ID != existingRecord.externalVariant.productID) {
                    console.log(`>> existingRecord is linked to a different product than the product on the listing`)
                    console.log(`${invListing.product.ID} => ${existingRecord.externalVariant.productID}`)
                    console.log(`${invListing.product.code} => ${existingRecord.externalVariant.product.code}`)
                    console.log(`${invListing.product.status} => ${existingRecord.externalVariant.product.status}`)
                    if (invListing.product.code.trim().toLowerCase() == existingRecord.externalVariant.product.code.trim().toLowerCase() && invListing.product.status == "deleted" && existingRecord.externalVariant.product.status == "active") {
                        console.log(`>> product on the listing has been replaced with the same product and is active - migrate`)

                        const invOldProduct = await db.inventory.findAll({
                            where: {productID: invListing.product.ID},
                        })

                        // if some stock left in the old product, move it to the new product
                        if (invOldProduct.length != 0) {
                            const oldDeletedProduct = await db.product.findOne({
                                where: {ID: invListing.product.ID},
                                include: [
                                    {model: db.productVariant, as: 'variants'}
                                ]
                            })
                            const newProduct = await db.product.findOne({
                                where: {ID: existingRecord.externalVariant.productID},
                                include: [
                                    {model: db.productVariant, as: 'variants'}
                                ]
                            })
                            for (var oldProductVariant of oldDeletedProduct.variants) {
                                const newProductVariant = newProduct.variants.find(v => utils.areVariantsEqual(oldProductVariant.name, v.name))
                                if (!newProductVariant) {
                                    console.log(`ATTENTION - impossible to find new variant for variant ${oldProductVariant.name}`)
                                    continue
                                }
                                await db.item.update({productID: newProductVariant.productID, productVariantID: newProductVariant.ID}, {where: {productVariantID: oldProductVariant.ID}})
                                await db.inventory.update({productID: newProductVariant.productID, productVariantID: newProductVariant.ID}, {where: {productVariantID: oldProductVariant.ID}})
                                await db.orderLineItem.update({productID: newProductVariant.productID, productVariantID: newProductVariant.ID}, {where: {productVariantID: oldProductVariant.ID}})
                            }
                        }
                        await db.productMatchLookup.destroy({where: {externalProductID: invListing.product.ID}})
                        await db.inventoryListing.update({productID: existingRecord.externalVariant.productID, productVariantID: existingRecord.externalVariant.ID}, {where: {ID: invListing.inventoryListingID}})
                    }
                } 
            }
        }

        //deadListing
        const deadListings = records.filter(record => record['deadListing'])
        console.log(`>>Inventory Listings Report - deadListings ${deadListings.length}`)
        for (var invListing of deadListings) {
            if (invListing.product.ID != 10791) {
                continue
            }
            console.log(invListing.product.ID)
            //if listing.product deleted - check if exist a duplicated product active
            if (invListing.product.status == "deleted" && invListing.inventory.product.status == "active") {
                const existingActiveProduct = await db.product.findOne({
                    where: {accountID: invListing.product.accountID, code: invListing.product.code, status: "active"},
                    include: [
                        {model: db.productVariant, as: 'variants'}
                    ]
                })
                if (existingActiveProduct) {
                    console.log(`Active product exist move ${invListing.product.code} => ${existingActiveProduct.code} | (${invListing.product.ID} => ${existingActiveProduct.ID})`)
                    const deletedProduct = await db.product.findOne({
                        where: {ID: invListing.product.ID},
                        include: [
                            {model: db.productVariant, as: 'variants'}
                        ]
                    })
                    for (var deletedProductVariant of deletedProduct.variants) {
                        const newProductVariant = existingActiveProduct.variants.find(v => utils.areVariantsEqual(deletedProductVariant.name, v.name))
                        if (!newProductVariant) {
                            console.log(`ATTENTION - impossible to find new variant for variant ${deletedProductVariant.name} - deleting listing and match`)
                            await db.inventoryListing.destroy({where: {productVariantID: deletedProductVariant.ID}})
                            await db.productMatchLookup.destroy({where: {externalProductVariantID: deletedProductVariant.ID}})
                            continue
                        }
                        await db.productMatchLookup.update({externalProductID: newProductVariant.productID, externalProductVariantID: newProductVariant.ID}, {where: {externalProductVariantID: deletedProductVariant.ID}})
                        await db.inventoryListing.update({productID: newProductVariant.productID, productVariantID: newProductVariant.ID}, {where: {ID: invListing.inventoryListingID}})
                    }
                }
            } else if (invListing.product.status == "deleted" && invListing.inventory.product.status == "deleted") {
                // products on both accounts are deleted. Check if has inventory
            }


            //queries.push(db.inventoryListing.update({productVariantID: correctVariant.ID}, {where: {ID: invListing.inventoryListingID}}))
        }
        */

        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (fs.existsSync('./scripts/checksReports/orderLineItemsReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/orderLineItemsReport.csv');
        console.log(`Order Line Items Report Problems ${records.length}`)
        queries = []

        //productAccountIDMissmatch [case1] - consignment transfer problem
        const productAccountIDMissmatchTransfer = records.filter(record => record['productAccountIDMissmatch'] && record['order yype'] == 'transfer-out')
        console.log(`>>Order Line Items Report - productAccountIDMissmatch [case1] ${productAccountIDMissmatchTransfer.length}`)
        for (var record of productAccountIDMissmatchTransfer) {
            const expectedProductAccountID = record['oli accountID']
            const match = await db.productMatchLookup.findOne({
                where: {productVariantID: record['variant ID'], externalAccountID: expectedProductAccountID},
                include: [
                    {model: db.productVariant, as: 'externalVariant'}
                ]
            })
            if (!match) {
                console.log(record)
                console.log("ops somethign went wrong")
                return
            }

            queries.push(db.orderLineItem.update({
                productID: match.externalVariant.productID, 
                productVariantID: match.externalVariant.ID}, 
            {where: {ID: record['oliID']}}))
        }

        //productAccountIDMissmatch [case2] - accoutn inbounded item but product is of edit ldn
        const productAccountIDMissmatchInbound = records.filter(record => record['productAccountIDMissmatch'] && record['product accountID'] == 3)
        console.log(`>>Order Line Items Report - productAccountIDMissmatch [case2] ${productAccountIDMissmatchInbound.length}`)
        for (var record of productAccountIDMissmatchInbound) {
            console.log(record['variant ID'])
            const correctAccountID = record['oli accountID']
            const match = await db.productMatchLookup.findAll({
                where: {externalProductVariantID: record['variant ID']},
                include: [
                    {model: db.productVariant, as: 'variant', include: [
                        {model: db.product, as: 'product'}
                    ]}
                ]
            })
            const variants = await db.productVariant.findAll({
                where: {ID: match.map(m => m.productVariantID)},
                include: [
                    {model: db.product, as: 'product'}
                ]
            })

            const correctVariant = variants.find(variant => variant.product.accountID == correctAccountID)
            if (!correctVariant) {
                console.log(`${record['product code']} - ${record['variant name']} for accountID ${correctAccountID} doesn't exist`)
                continue
            }
            queries.push(db.orderLineItem.update({
                productID: correctVariant.productID, 
                productVariantID: correctVariant.ID}, 
            {where: {ID: record['oliID']}}))
        }

        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (fs.existsSync('./scripts/checksReports/stripeTransactionsReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/stripeTransactionsReport.csv');

        // fix quantity and/or prices missmatch - by re-sync
        const stripeTxStatusMissmatch = records.filter(record => record['statusMissmatch'])
        console.log(`>> Stripe Transactions Report - Tx to re-sync ${stripeTxStatusMissmatch.length}`)
        let i = 0
        for (let record of stripeTxStatusMissmatch){
            const taskId = uuidv1()
            console.log(`${taskId} - ${i}/${stripeTxStatusMissmatch.length}`)
            await service.gcloud.addTask(
                'api-jobs',
                'POST',
                `https://production-api-6dwjvpqvqa-nw.a.run.app/api/webhooks/stripe/payout/updated`,
                null,
                taskId,
                {
                    account: 'acct_1KRbEbHLPsP0JKdR',
                    data: {
                        object: {
                            id: record['Stripe tx ID'],
                            status: record['Stripe status']
                        }
                    }
                })
            i += 1
        }

        //import missing transactions
        const stripeTxMissing = records.filter(record => record['missingDBTx'])
        console.log(`>> Stripe Transactions Report - Tx Missing ${stripeTxMissing.length}`)
    }
    
    if (fs.existsSync('./scripts/checksReports/stripeAccountsReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/stripeAccountsReport.csv');
        console.log(`Stripe Accounts Report Problems ${records.length}`)
        queries = []

        //missingAccountOnStripe
        const missingAccountOnStripe = records.filter(record => record.missingAccountOnStripe)
        console.log(`>>Stripe Accounts Report - missingAccountOnStripe ${missingAccountOnStripe.length}`)
        await db.account.update({stripeAccountID: null}, {where: {ID: missingAccountOnStripe.map(record => record.account.ID)}})

        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (fs.existsSync('./scripts/checksReports/transactionsReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/transactionsReport.csv');
        console.log(`Transactions Report Problems ${records.length}`)
        queries = []

        //wrongDestinationAccountID
        const wrongDestinationAccountID = records.filter(record => record.wrongDestinationAccountID)
        console.log(`>>Transactions Report - wrongDestinationAccountID ${wrongDestinationAccountID.length}`)
        for (var record of wrongDestinationAccountID) {
            queries.push(db.transaction.update({fromAccountID: record.tx.toAccountID, toAccountID: null}, {where: {ID: record.tx.ID}}))
        }

        //missingGatewayForStripeTx
        const missingGatewayForStripeTx = records.filter(record => record.missingGatewayForStripeTx)
        console.log(`>>Transactions Report - missingGatewayForStripeTx ${missingGatewayForStripeTx.length}`)
        await db.transaction.update({gateway: 'stripe'}, {where: {ID: missingGatewayForStripeTx.map(record => record.tx.ID)}})

        //txStripeTxStatusMissmatch
        const txStripeTxStatusMissmatchCase1 = records.filter(record => record.txStripeTxStatusMissmatch && record.stripeTx.status == "failed" && record.tx.status == "paid")
        console.log(`>>Transactions Report - txStripeTxStatusMissmatchCase1 ${txStripeTxStatusMissmatchCase1.length}`)
        for (var record of txStripeTxStatusMissmatchCase1) {
            queries.push(service.transaction.update(null, record.tx.ID, {status: "reverted"}))
        }

        const txStripeTxStatusMissmatchCase2 = records.filter(record => record.txStripeTxStatusMissmatch && record.stripeTx.status == "paid" && record.tx.status == "processing")
        console.log(`>>Transactions Report - txStripeTxStatusMissmatchCase2 ${txStripeTxStatusMissmatchCase2.length}`)
        for (var record of txStripeTxStatusMissmatchCase2) {
            const serviceUser = await service.account.serviceUser(record.tx.fromAccountID)
            queries.push(service.transaction.update(serviceUser, record.tx.ID, {status: "paid"}))
        }

        const txStripeTxStatusMissmatchCase3 = records.filter(record => record.txStripeTxStatusMissmatch && record.stripeTx.status == "paid" && record.tx.status == "canceled")
        console.log(`>>Transactions Report - txStripeTxStatusMissmatchCase3 ${txStripeTxStatusMissmatchCase3.length}`)
        for (var record of txStripeTxStatusMissmatchCase3) {
            const serviceUser = await service.account.serviceUser(record.tx.fromAccountID)
            queries.push(service.transaction.update(serviceUser, record.tx.ID, {status: "paid"}))
        }

        const txStripeTxStatusMissmatchCase4 = records.filter(record => record.txStripeTxStatusMissmatch && record.stripeTx.status == "paid" && record.tx.status == "unpaid")
        console.log(`>>Transactions Report - txStripeTxStatusMissmatchCase4 ${txStripeTxStatusMissmatchCase4.length}`)
        for (var record of txStripeTxStatusMissmatchCase4) {
            const serviceUser = await service.account.serviceUser(record.tx.fromAccountID)
            queries.push(service.transaction.update(serviceUser, record.tx.ID, {status: "paid"}))
        }

        //0amountShippingTx
        const amount0ShippingTx = records.filter(record => record['0amountShippingTx'])
        console.log(`>>Transactions Report - 0amountShippingTx ${amount0ShippingTx.length}`)
        await db.transaction.destroy({where: {ID: amount0ShippingTx.map(record => record.tx.ID)}})
        
        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (fs.existsSync('./scripts/checksReports/invoicesReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/invoicesReport.csv');
        queries = []
        // totalAmountOwedStatusMissmatch [case 1] - totalAmountOwed == 0 && order not refunded or canceled - invoice should be settled
        let totalAmountOwedStatusMissmatch = records.filter(record => record['totalAmountOwedStatusMissmatch'] && !["refunded", "deleted"].includes(record['order status']))
        console.log(`>> Invoices Report - totalAmountOwedStatusMissmatch [case 1] ${totalAmountOwedStatusMissmatch.length}`)
        await Promise.all(totalAmountOwedStatusMissmatch.map(record => db.invoice.update({statusID: 25}, {where: {ID: record['invoiceID']}})))

        // totalAmountOwedStatusMissmatch [case 2] - totalAmountOwed == 0 && order refunded or canceled - invoice should be voided 
        totalAmountOwedStatusMissmatch = records.filter(record => record['totalAmountOwedStatusMissmatch'] && ["refunded", "deleted"].includes(record['order status']))
        console.log(`>> Invoices Report - totalAmountOwedStatusMissmatch [case 2] ${totalAmountOwedStatusMissmatch.length}`)
        await Promise.all(totalAmountOwedStatusMissmatch.map(record => db.invoice.update({statusID: 24}, {where: {ID: record['invoiceID']}})))

        // statusCompletedAtMissmatch [case 1] - invoice settled or voided but missing completedAt
        let statusCompletedAtMissmatch = records.filter(record => record['statusCompletedAtMissmatch'] && record['status'] != 'created')
        console.log(`>> Invoices Report - statusCompletedAtMissmatch [case 1] ${statusCompletedAtMissmatch.length}`)
        statusCompletedAtMissmatch.map(record => queries.push(db.invoice.update({completedAt: moment(record['updatedAt'])}, {where: {ID: record['invoiceID']}})))

        // statusCompletedAtMissmatch [case 2] - invoice not (settled and voided) but completedAt set
        statusCompletedAtMissmatch = records.filter(record => record['statusCompletedAtMissmatch'] && record['status'] == 'created')
        console.log(`>> Invoices Report - statusCompletedAtMissmatch [case 2] ${statusCompletedAtMissmatch.length}`)
        await db.invoice.update({completedAt: null}, {where: {ID: statusCompletedAtMissmatch.map(record => record['invoiceID'])}})
        /*

        // case 1 invoiceStatusOrderStatusMissmatch - invoice voided but order status is not deleted and totalAmountOwed == 0 => set invoice as settled
        let invoiceOrderStatusesMissmatch = records.filter(record => record['invoiceStatusOrderStatusMissmatch'] && record['status'] == 'voided' && record['totalAmountOwed'] == 0 && (record['order status'] != 'deleted'))
        await db.invoice.update({statusID: 25}, {where: {ID: invoiceOrderStatusesMissmatch.map(record => record['invoiceID'])}})
        console.log(`>> Invoices Report - invoiceOrderStatusesMissmatch [case 1] ${invoiceOrderStatusesMissmatch.length}`)

        // case 2 invoiceStatusOrderStatusMissmatch - invoice settled but order status is deleted
        invoiceOrderStatusesMissmatch = records.filter(record => record['invoiceStatusOrderStatusMissmatch'] && record['status'] == 'settled' && (record['order status'] == 'deleted') && record['totalAmountOwed'] == 0)
        await db.invoice.update({statusID: 24}, {where: {ID: invoiceOrderStatusesMissmatch.map(record => record['invoiceID'])}})
        console.log(`>> Invoices Report - invoiceOrderStatusesMissmatch [case 2] ${invoiceOrderStatusesMissmatch.length}`)
        */

        // totalAmountOwedTxAmountMissmatch - exist tx but totalAmountPaid not updated
        let totalAmountOwedTxAmountMissmatch = records.filter(record => record['totalAmountOwedTxAmountMissmatch'])
        console.log(`>> Invoices Report - totalAmountOwedTxAmountMissmatch ${totalAmountOwedTxAmountMissmatch.length}`)
        totalAmountOwedTxAmountMissmatch.map(record => {
            const newTotalAmountOwed = parseFloat(record.totalAmountOwed) - parseFloat(record.txTotalAmount)
            queries.push(db.invoice.update({totalAmountOwed: newTotalAmountOwed < 0 ? 0 : newTotalAmountOwed}, {where: {ID: record['invoiceID']}}))
        })

        // totalAmountMissmatch
        let totalAmountMissmatch = records.filter(record => record['totalAmountMissmatch'])
        console.log(`>> Invoices Report - totalAmountMissmatch ${totalAmountMissmatch.length}`)
        totalAmountMissmatch.map(record => {
            queries.push(db.invoice.update({totalAmount: record['orderTotalAmount']}, {where: {ID: record['invoiceID']}}))
        })

        // totalAmountOwedTxAmountTotalAmountMissmatch [case 1] -  
        let totalAmountOwedTxAmountTotalAmountMissmatch = records.filter(record => record['totalAmountOwedTxAmountTotalAmountMissmatch'])
        console.log(`>> Invoices Report - totalAmountOwedTxAmountTotalAmountMissmatch ${totalAmountOwedTxAmountTotalAmountMissmatch.length}`)
        totalAmountOwedTxAmountTotalAmountMissmatch.map(record => {
            const diff = parseFloat(record['orderTotalAmount']) - parseFloat(record['txTotalAmount'])
            queries.push(db.invoice.update({totalAmountOwed: diff}, {where: {ID: record['invoiceID']}}))
        })

        const queriesBatch = apiUtils.batchArray(queries, 500)
        for (var batch of queriesBatch) {
            await Promise.all(batch)
        }
        console.log(`>> Invoices Report - DONE`)
    }

    if (fs.existsSync('./scripts/checksReports/accountsReport.csv')) {
        const records = await csv().fromFile('./scripts/checksReports/accountsReport.csv');
        console.log(`Accounts Report Problems ${records.length}`)
        queries = []

        const querieBatches = utils.batchArray(queries, 500)
        for (var batch of querieBatches) {
            await Promise.all(batch)
        }
    }

    if (productsCatalogueUpdates && process.argv.includes("production")) {
        await service.bridge.typesense.productsIndex.addOrUpdate()
    }

    console.log("DONE")
}

async function mergeProducts(mergeProductID, mergeIntoProductID) {
    console.log(`Merge product ${mergeProductID} into ${mergeIntoProductID}`)
    const mergeFromProduct = await db.product.findOne({
        where: {ID: mergeProductID},

        include: [
            {model: db.productVariant, as: 'variants'}
        ]
    })
    const mergeIntoProduct = await db.product.findOne({
        where: {ID: mergeIntoProductID},
        include: [
            {model: db.productVariant, as: 'variants'}
        ]
    })

    //remove duplicate variants - TODO: return the match to use to replace
    const variantsToDelete = []
    const variantsToReplaceWith = [] // IDs of the variants from mergeIntoProduct to be used to replace the variants in variantsToDelete
    mergeIntoProduct.variants.map(v2 => {
        const v1Match = mergeFromProduct.variants.find(v1 => {
            const euSize1 = (v1.name.split("-").find(c => c.trim().toLowerCase().includes("eu")) || '').toLowerCase().replace("eu", "").trim()
            const euSize2 = (v2.euSize || '').trim().toLowerCase().replace("eu", "").trim() // since synced wth stockx
            const euMatch = (euSize1 != null && euSize1 == euSize2)

            const usSize1 = (v1.name.split("-").find(c => c.trim().toLowerCase().includes("us")) || '').toLowerCase().replace("us", "").trim()
            const usSize2 = (v2.usSize || '').trim().toLowerCase().replace("us", "").trim()
            const usMatch = (usSize1 != null && usSize1 == usSize2)
            return euMatch || usMatch
        })

        if (v1Match) {
            variantsToDelete.push(v1Match)
            variantsToReplaceWith.push(v2)
        }
    })

    //move all variants left from product 2 to product 1
    const variantsToMove = mergeFromProduct.variants.filter(v1 => !variantsToDelete.find(v => v.ID == v1.ID))

    variantsToMove.map(variant => console.log(`MOVE - ${variant.name}`))
    variantsToDelete.map(variant => console.log(`REMOVE - ${variant.name}`))
    console.log("")

    // update records accordingly. Update and delete variantsToDelete, Update product for variants to move
    //>>Update and delete variantsToDelete
    let idx = 0
    for (var i = 0;i < variantsToDelete.length; i++) {
        const replacingVariant = variantsToReplaceWith[i]
        await db.item.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
        await db.inventory.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
        await db.inventoryListing.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
        await db.jobLineItem.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
        await db.orderLineItem.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
    }

    await db.productMatchLookup.destroy({where: {productVariantID: variantsToDelete.map(v => v.ID)}})
    await db.productMatchLookup.destroy({where: {externalProductVariantID: variantsToDelete.map(v => v.ID)}})
    await db.productVariant.destroy({where: {ID: variantsToDelete.map(v => v.ID)}})
    
    //>>Update product for variants to move
    await db.item.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.inventory.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.inventoryListing.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.jobLineItem.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.orderLineItem.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.productVariant.update({productID: mergeIntoProduct.ID}, {where: {ID: variantsToMove.map(v => v.ID)}})

    await db.product.destroy({where: {ID: mergeFromProduct.ID}})
}


async function deleteOrder(orderID) {
    const order = await db.order.findOne({
        where: {
            ID: orderID,
        },
        include: [
            {model: db.productVariant, as: 'variants'}
        ]
    })
    const mergeIntoProduct = await db.product.findOne({
        where: {ID: mergeIntoProductID},
        include: [
            {model: db.productVariant, as: 'variants'}
        ]
    })

    //remove duplicate variants - TODO: return the match to use to replace
    const variantsToDelete = []
    const variantsToReplaceWith = [] // IDs of the variants from mergeIntoProduct to be used to replace the variants in variantsToDelete
    mergeIntoProduct.variants.map(v2 => {
        const v1Match = mergeFromProduct.variants.find(v1 => {
            const euSize1 = (v1.name.split("-").find(c => c.trim().toLowerCase().includes("eu")) || '').toLowerCase().replace("eu", "").trim()
            const euSize2 = (v2.euSize || '').trim().toLowerCase().replace("eu", "").trim() // since synced wth stockx
            const euMatch = (euSize1 != null && euSize1 == euSize2)

            const usSize1 = (v1.name.split("-").find(c => c.trim().toLowerCase().includes("us")) || '').toLowerCase().replace("us", "").trim()
            const usSize2 = (v2.usSize || '').trim().toLowerCase().replace("us", "").trim()
            const usMatch = (usSize1 != null && usSize1 == usSize2)
            return euMatch || usMatch
        })

        if (v1Match) {
            variantsToDelete.push(v1Match)
            variantsToReplaceWith.push(v2)
        }
    })

    //move all variants left from product 2 to product 1
    const variantsToMove = mergeFromProduct.variants.filter(v1 => !variantsToDelete.find(v => v.ID == v1.ID))

    variantsToMove.map(variant => console.log(`MOVE - ${variant.name}`))
    variantsToDelete.map(variant => console.log(`REMOVE - ${variant.name}`))
    console.log("")

    // update records accordingly. Update and delete variantsToDelete, Update product for variants to move
    //>>Update and delete variantsToDelete
    let idx = 0
    for (var i = 0;i < variantsToDelete.length; i++) {
        const replacingVariant = variantsToReplaceWith[i]
        await db.item.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
        await db.inventory.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
        await db.inventoryListing.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
        await db.jobLineItem.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
        await db.orderLineItem.update({productID: mergeIntoProduct.ID, productVariantID: replacingVariant.ID}, {where: {productVariantID: variantsToDelete[i].ID}})
    }

    await db.productMatchLookup.destroy({where: {productVariantID: variantsToDelete.map(v => v.ID)}})
    await db.productMatchLookup.destroy({where: {externalProductVariantID: variantsToDelete.map(v => v.ID)}})
    await db.productVariant.destroy({where: {ID: variantsToDelete.map(v => v.ID)}})
    
    //>>Update product for variants to move
    await db.item.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.inventory.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.inventoryListing.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.jobLineItem.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.orderLineItem.update({productID: mergeIntoProduct.ID}, {where: {productVariantID: variantsToMove.map(v => v.ID)}})
    await db.productVariant.update({productID: mergeIntoProduct.ID}, {where: {ID: variantsToMove.map(v => v.ID)}})

    await db.product.destroy({where: {ID: mergeFromProduct.ID}})
}

async function importShopifyOrder(id, storename) {
    const saleChannel =  await db.saleChannel.findOne({where:{shopifyStoreName: storename}})
    const orderFound = await db.order.findOne({where: {foreignID: id}})

    const serviceUser = await service.account.serviceUser(editShopifySalesChannel.accountID)
    const {shopify, shopifySession} = await service.bridge.shopify.client( editShopifySalesChannel.accountID)


    const shopifyOrder =  await shopify.rest.Order.find({session: shopifySession, id: id,});

    if (orderFound){
        console.log('This order is already on the platform!!!')
        return
    }

    await service.bridge.shopify.webhook.orderCreated(serviceUser, shopifyOrder)
}

async function deleteProduct(ID, accountID) {


    const product = await db.product.findOne({
        where :{ID: ID},
        include: [
            {model: db.productVariant, as: 'variants', where: {status: 'active'}}
        ]
    })

    if(product.accountID != accountID){
        console.log("This product does not belong to this account")
        return
    }


    const serviceUser = await service.account.serviceUser(product.accountID)

    for (let variant of product.variants){
        await service.product.deleteVariant(serviceUser,variant.ID)
    }
    await service.product.update(serviceUser,product.ID, {status: "deleted", imageReference: '', untracked: false})
    //delete records on productLookUp where productID = ID
    await db.productMatchLookup.destroy({where: {productID: ID}})

}

async function nukeInventory(accountID) {
    await db.inventory.destroy({where: {accountID: accountID}})
    await db.item.destroy({where: {accountID: accountID}})
    await db.orderLineItem.destroy({where: {accountID: accountID}})
    await db.order.destroy({where: {accountID: accountID}})
}


async function nukeProduct() {
    const productCodes = ['SO33G100','SO33A100','SO33M100','SO33P100','SO33J100','SO33T100','SO33M101','SO33R100','SO33C100',
        'SO33L100']

    const variants = await db.productVariant.findAll({
        include: [{
            model: db.product,
            as: 'product',
            where: {code: productCodes}
        }, {
            model: db.inventory,
            as: 'inventory',
            where: {quantity: {[Op.gt]: 0}},
            include: [
                {model: db.item, as: 'items'},
                {model: db.warehouse, as: 'warehouse', include: [{model: db.account, as: 'account'}]}
            ]
        }]
    })
    console.log(variants.length)
    for (let variant of variants){
        for (let inventoryRecord of variant.inventory){
            if (inventoryRecord.warehouseID != null && inventoryRecord.warehouse.account.ID != 3 ){
                //console.log(inventoryRecord.warehouse.account.ID)
                 const userAccount = await service.account.serviceUser(inventoryRecord.accountID)
                 await service.inventory.unstock(userAccount, [ {inventoryID: inventoryRecord.ID, quantity: inventoryRecord.quantity}])
                console.log(inventoryRecord.quantity)
            }
            else if (inventoryRecord.warehouseID == null){
                //console.log(inventoryRecord.ID)
            }
        }
    }
}

async function costPatching() {
    let serviceUser = await service.account.serviceUser(3)
    const records = await csv().fromFile('./scripts/checksReports/costPatch.csv');
    const notParsable = []
    const indexedReport = []
    console.log(records[0])
    let index =  0
    for (let record of records){
        record['ID'] = index
        record['notParseable'] = false
        record['orderRef'] = null
        record['deleted'] = null
        record['weird'] = null
        let rawName =  record.name.split('-')
        if (rawName[0].includes('#')){
            let orderRef = Array.from(rawName[0].trim())
            orderRef.splice(0,1)
            orderRef = orderRef.join('')
            record['orderRef'] = orderRef
            const orders =  await db.order.findAll({where: {reference1: orderRef, accountID: 3, typeID: 4}, include: [{model: db.orderLineItem, as: 'orderLineItems', include:[{model: db.product, as: 'product'}, {model: db.productVariant, as: 'variant'}, {model: db.item, as: 'item'}]}]})
            if(orders.length != 1) {
                record['notParseable'] = true
                notParsable.push(record)
            }else{
                const order = orders[0]
                let orderLineItemFound = []
                if(order.statusID == 3){
                    record['deleted'] = true
                    record['notParseable'] = true
                    notParsable.push(record)
                }
                else{
                    order.orderLineItems.map(oli => {
                        let mappedProd = record.name.toLowerCase().includes(oli.product.title.toLowerCase())
                        let mappedVariant = record.name.toLowerCase().includes(oli.variant.name.toLowerCase())
                        if (mappedProd && oli.item.accountID == 3 && oli.statusID != 3){
                            orderLineItemFound.push(oli)
                        }
                    })
                    if(order.orderLineItems.length == 1 && orderLineItemFound.length != 1){
                        orderLineItemFound.push(order.orderLineItems[0])
                    }
                    if(orderLineItemFound.length != 1) {
                        record['weird'] = true
                        record['notParseable'] = true
                        notParsable.push(record)
                    }
                    if(orderLineItemFound.length == 1){
                        let cost = record.cost.replace(',', '').trim()
                        cost = Array.from(cost)
                        if(cost.length> 0){
                            cost.splice(0,1)
                            cost = cost.join('')
                            cost = (Number(cost)).toFixed(2)
                            console.log(record.ID,record.cost )
                            await service.orderLineItem.update(serviceUser, orderLineItemFound[0].ID, {cost: cost}  )
                        }
                        else{
                            record['weird'] = true
                            record['notParseable'] = true
                            notParsable.push(record)
                        }

                    }

                }

            }
        }
        else {
            record['notParseable'] = true
            notParsable.push(record)
        }
        indexedReport.push(record)
        index ++
    }
    console.log('Not doable ->',notParsable.length)
    console.log('Parsed ->',records.length - notParsable.length)

    let parsedCSV = new objectsToCsv(indexedReport)
    await parsedCSV.toDisk(`./scripts/reports/originalIndex.csv`)

    parsedCSV = new objectsToCsv(notParsable)
    await parsedCSV.toDisk(`./scripts/reports/notParseable.csv`)
}

async function addShopifyOrderLineItem(orderForeignID, lineItemID, delta = 1 ) {
    const serviceUser = await service.account.serviceUser(3)
    //fetch order
    const shopifySaleChannel = await db.saleChannel.findOne({where: {ID: 1}})
    // get shopify client and session
    const {shopify, shopifySession} = await service.bridge.shopify.client( shopifySaleChannel.accountID)
    const shopifyOrder= await shopify.rest.Order.find({session: shopifySession, id: orderForeignID,});
    console.log(shopifyOrder)
    console.log('Shopify Order ID: ',shopifyOrder.id)
    const lineItemAdded = shopifyOrder.line_items.find(line_item =>  line_item.id == lineItemID)
    console.log('Added line_item : ',lineItemAdded)
    // trigger webhook
    console.log("trigger shopify webhook to add shopify order line_ item")
    try {

        //     shopifyOrder: {
        //         id: order.foreignID,
        //             shipping_address: {
        //             "first_name": "test name",
        //                 "address1": "test address",
        //                 "phone": "0000873654",
        //                 "city": "london",
        //                 "zip": "00azh",
        //                 "country": "uk",
        //                 "last_name": "test surname",
        //                 "address2": "00",
        //                 "latitude": null,
        //                 "longitude": null
        //         },
        //         line_items: [
        //             {
        //                 "id": 768312548757563,
        //                 "variant_id": addedInvRecord.variant.foreignID,
        //                 "quantity": 1,
        //                 "vendor": null,
        //                 "product_id": addedInvRecord.product.ID,
        //                 "grams": addedInvRecord.product.weight * 1000,
        //                 "price":addedInvRecord.price,
        //             }
        //         ]
        //     },
        //     orderEditContent: {
        //         line_items: {
        //             additions: [
        //                 {
        //                     id: 768312548757563,
        //                     delta: 1
        //                 }
        //             ]
        //         }
        //     }
    
        const resp2 = await axios({
            headers: {
                'Authorization': `Bearer ${serviceUser.apiKey}`,
            },
            method: 'POST',
            url: apiUrl + `api/bridge/ingress/shopify/order/edited`,

            data: {
                shopifyOrder: shopifyOrder,
                orderEditContent: {
                    line_items: {
                        additions: [
                            {
                                id: lineItemID,
                                delta: delta
                            }
                        ]
                    }
                }
            }
        })
        console.log('SUCCESS')
    } catch (e) {
        console.log(e.response.config.body.orderEditContent)
    }

}

//Updates banks account synced to stripe for all connected accounts on the plaform
async function syncStripeBanking() {
    const editAccount =  await db.account.findOne({where: {ID: 3}})
    const stripe = require('stripe')(editAccount.stripeAPIKey)
    //const accounts_linked = await db.account.findAll({where: {stripeID: {[Op.ne]: null}, ID: 163}})
     const accounts_linked = await db.account.findAll({where: {stripeID: {[Op.ne]: null}, ID: {[Op.ne]: 3}}})
    console.log('START iterating accounts')
    for ( let account of accounts_linked){
        try{
            let stripeAccount = await stripe.accounts.retrieve(account.stripeID);
            if (stripeAccount.external_accounts.total_count > 1 ) console.log(`Account ID ${account.ID} MULTIPLE ACCOUNTS `)
            if (stripeAccount.external_accounts.data[0].id != account.defaultStripeDestinationID) {
                console.log(`Account ID ${account.ID} INCORRECT BANKING`)
                await db.account.update({defaultStripeDestinationID: stripeAccount.external_accounts.data[0].id}, {where: {ID: account.ID}})
            }
        }
        catch (e) {
            console.log('Issue with account ID: ', account.ID ,' - ', account.name)
            //console.log('some error', e)
        }


    }
    console.log('DONE iterating accounts')


    console.log('Accounts Linked: ', accounts_linked.length)

}


async function editShopifyInventorySync(){
    const currentTime = moment(new Date())
    let fromTime = currentTime.subtract(17,'minutes');
    //format time for query filtering
    fromTime = fromTime.format('YYYY-MM-DD hh:mm:ss')
    const editShopifySalesChannelID = 1
    const shopifySaleChannel = await db.saleChannel.findOne({
        where: {
            ID: editShopifySalesChannelID
        },
        include: [
            {model: db.transactionRate, as: 'fees'}
        ]
    })

    //get service user of the account with shopName matching
    const serviceUser = await service.account.serviceUser(shopifySaleChannel.accountID)
    // get shopify client and session
    const {shopify, shopifySession} = await service.bridge.shopify.client( shopifySaleChannel.accountID)

    // Fetch shopify variants
    const shopifyAPIUrl = shopifySaleChannel.shopifyAPIAuth
    const shopifyVariants = []
    const startCheckDate = new Date() ;

    console.log('SHOPIFY_INVENTORY_SYNC: Fetching Shopify Variants')


    const productsCount = (await shopify.rest.Product.count({session: shopifySession})).count
    let shopifyProducts = await utils.getShopifyProducts(shopifySaleChannel.accountID, true)
    const shopifyProductsActiveDraft = shopifyProducts.filter(prod => (prod.status == 'active' || prod.status == "draft") && (!prod.tags.includes('wiredhub-untracked'))) // remove archived products
    shopifyProductsActiveDraft.map(product => product.variants.map(variant => shopifyVariants.push(variant)))

    console.log('Fetching Inventory Listings')
    // Fetch inventory listings
    let dbInventoryListings = await db.inventoryListing.findAll({
        where: {
            saleChannelID: editShopifySalesChannelID,
        },
        include: [
            {model: db.product, as: 'product'},
            {model: db.productVariant, as: 'variant'},
            {model: db.inventory, as: 'inventory'},
        ]
    })
    console.log(dbInventoryListings.length)

    const inventoryListingLookupByForeignVariantID = {}
    const lookupShopifyProductByID = {}

    //Group shopify products by id
    shopifyProducts.map(sprod => {
        const key = `${sprod.id}`
        lookupShopifyProductByID[key] = sprod
    })

    // Group inventory listings by variant foreign ID to be sorted later
    dbInventoryListings
        //.filter(listing => (listing.saleChannelID in lookupSaleChannelByID))
        .filter(listing => listing.status == 'active')
        .filter(listing => listing.inventory.quantity > 0)
        .filter(listing => listing.variant.foreignID).map(listing => {
        //Compute prices for listings and store them as object attribute
        listing['price'] = parseFloat(listing['price'])
        const key = `${listing.variant.foreignID}`
        if (key in inventoryListingLookupByForeignVariantID) {
            inventoryListingLookupByForeignVariantID[key].push(listing)
        } else {
            inventoryListingLookupByForeignVariantID[key] = [listing]
        }
    })


    console.log('SHOPIFY_INVENTORY_SYNC: selecting listings for variants')
    // select inventory for each variant
    for (var key in inventoryListingLookupByForeignVariantID) {
        const invListingRecords = inventoryListingLookupByForeignVariantID[key]
        let sortedInvListingRecords = invListingRecords.sort((a, b) => {

            if (parseFloat(a.price) > parseFloat(b.price)) return 1
            if (parseFloat(a.price) < parseFloat(b.price)) return -1

            // if same price, sort by updatedAt:asc
            if (a.updatedAt > b.updatedAt) return 1
            if (a.updatedAt < b.updatedAt) return -1
        })

        const firstRecordWithQtyIdx = sortedInvListingRecords.findIndex(listing => listing.inventory.quantity > 0)
        inventoryListingLookupByForeignVariantID[key] = sortedInvListingRecords[firstRecordWithQtyIdx != -1 ? firstRecordWithQtyIdx : 0]
    }

    const variantsToUpdate = new Set()
    const errors = {
        'priceMissmatch': false,
        'quantityMissmatch': false,
        'selling@0': false,
    }


    for (let _shopifyVariant of shopifyVariants){

        let selectedInventoryListing = inventoryListingLookupByForeignVariantID[`${_shopifyVariant.id}`]
        const lastUpdated = Math.floor((Math.abs(startCheckDate - new Date(_shopifyVariant.updated_at))/1000)/60)

        // if(_shopifyVariant.id == '43002737230072'){
        //     console.log(selectedInventoryListing)
        //     console.log(_shopifyVariant.price)
        //     console.log(selectedInventoryListing )
        //     console.log((Math.abs(selectedInventoryListing.price - _shopifyVariant.price) > 2) )
        //     console.log(_shopifyVariant.inventory_quantity > 0 )
        //     //console.log(lastUpdated > 10)
        // }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errors))

        //Price mismatch - only if shopify variant has quantity > 0
        if (selectedInventoryListing && ( Math.abs(selectedInventoryListing.price - _shopifyVariant.price) > 2) && _shopifyVariant.inventory_quantity > 0 ){
            // console.log('priceMissmatch', selectedInventoryListing.price, _shopifyVariant.price, selectedInventoryListing.productVariantID)
            errorsRecord['priceMissmatch'] = true
        }

        // quantity mismatch
        else if ((selectedInventoryListing && selectedInventoryListing.inventory.quantity != _shopifyVariant.inventory_quantity) || (_shopifyVariant.inventory_quantity > 0 && !selectedInventoryListing ) ){
            // console.log('quantityMissmatch ', selectedInventoryListing.inventory.quantity , _shopifyVariant.inventory_quantity, selectedInventoryListing.productVariantID)
            errorsRecord['quantityMissmatch'] = true
        }

        //selling at 0
        if (_shopifyVariant.price == 0 && _shopifyVariant.quantity > 0){
            //console.log('selling@0')
            errorsRecord['selling@0'] = true
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true && selectedInventoryListing) {
            variantsToUpdate.add(selectedInventoryListing.productVariantID)
        }
    }

    console.log(`Shopify Variant SYNC missmatches ${variantsToUpdate.size}`)
    let tasks = []
    let vidx = 0
    for (const variantID of Array.from(variantsToUpdate)) {
        tasks.push(service.gcloud.addTask('shopify-jobs', 'POST', `${configs.microservices.api}/api/bridge/egress/shopify/variant/sync`, {provenance: 'fixes/sync-inventory'}, null, {
            variantID: variantID
        }))
        vidx +=1
        //console.log(variantID)
    }
    console.log(Array.from(variantsToUpdate))
    console.log(`SHOPIFY_INVENTORY_SYNC: Tasks Generated ${tasks.length}`)
    console.log(`SHOPIFY_INVENTORY_SYNC: Task total time elapsed ${Math.floor((Math.abs(startCheckDate - new Date())/1000)/60)} minutes`)
}

//create a function to fetch and log a shopify product by ID
async function fetchShopifyProductByID(shopifyProductID) {
    const editShopifySalesChannelID = 1
    const shopifySaleChannel = await db.saleChannel.findOne({where: {ID: editShopifySalesChannelID}})

    const serviceUser = await service.account.serviceUser(shopifySaleChannel.accountID)
    // get shopify client and session
    const {shopify, shopifySession} = await service.bridge.shopify.client( shopifySaleChannel.accountID)
    // Fetch shopify variants
    const shopifyAPIUrl = shopifySaleChannel.shopifyAPIAuth
    console.log(shopifyAPIUrl)


    // Calculate the datetime for 20 minutes ago
    const updatedAtMin = moment().subtract(20, 'minutes').toISOString();



    let resp = await shopify.rest.Product.all({session: shopifySession, updated_at_min: updatedAtMin});


    //let resp = await axios.get(shopifyAPIUrl + `products/${shopifyProductID}.json`)
    console.log(resp.data)
}

// create a function to fetch some variant inventory
async function fetchAccountProductMatches(accountID) {
    let matches = await db.productMatchLookup.findAll({where: {accountID}, include: [{model: db.product, as: 'product'}, {model: db.productVariant, as: 'variant'}, {model: db.productVariant, as: 'externalVariant'}, {model: db.product, as: 'externalProduct'}]})
    for (let match of matches) {
        console.log(`${match.product.title} | ${match.product.code} | ${match.variant.name} <===========> ${match.externalProduct.title} | ${match.externalProduct.code} | ${match.externalVariant.name}`)
    }
}

//create a function that will fetch all the variants from stock x and will update the matching variants on the database matching by stockxId
async function syncStockXVariantSizeCharts() {
    // fetch stockx products
    const stockxProducts = await utils.getStockxProducts()
    //create an array of variants from stockx products
    const stockxVariants = stockxProducts.map(product => product.variants).flat()
    //fetch all the variants from the database that have a stockxId
    const dbVariants = await db.productVariant.findAll({
        where: {
            stockxId: {[Op.not]: null},
        }, include: [{model: db.product, as: 'product', required: true, where: {public: true}}]
    })
    //log how many variants are in the database
    console.log('public db variants', dbVariants.length)
    //create a map of stockx variants by stockxId
    const stockxVariantsMap = stockxVariants.reduce((acc, variant) => {
        acc[variant.stockxId] = variant
        return acc
    }
    , {})

    const variantsToUpdate = []

    //cycle through all the db variants and update the size chart from matching stock x variant
    for (const dbVariant of dbVariants) {

        const stockxVariant = stockxVariantsMap[dbVariant.stockxId]


        if(!stockxVariant) {
            console.log('no stockx variant found for ', dbVariant.stockxId)
            continue
        }

        // create an if consition to crosscheck the following attributes across the db variant and the stockx variant: 'usSize','ukSize','euSize','jpSize', 'usmSize', 'uswSize'
        if ((dbVariant.usSize != stockxVariant.usSize) || (dbVariant.ukSize != stockxVariant.ukSize) || (dbVariant.euSize != stockxVariant.euSize) || (dbVariant.jpSize != stockxVariant.jpSize) || (dbVariant.usmSize != stockxVariant.usmSize) || (dbVariant.uswSize != stockxVariant.uswSize)){
            //log the size charts that dont match
            console.log('size chart missmatch', dbVariant.ID, dbVariant.usSize, stockxVariant.usSize, dbVariant.ukSize, stockxVariant.ukSize, dbVariant.euSize, stockxVariant.euSize, dbVariant.jpSize, stockxVariant.jpSize, dbVariant.usmSize, stockxVariant.usmSize, dbVariant.uswSize, stockxVariant.uswSize)
            //if any of the attributes are different, add the variant to the variantsToUpdate array
            variantsToUpdate.push(dbVariant.update({usSize:stockxVariant.usSize, ukSize:stockxVariant.ukSize, euSize:stockxVariant.euSize, jpSize:stockxVariant.jpSize, usmSize:stockxVariant.usmSize, uswSize:stockxVariant.uswSize}, {where: {ID: dbVariant.ID}}))
        }
    }

    console.log(variantsToUpdate.length)

    //process varianrsToUpdate array in batches of 100
    // await Promise.all(utils.chunkArray(variantsToUpdate, 100).map(async (chunk) => {
    //     await Promise.all(chunk)
    // }))
    console.log('StockX Variant Size Charts Synced')
}

async function removeUnusedAddresses() {
   //fetch all the addresses from the database
    const addresses = await db.address.findAll()
    //fetch all the orders from the database
    const orders = await db.order.findAll()
    //fetch all the accounts from the database
    const accounts = await db.account.findAll()
    //fetch all the fulfilments from the database
    const fulfillments = await db.fulfillment.findAll()
    //fetch all the warehouses from the database
    const warehouses = await db.warehouse.findAll()

    //create maps

    //create a map of orders by consignorID
    const ordersByConsignorID = orders.reduce((acc, order) => {
        if (!acc[order.consignorID]) acc[order.consignorID] = []
        acc[order.consignorID].push(order)
        return acc
    }, {})

    const ordersByConsigneeID = orders.reduce((acc, order) => {
        if (!acc[order.consignorID]) acc[order.consignorID] = []
        acc[order.consignorID].push(order)
        return acc
    }, {})

    //create a map of accounts by billingAddressID
    const accountsByBillingAddressID = accounts.reduce((acc, account) => {
        if (!acc[account.billingAddressID]) acc[account.billingAddressID] = []
        acc[account.billingAddressID].push(account)
        return acc
    }, {})

    //create a map of fulfillments by originAddressID
    const fulfillmentsByOriginAddressID = fulfillments.reduce((acc, fulfillment) => {
        if (!acc[fulfillment.originAddressID]) acc[fulfillment.originAddressID] = []
        acc[fulfillment.originAddressID].push(fulfillment)
        return acc
    } , {})

    //create a map of fulfillments by destinationAddressID
    const fulfillmentsByDestinationAddressID = fulfillments.reduce((acc, fulfillment) => {
        if (!acc[fulfillment.destinationAddressID]) acc[fulfillment.destinationAddressID] = []
        acc[fulfillment.destinationAddressID].push(fulfillment)
        return acc
    } , {})

    //create a map of warehouses by addressID
    const warehousesByAddressID = warehouses.reduce((acc, warehouse) => {
        if (!acc[warehouse.addressID]) acc[warehouse.addressID] = []
        acc[warehouse.addressID].push(warehouse)
        return acc
    } , {})



    const addressesToDelete = []

    //cycle through the addresses
    for (const address of addresses) {
        //check if the address is used in any order
        const addressUsedInOrder = ordersByConsignorID[address.ID] || ordersByConsigneeID[address.ID]
        //check if the address is used in any account
        const addressUsedInAccount =  accountsByBillingAddressID[address.ID]
        //check if the address is used in any fulfilment
        const addressUsedInFulfillment =  fulfillmentsByOriginAddressID[address.ID] || fulfillmentsByDestinationAddressID[address.ID]
        //check if the address is used in any warehouse
        const addressUsedInWarehouse = warehousesByAddressID[address.ID]

        //if the address is not used in any order, account, fulfilment or warehouse, add the address to the addressesToDelete array
        if(!addressUsedInOrder && !addressUsedInAccount && !addressUsedInFulfillment && !addressUsedInWarehouse) {
            //add the address to the addressesToDelete array
            addressesToDelete.push(address)
        }
    }

    const updates = []
    //cycle through the addressesToDelete array
    for (const address of addressesToDelete) {
        updates.push(db.address.destroy({where: {ID: address.ID}}))
    }

    //process updates array in batches of 100
    //TODO: RUN ON PRODUCTION

    // const batchedUpdates = utils.batchArray(updates,100)
    // await utils.processBatchedRequests(batchedUpdates)

}
main()
