const db = require('../libs/db')
const Op = require('sequelize').Op;
const logger=require('../libs/logger.js')
const service = require('./main')
const utils = require('../libs/utils')
const configs = require('../configs')
const moment = require('moment')
const axios = require('axios')
const JSZip = require("jszip");

exports.runScheduler = async (forceTimestamp, forceWorkflowName) => {
    /**
     * This function is used to schedule and run all the workflows
     */
    const currentTimestamp = forceTimestamp ? moment(forceTimestamp) : moment()

    if (configs.environment == "prod" && (forceTimestamp || forceWorkflowName)) {
        throw {status: 403, message: `You can override default behaviour only on dev environment`}
    }

    const workflows = [
        {name: 'sale-order/created',           runAt: '*/15 * * * *'},
        {name: 'sale-order/pending-reminder',  runAt: '0 * * * *'},
        {name: 'sale-order/fulfill-reminder',  runAt: '0 * * * *'},
        {name: 'inventory/upload-reminder',    runAt: '0 * * * *'},
        {name: 'invoice-virtual-stock',        runAt: '0 0 1 * *'},
        {name: 'milanostoreReport',            runAt: '0 21 * * *'}, //every day at 21
        {name: 'account-report/disconnected-listing', runAt: '0 0 1,15 * *'}, // day 1 and 15 of each month
        //TODO: uuncomment when frontend ready {name: 'account-report/new-product-uploads', runAt: '0 0 * * 0'}, //run every sunday at midnight
        {name: 'account-report/best-selling-products', runAt: '0 0 * * 0'}, //run every sunday at midnight
        //TODO: uuncomment when frontend ready {name: 'account-report/stock-levels',   runAt: '0 0 * * 0'}, //run every sunday at midnight
        {name: 'accountsKPIsReport',         runAt: '0 1 * * 6'}, //run every saturday at 1:00 am
        {name: 'syncShopifyInventoryAndPrices',runAt: '*/30 * * * *'}, //run every 30 minutes
        {name: 'reconcileStripePaymentsCaptured',runAt: '*/30 * * * *'}, //run every 30 minutes
        {name: 'lacedSync',                    runAt: '0 */2 * * *'}, // run every 6 hours
        {name: 'editLDNVirtualStockReport',    runAt: '0 0 1,15 * *'}, // run day 1 and 15 of each month
    ]

    let workflowsNamesToRun = []
    for (const workflow of workflows) {
        if (workflow.runAt == "0 0 1 * *" && currentTimestamp.minutes() == 0 && currentTimestamp.hours() == 0 && currentTimestamp.date() == 1) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "0 * * * *" && currentTimestamp.minutes() == 0) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "*/15 * * * *" && currentTimestamp.minutes() % 15 == 0) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "0 0 * * 1" && currentTimestamp.minutes() == 0 && currentTimestamp.hours() == 0 && currentTimestamp.day() == 1) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "0 0 1,15 * *" && currentTimestamp.minutes() == 0 && currentTimestamp.hours() == 0 && ([1,15].includes(currentTimestamp.date()))) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "0 0 * * 0" && currentTimestamp.minutes() == 0 && currentTimestamp.hours() == 0 &&  currentTimestamp.date() == 0) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "0 4 * * 1,3,5" && currentTimestamp.minutes() == 0 && currentTimestamp.hours() == 4 && ([1,3,5].includes(currentTimestamp.day()))) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "0 1 * * 6" && currentTimestamp.minutes() == 0 && currentTimestamp.hours() == 1 && currentTimestamp.day() == 6) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "0 21 * * *" && currentTimestamp.minutes() == 0 && currentTimestamp.hours() == 21) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "0 */2 * * *" && currentTimestamp.minutes() == 0 && currentTimestamp.hours() % 2 == 0) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "*/30 * * * *" && currentTimestamp.minutes() % 30 == 0) workflowsNamesToRun.push(workflow.name)
        else if (workflow.runAt == "0 0 * * *" && currentTimestamp.minutes() == 0 && currentTimestamp.hours() == 0) workflowsNamesToRun.push(workflow.name)
    }
    logger.info(`workflows.runScheduler`, {data: {
        currentTimestamp: currentTimestamp,
        workflowsNamesToRun: workflowsNamesToRun
    }})


    workflowsNamesToRun = forceWorkflowName ? [forceWorkflowName] : workflowsNamesToRun

    for (const workflowName of workflowsNamesToRun) {
        // Send reminder notification for all orders created in last 48 hours but still to accept
        if (workflowName == 'sale-order/pending-reminder') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)

            //Fetch all orders which have pending order line items created in past 24 hours
            const saleOrdersPending = await db.order.findAll({
                where: {
                    parentOrderID: {[Op.not]: null},
                    '$orderLineItems.createdAt$': {[Op.gte]: currentTimestamp.clone().subtract(24, 'hours').format()}
                },
                include: [
                    {model: db.orderLineItem, as: 'orderLineItems', required: true, include: [
                        {model: db.status, as: 'status', where: {name: 'pending'}}
                    ]},
                ]
            });

            const uniqueAccountIDs = [... new Set(saleOrdersPending.map(order => order.accountID))]
            const serviceUsers = await Promise.all(uniqueAccountIDs.map(accountID => service.account.serviceUser(accountID)))
            const bucket12hrsReminders = saleOrdersPending.filter(order => order.orderLineItems.filter(oli => oli.createdAt >= currentTimestamp.clone().subtract(12, 'hours') && oli.createdAt < currentTimestamp.clone().subtract(11, 'hours')).length > 0)
            const bucket24hrsReminders = saleOrdersPending.filter(order => order.orderLineItems.filter(oli => oli.createdAt >= currentTimestamp.clone().subtract(24, 'hours') && oli.createdAt < currentTimestamp.clone().subtract(23, 'hours')).length > 0)
            logger.info(`[DEBUG] bucket12hrsReminders orders ${bucket12hrsReminders.length}`, {data: bucket12hrsReminders.map(order => order.ID)})
            logger.info(`[DEBUG] bucket24hrsReminders orders ${bucket24hrsReminders.length}`, {data: bucket24hrsReminders.map(order => order.ID)})
            const responses12hrs = await Promise.all(bucket12hrsReminders.map(order => {
                const serviceUser = serviceUsers.find(u => u.accountID == order.accountID)
                return service.notification.saleOrderPendingReminder(serviceUser, order.ID, '12h')
            }));

            const responses24hrs = await Promise.all(bucket24hrsReminders.map(order => {
                const serviceUser = serviceUsers.find(u => u.accountID == order.accountID)
                return service.notification.saleOrderPendingReminder(serviceUser, order.ID, '24h')
            }));

            if (configs.environment == 'local') {
                return responses24hrs
            }
        }

        // Sends notifications for orders created in past 15 mins that are still live
        if (workflowName == 'sale-order/created') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)

            // Fetch all sales orders created in past 15 mins and not deleted to send order creation notification
            const saleOrdersCreatedIn15Mins = await db.order.findAll({
                where: {
                    createdAt: {[Op.gte]: currentTimestamp.clone().subtract(15, 'minutes').format()},
                    typeID: 4,
                    statusID: {[Op.ne]: 3}
                }
            })

            logger.info(`[DEBUG] saleOrdersCreatedIn15Mins orders ${saleOrdersCreatedIn15Mins.length}`, {data: saleOrdersCreatedIn15Mins.map(order => order.ID)})
            const uniqueAccountIDs = [... new Set(saleOrdersCreatedIn15Mins.map(order => order.accountID))]
            const serviceUsers = await Promise.all(uniqueAccountIDs.map(accountID => service.account.serviceUser(accountID)))
            const responses = await Promise.all(saleOrdersCreatedIn15Mins.map(order => {
                const serviceUser = serviceUsers.find(u => u.accountID == order.accountID)
                return service.notification.saleOrderCreated(serviceUser, order.ID)
            }));

            // on debug just return data so that can be checked against test
            if (configs.environment == 'local') {
                return responses
            }
        }

        // Send reminder notification for all orders created in last 72 hours but still to fulfill
        if (workflowName == 'sale-order/fulfill-reminder') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)
            const saleOrderUnfulfilled = await db.order.findAll({
                where: {
                    parentOrderID: {[Op.not]: null}, //for now just applies to consignment orders
                },
                include: [
                    {model: db.orderLineItem, as: 'orderLineItems', required: true, where: {
                        acceptedAt: {[Op.gte]: currentTimestamp.clone().subtract(72, 'hours').format()},
                        dispatchedAt: {[Op.is]: null},
                    }},
                ],
            });

            const uniqueAccountIDs = [... new Set(saleOrderUnfulfilled.map(order => order.accountID))]
            const serviceUsers = await Promise.all(uniqueAccountIDs.map(accountID => service.account.serviceUser(accountID)))
            // Filter out the order line items into seperate buckets for 24 hrs, 48 hrs and 72 hrs reminders
            let bucket24hrsReminders = saleOrderUnfulfilled.filter(o => o.orderLineItems[0].acceptedAt >= currentTimestamp.clone().subtract(24, 'hours') && o.orderLineItems[0].acceptedAt < currentTimestamp.clone().subtract(23, 'hours'));
            let bucket48hrsReminders = saleOrderUnfulfilled.filter(o => o.orderLineItems[0].acceptedAt >= currentTimestamp.clone().subtract(48, 'hours') && o.orderLineItems[0].acceptedAt < currentTimestamp.clone().subtract(47, 'hours'));
            let bucket72hrsReminders = saleOrderUnfulfilled.filter(o => o.orderLineItems[0].acceptedAt >= currentTimestamp.clone().subtract(72, 'hours') && o.orderLineItems[0].acceptedAt < currentTimestamp.clone().subtract(71, 'hours'));

            const responses24hrs = await Promise.all(bucket24hrsReminders.map(order => {
                const serviceUser = serviceUsers.find(u => u.accountID == order.accountID)
                return service.notification.fulfillmentPendingReminder(serviceUser, order.ID, '24h')
            }));

            const responses48hrs = await Promise.all(bucket48hrsReminders.map(order => {
                const serviceUser = serviceUsers.find(u => u.accountID == order.accountID)
                return service.notification.fulfillmentPendingReminder(serviceUser, order.ID, '48h')
            }));

            const responses72hrs = await Promise.all(bucket72hrsReminders.map(order => {
                const serviceUser = serviceUsers.find(u => u.accountID == order.accountID)
                return service.notification.fulfillmentPendingReminder(serviceUser, order.ID, '72h')
            }));

            // on debug just return data so that can be checked against test
            if (configs.environment == 'local') {
                return responses24hrs
            }
        }

        // Send reminder notification for all accounts created in last 7 days but still to add inventory
        if (workflowName == 'inventory/upload-reminder') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)

            const accountSignups7days = await db.account.findAll({
                where: {
                    createdAt: {[Op.gte]: currentTimestamp.clone().subtract(8, 'days').format()},
                },
            })
            const accountsInventory = await db.inventory.findAll({
                where: {
                    accountID: accountSignups7days.map(account => account.ID),
                }
            });

            const bucket24hrsReminders = []
            const bucket72hrsReminders = []
            const bucket1WeekReminders = []

            accountSignups7days.map(account => {
                const inventory = accountsInventory.filter(inventory => inventory.accountID == account.ID)
                const hoursSinceSignup = moment.duration(currentTimestamp.diff(account.createdAt)).asHours()

                if (inventory.length != 0) return

                if (hoursSinceSignup >= 24 && hoursSinceSignup < 25) bucket24hrsReminders.push(account)
                if (hoursSinceSignup >= 72 && hoursSinceSignup < 73) bucket72hrsReminders.push(account)
                if (hoursSinceSignup >= (24*7) && hoursSinceSignup < (24*7 + 1)) bucket1WeekReminders.push(account) //168-169 hrs
            })

            const responses24hrs = await Promise.all(bucket24hrsReminders.map(account => service.notification.inventoryUploadReminder(account, '24h')));

            const responses72hrs = await Promise.all(bucket72hrsReminders.map(account => service.notification.inventoryUploadReminder(account, '72h')));

            const responses1Week = await Promise.all(bucket1WeekReminders.map(account => service.notification.inventoryUploadReminder(account, '1w')));

            // on debug just return data so that can be checked against test
            if (configs.environment == 'local') {
                return responses1Week
            }
        }

        if (workflowName == 'invoice-virtual-stock') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)
            await service.workflows.invoiceVirtualStock()
        }

        if (workflowName == 'milanostoreReport') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)
            const milanoStoreReportResponse = await service.workflows.milanostoreReports(currentTimestamp.clone())

            if (configs.environment == 'local') {
                return milanoStoreReportResponse
            }
        }

        if (workflowName == 'account-report/disconnected-listing') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)

            const disconnectedListingsReportResponse = await service.workflows.disconnectedListingsReport()

            if (configs.environment == 'local') {
                return disconnectedListingsReportResponse
            }
        }

        if (workflowName == 'account-report/new-product-uploads') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)

            const newProductUploadsReportResponse = await service.workflows.newProductUploadsReport()

            if (configs.environment == 'local') {
                return newProductUploadsReportResponse
            }
        }

        if (workflowName == 'account-report/best-selling-products') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)

            const bestSellingProductsReportResponse = await service.workflows.bestSellingProductsReport()

            if (configs.environment == 'local') {
                return bestSellingProductsReportResponse
            }
        }

        if (workflowName == 'account-report/stock-levels') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)

            const stockLevelsReportResponse = await service.workflows.stockLevelsReport()

            if (configs.environment == 'local') {
                return stockLevelsReportResponse
            }
        }

        if (workflowName == 'syncShopifyInventoryAndPrices') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)
            const syncShopifyInventoryAndPricesResponse = await service.workflows.syncShopifyInventoryAndPrices()

            if (configs.environment == 'local') {
                return syncShopifyInventoryAndPricesResponse
            }
        }

        if (workflowName == 'reconcileStripePaymentsCaptured') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)
            const reconcileStripePaymentsCapturedResponse = await service.workflows.reconcileStripePaymentsCaptured()

            if (configs.environment == 'local') {
                return reconcileStripePaymentsCapturedResponse
            }
        }

        if (workflowName == 'lacedSync') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)

            return service.workflows.syncLacedStock()
        }

        if (workflowName == "accountsKPIsReport") {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)
            await service.workflows.accountsKPIsReport()
        }

        if (workflowName == 'editLDNVirtualStockReport') {
            logger.info(`workflows.runScheduler - ${workflowName} ${currentTimestamp.format()}`)

            const editLDNVirtualStockReportResponse = await service.workflows.editLDNVirtualStockReport()

            if (configs.environment == 'local') {
                return editLDNVirtualStockReportResponse
            }
        }
    }
}

