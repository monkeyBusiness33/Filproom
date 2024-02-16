const axios = require('axios')
const logger = require('../../libs/logger')
const service = require('../main')
const db = require('../../libs/db');
const configs = require("../../configs");
const Op = require('sequelize').Op;
const utils = require('../../libs/utils')
const moment = require('moment')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

require('@shopify/shopify-api/adapters/node');
const { shopifyApi} = require('@shopify/shopify-api');
const  { restResources } = require ("@shopify/shopify-api/rest/admin/2023-04");

exports.account = {
    setupWebhooks: async(accountID) => {
        /**
         * This function is used to setup webhooks on shopify
         */
        logger.info(`shopify.account.setupWebhooks for account ${accountID}`)
        const serviceUser = await service.account.serviceUser(accountID)
        const {shopify, shopifySession} = await service.bridge.shopify.client( accountID)
    
        // add webhooks
        logger.debug(`Setup WebHooks for store ${shopifySession.shop} on domain ${configs.microservices.api}`)
        const _webhooksList = [
            {topic: 'products/create', endpoint: configs.microservices.api + '/api/webhooks/shopify/product/created'},
            {topic: 'products/update', endpoint: configs.microservices.api + '/api/webhooks/shopify/product/updated'},
            {topic: 'products/delete', endpoint: configs.microservices.api + '/api/webhooks/shopify/product/deleted'},
            {topic: 'orders/create',   endpoint: configs.microservices.api + '/api/webhooks/shopify/order/created'},
            {topic: 'orders/edited',   endpoint: configs.microservices.api + '/api/webhooks/shopify/order/edited'},
            {topic: 'refunds/create',  endpoint: configs.microservices.api + '/api/webhooks/shopify/refund/created'},
            {topic: 'fulfillments/create', endpoint: configs.microservices.api + '/api/webhooks/shopify/fulfillment/created'},
        ]
    
        // Check for new webhooks defined in _webhooksList
        logger.debug(`Fetch existing webhooks for account ${accountID} on store ${shopifySession.shop}`)
        let webhooksResponse = await shopify.rest.Webhook.all({session: shopifySession});
        let webhooks = webhooksResponse.data

        const webhooksToDelete = webhooks.filter(webhook => {
            const match = _webhooksList.find(wh => wh.topic == webhook.topic && wh.endpoint == webhook.address)
            return !match
        })
        logger.debug(`Deleting ${webhooksToDelete.length} existing webhooks that don't match the template list above`)
        for (var _wh of webhooksToDelete) {
            try {
                await shopify.rest.Webhook.delete({session: shopifySession, id: _wh.id,});
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                logger.error(`Impossible to delete webhook`)
                throw {
                    status: e.response?.status || 500,
                    message: `Impossible to delete webhook ${_wh.topic} | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                    errors: e.response?.body?.errors || e.response?.errors
                }
            }
        }

        const newWebhooks = _webhooksList.filter(webhook => {
            const match = webhooks.find(_wh => _wh.topic == webhook.topic && _wh.address == webhook.endpoint)
            return !match
        })
        logger.debug(`Recording ${newWebhooks.length} webhooks for store ${shopifySession.shop}`)
        for (var _wh of newWebhooks) {
            try {
                const webhook = new shopify.rest.Webhook({session: shopifySession});
                webhook.address = _wh.endpoint;
                webhook.topic = _wh.topic;
                webhook.format = "json";
                await webhook.save({update: true});
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                throw {
                    status: e.response?.status || 500,
                    message: `Impossible to add webhook ${_wh.topic} on endpoint: ${_wh.endpoint} | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                    errors: e.response?.body?.errors || e.response?.errors
                }
            }
        }
    },
    deleteAllProducts: async(accountID) => {
        /**
         * This function is used to delete all products on shopify
         * This function is used only on staging environment for safety purposes
         */
        logger.info(`shopify.account.deleteAllProducts for account ${accountID}`)
        if (configs.environment != "staging") {
            logger.info('Not in staging environment - skipping shopify.account.deleteAllProducts')
            return
        }
        const serviceUser = await service.account.serviceUser(accountID)
        const {shopify, shopifySession} = await service.bridge.shopify.client( accountID)
        if (!shopify) {
            return
        }
        // get all products
        let idx = 0
        let pageInfo;
        let shopifyProducts = []
        do {
            const response = await shopify.rest.Product.all({
                ...pageInfo?.nextPage?.query,
                session: shopifySession,
                limit: 250,
            });
    
            const pageProducts = response.data;
            shopifyProducts = shopifyProducts.concat(pageProducts)
            idx += pageProducts.length
    
            pageInfo = response.pageInfo;
        } while (pageInfo?.nextPage);

        // delete all products
        for (var product of shopifyProducts) {
            try {
                await shopify.rest.Product.delete({session: shopifySession, id: product.id,});
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                throw {
                    status: e.response?.status || 500,
                    message: `Impossible to delete product ${product.id} | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                    errors: e.response?.body?.errors || e.response?.errors
                }
            }
        }
    },
    getProducts: async(accountID) => {
        const serviceUser = await service.account.serviceUser(accountID)
        const {shopify, shopifySession} = await service.bridge.shopify.client( accountID)
        const storename = shopify.config.hostName.split('.')[0]

        const productsCount = (await shopify.rest.Product.count({session: shopifySession})).count;

        let shopifyProducts = []
        let pageInfo;
        let idx = 0
        do {
            const response = await shopify.rest.Product.all({
                ...pageInfo?.nextPage?.query,
                session:shopifySession,
                limit: 250,
            });
    
            const pageProducts = response.data;
            shopifyProducts = shopifyProducts.concat(pageProducts)
            idx += pageProducts.length
            console.log(`${storename} - ${idx}/${productsCount}`)
    
            pageInfo = response.pageInfo;
        } while (pageInfo?.nextPage);

        // add sale channel form where they coming from to every product
        shopifyProducts = shopifyProducts.map(product => {
            product.saleChannel = storename
            return product
        })

        return shopifyProducts
    },
    getOrders: async(accountID, sinceDatetime = moment().subtract(30, 'days')) => {
        const serviceUser = await service.account.serviceUser(accountID)
        const {shopify, shopifySession} = await service.bridge.shopify.client( accountID)
        const storename = shopify.config.hostName.split('.')[0]
        const ordersCount = (await shopify.rest.Order.count({session: shopifySession, status:'any', created_at_min: sinceDatetime.toISOString()})).count;

        let shopifyOrders = []
        let shopifyFulfillments = []
        let idx = 0
        let pageInfo;
        do {
            let options = {
                session:shopifySession,
                status:'any',
                created_at_min: sinceDatetime.toISOString(),
                limit: 250,
            };
            if (pageInfo?.nextPage) {
                options = {
                    session: shopifySession,
                    ...pageInfo?.nextPage?.query,
                    limit: 250,
                };
            }
            const response = await shopify.rest.Order.all(options);
    
            const pageOrders = response.data;
            shopifyOrders = shopifyOrders.concat(pageOrders)
            idx += pageOrders.length
            console.log(`${storename} - ${idx}/${ordersCount}`)
            pageInfo = response.pageInfo;
        } while (pageInfo?.nextPage);
    
    
        // add sale channel form where they coming from to every product
        shopifyOrders = shopifyOrders.map(order => {
            order.saleChannel = storename
            order.fulfillments.map(fulfillment => {
                fulfillment.saleChannel = storename
                shopifyFulfillments.push(fulfillment)
            })
            return order
        })

        return shopifyOrders
    }
}

exports.order = {
    refund: async(user, body) => {
        /**
         * 
         * {
         *  ID: number
         *  orderLineItems: [
         *      ID: number
         *  ]
         * 
         * }
         */
        logger.info("Shopify POST refunds", {data: body})
        const serviceUser = await service.account.serviceUser(user.accountID) // Using serviceUser decoded from the apiKey sent as bearer in the request

        const order = await service.order.getOne(serviceUser, body.ID)
        const orderLineItemsToRefund = order.orderLineItems.filter(oli => body.orderLineItems.find(o => o.ID == oli.ID))

        // Init shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client( order.accountID)

        let shopifyOrder;
        try {
            shopifyOrder = await shopify.rest.Order.find({session: shopifySession, id: order.foreignID})
        }
         catch (e) {
             throw ({
                 status: e.response?.status || 500,
                 message: `Impossible to get shopify order | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                 errors: e.response?.body?.errors || e.response?.errors
             })
        }
        //const shopifyOrder = resp.data.order

        // 1. calculate refund
        const lineItemsToRefund = []
        shopifyOrder.line_items.map(lineItem => { // for each order line item - compute how many items to refund 
            const oli = orderLineItemsToRefund.filter(oli => oli.variant.foreignID == lineItem.variant_id)
            // check there is already a refunded order line item
            const refundedOrderLineItems = []
            shopifyOrder.refunds.filter(refund => refund.refund_line_items.length != 0).map(refund => refund.refund_line_items.map(i => refundedOrderLineItems.push(i)))
            const match = refundedOrderLineItems.find(rli => rli.line_item_id == lineItem.id)
            if (!match && oli.length > 0) {
                lineItemsToRefund.push({
                    "line_item_id": lineItem.id,
                    "quantity": 1,
                    "restock_type": "no_restock"
                })
            }
        })
        if (lineItemsToRefund.length == 0) {
            logger.silly("No line items to refund")
            return
        }

        let calculatedRefund = null
        try {
            const refund = new shopify.rest.Refund({session: shopifySession});
            refund.order_id = order.foreignID;
            const resp = await refund.calculate({
                body: {"refund": {
                        "shipping": {
                            "full_refund": true
                        },
                        "refund_line_items": lineItemsToRefund
                    }},
            });
            calculatedRefund = resp.refund;

        } catch (e) {
            throw ({
                status: e.response?.status || 500,
                message: `Impossible to Calculate shopify refund | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                errors: e.response?.body?.errors || e.response?.errors
            })
        }

        // 2. Apply refund
        const transactions = []
        calculatedRefund.transactions.map(transaction => {
            transactions.push({
                parent_id: transaction.parent_id,
                amount: transaction.amount,
                kind: 'refund',
                gateway: transaction.gateway
            })
        })

        try {
            //fetch and update refund
            const refund = new shopify.rest.Refund({session: shopifySession});
            //adapt refund object
            refund.order_id = order.foreignID;
            refund.currency = calculatedRefund.currency;
            refund.notify = true;
            refund.note = "";
            refund.shipping = calculatedRefund.shipping
            refund.refund_line_items = lineItemsToRefund
            refund.transactions = transactions
            //save refund
            await refund.save({
                update: true,
            });
        } catch (e) {
            throw ({
                status: e.response?.status || 500,
                message: `Impossible to update shopify product refund | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                errors: e.response?.body?.errors || e.response?.errors
            })
        }
    },

    dataCheck: async() => {
        /**
         * 
         */
        console.log("shopify.order.dataCheck")
        const objectsToCsv = require('objects-to-csv')
        const shopifySaleChannels = await db.saleChannel.findAll({where: {platform: 'shopify'}})
        const shopifyOrders = []
        const sinceDatetime = moment().subtract(30, 'days')
        for(const saleChannel of shopifySaleChannels){
            if (saleChannel.accountID == 3791) continue //skip littlelaces

            const shopifyOrdersAccount = await service.bridge.shopify.account.getOrders(saleChannel.accountID, sinceDatetime)
            shopifyOrders.push(...shopifyOrdersAccount)
        }

        console.log(">> fetching dbSaleOrders")
        const dbSaleOrders = await db.order.findAll({
            where: {
                updatedAt: {[Op.gte]: sinceDatetime},
                typeID: 4,
            },
            include: [
                {model: db.account,       as:'account'},
                {model: db.status, as: 'status'},
                {model: db.saleChannel, as: 'saleChannel'},
                {model: db.transaction, as: 'transactions'},
                {model: db.orderType, as: 'type'},
                {model: db.orderLineItem, as:'orderLineItems', include: [
                        {model: db.product, as: 'product'},
                        {model: db.productVariant, as: 'variant'},
                        {model: db.status, as: 'status'},
                        {model: db.item, as: 'item'}
                    ]}
            ]
        })
        console.log(">> fetching dbFulfillments")
        const dbFulfillments = await db.fulfillment.findAll({
            where: {
                updatedAt: {[Op.gte]: sinceDatetime},
            },
            include: [
                {model: db.orderLineItem, as: 'orderLineItems'},
                {model: db.status, as: 'status' }
            ]
        })
    
        const errorsShopifyOrders = {
            'missingShopifyOrder': false,
            'duplicatedShopifyOrder': false,
            'emptyShopifyOrder': false,
            'fulfillmentStatusMissmatch': false,
            'refundedStatusMissmatch': false,
            'saleAmountMissmatch': false
        }
        const errorsShopifyFulfillments = {
            'missingShopifyFulfillment': false,
            'quantityMissmatch': false,
        }
    
        const shopifyOrderReport = []
        const shopifyFulfillmentReport = []
        shopifyOrders.map(sorder => {
            //skip edit LDN woo commerce orders (they have reference in format R128817338-1)
            if (/^R\d{9}-\d$/.test(sorder.name)) {
                return
            }
            const shopifyOrderQuantity = sorder.line_items.reduce((total, lineItem) => total += lineItem.quantity, 0)
            const productsDontExist = sorder.line_items.filter(lineItem => lineItem.product_id == null)
            const prelovedProducts = sorder.line_items.filter(lineItem => lineItem.name.toLowerCase().includes("loved"))
            const giftcardsProducts = sorder.line_items.filter(lineItem => lineItem.name.toLowerCase().includes("gift card"))
            let refundedQty = 0
            if (sorder.refunds.length > 0) {
                sorder.refunds.map(rf => rf.refund_line_items.map(li => refundedQty += li.quantity))
            }
    
            const dbAdminOrderList = dbSaleOrders.filter(order => 
                (
                order.foreignID == sorder.id || 
                (sorder.name && order.reference1 && (sorder.name.toLowerCase() == order.reference1.toLowerCase()))
                ) && 
                order.accountID == order.saleChannel.accountID
                )
            const untrackedProducts = sorder.line_items.filter(lineItem =>  {
                const dbProduct = dbAdminOrderList[0]?.orderLineItems.find(oli => oli.product.foreignID == lineItem.product_id)
                return dbProduct?.untracked
            })
            
            if (
                ((moment() - moment(sorder.created_at)) < 1000 * 60 * 60) || // skip if shopify order is less than 1 hr old
                (productsDontExist.length == shopifyOrderQuantity) || // don't include orders with only products that don't exist
                (prelovedProducts.length == shopifyOrderQuantity) || // don't include orders with only pre-loved products (edit-ldn bullshit)
                (giftcardsProducts.length == shopifyOrderQuantity) || // don't include orders with only gift cards (edit-ldn bullshit)
                (sorder.tags.includes("threads-styling")) // don't include threads orders not imported
            ) {
                return
            }
            
            const report_order = {
                'shopify.createdAt': sorder.created_at,
                'saleChannel': sorder.saleChannel,
                'shopify.id': sorder.id,
                'shopify.order_number': sorder.order_number,
                'Financial Status': sorder.financial_status,
                'shopify.fulfillment_status': sorder.fulfillment_status,
                'order.fulfillment_status': dbAdminOrderList[0]?.status.name || '',
                'shopify.quantity': shopifyOrderQuantity,
                'shopify.refundedQty': refundedQty,
                'order.quantity': dbAdminOrderList[0]?.quantity,
                'shopify.name': sorder.name,
                'order.reference1': sorder.reference1,
                'sorder.saleAmount': sorder.total_line_items_price,
                'order.saleAmount': dbAdminOrderList[0]?.transactions.find(tx => tx.type == "sale").grossAmount,
                'Product Dont exists qty': productsDontExist.length,
                'Untracked products': untrackedProducts.length,
                'pre-loved products qty': prelovedProducts.length,
                'gift-cards products qty': giftcardsProducts.length,
                'orderIds': dbAdminOrderList.map(order => order.ID).join(","),
                'shopify_url': `https://admin.shopify.com/store/${sorder.saleChannel}/orders/${sorder.id}`,
                'fliproom_url': dbAdminOrderList[0] ? `https://app.fliproom.io/orders/${dbAdminOrderList[0].ID}` : null
            }
            const orderErrorsRecord = JSON.parse(JSON.stringify(errorsShopifyOrders))
    
            if (dbAdminOrderList.length == 0 ) {
                orderErrorsRecord['missingShopifyOrder'] = true
            }
    
            if (dbAdminOrderList.length > 1) {
                orderErrorsRecord['duplicatedShopifyOrder'] = true
            }
    
            if (dbAdminOrderList.length == 1 && dbAdminOrderList[0].orderLineItems.length == 0) {
                orderErrorsRecord['emptyShopifyOrder'] = true
            }
    
            if (dbAdminOrderList.length == 1 && dbAdminOrderList[0].transactions.find(tx => tx.type == "sale").grossAmount != parseFloat(sorder.total_line_items_price)) {
                orderErrorsRecord['saleAmountMissmatch'] = true
            }
    
            // Compare statuses
            if (dbAdminOrderList.length == 1 && sorder.fulfillment_status == "fulfilled" && !["fulfilling", "dispatched", "delivered"].includes(dbAdminOrderList[0].status.name) && refundedQty == 0) {
                orderErrorsRecord['fulfillmentStatusMissmatch'] = true
            }
    
            //refunded before fulfilling
            if (dbAdminOrderList.length == 1 && sorder.fulfillment_status == null && sorder.financial_status == "refunded" && dbAdminOrderList[0].status.name != "deleted") {
                orderErrorsRecord['refundedStatusMissmatch'] = true
            }
    
            //refunded after fulfilling
            if (dbAdminOrderList.length == 1 && sorder.fulfillment_status == "restocked" && dbAdminOrderList[0].status.name != "deleted") {
                orderErrorsRecord['refundedStatusMissmatch'] = true
            }
    
            // if any error triggered - add record to report
            if (Object.values(orderErrorsRecord).find(error => error) == true) {
                for (var errorName in orderErrorsRecord) {
                    report_order[errorName] = orderErrorsRecord[errorName]
                }
                shopifyOrderReport.push(report_order)
            }
    
            sorder.fulfillments.map(sfulfillment => {
                if (sfulfillment.status == "cancelled") {
                    return
                }
                const dbFulfillment = dbFulfillments.find(fulfillment => fulfillment.foreignID == sfulfillment.id)
                const dbAdminOrder = dbAdminOrderList[0]
    
                if (!dbAdminOrder) {
                    return
                }
                const orderFulfillments = dbFulfillments.filter(fulfillment => fulfillment.outboundOrderID == dbAdminOrder?.ID)
                const itemsFulfilledQty = sfulfillment.line_items.filter(soli => {
                    //remove shit products not even on db
                    if (
                        soli.name.toLowerCase().includes("the edit ldn tote bag") || 
                        soli.name.toLowerCase().includes("gift card") || 
                        soli.name.toLowerCase().includes("loved") || 
                        soli.name.toLowerCase().includes("shipping")
                        ) {
                        return false
                    }
    
                    const dbProduct = dbAdminOrder?.orderLineItems.find(oli => oli.product.foreignID == soli.product_id)
                    //remove untracked products
                    return dbProduct ? !dbProduct.untracked : true
                }).reduce((total, lineItem) => total += lineItem.quantity, 0)
    
                const report_fulfillment = {
                    'shopify.createdAt': sfulfillment.created_at,
                    'shopify.saleChannel': sorder.saleChannel,
                    'shopify.id': sfulfillment.id,
                    'shopify.order_id': sfulfillment.order_id,
                    'shopify.quantity': itemsFulfilledQty,
                    'quantity': dbFulfillment?.orderLineItems.length,
                    'fulfillment.ids': orderFulfillments.map(f => f.ID).join(","),
                    'order.id': dbAdminOrder?.ID,
                    'createdAts': orderFulfillments.map(f => moment(f.createdAt)).join(" | "),
                    'account.id': dbAdminOrder?.accountID,
                    'shopify_url': `https://admin.shopify.com/store/${sorder.saleChannel}/orders/${sfulfillment.order_id}` 
                }
    
                const fulfillmentErrorsRecord = JSON.parse(JSON.stringify(errorsShopifyFulfillments))
    
                //whitelisted fulfillments - because of extreme edge cases
                if (([
                    4845879001336, //item still waiting sourcing on fliproom but fulfilled on shopify
                    4849004609784, //item still waiting sourcing on fliproom but fulfilled on shopify
                    5262797832529, //item still waiting sourcing on fliproom but fulfilled on shopify
    
                    4415503663148, // weird scenario
                    4847315484920, //contains only shipping and taxes as item
                ]).includes(sfulfillment.id)) return
    
                // fulfillment not linked
                if (dbAdminOrder && !dbFulfillment && (moment(sfulfillment.created_at).utc() > moment.utc("2023-11-22", "YYYY-MM-DD")) && (moment(sfulfillment.created_at) < moment().subtract(1, 'hour'))) {
                    console.log(`missing dbFulfillment for order id ${dbAdminOrder.foreignID} shopifyId ${sfulfillment.order_id} | fulfillmentId ${sfulfillment.id} ${moment(sfulfillment.created_at).utc()}`)
                    fulfillmentErrorsRecord['missingShopifyFulfillment'] = true
                }
    
                //exclude scenarios where fulfillment has been cancelled on fliproom since fliproom qty is but shopify shows it as fulfilled
                if (dbAdminOrder && dbFulfillment && dbFulfillment.status.name != "deleted" && dbFulfillment.orderLineItems.length != itemsFulfilledQty) {
                    sfulfillment.line_items.filter(soli => console.log(soli.name))
                    fulfillmentErrorsRecord['quantityMissmatch'] = true
                }
    
                // if any error triggered - add record to report
                if (Object.values(fulfillmentErrorsRecord).find(error => error) == true) {
                    for (var errorName in fulfillmentErrorsRecord) {
                        report_fulfillment[errorName] = fulfillmentErrorsRecord[errorName]
                    }
                    shopifyFulfillmentReport.push(report_fulfillment)
                }
    
    
            })
        })

        //export
        const attachments = []
        if (shopifyOrderReport.length > 0) {
            const shopifyOrderReportAsString = await new objectsToCsv(shopifyOrderReport).toString()
            const shopifyOrderReportAttachmentBase64 = Buffer.from(shopifyOrderReportAsString).toString('base64')

            if (!configs.onCloud) {
                await (new objectsToCsv(shopifyOrderReport)).toDisk(`./scripts/checksReports/shopifyOrderReport.csv`)
            }

            attachments.push({
                content: shopifyOrderReportAttachmentBase64,
                filename: `shopify_orders.csv`,
                type: "text/csv",
                disposition: "attachment"
            })
        }
        let message = `<br><br>Shopify Orders Report<br>`
        for (var errorType in errorsShopifyOrders) {
            message += `${shopifyOrderReport.filter(r => r[errorType]).length} - ${errorType}<br>`
        }

        if (shopifyFulfillmentReport.length > 0) {
            const shopifyFulfillmentReportAsString = await new objectsToCsv(shopifyFulfillmentReport).toString()
            const shopifyFulfillmentReportAttachmentBase64 = Buffer.from(shopifyFulfillmentReportAsString).toString('base64')

            if (!configs.onCloud) {
                await (new objectsToCsv(shopifyFulfillmentReport)).toDisk(`./scripts/checksReports/shopifyFulfillmentReport.csv`)
            }

            attachments.push({
                content: shopifyFulfillmentReportAttachmentBase64,
                filename: `shopify_fulfillments.csv`,
                type: "text/csv",
                disposition: "attachment"
            })
        }
        message += `<br><br>Shopify Fulfillments Report<br>`
        for (var errorType in errorsShopifyFulfillments) {
            message += `${shopifyFulfillmentReport.filter(r => r[errorType]).length} - ${errorType}<br>`
        }

        const data = {
            to: ['s.rosa@wiredhub.io', 'a.singhania@wiredhub.io'],
            subject: `[DATA CHECK] - Shopify Orders & Fulfillments Report - ${moment().format('ll')}`,
            body: message,
            attachments: attachments
        }
    
        try {
            await service.bridge.sendGrid.sendEmail(data)
        } catch (e) {
            console.log(e.response)
        }
    }
}

