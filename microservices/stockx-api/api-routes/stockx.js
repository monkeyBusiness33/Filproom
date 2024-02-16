const express = require('express');
const router = express.Router();
const service = require('../services/main')
const moment = require('moment')

router.get("/products/:urlKey", async (req, resp, next) => {
    try {
        const product = await service.stockx.getProduct_v2(req.params.urlKey)
        resp.status(200).json(product)
    } catch (e) {
        console.log(e)
        next(e)
    }
    return
})

router.get("/new-releases", async (req, resp, next) => {
    try {
        const newReleases = await service.stockx.getNewReleases_v2(moment().set({hour:0,minute:0,second:0,millisecond:0}))
        resp.status(200).json(newReleases)
    } catch (e) {
        console.log(e)
        next(e)
    }
    return
})

module.exports = router;