exports.syncShopifySaleChannel = async (user, body) => {
    /**
     * saleChannelID: number
     * 
     * 
     * 1. Fetch SHopify Warehouse/location and sync it with account warehouse
     * 2. Fetch all db products and return only products not uploaded yet (without foreignID)
     * 3. For each product upload it to shopify and sync it updating the foreignID
     */
    logger.info(`syncShopifySaleChannel`, {data: body})
    const saleChannel = await db.saleChannel.findOne({where: {ID: body.saleChannelID}})
    logger.info(`saleChannel`, {data: saleChannel})

    const serviceUser = await service.account.serviceUser(saleChannel.accountID)
    // get shopify client and session
    const {shopify, shopifySession} = await service.bridge.shopify.client( saleChannel.accountID)

    logger.info(`Fetching Shopify warehouse ID`)
    let shopifyWarehouse;
    try {

        logger.info(`Fetching Shopify locations`)
        const shopifyWarehouses = (await shopify.rest.Location.all({session: shopifySession,})).data;
        // get first location
        shopifyWarehouse = shopifyWarehouses[0]
        await db.warehouse.update({foreignID: shopifyWarehouse.id}, {where: {accountID: saleChannel.accountID}})
    } catch (e) {
        logger.error(`Impossible to fetch shopify warehouse`, {data: e.response.data})
        throw new Error(`Impossible to fetch shopify warehouse. Error ${e.response.status}`)
    }

    logger.info(`Fetching DB Products to Upload`)
    let dbProducts = await db.product.findAll({
        where: {
            accountID: saleChannel.accountID,
            status: {[Op.not]: 'deleted'}
        },
        include: [
            {model: db.product, required: false, as: 'sourceProduct'},
            {model: db.productVariant, as: 'variants', include: [
                { model: db.productVariant, as: 'sourceProductVariant'},
            ]},
            {model: db.productImage, as: 'images'},
            {model: db.productCategory, as: 'category'},
        ]
    }) 
    const productsMissingOnShopify = dbProducts.filter(dbProd => dbProd.foreignID == null)
    logger.info(`Products to upload to Shopify ${productsMissingOnShopify.length}`)

    let idx = 0
    for (var dbProduct of productsMissingOnShopify) {
        logger.info(`${idx}/${productsMissingOnShopify.length} - Product ${dbProduct.ID}`)
        //added try and catch to not fail if a product fails to upload
        try {
            await service.bridge.shopify.product.create(serviceUser, dbProduct)
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            console.log(e)
            continue
        }

        const progressValue = Math.round((idx / productsMissingOnShopify.length) * 100)
        logger.info(`Sync completed at ${progressValue} %`)
        await db.saleChannel.update({syncProgress: progressValue}, {where: {ID: body.saleChannelID}})

        idx +=1
    }

    await service.bridge.shopify.account.setupWebhooks(saleChannel.accountID)

    logger.debug(`>> Sync product listings`)
    for (const dbProduct of dbProducts) {
        for (let variant of dbProduct.variants) {
            await service.gcloud.addTask(
                'shopify-jobs',
                'POST',
                `${configs.microservices.api}/api/bridge/egress/shopify/variant/sync`,
                {provenance: 'workflow/syncShopifySaleChannel'},
                null,
                {
                    variantID: variant.ID
                })
        }
    }
    

    await db.saleChannel.update({syncProgress: 100}, {where: {ID: body.saleChannelID}})
}