exports.fulfillment = {
    create: async(user, fulfillment) => {
        /**
         * This function is used to create a fulfillment on shopify
         * 
         * {
         *  ID: number
         *  orderLineItems: [
         *      ID: number
         *  ]
         * 
         * fulfillment.outboundOrder.foreignID
         * fulfillment.trackingNumber
         * fulfillment.courier.name
         * }
         */
        logger.info("shopify.fulfillment.create", {data: fulfillment})

        // Init shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client( user.accountID)
        if (!shopify) {
            return
        }
            
        //if order not linked to shopify - return
        if (!fulfillment.outboundOrder.foreignID) {
            throw {status: 400, message: `Order ${fulfillment.outboundOrder.ID} not linked to shopify`}
        }

        let fulfillmentOrder;
        //mocking GET shopify/FulfillmentOrder/all for local environment
        if (configs.environment == "local") {
            const order = await service.order.getOne(user, fulfillment.outboundOrder.ID)
            fulfillmentOrder = {
                id: 123456789,
                line_items: order.orderLineItems.map(oli => {
                    return {
                        id: oli.variant.foreignID,
                        variant_id: oli.variant.foreignID,
                        fulfillable_quantity: 1
                    }
                })
            }
        } else {
            const _sfulfillmentOrders = await shopify.rest.FulfillmentOrder.all({
                session: shopifySession,
                order_id: fulfillment.outboundOrder.foreignID,
              });
              
    
            fulfillmentOrder = _sfulfillmentOrders.data.find(fo => fo.supported_actions.includes('create_fulfillment'))
            if (!fulfillmentOrder) {
                logger.info(`Shopify Fulfillment order`, {data: _sfulfillmentOrders.data})
                throw {status: 400, message: `No fulfillment order found for order ${fulfillment.outboundOrder.ID} - ${fulfillment.outboundOrder.foreignID}`}
            }
        }


        const _sfulfillment = new shopify.rest.Fulfillment({session: shopifySession});
        _sfulfillment.line_items_by_fulfillment_order = [
            {"fulfillment_order_id": fulfillmentOrder.id}
        ];

        const fulfillableQuantity = fulfillmentOrder.line_items.reduce((sum, lineItem) => sum += lineItem.fulfillable_quantity, 0)

        //if not all order has been fulfilled - add the line items to fulfill
        if (fulfillment.orderLineItems.length != fulfillableQuantity) {
            _sfulfillment.line_items_by_fulfillment_order[0]['fulfillment_order_line_items'] = []

            for (var oli of fulfillment.orderLineItems) {
                const fulfillmentOliId = fulfillmentOrder.line_items.find(soli => soli.variant_id == oli.variant.foreignID).id
                const record = _sfulfillment.line_items_by_fulfillment_order[0]['fulfillment_order_line_items'].find(oli => oli.id == fulfillmentOliId)
                if (record) {
                    record.quantity += 1
                    continue
                }

                _sfulfillment.line_items_by_fulfillment_order[0]['fulfillment_order_line_items'].push({
                    "id": fulfillmentOliId,
                    "quantity": 1
                })
            }
        }

        if (fulfillment.trackingNumber) {
            _sfulfillment.tracking_info = {
                "number": fulfillment.trackingNumber,
                "company": fulfillment.courier ? fulfillment.courier.name : null
                //"url": "https://www.my-shipping-company.com?tracking_number=MS1562678"
            };
        }

        if (configs.environment == "local") {
            _sfulfillment.id = 123456789
            await db.fulfillment.update({foreignID: _sfulfillment.id}, {where: {ID: fulfillment.ID}})
            return _sfulfillment
        }

        try {
            await _sfulfillment.save({update: true});
            await db.fulfillment.update({foreignID: _sfulfillment.id}, {where: {ID: fulfillment.ID}})
        }catch (e) {
             throw {
                 status: e.response?.status || 500,
                 message: `Impossible to create fulfillment for order ${fulfillment.outboundOrder.ID} | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                 errors: e.response?.body?.errors || e.response?.errors
             }
        }

        return service.fulfillment.getOne(user, fulfillment.ID)
    },
    update: async(user, fulfillment) => {
        /**
         * This function is used to update a fulfillment on shopify
         * 
         * {
         *   ID: number
         *   foreignID: string
         *   trackingNumber: string
         *   courier: {
         *      name: string
         *   }
         * }
         */
        logger.info("shopify.fulfillment.update", {data: fulfillment})
        if (!fulfillment.foreignID) {
            logger.info("No foreignID found for fulfillment", {data: fulfillment})
            return
        }
        // Init shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client( user.accountID)

        const _sfulfillment = new shopify.rest.Fulfillment({session: shopifySession});
        _sfulfillment.id = fulfillment.foreignID;
        const updates = {
        }

        if (fulfillment.trackingNumber) {
            updates['tracking_info'] = {}
            updates.tracking_info.number = fulfillment.trackingNumber
            updates.tracking_info.company = fulfillment.courier ? fulfillment.courier.name : null
        }

        if (configs.environment == "local") {
            return updates
        }

        if (Object.keys(updates).length == 0) {
            return service.fulfillment.getOne(user, fulfillment.ID)
        }

        try {
            await _sfulfillment.update_tracking({
                body: {
                    "fulfillment": updates
                }
            });
        }catch (e) {
             throw {
                 status: e.response?.status || 500,
                 message: `Impossible to update fulfillment for order ${fulfillment.outboundOrder.ID} | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                 errors: e.response?.body?.errors || e.response?.errors
             }
        }

        return service.fulfillment.getOne(user, fulfillment.ID)
    },
    cancel: async(user, body) => {
        /**
         * This function is used to cancel a fulfillment on shopify
         * {
         *  fulfillmentID: number
         * }
         */
        logger.info("shopify.fulfillment.cancel", {data: body})

        const fulfillment = await service.fulfillment.getOne(user, body.fulfillmentID)

        if (!fulfillment.foreignID) {
            logger.info("No foreignID found for fulfillment", {data: body})
            return
        }

        // Init shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client( user.accountID)

        const _sfulfillment = new shopify.rest.Fulfillment({session: shopifySession});
        _sfulfillment.id = fulfillment.foreignID;

        if (configs.environment == "local") {
            return "ok"
        }

        try {
            await _sfulfillment.cancel({});
            await db.fulfillment.update({foreignID: null}, {where: {ID: fulfillment.ID}})
        }catch (e) {
             throw {
                 status: e.response?.status || 500,
                 message: `Impossible to cancel fulfillment for order ${fulfillment.outboundOrder.ID} | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                 errors: e.response?.body?.errors || e.response?.errors
             }
        }

        return "ok"
    }
}

exports.variant = {
    create: async (_user, dbVariant) => {
        /**
         * Create Variant values
         */

        /**
         * MAY THROW ERRORS ON:
         *
         * - (422) variants same name
         */
        if (!await service.user.isAuthorized(_user.ID, _user.accountID)) {
            return
        }
        if (configs.environment == "local") {
            logger.info('Using Local Environment - Skipping Shopify Integration')
            return
        }


        // Check if variant needs to be created on shopify

        logger.info('Creating shopify variant', {data: dbVariant})

        try {
            //get shopify client and session
            const {shopify, shopifySession} = await service.bridge.shopify.client( dbVariant.product.accountID)

            if(!shopify){
                logger.info('No shopify store connected to account')
                return
            }

            //create variant on shopify
            const shopifyVariant = new shopify.rest.Variant({session: shopifySession});
            shopifyVariant.product_id = dbVariant.product.foreignID
            shopifyVariant.title = dbVariant.name
            shopifyVariant.option1 = dbVariant.name
            shopifyVariant.position = dbVariant.position + 1 // shopify first element starts at 1
            shopifyVariant.price = dbVariant.price || 0
            shopifyVariant.barcode = dbVariant.gtin || null
            //TODO: remove hardcoded accountID for R2R
            if (_user.accountID != 2830) shopifyVariant.sku = dbVariant.product.code

            //save and create variant
            await shopifyVariant.save({update: true})

            //update internal foreignID
            await db.productVariant.update({foreignID: shopifyVariant.id}, {where: {ID: dbVariant.ID}})
            return shopifyVariant
        } catch (e) {
            throw({
                status: e.response?.status || 500,
                message: `Impossible to Create Shopify Variant ${dbVariant.ID}  | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                errors: e.response?.body?.errors || e.response?.errors
            })
        }
    },

    update: async (_user, dbVariant) => {
        /**
         * Update Variant values
         */

        /**
         * MAY THROW ERRORS ON:
         *
         * - (422) variants same name
         */
        if (!await service.user.isAuthorized(_user.ID, _user.accountID)) {
            return
        }

        logger.info('Update shopify variant', {data: dbVariant})

        let shopifyVariant
        try {
            //get shopify client and session
            const {shopify, shopifySession} = await service.bridge.shopify.client( dbVariant.product.accountID)
            // Check if variant needs to be updated on shopify
            if (!shopify) {
                logger.info('No shopify store connected to account')
                return
            }
            //get and update variant on shopify
            shopifyVariant = new shopify.rest.Variant({session: shopifySession});
            shopifyVariant.id = dbVariant.foreignID;
            shopifyVariant.title = dbVariant.name
            shopifyVariant.option1 = dbVariant.name
            shopifyVariant.barcode = dbVariant.gtin || null
            shopifyVariant.position = dbVariant.position + 1
            //TODO: remove hardcoded accountID for R2R
            if (_user.accountID != 2830) shopifyVariant.sku = dbVariant.product.code

            /**
             * TESTING ENNVIRONMENT - SKIP SHOPIFY UPDATE
             */

            if (configs.environment == "local") {
                logger.info('Using Local Environment - Skipping Shopify Integration')
                return {variant: {
                        id: dbVariant.foreignID,
                        title: dbVariant.name,
                        option1: dbVariant.name,
                        barcode: dbVariant.gtin || null,
                        position: dbVariant.position + 1, // shopify first element starts at 1
                        sku: dbVariant.product.code,
                }}
            }

            //save variant
            await shopifyVariant.save({update: true});

        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: `Impossile Update Shopify Variant ${dbVariant.foreignID} (${dbVariant.ID}) | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                errors: e.response?.body?.errors || e.response?.errors
            }
        }
        return shopifyVariant
    },

    /**
     * Delete Variant values
     */
    delete: async (_user, dbVariant) => {
        //if (!await service.user.isAuthorized(_user.ID, _user.accountID)) {
        //    return
        //}

        if (configs.environment == "local") {
            logger.info('Using Local Environment - Skipping Shopify Integration')
            return dbVariant
        }


        
        logger.info('Delete shopify variant', {data: dbVariant})
        if (configs.environment == "local") {
            logger.info('Using Local Environment - Skipping Shopify Integration')
            return 'ok'
        }
        //get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client( dbVariant.product.accountID)
        // Check if variant needs to be deleted on shopify
        if(!shopify){
            logger.info('No shopify store connected to account')
            return
        }

        if (!dbVariant.foreignID) {
            logger.warn(`No foreignID found for variant ${dbVariant.ID}`)
            return
        }

        try {
            await shopify.rest.Variant.delete({
                session: shopifySession,
                product_id: dbVariant.product.foreignID,
                id: dbVariant.foreignID,
            });
        } catch (e) {
            console.log(e)
            throw {
                status: e.response?.status || 500,
                message: `Impossile Delete Shopify Variant ${dbVariant.ID}| ${JSON.stringify(e.response?.data?.errors ?? {})}`,
                errors: e.response
            }
        }
        return "ok"
    },

    sync: async(body) => {
        /**
         * variantID:               number
         * provenance:              string (where the update is coming from)
         */
        logger.info("Shopify Variant Update", {data: body})
        const variantID = body.variantID;

        const variant = await db.productVariant.findOne({
            where: {ID: variantID},
            include: [
                {model: db.product, as: 'product'}
            ]
        })
        if (!variant){
            logger.info('No variant found' , {data: variantID})
            return
        }

        const serviceUser = await service.account.serviceUser(variant.product.accountID)
        const shopifySaleChannel = await service.account.getShopifySaleChannel(variant.product.accountID)

        //make sure account has an eshop associated and variant is active
        let skipEshopUpdate = variant.untracked || variant.status == 'deleted' || !shopifySaleChannel
        if (skipEshopUpdate){
            logger.info('skipEshopUpdate' , {data: {
                untracked: variant.untracked ,
                deleted: variant.status == 'deleted',
                shopifyStoreName: shopifySaleChannel?.shopifyStoreName
            }})
            return
        }

        //sort by internal location - location priority - price - updatedAt
        let availableInventoryListings = await service.inventoryListing.activeListing(serviceUser, variant.ID, shopifySaleChannel.ID, true)

        // find all the inventory listings that match the active listing (first in the list)
        const selectedInventoryListings = availableInventoryListings.filter(invListing => 
            availableInventoryListings[0].virtual == invListing.virtual &&
            availableInventoryListings[0].price == invListing.price &&
            availableInventoryListings[0].inventory.warehouse?.ID == invListing.inventory.warehouse?.ID &&
            availableInventoryListings[0].inventory.warehouse?.accountID == invListing.inventory.warehouse?.accountID
        )


        //update all the inventory listings that don't match the active listing
        await db.inventoryListing.update({isActiveListing: false}, {where: {isActiveListing:true, saleChannelID: shopifySaleChannel.ID, productVariantID:variant.ID }})
        await db.inventoryListing.update( {isActiveListing: true},{where: {ID: selectedInventoryListings.map(l => l.ID), saleChannelID: shopifySaleChannel.ID, productVariantID:variant.ID }})


        
        const computedListing = {
            selectedInventoryListings: selectedInventoryListings,
            salePrice: selectedInventoryListings[0]?.price || null,
            quantity: selectedInventoryListings.reduce((sum, listing) => sum += parseFloat(listing.inventory.quantity), 0),
            accountID: selectedInventoryListings[0]?.inventory.warehouse?.accountID || null,
            warehouseID: selectedInventoryListings[0]?.inventory.warehouse?.ID || null,
            stockType: selectedInventoryListings[0]?.inventory.virtual == 1 ? 'virtual' : 'stock',
            metatags: {
                "stock.type": "out of stock",
                "stock.locationId": "null",
            }
        }
        logger.info(`New Inventory Listings Selected: ${selectedInventoryListings.length > 0 ? selectedInventoryListings.map(l => l.ID).join(",") : '<no-available>'} - listing price: ${computedListing.salePrice || '<no-available>'} | quantity: ${computedListing.quantity} `)

        // compute metatags
        if (computedListing.quantity != 0 && computedListing.selectedInventoryListings[0].inventory.warehouse?.accountID == computedListing.selectedInventoryListings[0].saleChannel.accountID) {
            // if stock available and stock at warehouse of the owner of the sale channel
            computedListing.metatags["stock.type"] = "store"
        } else if (computedListing.stockType == 'virtual' || computedListing.quantity != 0) {
            // if virtual stock or stock avaialbel at a warehouse that is not owned by the owner of the sale channel
            computedListing.metatags["stock.type"] = "sourcing"
        }

        if (computedListing.accountID == serviceUser.accountID) {
            computedListing.metatags["stock.locationId"] = computedListing.warehouseID
        }

        // used for test purposes - return expected data to send to shopify to verify correct behaviour
        if (configs.environment == "local") {
            return computedListing
        }

        //get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client( variant.product.accountID)
        if (!shopify) return

        // get shopify Variant record for obtaining the inventory_item_id
        let shopifyProductVariant;
        try {
            logger.info(`shopify-api - Get Variant ${variant.foreignID}`)
            shopifyProductVariant = await shopify.rest.Variant.find({
                session: shopifySession,
                id: variant.foreignID,
            });
        } catch (e) {
            throw { status: e.response?.code || 500, message: `shopify-api - GET variants/${variant.foreignID}| ${JSON.stringify(e.response?.body?.errors || e.message)}` }
        }

        // get shopify variant metafields - can't be done in a call with REST API. Only with graphQL
        let shopifyProductVariantMetafields;
        try {
            logger.info(`shopify-api - Get Variant ${variant.foreignID} metafields`)
            let shopifyProductVariantMetafieldsResp = await shopify.rest.Metafield.all({
                session: shopifySession,
                metafield: {"owner_id": shopifyProductVariant.id, "owner_resource": 'variants'},
            });
            shopifyProductVariantMetafields = shopifyProductVariantMetafieldsResp.data
        } catch (e) {
            throw { status: e.response?.code || 500, message: `shopify-api - GET  Variant ${variant.foreignID} metafields | ${JSON.stringify(e.response?.body?.errors || e.message)}` }
        }

        // update stock.type metafield if already set
        const stockTypeMetafield = shopifyProductVariantMetafields.find(metafield => metafield.key == 'type' && metafield.namespace == 'stock')
        logger.info(`shopify-api - metatag stock.type ${stockTypeMetafield?.value || '<missing>'} => ${computedListing.metatags["stock.type"]}`)
        if (stockTypeMetafield && stockTypeMetafield.value != computedListing.metatags["stock.type"]) {
            // update metafield
            try {
                logger.info(`shopify-api - Update Variant ${variant.foreignID} metafield ${stockTypeMetafield.id }`, {data: {"id": stockTypeMetafield.id, "value": computedListing.metatags["stock.type"]}})

                //update shopify  metafield
                const shopifyMetafield = new shopify.rest.Metafield({session: shopifySession});
                shopifyMetafield.id = stockTypeMetafield.id;
                shopifyMetafield.value = computedListing.metatags["stock.type"];
                await shopifyMetafield.save({
                    update: true,
                });
                logger.info(`shopify-api - Update Variant ${variant.foreignID} metafield ${stockTypeMetafield.id} - Success`)
            } catch (e) {
                logger.error(`shopify-api - Update Variant ${variant.foreignID} metafield ${stockTypeMetafield.id} - Failed with status code ${e.response?.status || 500}`)
                throw { status: e.response?.code || 500, message: `shopify-api - Update Variant ${variant.foreignID} metafield ${stockTypeMetafield.id} | ${JSON.stringify(e.response?.body?.errors || e.message)}` }
            }
        }

        // update stock.locationId metafield if already set
        const stockLocationMetafield = shopifyProductVariantMetafields.find(metafield => metafield.key == 'locationId' && metafield.namespace == 'stock')
        logger.info(`shopify-api - metatag stock.locationId ${stockLocationMetafield?.value || '<missing>'} => ${computedListing.metatags["stock.locationId"]}`)
        if (stockLocationMetafield && stockLocationMetafield.value != computedListing.metatags["stock.locationId"]) {
            // update metafield
            try {
                logger.info(`shopify-api - Update Variant ${variant.foreignID} metafield ${stockLocationMetafield.id } (stock.locationId)`, {data: {"id": stockLocationMetafield.id, "value": computedListing.metatags["stock.locationId"]}})
                const shopifyMetafield = new shopify.rest.Metafield({session: shopifySession});
                shopifyMetafield.id = stockLocationMetafield.id;
                shopifyMetafield.value = computedListing.metatags["stock.locationId"];
                await shopifyMetafield.save({update: true});
            } catch (e) {
                logger.error(`shopify-api - Update Variant ${variant.foreignID} metafield ${stockLocationMetafield.id} -  - Failed with status code ${e.response?.status || 500}`)
                throw { status: e.response?.code || 500, message: `shopify-api - Update Variant ${variant.foreignID} metafield ${stockLocationMetafield.id} | ${JSON.stringify(e.response?.body?.errors || e.message)}` }
            }
        }

        // variant doesn't have the stock.type metafield yet. create it
        if (!stockTypeMetafield && computedListing.metatags["stock.type"]){
            try {
                logger.info(`shopify-api - Create Variant ${variant.foreignID} metafield (stock.type)`, {data: {"value": computedListing.metatags["stock.type"]}})

                const shopifyMetafield = new shopify.rest.Metafield({session: shopifySession});
                shopifyMetafield.variant_id = shopifyProductVariant.id;
                shopifyMetafield.namespace = "stock";
                shopifyMetafield.key = "type"
                shopifyMetafield.type = "single_line_text_field";
                shopifyMetafield.value = computedListing.metatags["stock.type"];
                await shopifyMetafield.save({update: true});
            } catch (e) {
                throw { status: e.response?.code || 500, message: `shopify-api - Update Variant ${shopifyProductVariant.id} create metafield stock.type | ${JSON.stringify(e.response?.body?.errors || e.message)}` }
            }
        }

        // variant doesn't have the stock.locationId metafield yet. create it
        if (!stockLocationMetafield && computedListing.metatags["stock.locationId"]){
            try{
                logger.info(`shopify-api - Create Variant ${variant.foreignID} metafield (stock.locationId)`, {data: {"value": computedListing.metatags["stock.locationId"]}})
                const shopifyMetafield = new shopify.rest.Metafield({session: shopifySession});
                shopifyMetafield.variant_id = shopifyProductVariant.id;
                shopifyMetafield.namespace = "stock";
                shopifyMetafield.key = "locationId"
                shopifyMetafield.type = "single_line_text_field";
                shopifyMetafield.value = computedListing.metatags["stock.locationId"];
                await shopifyMetafield.save({update: true,});
            }
            catch(e){
                throw { status: e.response?.code || 500, message: `shopify-api - Update Variant ${shopifyProductVariant.id} create metafield stock.locationId | ${JSON.stringify(e.response?.body?.errors || e.message)}` }
            }

        }

        // update price if changed
        logger.info(`shopify-api - price | fliproom: ${computedListing.salePrice} - shopify: ${shopifyProductVariant.price}`)
        if (computedListing.salePrice && computedListing.salePrice != shopifyProductVariant.price) {
            try {
                logger.info(`shopify-api - Update Variant`, {data: computedListing.salePrice})
                const updatedShopifyProductVariant = new shopify.rest.Variant({session: shopifySession});
                updatedShopifyProductVariant.id = shopifyProductVariant.id;
                updatedShopifyProductVariant.price = computedListing.salePrice
                await updatedShopifyProductVariant.save({update: true,});
                shopifyProductVariant = updatedShopifyProductVariant

            } catch (e) {
                throw { status: e.response?.code || 500, message: `shopify-api - PUT variants/${shopifyProductVariant.id} | ${JSON.stringify(e.response?.body?.errors || e.message)}` }
            }

            // update google merchant price is price changed
            await service.bridge.gmerchant.variant.update(serviceUser, {variantID: variant.ID, data: {
                price: shopifyProductVariant.compare_at_price != null ? shopifyProductVariant.price : computedListing.salePrice
            }})
        }

        // Quantity Update
        logger.info(`shopify-api - quantity | fliproom: ${computedListing.quantity} - shopify: ${shopifyProductVariant.inventory_quantity}`)
        if (computedListing.quantity != shopifyProductVariant.inventory_quantity) {
            const warehouses = await service.account.getWarehouses(variant.product.accountID)
            const warehouseForeignID = warehouses[0].foreignID;
            const reqQtyBody = {
                location_id: warehouseForeignID,
                inventory_item_id: shopifyProductVariant.inventory_item_id,
                available: computedListing.quantity
            }
            try {
                logger.info(`shopify-api - Adjust Inventory`, {data: reqQtyBody})
                //update shopify inventory
                const inventory_level = new shopify.rest.InventoryLevel({session: shopifySession});
                await inventory_level.set({
                    body: {"location_id": reqQtyBody.location_id, "inventory_item_id": reqQtyBody.inventory_item_id , "available": reqQtyBody.available},
                });

            } catch(e) {
                throw { status: e.response?.code || 500, message: `shopify-api - POST inventory_levels/set failed | ${JSON.stringify(e.response?.body?.errors || e.message)}` }
            }
        }


        return db.productVariant.findOne({where: {ID: variantID}})   
    }
}

exports.product = {
    create: async (_user, dbProduct) => {
        if (!await service.user.isAuthorized(_user.ID, dbProduct.accountID)) {
            return
        }

        //logger.info('shopify.product.create', {data: dbProduct}) do not decomment on prod - triggers overflwo for product objects too big

        //get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client(dbProduct.accountID)

        // Check if product needs to be created on shopify
        if(!shopify){
            logger.info('No shopify store connected to account')
            return
        }

        //create shopify product
        let shopifyProduct

        try {
            shopifyProduct = new shopify.rest.Product({session: shopifySession});
            shopifyProduct.title = dbProduct.title
            shopifyProduct.body_html = dbProduct.description
            shopifyProduct.vendor = ''
            //set the product option name to one of the defaults: size. Otherwise it will be set to 'title' and doesn't allow to implement the filter by size
            shopifyProduct.options = [{name: 'Size'}]
            shopifyProduct.product_type = dbProduct.category.name
            shopifyProduct.status = dbProduct.status == "deleted" ? "archived" : dbProduct.status
            shopifyProduct.variants = dbProduct.variants.filter(v => v.status != "deleted").map(variant => {
                const variantBody = {
                    title: variant.name,
                    option1: variant.name,
                    position: variant.position + 1, // shopify first element starts at 1
                    barcode: variant.gtin,
                    price: variant.price || 0,
                    inventory_management: "shopify",
                    inventory_quantity: 0,
                }
                //TODO: remove hardcoded accountID for R2R
                if (_user.accountID != 2830) variantBody.sku = dbProduct.code
                return variantBody
            })
            shopifyProduct.images = dbProduct.images.map(image => {
                return {
                    src: image.src,
                    position: image.position + 1,  // shopify first element starts at 1
                }
            })

            if (configs.environment == "local") {
                logger.info('Using Local Environment - Skipping Shopify Integration')
                return shopifyProduct
            }

            await shopifyProduct.save({
                update: true,
            });

        } catch (e) {
            throw {
                status: e.response?.code,
                message: `Impossible to create shopify product | ${e.response?.statusText || e}`,
                errors: e.response?.body?.errors || e.response?.errors
            }
        }

        logger.info('Update internal product, variants and images with foreign ID', {data: shopifyProduct})
        const updates = {
            foreignID: shopifyProduct.id,
            variants: [],
            images: []
        }
        dbProduct.variants.map(_variant => {
            const foundShopifyVariant = shopifyProduct.variants.find(_shopifyVariant => _shopifyVariant.position == _variant.position +1)
            if (!foundShopifyVariant) {
                //logger.info(`Shopify Variant not found for dbVariant ${_variant.ID} at position ${_variant.position + 1}`)
                return
            }
            updates.variants.push({ID: _variant.ID, foreignID: foundShopifyVariant.id})
        })

        dbProduct.images.map(_image => {
            const foundShopifyImage = shopifyProduct.images.find(_shopifyImage => _shopifyImage.position == _image.position +1)
            if(foundShopifyImage){
                updates.images.push({ID: _image.ID, foreignID: foundShopifyImage.id})
            }

        })
        await service.product.update(_user, dbProduct.ID, updates)

        // if image available for the product - link product image to the variants
        if (shopifyProduct.image?.id) {
            logger.info('Linking product image to variants')
            try {
                // setting image to all variants
                const image = new shopify.rest.Image({session: shopifySession});
                image.product_id = shopifyProduct.id;
                image.id = shopifyProduct.image.id;
                image.variant_ids = shopifyProduct.variants.map(_sv => _sv.id)
                await image.save({
                    update: true,
                });
            } catch (e) {
                logger.info(`Impossible to link product image to variants`, {data: e.response})
                throw {
                    status: e.response?.status,
                    message: `Impossible to link product image to variants | ${e.response?.statusText || e}`,
                    errors: e.response?.body?.errors || e.response?.errors
                }
            }
        }

        return service.product.getById(_user, dbProduct.ID)
    },

    update: async(_user, dbProduct) => {
        if (!await service.user.isAuthorized(_user.ID, _user.accountID)) {
            return
        }

        logger.info('shopify.product.update', {data: dbProduct})

        //get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client(dbProduct.accountID)

        // Check if product needs to be updated on shopify
        if(!shopify){
            logger.info('No shopify store connected to account')
            return
        }

        let shopifyProduct
        try {
            //update shopify product
            shopifyProduct = new shopify.rest.Product({session: shopifySession});
            shopifyProduct.id = dbProduct.foreignID;
            shopifyProduct.title = dbProduct.title
            shopifyProduct.body_html = dbProduct.description
            //shopifyProduct.vendor = '' //TODO: replace for manufacturer
            shopifyProduct.product_type = dbProduct.category.name
            shopifyProduct.status = dbProduct.status
            shopifyProduct.variants = dbProduct.variants.filter(v => v.status != "deleted").map(variant => {
                const variantBody = {
                    id: variant.foreignID,
                    title: variant.name,
                    option1: variant.name,
                    position: variant.position + 1, // shopify first element starts at 1
                    barcode: variant.gtin,
                    price: variant.price || 0,
                    inventory_management: "shopify",
                    inventory_quantity: 0, // TODO: check which var to use here
                }
                //TODO: remove hardcoded accountID for R2R
                if (_user.accountID != 2830) variantBody.sku = dbProduct.code
                return variantBody
            })
            shopifyProduct.images = dbProduct.images.map(image => {
                return {
                    id: image.foreignID,
                    src: image.src,
                    position: image.position + 1,  // shopify first element starts at 1
                }
            })

            if (configs.environment == "local") {
                logger.info('Using Local Environment - Skipping Shopify Integration')
                return shopifyProduct
            }

            await shopifyProduct.save({
                update: true,
            });

        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: `Impossile Update Shopify Product ${dbProduct.ID} || ${JSON.stringify(e.response?.data.errors ?? {})}`,
                errors: e.response?.body?.errors || e.response?.errors
            }
        }

        // if image available for the product - link product image to the variants
        const shopifyVariantIdsWithoutImage = shopifyProduct.variants.filter(_sv => _sv.image_id == null).map(_sv => _sv.id)
        if (shopifyProduct.image?.id && shopifyVariantIdsWithoutImage.length > 0) {
            logger.info('Linking product image to variants')
            try {
                // setting image to all variants
                const image = new shopify.rest.Image({session: shopifySession});
                image.product_id = shopifyProduct.id;
                image.id = shopifyProduct.image.id;
                image.variant_ids = shopifyVariantIdsWithoutImage
                await image.save({
                    update: true,
                });
            } catch (e) {
                logger.info(`Impossible to link product image to variants`, {data: e.response})
                throw {
                    status: e.response?.status,
                    message: `Impossible to link product image to variants | ${e.response?.statusText || e}`,
                    errors: e.response?.body?.errors || e.response?.errors
                }
            }
        }
        return shopifyProduct

    },

    //Delete shopify product
    delete: async(_user, dbProduct) => {
        if (!await service.user.isAuthorized(_user.ID, _user.accountID)) {
            return
        }

        if (configs.environment == "local") {
            logger.info('Using Local Environment - Skipping Shopify Integration')
            return
        }




        logger.info('Delete shopify product', {data: dbProduct})
        //get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client(dbProduct.accountID)
        // Check if product needs to be updated on shopify
        if(!shopify){
            logger.info('No shopify store connected to account')
            return
        }
        try{
            await shopify.rest.Product.delete({
                session: shopifySession,
                id: dbProduct.foreignID,
            });
        }
        catch(e){
            throw {
                status: e.response?.status,
                message: `Impossible to delete shopify product | ${e.response?.statusText || e}`
            }
        }
    },

    createProductImage: async(_user, dbProductImage) => {
        /**
         * This function creates a image on shopify for a given product
         * 
         * productImageID
         */
        if (!await service.user.isAuthorized(_user.ID, _user.accountID)) {
            return
        }
        logger.info(`createProductImage for imageID ${dbProductImage.ID}`)

        if (configs.environment == "local") {
            logger.info('Using Local Environment - Skipping Shopify Integration')
            return
        }

        //get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client( _user.accountID)
        // Check if product needs to be created on shopify
        if(!shopify){
            logger.info('No shopify store connected to account')
            return
        }

        let shopifyImage
        try {
            // Session is built by the OAuth process
            shopifyImage = new shopify.rest.Image({session: shopifySession});
            shopifyImage.product_id = dbProductImage.product.foreignID;
            shopifyImage.position = dbProductImage.position +1;
            shopifyImage.src = dbProductImage.src;
            await shopifyImage.save({
                update: true,
            });
            //logger.info('shopify.createProductImage', {data: shopifyImage})
        }
        catch (e) {
            logger.info(e)
            throw {
                status: e.response?.status || 500,
                message: `Impossile Create Shopify Product Image ${dbProductImage.ID} | ${JSON.stringify(e.response?.data.errors ?? {})}`,
                errors: e.response?.body?.errors || e.response?.errors
            }
        }

        //update internal foreignID
        await db.productImage.update({foreignID: shopifyImage.id}, {where: {ID: dbProductImage.ID}})
        return shopifyImage
    },

    updateProductImage: async(_user, dbProductImage) => {
        /**
         * This function updates a image on shopify for a given product
         * 
         * productImageID
         */
        if (!await service.user.isAuthorized(_user.ID, _user.accountID)) {
            return
        }

        if (configs.environment == "local") {
            logger.info('Using Local Environment - Skipping Shopify Integration')
            return
        }

        //get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client(_user.accountID)
        // Check if product needs to be created on shopify
        if(!shopify){
            logger.info('No shopify store connected to account')
            return
        }

        let shopifyImage;
        try {
            shopifyImage = new shopify.rest.Image({session: shopifySession});
            shopifyImage.product_id = dbProductImage.product.foreignID;
            shopifyImage.id = dbProductImage.foreignID;
            shopifyImage.position = dbProductImage.position +1;
            logger.info('shopify.updateProductImage', {data: shopifyImage})
            await shopifyImage.save({
                update: true,
            });
        }
        catch (e) {
            throw {
                status: e.response ? e.response.status : 500,
                message: `Impossile update Shopify Product Image ${dbProductImage.ID} ${dbProductImage.foreignID}| ${e.response?.statusText || e}`,
                errors: e.response?.body?.errors || e.response?.errors
            }
        }

        return shopifyImage
    },

    deleteProductImage: async(_user, dbProductImage) => {
        /**
         * This function deletes a image on shopify for a given product
         */
        if (!await service.user.isAuthorized(_user.ID, _user.accountID)) {
            return
        }

        if (configs.environment == "local") {
            logger.info('Using Local Environment - Skipping Shopify Integration')
            return
        }

        //get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client(_user.accountID)
        if(!shopify){
            logger.info('No shopify store connected to account')
            return
        }

        try {
            await shopify.rest.Image.delete({
                session: shopifySession,
                product_id: dbProductImage.product.foreignID,
                id: dbProductImage.foreignID,
            });
        }
        catch (e) {
            throw {
                status: e.response?.status || 500,
                message: `Impossile Delete Shopify Product Image ${dbProductImage.product.foreignID}| ${JSON.stringify(e.response?.data.errors ?? {})}`,
                errors: e.response?.body?.errors || e.response?.errors
            }
        }

    },

    dataCheck: async() => {
        /**
         * 
         */
        const objectsToCsv = require('objects-to-csv')
        const shopifySaleChannels = await db.saleChannel.findAll({where: {platform: 'shopify'}})
        let shopifyProducts = []
        for(const saleChannel of shopifySaleChannels){
            const accountShopifyProducts = await service.bridge.shopify.account.getProducts(saleChannel.accountID)
            shopifyProducts = shopifyProducts.concat(accountShopifyProducts)
        }
        const dbProducts = await db.product.findAll({
            where: {accountID: shopifySaleChannels.map(s => s.accountID)},
            include: [
                {model: db.productVariant, as: 'variants'}
            ]
        })
        const lookupDBProductByForeignID = {}
        const lookupDBVariantByForeignID = {}
        dbProducts.map(product => {
            const key = `${product.foreignID}`
            if (key in lookupDBProductByForeignID) {
                lookupDBProductByForeignID[key].push(product)
            } else {
                lookupDBProductByForeignID[key] = [product]
            }
            product.variants.map(variant => {
                const key2 = `${variant.foreignID}`
                if (key2 in lookupDBVariantByForeignID) {
                    lookupDBVariantByForeignID[key2].push(variant)
                } else {
                    lookupDBVariantByForeignID[key2] = [variant]
                }
            })
        })

        const shopifyProductReport = []
        const errorsProducts = {
            'missingDBProduct': false,
            'multipleDBProducts': false,
            'statusMissmatch': false,
            'untrackedMissmatch': false,
            'descriptionMismatch': false,
        }

        const shopifyVariantReport = []
        const errors = {
            'missingDBVariant': false,
            'statusMissmatch': false,
            'multipleVariants': false,
            'nameMismatch': false,
            'untrackedMissmatch': false,
            'missingImage': false,
            'gtinMissmatch': false,
        }

        shopifyProducts.map(sproduct => {
            const dbProductsMatch = lookupDBProductByForeignID[`${sproduct.id}`] || []
    
            const report = {
                'Shopify ID':                 sproduct.id,
                'Shopify Store':              sproduct.saleChannel,
                'product.ID':                 dbProductsMatch && dbProductsMatch.length > 0 ? dbProductsMatch[0].ID : null,
                'product.accountID':          dbProductsMatch.length == 1 ? `${dbProductsMatch[0].accountID}` : '',
                'Shopify Created At':         moment.utc(sproduct.created_at).format(),
                'product.code':                dbProductsMatch.length == 1 ? `${dbProductsMatch[0].code}` : '',
                'shopify.title':              sproduct.title,
                'product.title':              dbProductsMatch.length == 1 ? `${dbProductsMatch[0].title}` : '',
                'shopify.description':        sproduct.body_html,
                'product.description':        dbProductsMatch.length ==1 ? `${dbProductsMatch[0].description}` : '',
                'shopify.status':             sproduct.status,
                'product.status':             dbProductsMatch.length > 0 ? dbProductsMatch[0].status : null,
                'shopify.url':                `https://${sproduct.saleChannel}.myshopify.com/admin/products/${sproduct.id}`,
                'Shopify Product Untracked':  sproduct.tags.includes('wiredhub-untracked') ? 'YES' : '',
                'Product Untracked':          dbProductsMatch.length > 0 ? dbProductsMatch[0].untracked : null,
                'Multiple DB Products IDs':   dbProductsMatch.length > 1 ? dbProductsMatch.map(p => p.ID).join(",") : ''
            }
    
            // deep clone object for the record
            const errorsRecord = JSON.parse(JSON.stringify(errorsProducts))
            const minutesSinceCreation = (moment().utc() - moment.utc(sproduct.created_at)) / 1000 / 60
    
            //if shopify product is more than 1 hr old
            if (dbProductsMatch.length == 0 && minutesSinceCreation > 60) {
                console.log(moment().utc(), moment.utc(sproduct.created_at))
                errorsRecord['missingDBProduct'] = true
            }
            //CHANGE added description mismatch - before we were using title as description from shopify
            if (dbProductsMatch.length == 1 && (`${dbProductsMatch[0].description}` !=  `${sproduct.body_html}`)) {
                errorsRecord['descriptionMismatch'] = true
            }
    
            // check for double products
            if (dbProductsMatch.length > 1 && dbProductsMatch[0].ID != dbProductsMatch[1].ID) {
                errorsRecord['multipleDBProducts'] = true
            }
    
            // check status missmatch only if product is NOT untracked. Since if it is untracked, the db product status will be deleted
            if ( dbProductsMatch.length == 1 && !dbProductsMatch[0].untracked && ((sproduct.status != "archived" && dbProductsMatch[0].status != sproduct.status) || (sproduct.status == "archived" && dbProductsMatch[0].status != "deleted"))) {
                errorsRecord['statusMissmatch'] = true
            }
    
            if ( dbProductsMatch.length == 1 && (dbProductsMatch[0].untracked != (sproduct.tags || '').includes('wiredhub-untracked'))) {
                errorsRecord['untrackedMissmatch'] = true
            }
    
            // if any error triggered - add record to report
            if (Object.values(errorsRecord).find(error => error) == true) {
                for (var errorName in errorsRecord) {
                    report[errorName] = errorsRecord[errorName]
                }
                shopifyProductReport.push(report)
            }
        })

        for (var sproduct of shopifyProducts) {
            for (var svariant of sproduct.variants) {
                const dbVariantsMatch = lookupDBVariantByForeignID[`${svariant.id}`] || []
                const report = {
                    'Shopify Product ID':         sproduct.id,
                    'variant.productID':         dbVariantsMatch && dbVariantsMatch.length > 0 ? dbVariantsMatch[0].productID : '',
                    'shopify.id':         svariant.id,
                    'variant.ID':                      dbVariantsMatch && dbVariantsMatch.length > 0 ? dbVariantsMatch[0].ID : '',
                    'shopify.title':      svariant.title,
                    'variant.name':                      dbVariantsMatch && dbVariantsMatch.length > 0 ? dbVariantsMatch[0].name : '',
                    'shopify.status':             sproduct.status,
                    'variant.status':                  dbVariantsMatch && dbVariantsMatch.length > 0 ? dbVariantsMatch[0].status : '',
                    'shopify.untracked':  (sproduct.tags || '').includes('wiredhub-untracked') ? 'YES' : '',
                    'variant.untracked':               dbVariantsMatch.length > 0 ? dbVariantsMatch[0].untracked : '',
                    'shopify.gtin':                     svariant.barcode,            
                    'variant.gtin':                     dbVariantsMatch.length > 0 ? dbVariantsMatch[0].gtin : '',
                    'shopify.image_id':                 svariant.image_id,
                    'sproduct.image.id':                     sproduct.image?.id,
                    'Shopify Variant Created At': svariant.created_at,
                    'shopify.url':                `https://${sproduct.saleChannel}.myshopify.com/admin/products/${sproduct.id}/variants/${svariant.id}`,
                    'Multiple Matches':           dbVariantsMatch.length > 1 ? dbVariantsMatch.map(v => v.ID).join(",") : '',
                }
        
                // deep clone object for the record
                const errorsRecord = JSON.parse(JSON.stringify(errors))
                const minutesSinceCreation = (moment().utc() - moment.utc(svariant.created_at)) / 1000 / 60
        
                if (dbVariantsMatch.length == 0 && minutesSinceCreation > 60) {
                    errorsRecord['missingDBVariant'] = true
                }
        
                //CHANGE: only need to check variants against 'active' product statuses because the when in 'draft' variants can be 'active' or 'deleted'
                if (dbVariantsMatch.length == 1 && (sproduct.status == 'active' && ( dbVariantsMatch[0].status!='active' && dbVariantsMatch[0].status!='deleted')) ) {
                        errorsRecord['statusMissmatch'] = true
                    }
        
                if (dbVariantsMatch.length == 1 && dbVariantsMatch[0].name.toLowerCase().trim() != svariant.title.toLowerCase().trim() ) {
                    errorsRecord['nameMismatch'] = true
                }
        
                if (dbVariantsMatch.length == 1 && dbVariantsMatch[0].untracked != (sproduct.tags || '').includes('wiredhub-untracked')) {
                    errorsRecord['untrackedMissmatch'] = true
                }
        
                if (dbVariantsMatch.length > 1) {
                    errorsRecord['multipleVariants'] = true
                }
        
                if (sproduct.image?.id && svariant.image_id == null) {
                    errorsRecord['missingImage'] = true
                }
        
                if (dbVariantsMatch.length == 1 && dbVariantsMatch[0].gtin != null && dbVariantsMatch[0].gtin != svariant.barcode) {
                    errorsRecord['gtinMissmatch'] = true
                }
        
                // if any error triggered - add record to report
                if (Object.values(errorsRecord).find(error => error) == true) {
                    for (var errorName in errorsRecord) {
                        report[errorName] = errorsRecord[errorName]
                    }
                    shopifyVariantReport.push(report)
                }
            }
        }

        //export
        const attachments = []
        if (shopifyProductReport.length > 0) {
            const shopifyProductReportAsString = await new objectsToCsv(shopifyProductReport).toString()
            const shopifyProductReportAttachmentBase64 = Buffer.from(shopifyProductReportAsString).toString('base64')

            if (!configs.onCloud) {
                await (new objectsToCsv(shopifyProductReport)).toDisk(`./scripts/checksReports/shopifyProductReport.csv`)
            }

            attachments.push({
                content: shopifyProductReportAttachmentBase64,
                filename: `shopify_product.csv`,
                type: "text/csv",
                disposition: "attachment"
            })
        }
        let message = `<br><br>Shopify Products Report<br>`
        for (var errorType in errorsProducts) {
            message += `${shopifyProductReport.filter(r => r[errorType]).length} - ${errorType}<br>`
        }

        if (shopifyVariantReport.length > 0) {
            const shopifyVariantReportAsString = await new objectsToCsv(shopifyVariantReport).toString()
            const shopifyVariantReportAttachmentBase64 = Buffer.from(shopifyVariantReportAsString).toString('base64')

            if (!configs.onCloud) {
                await (new objectsToCsv(shopifyVariantReport)).toDisk(`./scripts/checksReports/shopifyVariantReport.csv`)
            }

            attachments.push({
                content: shopifyVariantReportAttachmentBase64,
                filename: `shopify_variant.csv`,
                type: "text/csv",
                disposition: "attachment"
            })
        }
        message += `<br><br>Shopify Variants Report<br>`
        for (var errorType in errors) {
            message += `${shopifyVariantReport.filter(r => r[errorType]).length} - ${errorType}<br>`
        }

        const data = {
            to: ['s.rosa@wiredhub.io', 'a.singhania@wiredhub.io'],
            subject: `[DATA CHECK] - Shopify Products & Variants Report - ${moment().format('ll')}`,
            body: message,
            attachments: attachments
        }
    
        try {
            await service.bridge.sendGrid.sendEmail(data)
        } catch (e) {
            console.log(e.response)
        }
    }
}

