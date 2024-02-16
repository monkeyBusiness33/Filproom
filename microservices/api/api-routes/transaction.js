const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
const db = require('../libs/db')
const configs = require('../configs')

router.get("/:ID", async (req, response, next) => {
    try {
        req.locals.body = await service.transaction.getById(req.user, req.params.ID)
        if (!req.locals.body) throw {status: 404, message: "Transaction not found"}
        req.user.can('transaction.view', req.locals.body)
        return next()
    } catch(e) {
        next(e)
    }
    return
})

router.get("/", async (req, response, next) => {
    try {
        req.locals.body = await service.transaction.getAll(req.user, req.query.offset, req.query.limit, req.query)
        req.user.can('transaction.view', req.locals.body.rows)
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.user.can('transaction.create', req.body)
            req.locals.body = await service.transaction.create(req.user, [req.body])
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:ID/pay", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const _tx = await db.transaction.findOne({where: {ID: req.params.ID}, include: [{model: db.order, as: 'order'}]})
            req.user.can('transaction.pay', _tx)
            switch (req.body.gateway) {
                case "stripe":
                    req.locals.body =await service.transaction.payWithStripe(req.user, req.params.ID, req.body.cancellationFeeTxIds)
                    break
                case "revolut":
                    req.locals.body =await service.transaction.payWithRevolut(req.user, req.params.ID, req.body.cancellationFeeTxIds)
                    break
                default:
                    req.locals.body =await service.transaction.payManual(req.user, req.params.ID, req.body.cancellationFeeTxIds)
                    break
            }
        })

        return next()
    } catch (e) {
        return next(e)
    }
})

router.put("/:ID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const _tx = await service.transaction.update(req.user, req.params.ID, req.body)
            req.user.can('transaction.update', _tx)
            req.locals.body = _tx
        })
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
