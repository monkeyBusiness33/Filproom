const express = require('express');
const router = express.Router();
const service = require('../services/main')
const configs = require('../configs')
const db = require('../libs/db')
const axios = require('axios')

router.post("/submit-task/:taskname", async (req, resp, next) => {
    try {
        const serviceUser = await service.account.serviceUser(req.user.accountID)
        await service.gcloud.addTask(
            'api-jobs', 
            'POST',
            `${configs.microservices.api}/api/workflows/${req.params.taskname}`,
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

router.post("/:workflowName", async (req, resp, next) => {
    try {
        switch (req.params.workflowName) {
            case "syncShopifySaleChannel":
                await db.sequelize.transaction(async tx => {
                    await service.workflows.syncShopifySaleChannel(req.user, req.body)
                })
                req.locals.body = "ok"
                break;
            case "updateSaleChannelConsignorListings":
                await service.workflows.updateSaleChannelConsignorListings(req.user, req.body)
                req.locals.body = "ok"
                break;
            case "downloadBulkDocuments":
                await service.workflows.downloadBulkDocuments(req.user, req.body)
                req.locals.body = "ok"
                break;
            case "downloadTable":
                req.locals.body = await service.workflows.downloadTable(req.user, req.body)
                break;
            case "runScheduler":
                req.locals.body = await service.workflows.runScheduler(req.body.forceTimestamp, req.body.forceWorkflowName)
                break;
            case "dataCheck-productsData":
                req.locals.body = await service.product.dataCheck()
                break;
            case "dataCheck-shopifyProducts&VariantsDataCheck":
                req.locals.body = await service.bridge.shopify.product.dataCheck()
                break;
            case "dataCheck-shopifyOrders&FulfillmentsDataCheck":
                req.locals.body = await service.bridge.shopify.order.dataCheck()
                break;
            case "cloneProductionIntoStaging":
                req.locals.body = await service.workflows.cloneProductionIntoStaging()
                break;
        }
        return next()
    } catch (e) {
        return next(e)
    }
})

module.exports = router;
