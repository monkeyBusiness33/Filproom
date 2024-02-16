const express = require('express');
const router = express.Router();
const service = require('../services/main')

router.post("/event", async (req, response, next) => {
    try {
        response.status(200).json("ok")
    } catch(e) {
        next(e)
    }
    return
})

router.get("/kpis/personal-shopping", async (req, response, next) => {
    try {
        const data = await service.analytics.personalShoppingKPIs()
        response.status(200).json(data)
    } catch(e) {
        next(e)
    }
    return
})

router.get("/kpis/engagement", async (req, response, next) => {
    try {
        const data = await service.analytics.engagementKPIs()
        response.status(200).json(data)
    } catch(e) {
        next(e)
    }
    return
})

module.exports = router;
