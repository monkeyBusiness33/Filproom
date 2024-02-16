const express = require('express');
const db = require('../libs/db');
const router = express.Router();
const service = require('../services/main')
const configs = require('../configs')

router.get("/", async (req, response, next) => {
    try {
        req.locals.body = await service.inventoryListing.getAll(req.user, req.query.offset, req.query.limit, req.query)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/:ID", async (req, response, next) => {
    try {
        req.locals.body = await service.inventoryListing.getByID(req.user, req.params.ID)
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

router.post("/:ID/reconnect", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const inventoryListing = await service.inventoryListing.reconnect(req.user, req.params.ID, req.body.productVariantID)
            req.locals.body = inventoryListing
            await service.inventory.updateEgress(req.user, [inventoryListing.inventoryID])
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.delete("/:ID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const inventoryListing = await service.inventoryListing.delete(req.user, req.params.ID)
            req.locals.body = inventoryListing
            await service.inventory.updateEgress(req.user, [inventoryListing.inventoryID])
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.put("/:ID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const _inventoryListing = await service.inventoryListing.getByID(req.user, req.params.ID)
            req.user.can('listing.update', _inventoryListing)
            req.locals.body = await service.inventoryListing.update(req.user, req.params.ID, req.body)
            await service.inventory.updateEgress(req.user, [_inventoryListing.inventoryID])
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

module.exports = router;
