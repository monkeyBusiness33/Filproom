const express = require('express');
const router = express.Router();
const service = require('../services/main')
const db = require("../libs/db");

router.get("/", async (req, response, next) => {
    try {
        req.locals.body = await service.events.getAll(req.user, req.query.offset, req.query.limit, req.query)
        next()
    } catch(e) {
        next(e)
    }
    return
})

router.get("/:ID", async (req, response, next) => {
    try {
        req.locals.body = await service.events.getById(req.user, req.params.ID)
        next()
    } catch(e) {
        next(e)
    }
    return
})

router.post("/", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const newEvent = await service.events.create(req.user, req.body)
            req.locals.body = newEvent
        })
        next()
    } catch(e) {
        next(e)
    }
    return
})

module.exports = router;
