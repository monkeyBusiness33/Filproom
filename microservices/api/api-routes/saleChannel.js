const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
const db = require('../libs/db')

router.get("/:saleChannelID",  async (req, response, next) => {
    try {
        req.locals.body = await service.saleChannel.getByID(req.user, req.params.saleChannelID)
        return next()
    } catch (e) {
        return next(e)
    }
})

//NOT IN USE
router.get("/:saleChannelID/variants/:variantID/active-listing",  async (req, response, next) => {
    try {
        req.locals.body = await service.inventoryListing.activeListing(req.user, req.params.variantID, req.params.saleChannelID)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/:saleChannelID/variants/:variantID/listing-bid-suggestion",  async (req, response, next) => {
    try {
        req.locals.body = await service.inventoryListing.getListingBidRecommendation(req.user,req.query.warehouseID,  req.params.saleChannelID,req.params.variantID)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/:saleChannelID/inventory-listings",  async (req, response, next) => {
    try {
        req.locals.body = await service.inventoryListing.getAll(req.user, req.query.offset, req.query.limit, req.query)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/",  async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.saleChannel.create(req.user, req.body)
            return next()
        })
    } catch (e) {
        return next(e)
    }
})

router.put("/:saleChannelID",  async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.saleChannel.update(req.user, req.params.saleChannelID, req.body)
            return next()
        })
    } catch (e) {
        return next(e)
    }
})

router.get("/:saleChannelID/consignors",  async (req, response, next) => {
    try {
        req.locals.body = await service.saleChannel.getConsignors(req.user, req.params.saleChannelID, req.query.offset, req.query.limit, req.query)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.put("/:saleChannelID/consignors/:accountID",  async (req, response, next) => {
    try {
        req.locals.body = await service.saleChannel.updateConsignor(req.user, req.params.saleChannelID, req.params.accountID, req.body)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:saleChannelID/consignors/:accountID",  async (req, response, next) => {
    try {
        req.locals.body = await service.saleChannel.addAccount(req.user, req.params.saleChannelID, req.params.accountID)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:saleChannelID/consignment-fees",  async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.saleChannel.createConsignmentFees(req.user, req.params.saleChannelID, req.body)
            return next()
        })
    } catch (e) {
        return next(e)
    }
})

router.put("/:saleChannelID/consignment-fees",  async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.saleChannel.updateConsignmentFees(req.user, req.params.saleChannelID, req.body)
            return next()
        })
    } catch (e) {
        return next(e)
    }
})

router.delete("/:saleChannelID/consignment-fees/:consignmentFeeID",  async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.saleChannel.deleteConsignmentFee(req.user, req.params.consignmentFeeID)
            return next()
        })
    } catch (e) {
        return next(e)
    }
})


router.post("/laced/validate-credentials",  async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.saleChannel.validateLacedCredentials(req.user, req.body.email, req.body.password)
            return next()
        })
    } catch (e) {
        return next(e)
    }
})

module.exports = router;
