const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
const db = require('../libs/db')

router.get("/", async (req, response, next) => {
    try {
        const query = await service.warehouse.getAll(req.user, req.query.offset, req.query.limit, req.query.sort, req.query)
        response.status(200).json(query)
    } catch(e) {
        next(e)
    }
    return
})

router.get("/:warehouseID", async (req, response, next) => {
    try {
        const location = await service.warehouse.getByID(req.user, req.params.warehouseID)
        response.status(200).json(location)
    } catch(e) {
        next(e)
    }
    return
})

router.post("/", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.warehouse.create(req.user, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.put("/:ID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.warehouse.update(req.user, req.params.ID, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

module.exports = router;