exports.updateSaleChannelConsignorListings = async (user, body) => {
    /**
     * This is called upon consignor account set as active or vacation. Turn on/off the listings and trigger the sale channel sync if shopify
     * saleChannelID: number
     * accountID: number
     * status: string //active|vacation
     */
    logger.info(`updateSaleChannelConsignorListings`, {data: body})
    await db.inventoryListing.update({status: body.status == 'vacation' ? 'drafted' : 'active'}, {where: {saleChannelID: body.saleChannelID, accountID: body.accountID}})

    const saleChannel = await db.saleChannel.findOne({where: {ID: body.saleChannelID}})
    if (saleChannel.platform == "shopify") {
        const inventoryListings = await db.inventoryListing.findAll({
            where: {
                saleChannelID: body.saleChannelID, 
                accountID: body.accountID
            }})
        const variantIds = [...new Set(inventoryListings.map(listing => listing.productVariantID))]
        const batchedVariants = utils.batchArray(variantIds, 500)
        let idx = 1
        for (var batch of batchedVariants) {
            logger.debug(`Batch ${idx}/${batchedVariants.length}`)
    
            await Promise.all(batch.map(variantId => service.gcloud.addTask('shopify-jobs', 'POST', `${configs.microservices.api}/api/bridge/egress/shopify/variant/sync`, {}, null,
            {
                variantID: variantId
            })))
            idx += 1
        }

    }

}

exports.syncShopifyInventoryAndPrices = async () => {
    /**
     * Fetch listings where listing or underlying inventory updated in the last 15 min
     * Fetch shopify variants to see if something changed
     * resync for the once that changed
     */

    const shopifySaleChannels = await db.saleChannel.findAll({where: {platform: 'shopify'}})
    const sinceDatetime = moment().subtract(30, 'minutes').format()

    if (configs.environment == 'local') {
        return "ok"
    }

    const inventoryListingsChangedRecently = await db.inventoryListing.findAll({
        where: {
            saleChannelID: shopifySaleChannels.map(sc => sc.ID),
            [Op.or]: [
                { updatedAt: { [Op.gte]: sinceDatetime } },
                { '$inventory.updatedAt$': { [Op.gte]: sinceDatetime } },
            ]
        },
        include: [
            {model: db.product, as: 'product'},
            {model: db.productVariant, as: 'variant'},
            {model: db.inventory, as: 'inventory'},
        ]
    })

    console.log(`inventoryListingsChangedRecently ${inventoryListingsChangedRecently.length}`)

    let variantIDsToResync = []
    for (var saleChannel of shopifySaleChannels) {
        console.log(`Processing ${saleChannel.shopifyStoreName}`)
        // extract listings variants
        const uniqueVariantIDsRecentlyUpdated = (Array.from(new Set(inventoryListingsChangedRecently
            .filter(listing => listing.saleChannelID == saleChannel.ID)
            .filter(listing => listing.product.foreignID != null)
            .map(listing => listing.variant.ID))))
            
        console.log(`uniqueVariantIDsRecentlyUpdated ${uniqueVariantIDsRecentlyUpdated.length}`)
        if (uniqueVariantIDsRecentlyUpdated.length == 0) {
            continue
        }

        const uniqueProductForeignIDs = (Array.from(new Set(inventoryListingsChangedRecently
            .filter(listing => listing.saleChannelID == saleChannel.ID)
            .filter(listing => listing.product.foreignID != null)
            .map(listing => listing.product.foreignID))))
            .join(',')
        // get respective service user
        const serviceUser = await service.account.serviceUser(saleChannel.accountID)
        const {shopify, shopifySession} = await service.bridge.shopify.client( saleChannel.accountID)
        if (!shopify) continue

        // fetch shopify products
        let shopifyProducts = []
        let pageInfo;
        do {
            let options = {
                session: shopifySession,
                ids: uniqueProductForeignIDs,
                limit: 250,
            };
            if (pageInfo?.nextPage) {
                options = {
                    session: shopifySession,
                    ...pageInfo?.nextPage?.query,
                    limit: 250,
                };
            }

            const response = await shopify.rest.Product.all(options);

            const pageProducts = response.data;
            shopifyProducts = shopifyProducts.concat(pageProducts)
            pageInfo = response.pageInfo;
        } while (pageInfo?.nextPage);
        console.log(`shopifyProducts ${shopifyProducts.length}`)
        const shopifyVariants = []
        shopifyProducts.map(p => p.variants.map(v => shopifyVariants.push(v)))
            
        console.log(`uniqueVariantsRecentlyUpdated ${uniqueVariantIDsRecentlyUpdated.length}`)
        // for each variant - fetch best listing and compare it with shopify variant (quantity and price)
        for (var variantID of uniqueVariantIDsRecentlyUpdated) {
            const dbVariant = inventoryListingsChangedRecently.find(l => l.variant.ID == variantID).variant
            const bestActiveListing = await service.inventoryListing.activeListing(serviceUser, variantID, saleChannel.ID)
            const _shopifyVariant = shopifyVariants.find(v => v.id == dbVariant.foreignID)
            if (!_shopifyVariant) {
                logger.warn(`Could not find shopify variant for variantID ${variantID}`)
                continue
            }
            
            // once not matching - add to a list for later
            if (bestActiveListing?.price != _shopifyVariant?.price || bestActiveListing?.inventory.quantity != _shopifyVariant?.inventory_quantity) {
                variantIDsToResync.push(variantID)
            }
        }

    }
    variantIDsToResync = Array.from(new Set(variantIDsToResync))

    console.log(`variantIDsToResync ${variantIDsToResync.length}`)
    for (const variantID of variantIDsToResync) {
        await service.gcloud.addTask(
            'shopify-jobs', 
            'POST', 
            `${configs.microservices.api}/api/bridge/egress/shopify/variant/sync`, 
            {provenance: 'worker/sync-inventory'}, 
            null, 
            {
                variantID: variantID
            })
    }
}

exports.invoiceVirtualStock = async () => {
    /**
     * Used to count the number of products active in virtual stock
     * to determine hwo much invoice customers
     * 
     * runs every month
     * 
     */

    const accountsInvoicable = [
        {ID: 2211, accountName: 'belfagore', pricePerProduct: 0.1, currency: 'GBP'}
    ]

    let reportHTML = `<table>
        <tr><th>Account</th><th>Active Listings</th><th>Unique Products</th><th>Total Price</th></tr>`
    for (var account of accountsInvoicable) {
        const listingsWithVirtualStockActive = await db.inventoryListing.findAll({
            where: {
                accountID: account.ID,
                status: 'active',
                '$inventory.virtual$': 1,
            },
            include: [
                {model: db.inventory, as: 'inventory'},
            ]
        })

        
        const uniqueProducts = Array.from(new Set(listingsWithVirtualStockActive.map(l => l.productID)))

        reportHTML += `<tr><td>${account.accountName}</td><td>${listingsWithVirtualStockActive.length}</td><td>${uniqueProducts.length}</td><td>${uniqueProducts.length * account.pricePerProduct} ${account.currency}</td></tr>`
    }
    reportHTML += `</table>`

    const data = {
        to: ['s.rosa@wiredhub.io'],
        subject: `Monthly Report - Virtual Stock Billing`,
        body: reportHTML,
        attachments: [] 
    }

    return service.bridge.sendGrid.sendEmail(data);
}

