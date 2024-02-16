const express = require('express');
const configs = require('../configs');
const router = express.Router();
const logger=require('../libs/logger.js')
const path = require('path')
const service = require('../services/main')

router.get("/", async (req, resp, next) => {
    try {
        const results = await service.products.getAll(req.query.offset, req.query.limit, req.query.sort, req.query)
        resp.status(200).json(results)
    } catch (e) {
        next(e)
    }

    return
})

router.get("/variants", async (req, resp, next) => {
    try {
        const results = await service.products.getAllVariants(req.query.offset, req.query.limit, req.query.sort, req.query)
        resp.status(200).json(results)
    } catch (e) {
        next(e)
    }
    return
})

router.get("/:id", async (req, resp, next) => {
    try {
        const results = await service.products.getOne(req.params.id)
        resp.status(200).json(results)
    } catch (e) {
        next(e)
    }

    return
})

router.get("/variant/:stockxId", async (req, resp, next) => {
    const stockxId = req.params.stockxId
    try {
        const variant = await service.products.getOneVariant(stockxId)
        resp.status(200).json(variant)
    } catch (e) {
        next(e)
    }
    return
})

module.exports = router;
