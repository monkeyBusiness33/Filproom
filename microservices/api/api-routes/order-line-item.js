const express = require('express');
const db = require('../libs/db.js');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')

router.get("/:ID", async (req, res, next) => {
    try {
        const orderLineItem = await service.orderLineItem.getOne(req.user, req.params.ID)
        res.status(200).json(orderLineItem)
    } catch (e) {
        next(e)
    }
})

router.get("/", async (req, res, next) => {
    try {
        const orderLineItems = await service.orderLineItem.getAll(req.user, req.query.offset, req.query.limit, req.query)
        res.status(200).json(orderLineItems)
    } catch (e) {
        next(e)
    }
})

module.exports = router;
