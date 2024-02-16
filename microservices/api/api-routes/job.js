const express = require('express');
const router = express.Router();
const service = require('../services/main')
const db = require('../libs/db')

 router.get("/", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.job.getAll(req.user, req.query.offset, req.query.limit, req.query)
        })
        return next()
    } catch (e) {
        return next(e)
    }

})

router.get("/:ID",  async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.job.getOne(req.user, req.params.ID)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})


router.post("/", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.job.create(req.user, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})


router.put("/:ID/complete", async (req, res, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.job.complete(req.user, req.params.ID)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})


module.exports = router;
