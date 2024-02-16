const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
var moment = require('moment');
const configs = require('../configs')

router.get("/", async (req, response, next) => {
    try {
        const items = await service.item.getAll(req.query.offset, req.query.limit, req.query)
        response.status(200).json(items)
    } catch(e) {
        next(e)
    }

    return 
})

router.get("/:ID", async (req, response, next) => {
    try {
        const item = await service.item.getOne(req.user, req.params.ID)
        response.status(200).json(item)
    } catch(e) {
        next(e)
    }

    return
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


router.get("/barcode/check", async (req, response, next) => {
    try {
        const barcodeExists = await service.item.barcodeExists(req.query.barcode)
        response.status(200).json(barcodeExists)
    } catch (e) {
        next(e)
    }
    return
})



router.put("/:ID", async (req, response, next) => {
    try {
        await service.item.update(req.user, req.params.ID, req.body)
        response.status(200).json("ok")
    } catch(e) {
        next(e)
    }

    return 
})

module.exports = router;
