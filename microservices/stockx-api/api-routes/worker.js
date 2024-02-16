const express = require('express');
const configs = require('../configs');
const router = express.Router();
const logger=require('../libs/logger.js')
const path = require('path')
const service = require('../services/main')
const db = require('../libs/db')

router.get("/parse-new-releases", async (req, resp, next) => {
    try {
        await service.worker.parseProductsReleases()
        resp.status(200).json('OK')
    } catch (e) {
        next(e)
    }
    return
})

router.get("/queue/process", async (req, resp, next) => {
    try {
        await service.worker.processQueue()
        resp.status(200).json("ok")
    } catch (e) {
        next(e)
    }
    return
})

router.post("/queue/tasks", async (req, resp, next) => {
    /**
     * url:      string - if passed a url parameter, it will extract the stockx's product unique key
     * stockxId: string - passed a stockx's unique key directly
     * type:     string - import, update (default: import)
     * process:  boolean
     */
    try {

        let task = {
            ID: null,
            stockxId: req.body.stockxId,
            action:   req.body.type || 'import'
        }

        if (req.body.url) {
            // convert https://stockx.com/nike-sb-dunk-low-light-cognac?329826398246v=4383464&t=5875 => nike-sb-dunk-low-light-cognac
            const splitPath = ((new URL(req.body.url)).pathname).split('/')
            const productUrlKey = splitPath.indexOf('en-gb')!= -1 ? splitPath[2] : splitPath[1];
            task['stockxId'] = productUrlKey
        }

        // be sure the task is not already in the queue
        if (task.action == "import") {
            [task] = await db.tasksQueue.findOrCreate({defaults: {stockxId: task.stockxId, action: task.action}, where: {stockxId: task.stockxId, action: task.action}})
        } else {
            task = await db.tasksQueue.create({stockxId: task.stockxId, action: task.action})
        }
        

        if (req.body.process === true) {
            await service.worker.processQueue([task.ID], {raiseErrorOnFail: true})
        }

        resp.status(200).json("ok")
    } catch (e) {
        next(e)
    }
    return
})

router.get("/queue/report", async (req, resp, next) => {
    try {
        await service.worker.queueReport()
        resp.status(200).json('OK')
    } catch (e) {
        next(e)
    }
    return
})


module.exports = router;
