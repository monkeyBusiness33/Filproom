const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
const db = require('../libs/db')

router.get("/", async (req, response, next) => {
    try {
        const user = await service.user.getAll(req.user, req.query.offset, req.query.limit, req.query)
        response.status(200).json(user)
    } catch (e) {
        next(e)
    }
    return
})

router.get("/session", async (req, response, next) => {
    try {
        //keep track of latest "login"
        await db.user.update({lastVisitAt: new Date()}, {where: {ID: req.user.ID}})
        const user = await service.user.getUserSession(req.user.ID)
        response.status(200).json(user) // status(200).json(user) is important, if we use return next() /:userID will also be called
        return
    } catch (e) {
        next(e)
    }
})

router.post("/:userID/api-key/refresh", async (req, response, next) => {
    try {
        if (req.user.ID.toString() != req.params.userID) throw {status: 403, message: "Forbidden"}
        await service.user.refreshAPIKey(req.params.userID)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:userID/permissions/add", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            await service.user.addPermissions(req.user, req.params.userID, req.body.permissions)
            req.locals.body = "ok"
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:userID/permissions/delete", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            await service.user.deletePermissions(req.user, req.params.userID, req.body.permissions)
            req.locals.body = "ok"
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.put("/:ID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.user.update(req.user, req.params.ID, req.body)
        })
        return next()
    } catch (e) {
        next(e)
    }
    return
})

module.exports = router;