exports.downloadTable = async (user, body) => {
    /**
     * This function is used to bulk download documents from the storage.
     * Given the orderIDs of the invoices to download
     * 1. download invoices from the storage as base64
     * 2. create a zip file with all the invoices
     * 3. upload zip file to storage
     * 4. send email to user with the link to download the zip file
     * 
     * 
     * @param {Object} user
     * @param {string} body.table          -  table to download 
     * @param {string[]} body.columns      -  columns to download ID, name, etc
     * @param {Obejct} body.query      -  columns to download ID, name, etc
     * @param {string} body.decimalseparator -  the type of decimal separator default: '.'
     * @param {string} body.fieldSeparator   -  the type of decimal separator default: ','
     * @param {string} body.destinationEmail        -  the email to who send the report to
     * 
     * 
     */
    logger.info(`workflows.downloadTable`, {data: body})
    if (!Array.isArray(body.columns)) throw {status: 400, message: `columns must be an array`}
    if (!body.destinationEmail) throw {status: 400, message: `destinationEmail is required`}

    const csvRowsData = [] // formatted data to save on csv
    let offset = 0
    let rowsPerPage = 10
    let totalRows;
    const tableName = body.table
    let fieldSeparator = body.fieldSeparator || ','
    let decimalSeparator = body.decimalseparator || '.'
    const objectsToCsv = require('objects-to-csv')

    //csv settings for italian accounts: 2211: belfa, 2530: onestreet,  2548: milanostore
    if ([2211, 2530, 2548].includes(user.accountID)) {
        fieldSeparator = ';'
        decimalseparator = ','
      }
    do {
        let batchRecords;
        switch (tableName) {
            case 'inventory': 
                batchRecords = await service.inventory.getAll(user, offset, rowsPerPage, body.query)
                break
            case 'orders':
                batchRecords = await service.order.getAll(user, offset, rowsPerPage, body.query)
                break
            case 'listings':
                batchRecords = await service.inventoryListing.getAll(user, offset, rowsPerPage, body.query)
                break
            case 'products':
                batchRecords = await service.product.getAll(user, offset, rowsPerPage, null, body.query)
                break
            case 'items-flow': 
                batchRecords = await service.orderLineItem.getAll(user, offset, rowsPerPage, body.query)
                break
            case 'transfer':
                batchRecords = await service.order.getAll(user, offset, rowsPerPage, body.query)
                break
            case 'consignors':
                batchRecords = await service.account.getAll(user, offset, rowsPerPage, body.query)
                break
            case 'payments':
                batchRecords = await service.transaction.getAll(user, offset, rowsPerPage, body.query)
                break
            default:
                throw {status: 400, message: `${tableName} is an invalid table name`}
        } 
        batchRecords.rows.map(record => {
            const csvRecord = {}
            body.columns.map(columnReferenceName => {
              // manage null values & lists
              let value = columnReferenceName.split(".").reduce((record, columnKey) => record ? record[columnKey] : null, record)
              if ((Array.isArray(value) && value.length == 0) || value === null || value == undefined) {
                value = ""
              } else if (moment(value, "YYY-MM-DDThh:mm:ss", true).isValid()) { //manage dates
                value = moment(value).format("YYYY-MM-DD HH:mm:ss")
              }
              else if (!isNaN(value)) {// if the value is a number - format decimals
                value  = `${Number.isInteger(Number(value)) ? value : Number(value).toFixed(2)}`
                if (decimalSeparator== ',') {
                  value = value.replace('.', ',')
                }
              }
              csvRecord[columnReferenceName] = value
            })
            csvRowsData.push(csvRecord)
        })

        offset = offset + rowsPerPage
        totalRows = batchRecords.count
    } while (offset < totalRows)

    const tableRecordsAsString = await new objectsToCsv(csvRowsData).toString()
    const tableRecordsAsAttachmentBase64 = Buffer.from(tableRecordsAsString).toString('base64')

    const data = {
        to: [body.destinationEmail],
        subject: `Fliproom - Your ${tableName} report is available`,
        body: 'Please find attached the report requested',
        attachments: [{
            content: tableRecordsAsAttachmentBase64,
            filename: `${tableName}_${moment().format('DD-MM-YYYY HH:mm')}.csv`,
            type: "text/csv",
            disposition: "attachment"
        }]
    }

    if (configs.environment == 'local') {
        return csvRowsData
    }

    try {
        await service.bridge.sendGrid.sendEmail(data)
    } catch (e) {
        throw {status: 500, message: `Error sending email | ${e}`}
    }
}

exports.downloadBulkDocuments = async (user, body) => {
    /**
     * This function is used to bulk download documents from the storage.
     * Given the orderIDs of the invoices to download
     * 1. download invoices from the storage as base64
     * 2. create a zip file with all the invoices
     * 3. upload zip file to storage
     * 4. send email to user with the link to download the zip file
     * 
     * 
     * @param {Object} user
     * @param {string} body.email      -  email to who submit the workflow once completed
     * @param {string[]} body.orderIDs -  the ids of the orders to download their invoices
     * 
     */
    logger.info(`downloadBulkDocuments`, {data: body})
    const zip = new JSZip();
    const orders = await db.order.findAll({
        where: {
            ID: body.orderIDs
        },
    })

    for (var order of orders) {
        if (!order.invoiceFilename) {
            continue
        }
        const fileBase64 = await service.gcloud.downloadFile(`resources/${order.invoiceFilename}`)
        zip.file(`${order.ID}.png`, fileBase64, { base64: true });
    }
    const content = await zip.generateAsync({type:"base64"});
    const filename = await service.gcloud.save(content, 'zip', 'workflows')
    const downloadUrl = `https://storage.googleapis.com/${configs.apis.gcloud.bucket_name}/resources/workflows/${filename}`

    const data = {
        to: [body.email],
        subject: `Documents Ready - ${moment().format('h:mm DD/MM/YYYY')}`,
        body: `<div id="wrapper">
        <div id="card" style="width: 700px; margin: auto;">
            <img src="https://storage.googleapis.com/production-wiredhub/resources/fliproom_logo-text.png" alt="" style="width: 200px; margin-top: 2em; display: block;">
    
            <div id="content" style="font-size: 1.25em">
                <p>Your documents are ready!</p>
            </div>
    
            <a id="button" href="${downloadUrl}" target="_blank" style="background-color: #0047fd; padding: 1em 3em; border-radius: 1em; color: white; text-decoration: none; display: block; width: 250px; text-align: center; letter-spacing: 0.05em; font-family: 'Roboto', sans-serif; margin: auto;">
                Download Documents
            </a>
        </div>
    </div>
        `,
        attachments: [] 
    }

    return service.bridge.sendGrid.sendEmail(data)
}