exports.webhook = {
    orderCreated: async (user, createdEvent) => {
        /**
         * Get Inventory matching variants purchased
         * Get only items matching the price
         */

        logger.info("shopify.webhook.orderCreated", {data: createdEvent})

        const shopifyOrder = createdEvent
        // extra idempotency check - cloud task has a idempotency limit of 1hr. sometimes shopify sends the same event couple of hours after 
        // So we need to prevent duplication internally too
        const doesOrderExists = await db.order.findOne({where: {foreignID: shopifyOrder.id}})
        if (doesOrderExists) {
            logger.info(`DB order with foreignID ${shopifyOrder.id} already avaialble. Skip order creation`)
            return
        }
        const serviceUser = await service.account.serviceUser(user.accountID) // Using serviceUser decoded from the apiKey sent as bearer in the request
        const shopifySaleChannel = await service.account.getShopifySaleChannel(user.accountID)

        // check if order has a shipping address if not use billing address - click and collect order
        let rawAddress = shopifyOrder.shipping_address ? shopifyOrder.shipping_address : shopifyOrder.billing_address
        let consignee = null
        //check if address is present in the order - Shopify orders can be created without address through the POS
        if (rawAddress){
            consignee = {
                accountID: serviceUser.accountID,
                name: rawAddress.first_name ? rawAddress.first_name.trim().toLowerCase() : '',
                surname: rawAddress.last_name ? rawAddress.last_name.trim().toLowerCase() : '',
                address: rawAddress.address1 ? rawAddress.address1.trim().toLowerCase() : '',
                addressExtra: rawAddress.address2 ? rawAddress.address2.trim().toLowerCase() : '',
                postcode: rawAddress.zip ? rawAddress.zip.trim().toLowerCase() : '',
                city: rawAddress.city ? rawAddress.city.trim().toLowerCase() : '',
                country: rawAddress.country ? rawAddress.country.trim().toLowerCase() : '',
                countryCode: rawAddress.country_code ? rawAddress.country_code.trim().toLowerCase() : '',
                email: shopifyOrder.email ? shopifyOrder.email.trim().toLowerCase() : '',
                phoneNumber: rawAddress.phone ? rawAddress.phone.trim() : '',
                validate: 'validate_optional' // Added for forcing optional address verification at later stage
            }
        }

        //Filter custom line_items that have no product_id
        shopifyOrder.line_items = shopifyOrder.line_items.filter(line_item => line_item.product_id)
        if(shopifyOrder.line_items.length == 0 ){
            logger.info("Order contains only custom line_items")
            return
        }

        //filter untracked products
        const productForeignIDs = shopifyOrder.line_items.map(lineItem => lineItem.product_id)
        const untrackedProducts = await db.product.findAll({where: {foreignID: productForeignIDs, untracked: true}})
        shopifyOrder.line_items = shopifyOrder.line_items.filter(line_item => !untrackedProducts.find(_up => _up.foreignID == line_item.product_id))
        if(shopifyOrder.line_items.length == 0 ){
            logger.info("Order contains only untracked items")
            return
        }

        const internalDBVariants = await db.productVariant.findAll({
            where: {foreignID: [... new Set(shopifyOrder.line_items.map(li => li.variant_id))]},
            include: [
                {model: db.product, as: 'product'}
            ]
        })
        
        let inventoryListingsSelected = []
        for (var lineItem of shopifyOrder.line_items) {
            console.log(`Shopify Line Item (${lineItem.sku}) ${lineItem.name} - Price ${lineItem.price} Quantity ${lineItem.quantity} Variant ID ${lineItem.variant_id}`)
            // new approach for matching sale item with inventory - instead of matching the exact price, pick invenotry with lowest price. Assign shopify price to admin and consignor items during order creation
            const dbVariant = internalDBVariants.find(_dbv => _dbv.foreignID == lineItem.variant_id)
            const sortedListings = await service.inventoryListing.activeListing(serviceUser, dbVariant.ID, shopifySaleChannel.ID, true)
            let selectedListing = sortedListings[0]
            // not throw 404 since there might be other line items that actually pull through. Moved to if the whole order is empty
            if (!selectedListing) {
                logger.warn(`${shopifySaleChannel.shopifyStoreName} - Shopify Order #${shopifyOrder.order_number} - Listing not available for item ${dbVariant.ID} - ${dbVariant.product.title} ${dbVariant.name}`)
                continue
            }

            let leftQuantity = lineItem.quantity
            while (leftQuantity > 0) {
                // if shopify price is lower than inventory price by 10£ - trigger error
                if (parseFloat(lineItem.price) - parseFloat(selectedListing.price) < -5) {
                    logger.info(`Shopify price is lower than inventory price by more than 5£ - shopify ${lineItem.price} - listing ${selectedListing.price}`)
                    //if (selectedListing.account.ID != serviceUser.accountID) { // avoid consignors
                    //    throw {status: 400, message: `Price missmatch of ${parseFloat(lineItem.price) - parseFloat(selectedListing.price)} - Consignor sale prevented to avoid lower payout`}
                    //}
                }

                if (leftQuantity <= selectedListing.inventory.quantity) {
                    inventoryListingsSelected.push({inventoryListingID: selectedListing.ID, quantity: leftQuantity, price: lineItem.price})
                    leftQuantity -= lineItem.quantity
                } else {
                    inventoryListingsSelected.push({inventoryListingID: selectedListing.ID, quantity: selectedListing.inventory.quantity, price: lineItem.price})
                    leftQuantity -= selectedListing.inventory.quantity
                    // find another listing that matches the selected listing (assume that dsata re sync so if shopify sale qty > listing qty means it exist)
                    selectedListing = sortedListings.filter(l => !inventoryListingsSelected.find(_l => _l.inventoryListingID == l.ID)).find(invListing => 
                        selectedListing.virtual == invListing.virtual &&
                        selectedListing.price == invListing.price &&
                        selectedListing.inventory.warehouse?.ID == invListing.inventory.warehouse?.ID &&
                        selectedListing.inventory.warehouse?.accountID == invListing.inventory.warehouse?.accountID
                    )
                }
            }
        }

        // throw 404 if no listings avilable found for the order
        if (inventoryListingsSelected.length == 0) {
            throw {status: 404, message: `${shopifySaleChannel.shopifyStoreName} - Shopify Order #${shopifyOrder.order_number} - No listings available for the order`}
        }

        /**
         * Merging same listings with same inventoryListingID into 1
         * Needed because for order creation from shopify sales, where 2 units are sold for a specific variant and one unit has a discount, shopify creates two line_items with quantity 1 instead of a single line_item with quantity 2 both have same inventoryListingID
         */
        inventoryListingsSelected = (() => {
            const mergedArray = [];
        
            inventoryListingsSelected.forEach((item) => {
                const existingItem = mergedArray.find(
                    (mergedItem) => mergedItem.inventoryListingID === item.inventoryListingID
                );
        
                if (existingItem) {
                    // If the item already exists in mergedArray, update the quantity
                    existingItem.quantity += item.quantity;
                } else {
                    // If the item doesn't exist in mergedArray, add it
                    mergedArray.push({ ...item });
                }
            });
        
            return mergedArray;
        })();
        

        //Build sale order request
        const orderRequest = {
            accountID:     serviceUser.accountID,
            foreignID:     shopifyOrder.id,
            saleChannelID: shopifySaleChannel.ID,
            consignee:     consignee,
            reference1:    shopifyOrder.order_number,
            paymentMethod: 'card',
            details: inventoryListingsSelected,
            transactions: []
        }

        // record sale transaction
        orderRequest.transactions.push({
            grossAmount:        shopifyOrder.total_line_items_price,
            currency:      shopifyOrder.currency,
            type:         'sale',
            reference:     shopifyOrder.order_number,
            paymentMethod: 'card',
            gateway:      'shopify',
            status:        shopifyOrder.total_outstanding == "0.00" ? 'paid' : 'unpaid'
        })

        // record any discount
        shopifyOrder.discount_codes?.map(discount => orderRequest.transactions.push({
            grossAmount:        discount.amount,
            currency:      shopifyOrder.currency,
            type:         'discount',
            reference:     shopifyOrder.order_number,
            status:        'paid'
        }))

        // record any shipping cost
        shopifyOrder.shipping_lines?.filter(shipping => parseFloat(shipping.price) > 0).map(shipping => orderRequest.transactions.push({
            grossAmount:        shipping.price,
            currency:      shopifyOrder.currency,
            type:         'shipping',
            toAccountID:   serviceUser.accountID,
            reference:     shopifyOrder.order_number,
            status:        'paid'
        }))

        // generate order 
        const saleOrder = await service.order.createSaleOrder(serviceUser, orderRequest)
        await service.inventory.updateEgress(serviceUser, saleOrder.orderLineItems.map(oli => oli.inventoryID))
        return saleOrder
    },
    orderEdited: async (user, editedEvent) => {
        /**
        order_edit: {
            order_id: number
            line_items: {
                additions: [
                    {
                        id: 
                        delta: 1
                    }
                ],
                removals: [
                    {
                        id: 
                        delta: 1
                    }
                ]
            } 
        }
        NEW LOGIC

        EDITING OF ORDER:
        Added line_items:
            1. filter out newly added line_items from shopify
            2. identify line_items from inventory
            3. Add items to respective orders:
                - IF ADMIN items only:
                    - ADD items to ADMIN order only by inventoryID (Adjustments included)
                - IF CONSIGNOR items also:
                    - ADD items to ADMIN order only by inventoryID (Adjustments included)
                    - CREATE order with items to CONSIGNOR order only by itemID (No Inventory Adjustment)
                    //TODO: Potential Improvement: update consignor order if existing (over engineered)

        */
        logger.info("Shopify webhook order/edited", {data: editedEvent})
        
        const orderEditContent = editedEvent.orderEditContent
        const shopifyOrder = editedEvent.shopifyOrder
        const serviceUser = await service.account.serviceUser(user.accountID) // Using serviceUser decoded from the apiKey sent as bearer in the request
        //Find admin order for shopify_order
        const [adminOrder] = (await service.order.getAll(serviceUser, 0,1, {foreignID: shopifyOrder.id, accountID: serviceUser.accountID})).rows
    
        if (orderEditContent.line_items.additions.length == 0){
            return
        }
        
        //filter untracked products
        const productForeignIDs = shopifyOrder.line_items.map(lineItem => lineItem.product_id)
        const untrackedProducts = await db.product.findAll({where: {foreignID: productForeignIDs, untracked: true}})

        const newLineItems = []
        orderEditContent.line_items.additions.map(addition => {
            const selectedLineItem = shopifyOrder.line_items.find(line_item => line_item.id == addition.id)
            //filter out untracked products
            if (untrackedProducts.find(up => up.foreignID == selectedLineItem.product_id)){
                console.log('Untracked product added -> foreign ID: ', selectedLineItem.product_id)
                return
            }
            
            // if product is not untracked - add item to list
            //set line items quantity to the delta of the adjusted order
            selectedLineItem.quantity = addition.delta
            newLineItems.push(selectedLineItem)
        })

        // if new line items list is empty because untracked products were added dont reflect on platform
        if (newLineItems.length == 0 ){
            logger.info('Only untracked products were added!')
            return
        }
        // Select inventory records based on order_line_items
        const internalDBVariants = await db.productVariant.findAll({where: {foreignID: [... new Set(newLineItems.map(li => li.variant_id))]}})
        const inventoryListingsSelected = []
        for (var lineItem of newLineItems) {
            // new approach for matching sale item with inventory - instead of matching the exact price, pick invenotry with lowest price. Assign shopify price to admin and consignor items during order creation
            const dbVariant = internalDBVariants.find(_dbv => _dbv.foreignID == lineItem.variant_id)
            const selectedListing = await service.inventoryListing.activeListing(serviceUser, dbVariant.ID, adminOrder.saleChannelID)
            inventoryListingsSelected.push(selectedListing)
        }

        let adminOrderAddedDetails = []
        // build order
        newLineItems.map((lineItem, idx) => {
            adminOrderAddedDetails.push({inventoryListingID: inventoryListingsSelected[idx].ID, quantity: lineItem.quantity, price: lineItem.price})
        })
        const newOrderLineItems = await service.order.addOrderLineItems(serviceUser, adminOrder.ID, adminOrderAddedDetails)

        //update order total amount
        const totalAmount = parseFloat(adminOrder.totalAmount) + newOrderLineItems.reduce((totalAmount, oli) => totalAmount += parseFloat(oli.price), 0)

        await db.order.update({totalAmount: totalAmount}, {where: {ID: adminOrder.ID}})
        // refresh invoice
        await service.gcloud.addTask(
            'api-jobs',
            'GET',
            `${configs.microservices.api}/api/order/${adminOrder.ID}/download/invoice?refresh=true`,
            {authorization: `Bearer ${serviceUser.apiKey}`},
            null,
            null,
            60 // wait 60 seconds to generate invoice. problem with data consistency
        )
        // add sale tx and any payout tx
        const txRequests = []
        txRequests.push({
            accountID:       adminOrder.accountID,
            grossAmount:        adminOrderAddedDetails.reduce((sum, lineItem) => sum += lineItem.price * lineItem.quantity, 0),
            currency:      adminOrder.account.currency,
            type:          'sale',
            orderID:       adminOrder.ID,
            fromAccountID: null,
            toAccountID:   adminOrder.accountID,
            status:        'paid',
            reference:     adminOrder.reference1
        })

        newOrderLineItems.filter(oli => oli.item.accountID != adminOrder.accountID).map(oli => txRequests.push({
            accountID:       adminOrder.accountID,
            grossAmount: parseFloat(oli.cost),
            currency: serviceUser.account.currency,
            orderID: adminOrder.ID,
            type: 'payout',
            reference: `order #${adminOrder.ID} (${adminOrder.reference1}) - ${oli.variant.name}`,
            fromAccountID: adminOrder.accountID,
            toAccountID: oli.item.accountID,
            orderLineItemID: oli.ID
        }))

        await service.transaction.create(serviceUser, txRequests)

        // Check if any consignor item - create order for each consignor
        const consignorAccountIDs = new Set(inventoryListingsSelected.filter(listing => listing.accountID != adminOrder.accountID).map(listing => listing.accountID))
        const consignorOrders = await db.order.findAll({
            where: {parentOrderID: adminOrder.ID, accountID: Array.from(consignorAccountIDs)},
        })
        for (var consignorAccountID of Array.from(consignorAccountIDs)) {
            const consignorFulfillmentCentres = await service.account.getFulfillmentCenters(consignorAccountID)
            const accountServiceUser = await service.account.serviceUser(consignorAccountID)

            let accountOrder = consignorOrders.find(o => o.accountID == consignorAccountID)
            // if consignor doesn't have a sale order for this shopify order, create if
            if (!accountOrder) {
                const consignorOrderRequest = {
                    accountID:     accountServiceUser.accountID,
                    parentOrderID: adminOrder.ID,
                    userID:        accountServiceUser.ID,
                    saleChannelID: adminOrder.saleChannelID,
                    typeID:        4,
                    consignorID:  consignorFulfillmentCentres[0].addressID,
                    consignee:    adminOrder.consignorID,
                    reference1:    adminOrder.reference1,
                }
                accountOrder = await db.order.create(consignorOrderRequest)
            }

            // add item to order and record payout tx
            const orderNewOrderLineItems = []
            newLineItems.map((lineItem, idx) => {
                const listingRecord = inventoryListingsSelected[idx]
                const newOli = newOrderLineItems.find(oli => oli.inventoryID == listingRecord.inventoryID)
                if (listingRecord.accountID == accountOrder.accountID) {
                    orderNewOrderLineItems.push({itemID: newOli.itemID, price: newOli.price})
                }
            })

            //add payouts
            const consignorNewOrderLineItems = await service.order.addOrderLineItems(accountServiceUser, accountOrder.ID, orderNewOrderLineItems)
            const newConsignorOrder = await service.order.getOne(accountServiceUser, accountOrder.ID)
            //publish order created event
            await service.gcloud.publishEvent(accountServiceUser, 'sale-order/created', newConsignorOrder)

            //update order total amount
            const totalAmount = parseFloat(accountOrder.totalAmount) + consignorNewOrderLineItems.reduce((totalAmount, oli) => totalAmount += parseFloat(oli.price), 0)
            await db.order.update({totalAmount: totalAmount}, {where: {ID: accountOrder.ID}})

            // refresh invoice
            await service.gcloud.addTask(
                'api-jobs',
                'GET',
                `${configs.microservices.api}/api/order/${accountOrder.ID}/download/invoice?refresh=true`,
                {authorization: `Bearer ${accountServiceUser.apiKey}`},
                null,
                null,
                60 // wait 60 seconds to generate invoice. problem with data consistency
            )
        }

        const adminSaleOrder = await service.order.getOne(serviceUser, adminOrder.ID)
        await service.inventory.updateEgress(serviceUser, adminSaleOrder.orderLineItems.map(oli => oli.inventoryID))
        return adminSaleOrder
    },
    orderRefunded: async (user, refundEvent) => {
        /**
         * https://shopify.dev/api/admin-rest/2021-10/resources/webhook
         * event: refunds/create
         */
        logger.info("Shopify webhook refunds/create", {data: refundEvent})
        const adminOrderSimple = await db.order.findOne({where: {foreignID: refundEvent.order_id, parentOrderID: null}})
        if (!adminOrderSimple) {
            throw {status: 404, message: `Shopify Order ${refundEvent.order_id} not found`}
        }
        const serviceUser = await service.account.serviceUser(adminOrderSimple.accountID) // Using serviceUser decoded from the apiKey sent as bearer in the request
        const order = await service.order.getOne(serviceUser, adminOrderSimple.ID)

        // if no items refunded (only delivery cost or something else), return ok
        if (refundEvent.refund_line_items.length == 0) {
            return "ok"
        }

        //this triggers refund logic only when some items refund and not when only some amount is refunded (like delivery cost refund)
        let itemsToCancel = []
        let itemsToRefund = []
        for (var rf_li of refundEvent.refund_line_items) {
            //Shopify line_item may be a custom product created on checkout check on line_item.product_exists to see if it's a custom product
            if(rf_li.line_item && rf_li.line_item.product_exists) {
                // if oli not cancelled yet, cancel it. oli.canceledAt == null handles scenario where shopify refund is triggered from fliproom cancel order
                const olis = order.orderLineItems.filter(oli => oli.variant.foreignID == rf_li.line_item.variant_id && oli.canceledAt == null)
                const olisToRefund = olis.slice(0, rf_li.quantity)
                olisToRefund.map(oli => {
                    if (oli.inventory != null) {
                        itemsToCancel.push({ID: oli.ID, restock: true, warehouseID: oli.inventory.warehouseID})
                    } else {
                        itemsToCancel.push({ID: oli.ID, restock: true})
                    }
                    itemsToRefund.push({ID: oli.ID})
                })
            }
        }
        if(itemsToCancel.length > 0) {
            // Cancel items first -> will set to pending-replacement to true
            await service.order.cancel(serviceUser, {orderID: order.ID,
                orderLineItems: itemsToCancel
            }, "shopify")
        }

        if(itemsToRefund.length > 0) {
            // Trigger replacement logic with "refund" action to refund items
            await service.order.refund(serviceUser, order.ID, itemsToRefund, "shopify")
        }

        const updatedOrder = await service.order.getOne(serviceUser, order.ID)
        await service.inventory.updateEgress(serviceUser, updatedOrder.orderLineItems.map(oli => oli.inventoryID))
        return updatedOrder
    },
    fulfillmentCreated: async (user, fulfillmentEvent) => {
        /**
         * This function is triggered when a fulfillment is created on shopify
         * Create fulfillment on fliproom to reflect the status
         */
        logger.info("shopify.webhook.fulfillmentCreated", {data: fulfillmentEvent})

        const _so = await db.order.findOne({where: {foreignID: fulfillmentEvent.order_id}})
        if (!_so) {
            throw {status: 404, message: `Shopify Order ${fulfillmentEvent.order_id} not found`}
        }
        
        const order = await service.order.getOne(user, _so.ID)
        if (order.fulfillments.find(f => f.foreignID == fulfillmentEvent.id)) {
            logger.info(`Fulfillment ${fulfillmentEvent.id} already available on fliproom. Skip fulfillment creation`)
            return
        }   

        // find exact items that have been fulfilled - process only olis that can be fulfilled
        const orderLineItemsToAdd = []
        fulfillmentEvent.line_items.map(_foli => {
            const olis = order.orderLineItems.filter(oli => oli.variant.foreignID == _foli.variant_id && !oli.fulfillmentID && !oli.deletedAt)
            if (olis.length == 0) {
                logger.info(`No order line items available for fulfillment ${_foli.id} - item ${_foli.title} ${_foli.variant_title}`)
                return
            }

            // add all items - if items qty fulfilled is equal to items qty to fulfill on the db order
            if (olis.length == _foli.quantity) {
                olis.map(oli => orderLineItemsToAdd.push({
                    ID: oli.ID
                }))
                return
            }

            // add only the items that can be fulfilled at location - if items qty fulfilled on shopify is different than items qty to fulfill on the db order
            const olisAvailableAtLocation = olis.filter(oli => (oli.item.warehouse && oli.item.warehouse.addressID == order.consignor.ID))
            if (olisAvailableAtLocation.length < _foli.quantity) {
                logger.warn(`Items at Locations ${olisAvailableAtLocation.length} less than quantity fulfilled on shopify ${_foli.quantity}`)
            }
            olisAvailableAtLocation.slice(0, _foli.quantity).map(oli => orderLineItemsToAdd.push({
                ID: oli.ID
            }))
        })

        if (orderLineItemsToAdd.length == 0) {
            throw {status: 400, message: `No order line items available at fulfillment centre`}
        }

        return service.fulfillment.create(user, {
            orderID: order.ID,
            foreignID: fulfillmentEvent.id,
            reference1: order.reference1 || fulfillmentEvent.name, // use our order reference or use the shopify fulfillment reference if not available
            trackingNumber: fulfillmentEvent.tracking_number,
            originAddressID: order.consignorID,
            orderLineItems: orderLineItemsToAdd
        })
    },
    productCreated: async (user, shopifyProduct) => {
        logger.info(`shopify.webhook.productCreated()`, {data: shopifyProduct})
        
        // When creating a product on the platform and the product is pushed on shopify, shopify creates a product/create event
        // The event product/create triggers this function. If the shopify Id is not set yet on the db product (because just takes some time to be set)
        // we might incur in creating the product again on the platform because the check by shopifyId returns no record. 
        // In order to prevent this, we run of this function with a delay of 60 seconds (delay encoded inside the cloud task). This to prevent the double product creation
        let dbProd = await db.product.findOne({
            where: {
                foreignID: shopifyProduct.id
            }
        })

        if (dbProd) {
            logger.info(`DB product with foreignID ${shopifyProduct.id} already avaialble. Skip product creation`)
            return service.product.getById(user, dbProd.ID)
        }

        //check shopify product tags to see whether product is untracked
        const shopifyProductTags = shopifyProduct.tags ? (shopifyProduct.tags.replace(/\s/g, '')).split(',') : []
        const untracked = !!shopifyProductTags.find(tag => tag == 'wiredhub-untracked')

        let productCode = null

        // Set productCode from the incoming variant
        //TODO: remove hardcoded accountID for R2R
        if(user.accountID != 2830) shopifyProduct.variants.map(_variant => {if(!productCode && _variant.sku) productCode = _variant.sku })


        const rawProduct = {
            accountID: user.accountID,
            foreignID: shopifyProduct.id,
            category: shopifyProduct.product_type,
            code: productCode,
            status: untracked ? 'deleted' : shopifyProduct.status,
            title: shopifyProduct.title.trim(),
            eanCode: null,
            description: shopifyProduct.body_html,
            published_scope: 'global',
            volume: 0.001,
            weight: (shopifyProduct.variants[0] ? shopifyProduct.variants[0]?.grams : 0)  / 1000, // convert to kilograms
            pieces: 1,
            untracked: untracked,
            variants: [],
            images: []
        }

        // Find or create a new product for every variant
        shopifyProduct.variants.forEach(variant => {
            rawProduct.variants.push({
                name: variant.title,
                foreignID: variant.id,
                weight: variant.grams / 1000,  // convert to kilograms
                volume: 0,
                gtin: variant.barcode, 
                position: variant.position - 1,  // shopify starts variant position at 1. convert to 0 based
                status: untracked ? 'deleted' : 'active',
                untracked: untracked
            })
        })
        shopifyProduct.images.forEach(_img => {
            rawProduct.images.push({
                foreignID: _img.id,
                src: _img.src,
                filename: null,
                position: _img.position - 1 // shopify starts image_position at 1. convert to 0 based
            })
        })
        await service.product.create(user, rawProduct, {forceCreate: true})

        dbProd = await db.product.findOne({where: {foreignID: shopifyProduct.id}})
        console.log(dbProd)
        return service.product.getById(user, dbProd.ID)
    },
    productUpdated: async (user, shopifyProduct) => {
        logger.info("Shopify webhook products/updated", {data: shopifyProduct})
        const queryResult = await service.product.getAll(user, 0, 50, null, {foreignID: `${shopifyProduct.id}`})
        // on product created - product/updated is triggered as well. This sometime generates an error 500 because the following 3 lines can't find the just created product.
        // if is the case - return 404
        if (queryResult.count == 0) {
            throw {status: 404, message: `Product with foreignID ${shopifyProduct.id} not found`}
        }

        // get dbProduct
        const simpleDbProduct = await db.product.findOne({where: {ID: queryResult.rows[0].ID}})
        const shopifyVariantIDs = shopifyProduct.variants.map(sv => `${sv.id}`)

        //Shopify Product Tag Checking
        //check shopify product tags to see whether product is untracked
        const shopifyProductTags = shopifyProduct.tags ? (shopifyProduct.tags.replace(/\s/g, '')).split(',') : []
        const untracked = !!shopifyProductTags.find(tag => tag == 'wiredhub-untracked')
        const hasBecomeUntracked = !simpleDbProduct.untracked && untracked

        //find product SKU if any since sku is at the variant level but we have sku at product level
        let productCode = ''
        //TODO: remove hardcoded accountID for R2R
        if(user.accountID != 2830) shopifyProduct.variants.map(_variant => {if(!productCode && _variant.sku) productCode = _variant.sku })

        // update product
        const productUpdates = {
            category: shopifyProduct.product_type,
            code: productCode,
            title: shopifyProduct.title.trim(),
            description: shopifyProduct.body_html,
            status: (untracked || shopifyProduct.status == 'archived') ? 'deleted' : shopifyProduct.status,
            untracked: untracked
        }
        await service.product.update(user, simpleDbProduct.ID, productUpdates)
        //include deleted variants to allow to check which variants should be created and which has already been deleted
        const dbProduct = await service.product.getById(user, simpleDbProduct.ID, {includeDeletedVariants: true})

        // Product Variants
        const currentProductVariants = dbProduct.variants
        const currentPVIDs = currentProductVariants.map(pv => `${pv.foreignID}`)
        const newProductVariants = shopifyProduct.variants.filter(pv => !currentPVIDs.includes(`${pv.id}`))
        const productVariantsToUpdate = shopifyProduct.variants.filter(pv => currentPVIDs.includes(`${pv.id}`))
        const productVariantsToDelete = currentProductVariants.filter(cpv => !shopifyVariantIDs.includes(`${cpv.foreignID}`))

        //Update variants
        const variantsToUpdate = []
        productVariantsToUpdate.map(variant => {
            const dbVariant = dbProduct.variants.find(_dbVariant => _dbVariant.foreignID == variant.id)
            variantsToUpdate.push({
                ID: dbVariant.ID,
                name: variant.title,
                status: (untracked || shopifyProduct.status == 'archived') ? 'deleted' : 'active',
                untracked: untracked,
                gtin: variant.barcode,
                weight: variant.grams / 1000, // convert to kilograms
                position: variant.position - 1, // shopify starts variant position at 1. convert to 0 based
            })
        })
        logger.info(`shopify/products/updated (${shopifyProduct.id}) - Variants to update ${variantsToUpdate.length}`)
        await service.product.updateVariants(user, dbProduct.ID, variantsToUpdate)

        //Create new variants
        const variantsToAdd = []
        newProductVariants.map(variant => {
            variantsToAdd.push({
                name: variant.title,
                foreignID: variant.id,
                weight: variant.grams / 1000, // convert to kilograms
                volume: 0,
                position: variant.position - 1,
                gtin: variant.barcode,
                status: (untracked || shopifyProduct.status == 'archived') ? 'deleted': 'active',
                untracked: untracked
            })
        })
        logger.info(`shopify/products/updated (${shopifyProduct.id}) - Variants to add ${variantsToAdd.length}`)
        variantsToAdd.length > 0 ? await service.product.addVariants(user, dbProduct.ID, variantsToAdd) : null

        //untrack porduct variants
        if (hasBecomeUntracked){
            const variantsToUntrackIDs = currentProductVariants.map(variant => variant.ID)
            logger.info(`shopify/products/updated (${shopifyProduct.id}) - Untrack variants`)
            await service.product.deleteVariants(user, dbProduct.ID, variantsToUntrackIDs, true)
        }

        //delete variants
        logger.info(`shopify/products/updated (${shopifyProduct.id}) - Variants to delete ${productVariantsToDelete.length}`)
        productVariantsToDelete.length > 0 ? await service.product.deleteVariants(user, simpleDbProduct.ID, productVariantsToDelete.map(variant => variant.ID)) : null

        /**
         * Images
         */
        const currentProductImages = dbProduct.images
        const shopifyPIIDs = shopifyProduct.images.map(pi => `${pi.id}`)
        const currentPIIDs = currentProductImages.map(pi => `${pi.foreignID}`)
        const deletedProductImages = currentProductImages.filter(pi => !shopifyPIIDs.includes(`${pi.foreignID}`))
        const updatedProductImages = currentProductImages.filter(pi => shopifyPIIDs.includes(`${pi.foreignID}`))
        const createdProductImages = shopifyProduct.images.filter(pi => !currentPIIDs.includes(`${pi.id}`))

        //delete
        const imagesToDeleteIDs = deletedProductImages.map(imageObj => imageObj.ID)
        logger.info(`shopify/products/updated (${shopifyProduct.id}) - Images to delete ${imagesToDeleteIDs.length}`)
        await service.product.deleteImages(user, dbProduct.ID, imagesToDeleteIDs)

        //add  - shopify starts image_position at 1. convert to 0 based
        const imagesToCreate = createdProductImages.map(prodImage => {return {
            foreignID: prodImage.id,
            src: prodImage.src,
            position: prodImage.position - 1
        }})
        logger.info(`shopify/products/updated (${shopifyProduct.id}) - Images to add ${imagesToCreate.length}`)
        await service.product.addImages(user, dbProduct.ID, imagesToCreate)

        //update
        const imagesToUpdateQueries = updatedProductImages.map(itu => {
            const shopifyRecord = shopifyProduct.images.find(pi => `${pi.id}` == itu.foreignID)
            return {
                ID: itu.ID,
                src: shopifyRecord.src,
                position: shopifyRecord.position - 1 //shopify starts image_position at 1. convert to 0 based
            }
        })
        logger.info(`shopify/products/updated (${shopifyProduct.id}) - Images to update ${imagesToUpdateQueries.length}`)
        await service.product.updateImages(user, dbProduct.ID, imagesToUpdateQueries)

        //get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client( dbProduct.accountID)
        const missingImagesVariantsIDs = shopifyProduct.variants.filter(variant => !variant.image_id).map(variant => variant.id);

        if (missingImagesVariantsIDs.length > 0 && shopifyProduct.image?.id) {
            logger.info('Linking product image to variants')
            try {
                // setting image to all variants
                const image = new shopify.rest.Image({session: shopifySession});
                image.product_id = shopifyProduct.id;
                image.id = shopifyProduct.image.id;
                image.variant_ids = missingImagesVariantsIDs
                await image.save({
                    update: true,
                });
            } catch (e) {
                logger.info(`Impossible to link product image to variants`, {data: e.response})
                throw {
                    status: e.response?.status,
                    message: `Impossible to link product image to variants | ${e.response?.statusText || e}`,
                    errors: e.response?.body?.errors || e.response?.errors
                }
            }
        }

        //Since if all variants have been deleted, because product untrack. The product is not returned. So, return deleted variants to allow to return the product is case is untracked. 
        return service.product.getById(user, dbProduct.ID, {includeDeletedVariants: untracked})
    },
    productDeleted: async (user, productForeignID) => {
        const serviceUser = await service.account.serviceUser(user.accountID)
    
        const product = await db.product.findOne({
            where :{foreignID: productForeignID},
            include: [
                {model: db.productVariant, as: 'variants', where: {status: 'active'}, required: false}
            ]
        })
        if (!product) throw {status: 404, message: `Shopify product ${productForeignID} not found`}

        await service.product.deleteVariants(serviceUser, product.ID, product.variants.map(variant => variant.ID))
        await service.product.update(serviceUser,product.ID, {status: "deleted", imageReference: '', untracked: false})

        return 'ok'
    },
}

