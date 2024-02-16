const express = require('express');
const router = express.Router();
const service = require('../services/main')
const configs = require('../configs')
const jwt = require('jsonwebtoken')
const db = require('../libs/db')
const logger = require('../libs/logger')
const moment = require('moment')

router.post("/signin", async (req, response, next) => {
    try {
        const resp = await service.auth.signIn(req.body)
        response.status(200).send(resp)
    } catch (e) {
        next(e)
    }
    return
})

router.post("/signup", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.auth.signUp(req.body)
        })
        return next()
    } catch(e) {
        next(e)
    }
    return
})

router.post("/forgot-password", async (req, response, next) => {
    try {
        await service.auth.forgotPassword(req.body.email)
        response.status(200).json({message: "Email sent"})
    } catch(e) {
        next(e)
    }
    return
})

router.get("/reset-password", async (req, response, next) => {
    try {
        const targetUrl = await service.auth.resetPassword(req.query.jwt)
        response.redirect(301, targetUrl);
    } catch(e) {
        next(e)
    }
    return
})

router.post("/guest-access-token", async (req, response, next) => {
    try {
        const jwtToken = await service.auth.signInWithGuestToken(req.body)
        response.status(200).json({jwtToken: jwtToken})
    } catch(e) {
        next(e)
    }
    return
})

module.exports = router;