exports.reconcileStripePaymentsCaptured = async () => {
    /**
     * This function is used to reconcile the payments captured in stripe with the orders in fliproom
     * If the transaction's funds are available on stripe, the order on fliproom is marked as paid
     */
    logger.info(`workflows.reconcileStripePaymentsCaptured`)
    const stripe = require('stripe')(configs.apis.stripeUK.apiKey);

    //Fetch all sale transactions and shipping transactions with stripeID and status processing
    const txs = await db.transaction.findAll({
        where: {
            stripeID: {[Op.not]: null},
            status: 'processing'
        },
        include: [
            {model: db.order, as: 'order'},
        ],
        order: [
            ['ID', 'ASC']
        ]
    })
    
    //Filter out the transactions with stripeID starting with txn_ and remove duplicates
    const uniqueStripeBalanceTransactionIDs = [... new Set(txs.filter(tx => `${tx.stripeID}`.includes("txn_")).map(tx => tx.stripeID))]
    
    logger.info(`Transactions processing ${uniqueStripeBalanceTransactionIDs.length}`)

    for (const stripeBalanceTxID of uniqueStripeBalanceTransactionIDs) {
        const txsMatchingStripeID = txs.filter(tx => tx.stripeID === stripeBalanceTxID)
        const saleTx = txsMatchingStripeID.find(tx => tx.type == "sale" && tx.status == "processing");
        const shippingTx = txsMatchingStripeID.find(tx => tx.type == "shipping" && tx.status == "processing");
        const payoutTx = txsMatchingStripeID.find(tx => tx.type == "payout" && tx.status == "processing" && tx.toAccountID == tx.order.personalShopperAccountID);
        const serviceUser = await service.account.serviceUser(saleTx.order.accountID)

        let stripeBalanceTx, stripeRefundTx;
        if (configs.environment == 'local') {
            //on local - just use the last txs created for this test otherwise you spend 2 hrs debugging
            if (stripeBalanceTxID != uniqueStripeBalanceTransactionIDs[uniqueStripeBalanceTransactionIDs.length - 1]) continue
            stripeBalanceTx = {
                id: 'test',
                status: 'available',
                fee: (parseFloat(txsMatchingStripeID[0].order.totalAmount) * 0.01) * 100,
                amount: parseFloat(txsMatchingStripeID[0].order.totalAmount) * 100
            }
        } else {
            stripeBalanceTx = await stripe.balanceTransactions.retrieve(stripeBalanceTxID)
            //used to check if the tx has been refunded
            stripeRefundTx = (await stripe.refunds.list({
                charge: stripeBalanceTx.source
            })).data[0]
        }

        //if refund exist
        if (stripeRefundTx) {
            logger.info(`Refund tx ${saleTx.ID} (${stripeBalanceTx.id})`)
            await service.transaction.cancel(serviceUser, saleTx.ID)

            if (payoutTx) {
                logger.info(`Refund payout tx ${payoutTx.ID} (${stripeBalanceTx.id})`)
                await service.transaction.cancel(serviceUser, payoutTx.ID)
            }

            if (shippingTx) {
                logger.info(`Refund shipping tx ${shippingTx.ID} (${stripeBalanceTx.id})`)
                await service.transaction.cancel(serviceUser, shippingTx.ID)
            }
        } else if (stripeBalanceTx.status == 'available') {
            //calculate the percentage of fee charged to the seller and personal shopper (is applicable)
            const feeAmount_stripe = stripeBalanceTx.fee / 100
            // amount_captured is the total amount customer paid and that comprises of both sale + shipping
            const grossAmount = stripeBalanceTx.amount / 100
            // Fliproom fee = 1.25% of the amount_captured or grossAmount
            const feeAmount_fliproom = 0 //grossAmount * 0.0125; TODO: fliproom amount is charged separately monthly
            const feeAmount = feeAmount_stripe + feeAmount_fliproom;
            //split fees between seller and ps
            const psChargedFeePercentage = payoutTx ? (parseFloat(payoutTx.grossAmount) / grossAmount) : 0;
            const psChargedFeeAmount = feeAmount * psChargedFeePercentage;
            const sellerChargedFeeAmount = feeAmount - psChargedFeeAmount
            logger.info(`Reconcile sale tx ${saleTx.ID} (${stripeBalanceTx.id}) | grossAmount: ${grossAmount} stripe: ${feeAmount_stripe} flirpoom: ${feeAmount_fliproom}`)

            await service.transaction.payWithStripe_v2(serviceUser, saleTx.ID, {fees: sellerChargedFeeAmount});

            if (payoutTx) {
                logger.info(`Reconcile payout tx ${payoutTx.ID} (${stripeBalanceTx.id}) | fees: psChargedFeeAmount`)
                await service.transaction.payWithStripe_v2(serviceUser, payoutTx.ID, {fees: psChargedFeeAmount});
            }

            if (shippingTx) {
                logger.info(`Reconcile shipping tx ${shippingTx.ID} (${stripeBalanceTx.id}) | fees: 0`)
                await service.transaction.payWithStripe_v2(serviceUser, shippingTx.ID);
            }

            if (configs.environment == 'local') {
                return service.order.getOne(serviceUser, txsMatchingStripeID[0].order.ID)
            }
        }

    }


}

exports.milanostoreReports = async (currentTimestamp = moment()) => {
    /**
     * This function is used to periodically generate and email reports requested by milanostore.
     * Reports currently implemented:
     * - margins and VAT report for items sold (weekly and monthly) 
     * 
     * This workflow is run daily at 20:00
     */

    const endDate = currentTimestamp
    let startDate; 
    let reportType;

    //if end date is first of the month => run monthly report
    if (endDate.date() == 1) {
        startDate = endDate.clone().subtract(7, 'days').startOf('month')
        reportType = 'Monthly'
    //if end date is monday => run weekly report
    } else if (endDate.weekday() == 1) {
        startDate = endDate.clone().subtract(7, 'days').startOf('day')
        reportType = 'Weekly'
    } else {
        startDate = endDate.clone().subtract(1, 'days')
        reportType = 'Daily'
    }

    if (configs.environment == 'local') {
        return "ok"
    }

    // column for the sale channel
    const serviceUser = await service.account.serviceUser(2548)
    let orderLineItems = (await service.orderLineItem.getAll(serviceUser, 0, 9999, {
        createdAt: `${startDate.format('YYYY-MM-DD')}:`,
        'order.type.name': `~outbound`,
        canceledAt: '!*', 
        accountID: 2548
    })).rows
    orderLineItems = orderLineItems.filter(oli => oli.createdAt > startDate) // usae this to filter by hours since our query parse breaks if we try to filter by a datetime
    
    const excel = require("excel4node");
    const workbook = new excel.Workbook();

    // Create a reusable style
    const currencyStyle = workbook.createStyle({
        numberFormat: '€ #.00; € -#.00'
    })


    const columns = [
        {name: 'CREATED AT',         key: 'createdAt'},
        {name: 'CODE',               key: 'product.code'},
        {name: 'TITLE',              key: 'product.title'},
        {name: 'VARIANT',            key: 'variant.name'},
        {name: 'COST',               key: 'cost'},
        {name: 'PRICE',              key: 'price'},
        {name: 'MARGINE LORDO',      key: 'gross-margin'},
        {name: 'MARGINE NETTO',      key: 'net-margin'},
        {name: 'VAT',                key: 'vat'},
        {name: 'VAT TYPE',           key: 'vat-type'},
        {name: 'NOTES',              key: 'notes'},
        {name: 'ORDER REFERENCE',    key: 'order.reference1'},
    ]
    const totals = {
        'cost': 0,
        'price': 0,
        'gross-margin': 0,
        'net-margin': 0,
        'vat': 0,
    }
    const saleChannels = [...new Set(orderLineItems.map(oli => oli.order.saleChannel.title))]
    for (var saleChannel of saleChannels) {
        //split data in tabs. Each tab is a sale channel
        var worksheet = workbook.addWorksheet(saleChannel);
        const saleChannelItems = orderLineItems.filter(oli => oli.order.saleChannel.title == saleChannel)
        columns.map((columnObj, colIndex) => {
            //fill tab headers row
            worksheet.cell(1, colIndex + 1).string(columnObj.name)

            //fill tab data rows
            saleChannelItems.forEach((row, rowIndex) => {
                // determine the vat type by detecting R.M
                let vatType = 'RM'//TODO: remove this default
                //let vatType = ''//TODO: decomment when correct way is implemntede
                //const oliNotes = `${row.notes}`.trim().toLowerCase()
                //vatType += oliNotes.includes('c.v') ? 'CV' : ''
                //vatType += oliNotes.includes('r.m') ? 'RM' : ''

                const saleAmount = parseFloat(row.price)
                const costAmount = parseFloat(row.cost)

                const grossMargin = saleAmount - costAmount

                let saleAmountPreTax = parseFloat((saleAmount / 1.22).toFixed(2)) //default vat amount sale / 1.22
                let taxAmount = saleAmount - saleAmountPreTax
                if (vatType.includes('RM')) {
                    saleAmountPreTax = parseFloat((grossMargin / 1.22).toFixed(2))
                    taxAmount = saleAmount - saleAmountPreTax - costAmount
                }

                const netMargin = saleAmount - taxAmount - costAmount

                if (columnObj.key == 'cost') {
                    totals['cost'] += costAmount
                    worksheet.cell(rowIndex + 2, colIndex + 1).number(costAmount).style(currencyStyle)
                } else if (columnObj.key == 'price') {
                    totals['price'] += saleAmount
                    worksheet.cell(rowIndex + 2, colIndex + 1).number(saleAmount).style(currencyStyle)
                } else if (columnObj.key == 'gross-margin') {
                    totals['gross-margin'] += grossMargin
                    worksheet.cell(rowIndex + 2, colIndex + 1).number(grossMargin).style(currencyStyle)
                } else if (columnObj.key == 'net-margin') {
                    totals['net-margin'] += netMargin
                    worksheet.cell(rowIndex + 2, colIndex + 1).number(netMargin).style(currencyStyle)
                } else if (columnObj.key == 'vat') {
                    totals['vat'] += taxAmount
                    worksheet.cell(rowIndex + 2, colIndex + 1).number(taxAmount).style(currencyStyle)
                } else if (columnObj.key == 'vat-type') {
                    worksheet.cell(rowIndex + 2, colIndex + 1).string(vatType)
                } else {
                    const keys = columnObj.key.split(".")
                    let obj = row
                    for (var key of keys) {
                        obj = obj[key]
                    }
                    const cellValue = obj ? `${obj}` : ''
                    worksheet.cell(rowIndex + 2, colIndex + 1).string(cellValue)
                }
            })
            
            //display totals
            worksheet.cell(saleChannelItems.length + 3, columns.findIndex(co => co.key == 'cost') + 1).formula(`SUM(E2:E${saleChannelItems.length+1})`).style(currencyStyle);
            worksheet.cell(saleChannelItems.length + 3, columns.findIndex(co => co.key == 'price') + 1).formula(`SUM(F2:F${saleChannelItems.length+1})`).style(currencyStyle);
            worksheet.cell(saleChannelItems.length + 3, columns.findIndex(co => co.key == 'gross-margin') + 1).formula(`SUM(G2:G${saleChannelItems.length+1})`).style(currencyStyle);
            worksheet.cell(saleChannelItems.length + 3, columns.findIndex(co => co.key == 'net-margin') + 1).formula(`SUM(H2:H${saleChannelItems.length+1})`).style(currencyStyle);
            worksheet.cell(saleChannelItems.length + 3, columns.findIndex(co => co.key == 'vat') + 1).formula(`SUM(I2:I${saleChannelItems.length+1})`).style(currencyStyle);
        })

    }

    const data = {
        to: ['antonio.sigillo@outlook.it', 'andrea@milanostore99.com'],
        subject: `${reportType} Margins Report - ${endDate.format('ll')}`,
        //message: `Costo: <b>€ ${totals.cost.toFixed(2)}</b> &ensp; Incasso: <b>€ ${totals.price.toFixed(2)}</b> &ensp; Margine Lordo: <b>€ ${totals['gross-margin'].toFixed(2)}</b> &ensp; Margine Netto: <b>€ ${totals['net-margin'].toFixed(2)}</b> &ensp; IVA: <b>€ ${totals.vat.toFixed(2)}</b>`,
        body: `No sales today`,
        attachments: []          
    }

    if (orderLineItems.length > 0) {
        data.body = `Margins Report - ${endDate.format('ll')}`
        const fileBuffer = await workbook.writeToBuffer()
        const attachmentBase64 = fileBuffer.toString("base64");
        data.attachments.push({
            content: attachmentBase64,
            filename: `${reportType}_margins_report_${endDate.format('ll')}.xlsx`,
            type: "application/xlsx",
            disposition: "attachment"
        })
    }

    await service.bridge.sendGrid.sendEmail(data)
}