//Initialise a shopify client and session for a given account
exports.client = async (accountID) => {
    //extractShopifyCredentials
    const shopifySaleChannel = await service.account.getShopifySaleChannel(accountID)

    if (!shopifySaleChannel) {
        logger.info(`Shopify sale channel not found for account ${accountID}`)
        return null
    }

    if (!shopifySaleChannel.shopifyAPIAuth) {
        logger.info(`No shopifyAPIAuth found for account ${accountID}`)
        return null
    }

    let apiAccessToken, apiKey, host;
    const regex = /https?:\/\/([^:@]+):([^@]+)@([^/]+)\/admin/i;
    const matches = shopifySaleChannel.shopifyAPIAuth.match(regex);

    if (matches && matches.length >= 4) {
        [, apiKey, apiAccessToken, host] = matches;
    } else if (matches && matches.length >= 3) {
        [, apiKey, apiAccessToken] = matches;
    } else {
        return {shopify: null, shopifySession: null}
    }

    //create shopify client with session
    const shopify = shopifyApi({
        apiSecretKey: apiAccessToken, // Note: this is the API Secret Key, NOT the API access token
       // apiVersion: shopifyApiVersion.April23, || OPTIONAL
        isCustomStoreApp: true,// this MUST be set to true (default is false)
        apiKey: apiKey, // Note: this is the API access token, NOT the API Secret Key
        isEmbeddedApp: false,
        // This should be the same as the app's `Host` in the Partner Dashboard
        hostName: host,
        // Scopes help limit access for API clients. For a list of available scopes,
        scopes: [
            "read_all_orders", "read_assigned_fulfillment_orders", "write_assigned_fulfillment_orders", "read_checkouts", "write_checkouts", "read_content", "write_content", "read_customer_merge", "write_customer_merge", "read_customers", "write_customers",
            "read_customer_payment_methods", "read_discounts", "write_discounts", "read_draft_orders", "write_draft_order", "read_files", "write_files", "read_fulfillments", "write_fulfillments", "read_gift_cards", "write_gift_cards", "read_inventory",
            "write_inventory","read_legal_policies","read_locales","write_locales","read_locations","read_metaobject_definitions","write_metaobject_definitions","read_metaobjects","write_metaobjects",
            "read_marketing_events", "write_marketing_events", "read_merchant_approval_signals", "read_merchant_managed_fulfillment_orders", "write_merchant_managed_fulfillment_orders", "read_orders", "write_orders", "read_payment_mandate",
            "write_payment_mandate", "read_payment_terms", "write_payment_terms", "read_price_rules", "write_price_rules", "read_products", "write_products", "read_product_listings",
            "read_publications", "write_publications", "read_purchase_options", "write_purchase_options", "read_reports", "write_reports", "read_resource_feedbacks", "write_resource_feedbacks", "read_script_tags",
            "write_script_tags", "read_shipping", "write_shipping", "read_shopify_payments_disputes", "read_shopify_payments_payouts", "read_own_subscription_contracts", "write_own_subscription_contracts", "read_returns", "write_returns",
            "read_themes", "write_themes", "read_translations", "write_translations", "read_third_party_fulfillment_orders", "write_third_party_fulfillment_orders", "read_users",
            "read_order_edits", "write_order_edits", "write_payment_gateways", "write_payment_sessions"
        ],
        // Mount REST resources.
        restResources,
        logger: {
            level: 0
        }
    });

    const shopifySession = shopify.session.customAppSession(host);
    return {shopify, shopifySession}
}