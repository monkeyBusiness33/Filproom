const express = require('express');
const db = require('../libs/db.js');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')

router.get("/:ID", async (req, res, next) => {
    try {
        const jobLineItem = await service.jobLineItem.getOne(req.user, req.params.ID)
        res.status(200).json(jobLineItem)
    } catch (e) {
        next(e)
    }
})

router.get("/", async (req, res, next) => {
    try {
        const jobLineItems = await service.jobLineItem.getAll(req.user, req.query.offset, req.query.limit, req.query)
        res.status(200).json(jobLineItems)
    } catch (e) {
        next(e)
    }
})

//create a jobLineItem
router.post("/", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.jobLineItem.create(req.user, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

//update a jobLineItem
router.put("/:ID", async (req, response, next) => {
    try {
        const jobLineItem = await service.jobLineItem.update(req.user, req.params.ID, req.body)
        await service.job.adjustStatus(jobLineItem.jobID)
        await service.job.adjustQuantity(jobLineItem.jobID)
        response.status(200).json("ok")
    } catch(e) {
        next(e)
    }
    return
})


module.exports = router;