exports.disconnectedListingsReport = async () => {
    // get all the accounts active last 2 weeks
    const accountsActiveThisWeek = await db.account.findAll({
        where: {
        },
        include: [
            {model: db.user, as: 'users', required: true, where: {lastVisitAt: {[Op.gte]: moment().subtract(14, 'days').format()}}},
        ]
    })

    const reportAccountIDs = [... new Set(accountsActiveThisWeek.map(a => a.ID))]

    logger.info(`disconnectedListingsReport: target accounts ${reportAccountIDs.length}`)

    if (configs.environment == 'local') {
        const serviceUser = await service.account.serviceUser(4)
        return service.account.createReport(serviceUser, 4, 'disconnected-listings')
    }

    // for each account to run reports, schedule the tasks
    for (accountID of reportAccountIDs) {
        const serviceUser = await service.account.serviceUser(accountID)
        await service.gcloud.addTask(
            'api-jobs',
            'POST',
            `${configs.microservices.api}/api/account/${accountID}/reports/disconnected-listings`,
            {authorization: `Bearer ${serviceUser.apiKey}`},
            null,
            null
        )
    }
}

exports.newProductUploadsReport = async () => {
    const consignmentRecords = await db.consignment.findAll({
        where: {},
        include: [
            {model: db.account, as: 'consignor', required: true, include: [
                {model: db.user, as: 'users', required: true, where: {email: {[Op.not]: null}}},
            ]}
        ]
    })

    logger.info(`workflows.newProductUploadsReport: Create report for ${consignmentRecords.length} accounts`)

    // for each account to run reports, schedule the tasks
    for (const record of consignmentRecords) {
        //exclude accounts inactiev for more than 30 days
        if (record.consignor.users[0].lastVisitAt < moment().subtract(30, 'days').format()) continue

        const serviceUser = await service.account.serviceUser(record.consignorAccountID)
        const payload = {
            retailerAccountID: record.accountID
        }

        if (configs.environment == "local") {
            return service.account.createReport(serviceUser, serviceUser.accountID, 'new-product-uploads', payload)
        }

        await service.gcloud.addTask(
            'api-jobs',
            'POST',
            `${configs.microservices.api}/api/account/${accountID}/reports/new-product-uploads`,
            {authorization: `Bearer ${serviceUser.apiKey}`},
            null,
            payload
        )
    }
}

exports.bestSellingProductsReport = async () => {
    const consignmentRecords = await db.consignment.findAll({
        where: {},
        include: [
            {model: db.account, as: 'consignor', required: true, include: [
                {model: db.user, as: 'users', required: true, where: {email: {[Op.not]: null}}},
            ]}
        ]
    })

    logger.info(`workflows.bestSellingProductsReport: Create report for ${consignmentRecords.length} accounts`)
    
    // for each account to run reports, schedule the tasks
    for (const record of consignmentRecords) {
        //exclude accounts inactiev for more than 30 days
        if (record.consignor.users[0].lastVisitAt < moment().subtract(30, 'days').format()) continue

        const serviceUser = await service.account.serviceUser(record.consignorAccountID)
        const payload = {
            retailerAccountID: record.accountID
        }

        if (configs.environment == "local") {
            return service.account.createReport(serviceUser, serviceUser.accountID, 'best-selling-products', payload)
        }

        await service.gcloud.addTask(
            'api-jobs',
            'POST',
            `${configs.microservices.api}/api/account/${serviceUser.accountID}/reports/best-selling-products`,
            {authorization: `Bearer ${serviceUser.apiKey}`},
            null,
            payload
        )
    }
}

exports.stockLevelsReport = async () => {
    // the report should run for all accounts that have more. than 1 order in the last 7 days 
    const ordersInLast7Days = await db.order.findAll({
        where: {
            createdAt: {[Op.gte]: moment().subtract(7, 'days').format()},
            typeID: 4
        }
    })

    const reportAccountIDs = [... new Set(ordersInLast7Days.map(o => o.accountID))]

    logger.info(`workflows.stockLevelsReport: target accounts ${reportAccountIDs.length}`)

    // for each account to run reports, schedule the tasks
    for (const accountID of reportAccountIDs) {
        const serviceUser = await service.account.serviceUser(accountID)

        if (configs.environment == 'local') {
            return service.account.createReport(serviceUser, accountID, 'stock-levels')
        }
        await service.gcloud.addTask(
            'api-jobs',
            'POST',
            `${configs.microservices.api}/api/account/${accountID}/reports/stock-levels`,
            {authorization: `Bearer ${serviceUser.apiKey}`},
            null,
            null
        )
    }
}

