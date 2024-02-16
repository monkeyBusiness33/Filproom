const express = require('express');
const router = express.Router();
const service = require('../services/main')
const db = require('../libs/db')
const configs = require('../configs')

router.get("/", async (req, res, next) => {
    try {
        req.locals.body = await service.order.getAll(req.user, req.query.offset, req.query.limit, req.query)
        req.user.can('order.view', req.locals.body.rows)
        return next()
    } catch (e) {
        return next(e)
    }

})

router.get("/:ID/checkout-session", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.order.getCheckoutSession(req.user,req.params.ID,req.query)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/:ID",  async (req, response, next) => {
    try {
        req.locals.body = await service.order.getOne(req.user, req.params.ID)
        req.user.can('order.view', req.locals.body)
        return next()
    } catch (e) {
        return next(e)
    }
})

//TODO
router.get("/:orderID/fulfillments/:fulfillmentID/shipping-label",  async (req, response, next) => {
    try {
        req.locals.body  = await service.fulfillment.getShippingLabel(req.user, req.params.fulfillmentID)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/:orderID/fulfillments/:fulfillmentID",  async (req, response, next) => {
    try {
        const order = await db.order.findOne({where: {ID: req.params.orderID}})
        req.user.can('order.view', order)
        req.locals.body  = await service.fulfillment.getOne(req.user, req.params.fulfillmentID)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/:ID/download/:document",  async (req, response, next) => {
    try {
        const order = await db.order.findOne({where: {ID: req.params.ID}})
        req.user.can('order.view', order)
        if (req.params.document == "receipt") {
            req.locals.body = await service.order.downloadReceipt(req.user, req.params.ID)
        } else if (req.params.document == "invoice") {
            req.locals.body = await service.order.downloadInvoice(req.headers.token_decoded.user, req.params.ID, req.query)
        } else if (req.params.document == "customerInvoice") {
            req.locals.body = await service.order.downloadCustomerInvoice(req.headers.token_decoded.user, req.params.ID)
        }
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/:ID/couriers-available",  async (req, response, next) => {
    try {
        req.locals.body = await service.order.getAvailableCouriers(req.user, req.params.ID)
        return next()
    } catch (e) {
        return next(e)
    }
})

//Not used currently
router.post("/:ID/compute-shipping-rates", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.fulfillment.computeRates(req.user, req.body)
            return next()
        })
    } catch (e) {
        return next(e)
    }

    return
})

router.get("/:ID/transactions",  async (req, response, next) => {
    try {
        const order = await db.order.findOne({where: {ID: req.params.ID}})
        req.user.can('order.view', order)
        req.locals.body = await service.order.getTransactions(req.user, req.params.ID)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/purchase", async (req, res, next) => {
    //TODO: temporary used only for testing. SHould not be used onm production
    if (configs.environment == "prod") throw {status: 403, message: "This endpoint is not available on production"}
    try {
        await db.sequelize.transaction(async tx => {
            req.body.accountID = req.body.accountID || req.user.accountID
            //req.user.can('order.create', req.body)
            req.locals.body = await service.order.create(req.user, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/transfer", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.body.accountID = req.body.accountID || req.user.accountID
            req.user.can('service.transfer', req.body)

            const order = await service.order.createTransferOrder(req.user, req.body)
            req.locals.body = order
            //note: we are using inventory.updateEgress instead of createEgress because this endpoint is called only for the creation of transfers. 
            // and on transfers we already have the inventory and listings created, so we need only to update.
            await service.inventory.updateEgress(req.user, order.orderLineItems.map(oli => oli.inventoryID))
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/sale-order", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.body.accountID = req.body.accountID || req.user.accountID

            const isPersonalShopper = req.user.roles.find(r => r.type == 'personal-shopper' && r.accountID == req.body.accountID)
            if (isPersonalShopper) {
                req.body.personalShopperAccountID = req.user.accountID;
            }

            req.user.can('order.create', req.body)

            const order = await service.order.createSaleOrder(req.user, req.body)
            req.locals.body = order
            // use oli.inventoryID instead of oli.item.inventoryID because oli.item.inventoryID is set as null when items are sold. 
            await service.inventory.updateEgress(req.user, order.orderLineItems.map(oli => oli.inventoryID))
        })
        return next()
    } catch (e) {
        return next(e)
    }

})

router.post("/:orderID/accept", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const order = await db.order.findOne({where: {ID: req.params.orderID}})
            req.user.can('order.accept', order)
            req.locals.body = await service.order.accept(req.user, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:orderID/cancel", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const order = await db.order.findOne({where: {ID: req.params.orderID}})
            req.user.can('order.cancel', order)
            req.body.orderID = req.params.orderID
            req.locals.body = await service.order.cancel(req.user, req.body, 'fliproom')
            // use oli.inventoryID instead of oli.item.inventoryID because oli.item.inventoryID is set as null when items are deleted. 
            // So we have to use the oli.inventoryID snapshot to know which inventory to update
            await service.inventory.updateEgress(req.user, req.locals.body.orderLineItems.map(oli => oli.inventoryID))
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:orderID/replace", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const order = await db.order.findOne({where: {ID: req.params.orderID}})
            req.user.can('order.replace', order)
            req.body.orderID = req.params.orderID
            req.locals.body = await service.order.replace(req.user, req.body)
            // use oli.inventoryID instead of oli.item.inventoryID because oli.item.inventoryID is set as null when items are deleted. 
            // So we have to use the oli.inventoryID snapshot to know which inventory to update
            await service.inventory.updateEgress(req.user, req.locals.body.orderLineItems.map(oli => oli.inventoryID))
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:orderID/refund", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const _o = await db.order.findOne({where: {ID: req.params.orderID}})
            req.user.can('order.refund', _o)
            const order =await service.order.refund(req.user, req.params.orderID, req.body.orderLineItems)
            req.locals.body = order
            // use oli.inventoryID instead of oli.item.inventoryID because oli.item.inventoryID is set as null when items are deleted. 
            // So we have to use the oli.inventoryID snapshot to know which inventory to update
            await service.inventory.updateEgress(req.user, order.orderLineItems.map(oli => oli.inventoryID))
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:orderID/checkout-session", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.order.createCheckout(req.user, req.params.orderID, req.body.gateway)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:orderID/fulfillments", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const order = await service.order.getOne(req.user, req.params.orderID)
            req.user.can('order.fulfill', order)
            req.body.orderID = req.params.orderID
            const fulfillment = await service.fulfillment.create(req.user, req.body)

            req.locals.body = fulfillment
            await service.inventory.updateEgress(req.user, fulfillment.orderLineItems.map(oli => oli.inventoryID))
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:orderID/fulfillments/:fulfillmentID/dispatch", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const order = await db.order.findOne({where: {ID: req.params.orderID}})
            req.user.can('order.dispatch', order)
            req.locals.body = await service.fulfillment.dispatch(req.user, req.body)
            return next()
        })
    } catch (e) {
        return next(e)
    }
})

