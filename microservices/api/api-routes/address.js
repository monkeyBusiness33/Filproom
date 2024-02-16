const { default: axios } = require('axios');
const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
const configs = require("../configs");
const db = require("../libs/db");

router.get("/", async (req, response, next) => {
    try {
        const addresses = await service.address.getAll(req.user, req.query.offset, req.query.limit, req.query.sort, req.query)
        req.user.can('address.view', addresses.rows)
        response.status(200).json(addresses)
    } catch(e) {
        next(e)
    }
    return
})

router.post("/search", async (req, response, next) => {
    try {
        req.locals.body = await service.address.search(req.headers.token_decoded.user, req.body.search, req.body)
        req.user.can('address.view', req.locals.body.rows)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const rawAddress = req.body
            rawAddress.accountID = req.user.accountID
            req.user.can('address.create', rawAddress)
            req.locals.body = await service.address.create(req.user, rawAddress)
        })
        return next()
    } catch(e) {
        next(e)
    }
    return
})

router.put("/:addressID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const address = await db.address.findOne({where: {ID: req.params.addressID}})
            req.user.can('address.update', address)
            req.locals.body = await service.address.update(req.user, req.params.addressID, req.body)
        })
        return next()
    } catch(e) {
        next(e)
    }
    return
})

router.get("/google/autocomplete", async (req, response, next) => {
    // https://developers.google.com/maps/documentation/places/web-service/autocomplete#place_autocomplete_requests

    try {
        req.query.key = 'AIzaSyA9E81VSc9WPFdOgBnXpafDwiqYEmFVT9g'
        const addresses = await axios({
            method: 'get',
            url: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
            params: req.query
        })
        response.status(200).json(addresses.data.predictions)
    } catch(e) {
        next(e)
    }
    return
})

router.get("/google/:ID", async (req, response, next) => {
    // https://developers.google.com/maps/documentation/places/web-service/details#place_id

    try {
        const resp = await axios({
            method: 'get',
            url: 'https://maps.googleapis.com/maps/api/place/details/json',
            params: {
                place_id: req.params.ID,
                key: 'AIzaSyA9E81VSc9WPFdOgBnXpafDwiqYEmFVT9g',
                fields: 'address_components'
            }
        })
        response.status(200).json(resp.data.result)
    } catch(e) {
        next(e)
    }
    return
})

router.post('/validate', async (req, response, next) => {
    const rawAddress = req.body
    try {
        const newAddress = await service.address.validate(rawAddress)
        req.locals.body = {validated: !!newAddress.validated}
        return next()
    } catch (e) {
        req.locals.body = {validated: false, error: e.message, address: rawAddress}
        return next()
    }
})


module.exports = router;