exports.cloneProductionIntoStaging = async () => {
    /**
     * This workflow is run every two days. It clones the production database into the staging database.
     * and masks sensible information
     * - remove sensible info
     * - set dev environments: stripe, revolut, shopify
     * - update service users jwts
     * - 
     * 
     */
    const jwt = require('jsonwebtoken')

    logger.info(`workflows.cloneProductionIntoStaging`)
    if (configs.environment != "staging") {
        logger.info('Not in staging environment - skipping database masking')
        return "ok"
    }
    await service.gcloud.mysql.export()
    await service.gcloud.mysql.import()

    logger.info('Start masking data..')
    //set salted passqword to everyone - set to one and then ciopy to everyone (mush faster)
    await db.user.update({
        password: 'Fliproom2022!',
        deviceID: null
    }, {where: {ID: 64}, individualHooks: true})
    const saltedPsw = await db.user.findOne({where: {ID: 64}})
    await db.user.update({password: saltedPsw.password}, {where: {}})

    logger.info('Masking data..')
    await db.saleChannel.update({
        shopifyStoreName: null,
        shopifyAPIAuth: null
    }, {where: {}})
    await db.account.update({
        stripeAPIKey: null,
        stripeID: null,
        defaultStripeDestinationID: null,
        stripeOnBoardingURL: null,
        stripeClientID: null,
        stripeAccountID: null,
        stripeConnectAccountID: null,
        revolutJWT: null,
        revolutRefreshToken: null
    }, {where: {}})

    //seed demo data
    const demoAccountID = 4405
    await db.account.update({
        stripeAPIKey: 'sk_test_51KRbEbHLPsP0JKdRgV3GFiG43U1RZKqgS3nQLmwqSTk7OHvCoH40rxpUwGgq5akJeorWmWA9GoyVjyfVFzDJKwhm00yGH3iZB8',
        stripeAccountID: 'acct_1KRbEbHLPsP0JKdR',
        stripeClientID: 'ca_L7rQJu7ZHaV0xzJ2MzBw9z20vq5ZbxIe',
        //to do payouts tyo consignors using revolut
        revolutJWT: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmbGlwcm9vbS5pbyIsInN1YiI6Imdieml1bkIweVNuNW9yUnlZTHRBSTVsU1JsN3U5ZTlvNUUyWHQ5eU9TcHMiLCJhdWQiOiJodHRwczovL3Jldm9sdXQuY29tIiwiZXhwIjoxODUzMDYzMzAzLCJpYXQiOjE2OTUyMTgwMzR9.W_YgPatC0jIKpLNI22HCfzm7d201qUTtjCdi4ziaPcA3xZ4mrKsqs5UXxHiFscsLhYgkHBkrWZQSuBDCl9VOEnrcK_QGHFJhP8GVTFLFoBx-hD4z6TtLTU2TXE-txhmrnhUTaTjgkeLWoCHqY2k8RG0daKHQS971wVMVqNdoXaqylIO9KkHwjTmxgvvkPpZ9t0hYHpqqWIvlOYYkEXzkiq89OX8tTIibLyfFN7u0x2xTpPqP3HILCD5BzolvPJKnIAG7nbK7s5iHQbMCs_k0fy85fm-rdigmkSJv-TszDnP5mWv-1PwCw3GK7guRHwJMCsxWafgYHSSLZxpCkuGDZw',
        revolutRefreshToken: 'oa_sand_pISgNxPhxW7F_GgszsdGPrCDbS8dIF1BbalqOmEeT1M',
        //to receive funds from personal shopping sale
        stripeConnectAccountID: 'acct_1OCQ7SIArhyWD0ek',
        stripeConnectAccountSetupCompleted: 1
    }, {where: {ID: demoAccountID}})

    await db.saleChannel.update({
        shopifyStoreName: 'fliproom-dev',
        shopifyAPIAuth: 'https://6ac5a5c6cc192f5265dc90d946475efd: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@fliproom-dev.myshopify.com/admin/api/2021-04/'
    }, {where: {accountID: demoAccountID, platform: 'shopify'}})

    await db.product.update({
        foreignID: null
    }, {where: {accountID: demoAccountID}})

    //generate new users api keys since they are not valid anymore
    logger.info('Generating new users api keys')
    const users = await db.user.findAll({
        where: {},
    })
    const usersBatched = utils.batchArray(users, 500)
    for (const batch of usersBatched) {
        const apiKeys = batch.map(user => service.auth.signToken(user))
        await Promise.all(batch.map((user, idx) => db.user.update({apiKey: apiKeys[idx]}, {where: {ID: user.ID}})))
    }

    //delete all products from shopify
    await service.bridge.shopify.account.deleteAllProducts(demoAccountID)

    //sync shopify
    await service.workflows.syncShopifySaleChannel(null, {saleChannelID: 3567}) 

    //update indexes
    await service.bridge.typesense.productsIndex.addOrUpdate()    
    await service.bridge.typesense.addressesIndex.addOrUpdate()

    logger.info('Database masked successfully')
    
}

exports.syncLacedStock = async () => {
    const lacedSaleChannels = await db.saleChannel.findAll({where: {platform: 'laced'}})
    const lacedSaleChannelAccountIDs = lacedSaleChannels.map(sc => sc.accountID)

    const uniqueAccountIDs = [... new Set(lacedSaleChannelAccountIDs)]
    const serviceUsers = await Promise.all(uniqueAccountIDs.map(accountID => service.account.serviceUser(accountID)))

    for (const serviceUser of serviceUsers) {
        try {
            await service.bridge.laced.listing.sync(serviceUser)
        } catch (e) {
            console.log(e)
            logger.error(`workflows.syncLacedStock - error while syncing accountID ${serviceUser.accountID} - ${e.message}`)
        }
    }

    if (configs.environment == 'local') {
        return 'ok'
    }
}

