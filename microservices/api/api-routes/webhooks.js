const express = require('express');
const router = express.Router();
const service = require('../services/main')
const configs = require('../configs')
const db = require('../libs/db')
const axios = require('axios')
const logger = require("../libs/logger");

/**
 * STOCKX
 */
router.post("/stockx/product/updated", async (req, resp, next) => {
    try {
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/stock-x/product/updated`, {}, null, req.body)
        resp.status(200).json('ok')
    } catch (e) {
        next(e)
    }
    return
})

router.post("/stockx/product/created", async (req, resp, next) => {
    try {
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/stock-x/product/created`, {}, req.body.stockxId, req.body)
        resp.status(200).json('ok')
    } catch (e) {
        next(e)
    }
    return
})

/**
 * SHOPIFY
 */
router.post("/shopify/product/created", async (req, response, next) => {
    const shopName = req.headers['x-shopify-shop-domain'].slice(0, req.headers['x-shopify-shop-domain'].indexOf('.myshopify.com'))

    // get service user of the account with shopName matching
    const shopifySaleChannel = await db.saleChannel.findOne({where: {shopifyStoreName: shopName}})
    const serviceUser = await service.account.serviceUser(shopifySaleChannel.accountID)

    try {
        // When creating a product on the platform and the product is pushed on shopify, shopify creates a product/create event
        // The event product/create triggers this function. If the shopify Id is not set yet on the db product (because just takes some time to be set)
        // we might incur in creating the product again on the platform because the check by shopifyId returns no record. 
        // In order to prevent this, we run of this function with a delay of 60 seconds (delay encoded inside the cloud task). This to prevent the double product creation
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/shopify/product/created`, {authorization: `Bearer ${serviceUser.apiKey}`}, req.body.id, req.body, 60)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/shopify/product/updated", async (req, response, next) => {
    const shopName = req.headers['x-shopify-shop-domain'].slice(0, req.headers['x-shopify-shop-domain'].indexOf('.myshopify.com'))

    // get service user of the account with shopName matching
    const shopifySaleChannel = await db.saleChannel.findOne({where: {shopifyStoreName: shopName}})
    const serviceUser = await service.account.serviceUser(shopifySaleChannel.accountID)

    try {
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/shopify/product/updated`, {authorization: `Bearer ${serviceUser.apiKey}`}, req.headers['x-shopify-webhook-id'], req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/shopify/product/deleted", async (req, response, next) => {
    const shopName = req.headers['x-shopify-shop-domain'].slice(0, req.headers['x-shopify-shop-domain'].indexOf('.myshopify.com'))

    // get service user of the account with shopName matching
    const shopifySaleChannel = await db.saleChannel.findOne({where: {shopifyStoreName: shopName}})
    const serviceUser = await service.account.serviceUser(shopifySaleChannel.accountID)

    try {
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/shopify/product/deleted`, {authorization: `Bearer ${serviceUser.apiKey}`}, req.headers['x-shopify-webhook-id'], req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/shopify/order/created", async (req, response, next) => {
    const shopName = req.headers['x-shopify-shop-domain'].slice(0, req.headers['x-shopify-shop-domain'].indexOf('.myshopify.com'))

    // get service user of the account with shopName matching
    const shopifySaleChannel = await db.saleChannel.findOne({where: {shopifyStoreName: shopName}})
    const serviceUser = await service.account.serviceUser(shopifySaleChannel.accountID)

    try {
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/shopify/order/created`, {authorization: `Bearer ${serviceUser.apiKey}`}, req.headers['x-shopify-webhook-id'], req.body)
        response.status(200).json('ok')
    } catch(e) {
        logger.info('error message to prrevent error', {data: e})
        next(e)
    }
})

