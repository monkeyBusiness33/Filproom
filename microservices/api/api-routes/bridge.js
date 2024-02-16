const express = require('express');
const router = express.Router();
const db = require('../libs/db');
const service = require('../services/main')
const logger = require("../libs/logger");

/**
 * INGRESS
 */

//SHOPIFY

router.post("/ingress/shopify/order/created", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.webhook.orderCreated(
                req.user,
                req.body
            )
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/shopify/order/edited", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.webhook.orderEdited(
                req.user,
                req.body
            )
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/shopify/order/refunded", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.webhook.orderRefunded(
                req.user,
                req.body
            )
        })
        return next()
    } catch (e) {
        if (e.message == "not-found") {
            e.message = "Order id not found"
            e.status = 404
        }
        return next(e)
    }
})

router.post("/ingress/shopify/fulfillment/created", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.webhook.fulfillmentCreated(
                req.user,
                req.body
            )
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/shopify/product/created", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.webhook.productCreated(req.user, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/shopify/product/updated", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.webhook.productUpdated(req.user, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/shopify/product/deleted", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.webhook.productDeleted(req.user, req.body.id)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

//STOCK-X

router.post("/ingress/stock-x/product/created", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.stockx.webhook.productCreated(req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/stock-x/product/updated", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.stockx.webhook.productUpdated(req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

//STRIPE
router.post("/ingress/stripe/payout/updated", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.stripe.webhook.payoutUpdated(req.user, req.body.data.object)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/stripe/payout/failed", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.stripe.webhook.payoutFailed(req.user, req.body.data.object)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/stripe/external-account/updated", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.stripe.webhook.externalAccountUpdated(req.user, req.body.data.object)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/stripe/account/updated", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.stripe.webhook.accountUpdated(req.user, req.body.data.object)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/stripe/payment-intent/created", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.stripe.webhook.paymentIntentCreated(req.user, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/ingress/stripe/charge/succeeded", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.stripe.webhook.chargeSucceeded(req.user, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

//REVOLUT
router.post("/ingress/revolut/transaction/updated", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.revolut.webhook.transactionUpdated(req.user, req.body.data)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

//SHIP ENGINE
router.post("/ingress/ship-engine/shipment/updated", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shipEngine.webhook.shipmentUpdated(req.user, req.body.data)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

//LACED
router.post("/ingress/laced/listing/sync", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.laced.listing.sync(req.user)
        return next()
    } catch (e) {
        return next(e)
    }
})

/**
 * EGRESS
 */

//SHOPIFY

router.post("/egress/shopify/variant/sync", async (req, response, next) => {
    try {
        req.body.provenance = req.headers.provenance
        req.locals.body = await service.bridge.shopify.variant.sync(req.body)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/egress/shopify/order/refund", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            await service.bridge.shopify.order.refund(
                req.user,
                req.body
            )
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/egress/shopify/fulfillment/create", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.shopify.fulfillment.create(
            req.user,
            req.body
        )
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/egress/shopify/fulfillment/update", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.shopify.fulfillment.update(
            req.user,
            req.body
        )
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/egress/shopify/fulfillment/cancel", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.shopify.fulfillment.cancel(
            req.user,
            req.body
        )
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/egress/shopify/product/create", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.product.create(
                req.user,
                req.body
            )
        })
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/egress/shopify/product/update", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.product.update(
                req.user,
                req.body
            )
        })
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/egress/shopify/product/delete", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.product.delete(
                req.user,
                req.body
            )
        })
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/egress/shopify/variant/create", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.variant.create(req.user, req.body)
        })
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/egress/shopify/variant/update", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.variant.update(req.user, req.body)
        })
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/egress/shopify/variant/delete", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.variant.delete(req.user, req.body)
        })
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/egress/shopify/product/image/create", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.product.createProductImage(req.user, req.body)
        })
        return next()
    } catch(e) {      
        return next(e)
    }
})

router.post("/egress/shopify/product/image/update", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.product.updateProductImage(req.user, req.body)
        })
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/egress/shopify/product/image/delete", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.shopify.product.deleteProductImage(req.user, req.body)
        })
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/egress/google-merchant/variant/update", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.bridge.gmerchant.variant.update(req.user, req.body)

        })
        return next()
    } catch(e) {
        return next(e)
    }
})

//LACED
router.post("/egress/laced/listing/create", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.laced.listing.create(req.body.inventoryListingID)
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/egress/laced/listing/update", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.laced.listing.update(req.body.inventoryListing)
        return next()
    } catch(e) {
        return next(e)
    }
})

module.exports = router;