router.post("/:orderID/fulfillments/:fulfillmentID/deliver", async (req, response, next) => {
    try {
        
        await db.sequelize.transaction(async tx => {
            const order = await db.order.findOne({where: {ID: req.params.orderID}})
            req.user.can('order.deliver', order)
            
            const fulfillmentSimple = await db.fulfillment.findOne({where: {ID: req.params.fulfillmentID}})
            if (fulfillmentSimple.inboundOrderID && fulfillmentSimple.outboundOrderID && fulfillmentSimple.outboundOrderID == order.ID ) {
                throw {status: 403, message: "You can't deliver outbound order if connected to an inbound order" }
            }
            
            req.body.fulfillmentID = req.params.fulfillmentID
            const fulfillment = await service.fulfillment.deliver(req.user, req.body)
            req.locals.body = fulfillment
            await service.inventory.updateEgress(req.user, fulfillment.orderLineItems.map(oli => oli.inventoryID))
            return next()
        })
    } catch (e) {
        return next(e)
    }
})

router.put("/:orderID/fulfillments/:fulfillmentID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const order = await db.order.findOne({where: {ID: req.params.orderID}})
            req.user.can('fulfillment.update', order)
            req.locals.body = await service.fulfillment.update(req.user, req.params.fulfillmentID, req.body)
            return next()
        })
    } catch (e) {
        return next(e)
    }

    return
})

router.put("/:ID", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const order = await db.order.findOne({where: {ID: req.params.ID}})
            req.user.can('order.update', order)
            req.locals.body = await service.order.update(req.user, req.params.ID, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.put("/:orderID/order-line-items/:orderLineItemID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const _o = await db.order.findOne({where: {ID: req.params.orderID}})
            req.user.can('order.update', _o)
            req.locals.body = await service.orderLineItem.update(req.user, req.params.orderLineItemID, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/transfer/download", async (req, response, next) => {
    try {
        /**
         * {
         *  fieldSeparator ?
         *  decimalSeparator ?
         *  table: string
         *  columns: string
         *  query: {
         *  },
         * }
         */

        if (!req.body.table) throw {status: 400, message: "Missing table parameter"}
        if (!req.body.columns) throw {status: 400, message: "Missing columns list"}
        if (!Array.isArray(req.body.columns)) throw {status: 400, message: "columns is not a list"}

        req.body.destinationEmail = req.user.email
        const serviceUser = await service.account.serviceUser(req.user.accountID)
        await service.gcloud.addTask(
            'api-jobs', 
            'POST',
            `${configs.microservices.api}/api/workflows/downloadTable`,
            {
                authorization: `Bearer ${serviceUser.apiKey}`
            }, 
            null, 
            req.body
        )
        req.locals.body = "ok"
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/download", async (req, response, next) => {
    try {
        /**
         * {
         *  fieldSeparator ?
         *  decimalSeparator ?
         *  table: string
         *  columns: string
         *  query: {
         *  },
         * }
         */

        if (!req.body.table) throw {status: 400, message: "Missing table parameter"}
        if (!req.body.columns) throw {status: 400, message: "Missing columns list"}
        if (!Array.isArray(req.body.columns)) throw {status: 400, message: "columns is not a list"}

        req.body.destinationEmail = req.user.email
        const serviceUser = await service.account.serviceUser(req.user.accountID)
        await service.gcloud.addTask(
            'api-jobs', 
            'POST',
            `${configs.microservices.api}/api/workflows/downloadTable`,
            {
                authorization: `Bearer ${serviceUser.apiKey}`
            }, 
            null, 
            req.body
        )
        req.locals.body = "ok"
        return next()
    } catch (e) {
        return next(e)
    }
})
module.exports = router;