exports.accountsKPIsReport = async () => {
    const objectsToCsv = require('objects-to-csv')
    const runDate = moment().subtract(7, 'days').startOf('day')
    const accounts = await db.account.findAll({
        where: {},
        include: [
            {model: db.user, as: 'users', where: {email: {[Op.not]: null},}},
            {model: db.saleChannel, as: 'saleChannels'},
        ]
    })
    const roles = await db.role.findAll({
        where: {},
        include: [
            {model: db.permission, as: 'permissions', include: [
                {model: db.resource, as: 'resource'},
            ]},
        ]
    })

    const user_roles = await db.user_role.findAll({where: {}})

    const sales = await db.order.findAll({
        where: {
            typeID: 4,
            createdAt: {[Op.gte]: runDate}
        },
        include: [
            {model: db.orderLineItem, as: 'orderLineItems', include: [
                {model: db.item, as: 'item'},
            ]},
            {model: db.saleChannel, as: 'saleChannel'},
        ]
    })
    const virtualInventoryRecords = await db.inventory.findAll({
        where: {
            virtual: 1,
            quantity: {[Op.gt]: 0},
        }
    })

    const lacedListings = await db.inventoryListing.findAll({
        where: {
            '$saleChannel.platform$': 'laced',
            '$inventory.quantity$': {[Op.gt]: 0},
        },
        include: [
            {model: db.inventory, as: 'inventory'},
            {model: db.saleChannel, as: 'saleChannel'},
        ]
    })

    const reportData = []
    for (const account of accounts) {
        const adminUserRole = roles.find(role => role.accountID === account.ID && role.type == "organization")
        const userIds = user_roles.filter(ur => ur.roleID === adminUserRole.ID).map(ur => ur.userID)
        const adminUser = account.users.find(u => userIds.includes(u.ID))
        const accountSaleChannels = account.saleChannels.filter(sc => sc.accountID === account.ID)
        const externalSaleChannels = account.saleChannels.filter(sc => sc.accountID != account.ID)
        const accountVirtualInventoryRecords = virtualInventoryRecords.filter(vir => vir.accountID === account.ID)
        const accountSales = sales.filter(sale => sale.accountID === account.ID)
        const itemsSoldVirtualInventory = []
        accountSales.map(sale => sale.orderLineItems.filter(oli => (oli.notes || '').includes('sourced')).map(oli => itemsSoldVirtualInventory.push(oli)))
        const accountsSellingOnThisAccountSaleChannel = accounts.filter(acc => acc.saleChannels.find(sc => sc.accountID == account.ID) && acc.ID != account.ID)

        const inventoryItems = await db.item.findAll({
            where: {
                accountID: account.ID,
            },
            include: [
                {model: db.inventory, as: 'inventory', required: true},
            ]
        })

        const inventoryItemsOnSaleOnAccountSaleChannels = await db.item.findAll({
            where: {
                accountID: {[Op.not]: account.ID},
            },
            include: [
                {model: db.inventory, as: 'inventory', required: true, include: [
                    {model: db.warehouse, as: 'warehouse'},
                    {model: db.inventoryListing, as: 'listings', required: true, where: {saleChannelID: {[Op.in]: accountSaleChannels.map(sc => sc.ID)}}},
                ]},
            ]
        })

        const accountConsignmentSales = accountSales.filter(sale => sale.tags.includes('consignment'))
        let consignment_sales_fees = 0
        accountConsignmentSales.map(sale => sale.orderLineItems.filter(oli => oli.item.accountID != sale.accountID).map(oli => consignment_sales_fees += parseFloat(oli.profit)))
        let accountData = {
            snapshot_date_week: moment().startOf('day'), //since we run the report weekly on saturday - friday 23:59 is the end of the (previous) week
            snapshot_date_month: moment().startOf('month'),
            account_id: account.ID,
            account_name: account.name,
            // retention
            days_since_signup: Math.floor((new Date().getTime() - new Date(account.createdAt).getTime()) / (1000 * 3600 * 24)),
            days_since_last_visit: Math.floor((new Date().getTime() - new Date(adminUser.lastVisitAt || account.createdAt).getTime()) / (1000 * 3600 * 24)),
            is_last_visit_this_week: adminUser.lastVisitAt >= runDate.startOf('week') ? 1 : 0,

            //engagment - general
            is_consigning: externalSaleChannels.length > 0 ? 1 : 0,
            is_warehousing_service_enabled: adminUserRole.permissions.find(p => p.resource.name === 'service.warehousing') ? 1 : 0, 
            is_transfer_service_enabled: adminUserRole.permissions.find(p => p.resource.name === 'service.transfer') ? 1 : 0, 

            //engagement - inventory
            inventory_items_count: inventoryItems.length,
            inventory_value: Math.floor(inventoryItems.reduce((acc, item) => acc + parseFloat(item.inventory.cost || 0), 0)),
            inventory_items_added: inventoryItems.filter(item => item.createdAt >= runDate).length,

            //engagement - inventory - virtual
            virtual_inventory_count: accountVirtualInventoryRecords.length,
            //virtual_inventory_value: accountVirtualInventoryRecords,
            virtual_inventory_added: accountVirtualInventoryRecords.filter(vir => vir.createdAt >= runDate).length,
            virtual_inventory_sales_volume: Math.floor(itemsSoldVirtualInventory.reduce((acc, curr) => acc + parseFloat(curr.price), 0)),
            
            //engagement - sale channels
            sale_channels: account.saleChannels.length,
            sale_channels_external: externalSaleChannels.length,
            sale_channels_laced: account.saleChannels.find(sc => sc.platform === 'laced' && sc.accountID == account.ID) ? 1 : 0,
            sale_channels_shopify: account.saleChannels.find(sc => sc.platform === 'shopify' && sc.accountID == account.ID) ? 1 : 0,

            //engagement - sales
            sales_volume: Math.floor(accountSales.reduce((acc, curr) => acc + parseFloat(curr.totalAmount), 0)),
            sales_volume_manual: Math.floor(accountSales.filter(sale => sale.tags.includes('manual')).reduce((acc, curr) => acc + parseFloat(curr.totalAmount), 0)),
            sales_volume_shopify: Math.floor(accountSales.filter(sale => sale.saleChannel.platform === 'shopify').reduce((acc, curr) => acc + parseFloat(curr.totalAmount), 0)),
            sales_count: accountSales.length,
            sales_count_manual: accountSales.filter(sale => sale.tags.includes('manual')).length,
            sales_count_shopify: accountSales.filter(sale => sale.saleChannel.platform === 'shopify').length,
            sales_items_count: accountSales.reduce((acc, curr) => acc + curr.orderLineItems.length, 0),
            
            //engagement - laced
            laced_listings_count: lacedListings.filter(listing => listing.accountID == account.ID).length,
            laced_sales_count: accountSales.filter(sale => sale.saleChannel.platform === 'laced').length,
            laced_sales_volume: Math.floor(accountSales.filter(sale => sale.saleChannel.platform === 'laced').reduce((acc, sale) => acc + parseFloat(sale.totalAmount), 0)),

            //engagement - consignment
            consignment_sales_volume: Math.floor(accountConsignmentSales.reduce((acc, curr) => acc + parseFloat(curr.totalAmount), 0)),
            consignment_sales_fees: consignment_sales_fees,
            consignment_sales_count: accountConsignmentSales.length,
            consignment_inventory_items_count: inventoryItemsOnSaleOnAccountSaleChannels.length,
            consignment_inventory_value: Math.floor(inventoryItemsOnSaleOnAccountSaleChannels.reduce((acc, item) => acc + parseFloat(item.inventory.cost || 0), 0)),
            consignment_inventory_items_instock: inventoryItemsOnSaleOnAccountSaleChannels.filter(item => item.inventory.warehouse.accountID == account.ID).length,
            consignment_accounts_connected: accountsSellingOnThisAccountSaleChannel.length,
            consignment_accounts_sold_item: ([... new Set(accountConsignmentSales.map(sale => sale.orderLineItems.map(oli => oli.item.accountID)).flat())]).length,
            consignment_accounts_stocked_item: ([... new Set(inventoryItemsOnSaleOnAccountSaleChannels.map(item => item.accountID))]).length,
        }

        reportData.push(accountData)
    }

    if (configs.environment != 'prod') return reportData

    const accountsReportAsString = await new objectsToCsv(reportData).toString()
    const accountsReportAsAttachmentBase64 = Buffer.from(accountsReportAsString).toString('base64')

    const data = {
        to: ['s.rosa@wiredhub.io'],
        subject: `Fliproom - Your Weekly accounts report is available ${moment().format('DD-MM-YYYY')}`,
        body: 'Report ready',
        attachments: [{
            content: accountsReportAsAttachmentBase64,
            filename: `accounts_report_${moment().format('DD-MM-YYYY')}.csv`,
            type: "text/csv",
            disposition: "attachment"
        }]
    }

    await service.bridge.sendGrid.sendEmail(data)
}

exports.editLDNVirtualStockReport = async () => {
    logger.info(`workflows.editLDNVirtualStockReport`)
    const objectsToCsv = require('objects-to-csv')

    if (configs.environment != "prod") return

    const virtualInventory = await db.inventoryListing.findAll({
        where: {
            saleChannelID: 1,
            '$inventory.virtual$': true,
        },
        include: [
            {model: db.productVariant, as: 'variant', include: [
                {model: db.productVariant, as: 'sourceProductVariant'}
            ]}, 
            {model: db.inventory, as: 'inventory'}, 
            {model: db.product, as: 'product'}, 
        ]
    })

    const errorsTransactions = {
        'notSelling': false,
        'priceSyncOff': false,
        'priceLowerThanMarket': false,
        'marginWarning': false,
    }

    const reportData = []
    for (var virtualListing of virtualInventory) {
        const report = {
            'listing.product':        virtualListing.product.title,
            'stockx.price':          virtualListing.variant.sourceProductVariant?.price,
            'listing.margin':          virtualListing.priceSourceMargin,
            'listing.price':          virtualListing.price,
            'listing.status':          virtualListing.status,
            'Listing Url':           `https://app.fliproom.io/inventory/product/${virtualListing.productID}/variants/${virtualListing.productVariantID}?inventoryID=${virtualListing.inventoryID}`
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errorsTransactions))

        errorsRecord.notSelling = (virtualListing.status != 'active')
        errorsRecord.priceSyncOff = (virtualListing.variant.sourceProductVariantID && !virtualListing.priceSourceName)
        errorsRecord.priceLowerThanMarket = (virtualListing.variant.sourceProductVariantID && parseFloat(virtualListing.price) < parseFloat(virtualListing.variant.sourceProductVariant.price))
        errorsRecord.marginWarning = (parseFloat(virtualListing.priceSourceMargin) < 21)

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            reportData.push(report)
        }

    }

    if (reportData.length == 0) return

    const accountsReportAsString = await new objectsToCsv(reportData).toString()
    const accountsReportAsAttachmentBase64 = Buffer.from(accountsReportAsString).toString('base64')

    const data = {
        to: ['marina@theeditldn.com', 'millie@theeditldn.com', 's.rosa@wiredhub.io'],
        subject: `Fliproom - Your virtual stock report is available ${moment().format('DD-MM-YYYY')}`,
        body: `Here's your report attached`,
        attachments: [{
            content: accountsReportAsAttachmentBase64,
            filename: `virtual_stock_report_${moment().format('DD-MM-YYYY')}.csv`,
            type: "text/csv",
            disposition: "attachment"
        }]
    }

    await service.bridge.sendGrid.sendEmail(data)
}


exports.chargePersonalShoppingService = async () => {
    /**
     * This function is used to charge the personal shopping service fee to the accounts subscribed to the service.
     */
    const accountsSubscribed = await db.account.findAll({
        where: {
            ID: 3
        }
    })
    const startDate = moment().startOf('month').format('YYYY-MM-DD')
    const endDate = moment().endOf('month').add(1, 'days') .format('YYYY-MM-DD')
    logger.info(`workflows.chargePersonalShoppingService ${startDate} ${endDate} | Accounts: ${accountsSubscribed.length}`)

    for (const account of accountsSubscribed) {
        const serviceUser = await service.account.serviceUser(account.ID)
        const dbOrders = await service.order.getAll(serviceUser, 0, 9999, {tags: `~personal-shopping`, createdAt: `${startDate}:${endDate}`})
        logger.info(`[chargePersonalShoppingService] AccountID: ${account.ID} Orders: ${dbOrders.rows.length}`)
        const invoiceItems = []
        for (const order of dbOrders.rows) {
            const saleTx = order.transactions.find(tx => tx.type == 'sale')
            if (saleTx.status != 'canceled') {
                invoiceItems.push({
                    name: `#${order.ID} - ${order.reference1} - ${order.account.currency.toUpperCase()} ${order.totalAmount}`,
                    amount: parseFloat(order.totalAmount) * 0.0125,
                })
            }
        }
        //console.log(invoiceItems)
    }
}