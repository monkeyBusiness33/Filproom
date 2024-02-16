const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
const db = require('../libs/db')

router.get("/", async (req, res, next) => {
    try {
        req.locals.body = await service.fulfillment.getAll(req.user, req.query.offset, req.query.limit, req.query)
        return next()
    } catch (e) {
        return next(e)
    }
})

module.exports = router;