router.post("/shopify/order/edited", async (req, response, next) => {
    const shopName = req.headers['x-shopify-shop-domain'].slice(0, req.headers['x-shopify-shop-domain'].indexOf('.myshopify.com'))

    // get service user of the account with shopName matching
    const shopifySaleChannel = await db.saleChannel.findOne({where: {shopifyStoreName: shopName}})
    const serviceUser = await service.account.serviceUser(shopifySaleChannel.accountID)


    try {
        const shopifyOrderID = req.body.order_edit.order_id
        //prefetch updated shopify order and send with task body
        // get shopify client and session
        const {shopify, shopifySession} = await service.bridge.shopify.client( shopifySaleChannel.accountID)
        // get shopify order
        logger.info(`Fetching shopify order ${shopifyOrderID} for ${shopName}`)
        const shopifyOrder = await shopify.rest.Order.find({
            session: shopifySession,
            id: shopifyOrderID,
        });

        let body = {
            shopifyOrder: shopifyOrder,
            orderEditContent: req.body.order_edit
        }

        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/shopify/order/edited`, {authorization: `Bearer ${serviceUser.apiKey}`}, req.headers['x-shopify-webhook-id'], body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/shopify/fulfillment/created", async (req, response, next) => {
    try {
        if (!req.headers['x-shopify-shop-domain']) {
            throw {status: 403, message: 'Forbidden'}
        }
        const shopName = req.headers['x-shopify-shop-domain'].slice(0, req.headers['x-shopify-shop-domain'].indexOf('.myshopify.com'))

        // get service user of the account with shopName matching
        const shopifySaleChannel = await db.saleChannel.findOne({where: {shopifyStoreName: shopName}})

        if (!shopifySaleChannel) {
            throw {status: 404, message: `Sale channel not found for shop ${shopName}`}
        }
        const serviceUser = await service.account.serviceUser(shopifySaleChannel.accountID)

        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/shopify/fulfillment/created`, {authorization: `Bearer ${serviceUser.apiKey}`}, req.headers['x-shopify-webhook-id'], req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/shopify/refund/created", async (req, response, next) => {
    const shopName = req.headers['x-shopify-shop-domain'].slice(0, req.headers['x-shopify-shop-domain'].indexOf('.myshopify.com'))

    // get service user of the account with shopName matching
    const shopifySaleChannel = await db.saleChannel.findOne({where: {shopifyStoreName: shopName}})
    const serviceUser = await service.account.serviceUser(shopifySaleChannel.accountID)

    try {
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/shopify/order/refunded`, {authorization: `Bearer ${serviceUser.apiKey}`}, req.headers['x-shopify-webhook-id'], req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

/**
 * SHIP ENGINE
 */
router.post("/ship-engine/shipment/updated", async (req, response, next) => {
    /**
     * This endpoint is called by ship-engine upon shipment tracking updates
     * 
     *  "resource_url": "https://api.shipengine.com/v1/tracking?carrier_code=usps&tracking_number=9400111298370264401222",
     *  "resource_type": "API_TRACK",
     *  "data": {
     *    
     *  }
     * 
     */

    try {
        // check request coming from ship-engine
        if (req.headers['user-agent'] != 'ShipEngine/v1') {
            throw {status: 401}
        }

        const fulfillment = await db.fulfillment.findOne({
            where: {trackingNumber: req.body.data.tracking_number},
            include: [
                {model: db.order, as: 'inboundOrder'},
                {model: db.order, as: 'outboundOrder'},
            ]
        })
        if (!fulfillment) {
            throw {status: 404, message: `Fulfillment with tracking number ${req.body.data.tracking_number} not found`}
        }
        
        //we need a serviceUser to pass auth - give priority to use the service user of the account doing outbound
        const serviceUser = await service.account.serviceUser(fulfillment.outboundOrder?.accountID || fulfillment.inboundOrder?.accountID)

        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/ship-engine/shipment/updated`, {authorization: `Bearer ${serviceUser.apiKey}`}, req.headers['sessionId'], req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }

})

// RECHARGE
router.post("/recharge/subscription/:eventName", async (req, resp, next) => {
    const serviceUser = await service.account.serviceUser(3)
    const eventName = req.params.eventName 
    try {
        if (eventName == "created" || eventName == "activated") {
            await service.webhooks.rechargeManageTag(serviceUser.account, req.body, "add")
        } else if (eventName == "cancelled" || eventName == "deleted") {
            await service.webhooks.rechargeManageTag(serviceUser.account, req.body, "remove")
        }
        resp.status(200).json('ok')
    } catch (e) {
        next(e)
    }

    return
})

// STRIPE
router.post("/stripe/payout/updated", async (req, response, next) => {

    try {
        //get service user of the account that stripeAccountID belongs to
        const account = await db.account.findOne({where: {stripeAccountID: req.body.account}})
        const serviceUser = await service.account.serviceUser(account.ID)
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/stripe/payout/updated`, {authorization: `Bearer ${serviceUser.apiKey}`}, null, req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/stripe/account/updated", async (req, response, next) => {
    try {
        // NOTE: Might cause unforeseen issues if the hook gets triggered by a non express account
        const account = await db.account.findOne({where: {stripeConnectAccountID: req.body.account}})
        if (!account) {
            throw {status: 404, message: `Stripe connect account not found with id ${req.body.account}`}
        }

        const serviceUser = await service.account.serviceUser(account.ID)
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/stripe/account/updated`, {authorization: `Bearer ${serviceUser.apiKey}`}, null, req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/stripe/payment-intent/created", async (req, response, next) => {
    try {
        const serviceUser = await service.account.serviceUser(3);
        const paymentIntentObj = req.body.data.object
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/stripe/payment-intent/created`, {authorization: `Bearer ${serviceUser.apiKey}`}, null, paymentIntentObj)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/stripe/charge/succeeded", async (req, response, next) => {
    try {
        const serviceUser = await service.account.serviceUser(3);
        const chargeObj = req.body.data.object 
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/stripe/charge/succeeded`, {authorization: `Bearer ${serviceUser.apiKey}`}, null, chargeObj)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/stripe/payout/failed", async (req, response, next) => {
    try {
        //get service user of the account that stripeAccountID belongs to
        const account = await db.account.findOne({where: {stripeAccountID: req.body.account}})
        const serviceUser = await service.account.serviceUser(account.ID)
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/stripe/payout/failed`, {authorization: `Bearer ${serviceUser.apiKey}`}, null, req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

router.post("/stripe/external-account/updated", async (req, response, next) => {
    try {
        //get service user of the account that stripeAccountID belongs to
        const account = await db.account.findOne({where: {stripeAccountID: req.body.account}})
        const serviceUser = await service.account.serviceUser(account.ID)
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/stripe/external-account/updated`, {authorization: `Bearer ${serviceUser.apiKey}`}, null, req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})

// REVOLUT
router.post("/revolut/events", async (req, response, next) => {
    try {
        if (req.body.event != "TransactionStateChanged") {
            response.status(200).json('ok')
            return
        }

        //get service user of the account that revolut tx belongs to
        const tx = await db.transaction.findOne({where: {revolutTransactionID: req.body.data.id}})
        if (!tx) {
            throw {status: 404, message: `Revolut transaction not found with id ${req.body.data.id}`}
        }
        const serviceUser = await service.account.serviceUser(tx.fromAccountID)
        await service.gcloud.addTask('api-jobs', 'POST', `${configs.microservices.api}/api/bridge/ingress/revolut/transaction/updated`, {authorization: `Bearer ${serviceUser.apiKey}`}, req.body.data.request_id, req.body)
        response.status(200).json('ok')
    } catch(e) {
        next(e)
    }
})


module.exports = router;
