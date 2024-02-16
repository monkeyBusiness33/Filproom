const db = require('../libs/db')
const service = require('../services/main')
const puppeteer = require('puppeteer-extra')
const moment = require('moment')
const {Op} = require('sequelize')
const configs = require('../configs')
const axios = require('axios')

exports.processQueue = async (taskIDs = [], _configs = {raiseErrorOnFail: false}) => {
    /**
     * Get all products that haven't been queued and have processAt < now so that is time for them to be processed.
     * We create the task for these products and set queuedAt = now so that we don't re-add them to the queue
     * Once processed, we set queuedAt = NULL and set the processAt into the future so that when is time the product is re-queued

    * _configs: {
     *      raiseErrorOnFail: false (default) - raise error if any of the task fails. Default is false
     * }
     * 
     * TODO: remove processedAt - no needed
     */
    console.log("Adding Tasks to Queue")
    console.log(">> Check for new Update tasks")
    let products = await db.product.findAll({where: {
        [Op.and]: {
            processAt: {[Op.or]: [
                {[Op.lt]: moment().format()},
                null
            ]},
            queuedAt: null
        }
    }})

    console.log(`>> Products to queue for update: ${products.length}`)
    for (var product of products) {
        await db.tasksQueue.create({stockxId: product.url, action: 'update'})
        await db.product.update({queuedAt: moment().format()}, {where: {ID: product.ID}})
    }

    console.log("Computing Tasks To Process")
    let tasksToProcess;
    if (taskIDs.length > 0) {
        tasksToProcess = await db.tasksQueue.findAll({where: {ID: taskIDs}})
    } else {
        tasksToProcess = await db.tasksQueue.findAll({
            where: {
                completedAt: null, 
                retryAttempts: {[Op.lt]: configs.queue.maxRetryAttempts},
                // stockxId: products[0].url // for testing purposes
            }, 
            limit: (configs.queue.maxConcurrency * configs.queue.batchesPerJob), 
            order: [['id', 'asc']]}
        )
    }

    if (tasksToProcess.length == 0) {
        console.log(`>> Task to process: ${tasksToProcess.length} - DONE`)
        return 
    } else {
        console.log(`>> Task to process: ${tasksToProcess.length}`)
    }


    const taskBatches = []
    while (tasksToProcess.length > 0) {
        taskBatches.push(tasksToProcess.splice(0, configs.queue.maxConcurrency))
    }

    console.log(`Processing ${taskBatches.length} Batches`)
    for (var tasksBatch of taskBatches) {
        console.log(">> Scraping")
        const taskResults = await Promise.all(tasksBatch.map(taskRecord => service.stockx.getProduct_v2(taskRecord.stockxId).then((stockxProduct) => {return {taskId: taskRecord.ID, status: 200, data: stockxProduct}}).catch(e => {
            e.taskId = taskRecord.ID
            return e
        })))

        // process tasks results & log tasks statuses & send events
        console.log(">> Processing Task (create/update products)")
        const queries = []
        for (let taskResult of taskResults) {
            const taskRecord = tasksBatch.find(task => task.ID == taskResult.taskId)
            console.log(`${taskRecord.stockxId} (${taskRecord.action}) => ${taskResult.status} ${taskResult.status != 200 && taskResult.data?.message ? taskResult.data.message : ''}`)
            
            if (taskResult.status == 200) {
                if (taskRecord.action == 'import') {
                    await service.products.create(taskResult.data)
                } else if (taskRecord.action == 'update') {
                    await service.products.update(taskResult.data)
                }

                queries.push(db.product.update({queuedAt: null}, {where: {url: taskRecord.stockxId}})) //remove the queuedAt to the product so that can be re-added to the queue
                queries.push(db.tasksQueue.update({completedAt: moment(), errorMessage: null}, {where: {ID: taskRecord.ID}}))
                //const dbProduct = results.find(product => (product && (product.stockxId == taskResult.data.id)))
                const dbProduct = await service.products.getOne(taskResult.data.id)
                if (taskRecord.action == 'import') {
                    queries.push(service.system.publish('product/create', dbProduct))
                } else if (taskRecord.action == 'update') {
                    //TODO: remove logging once issue monitored and resolved
                    if(!dbProduct) console.log('>>>stock-x-api trying to publish api task with no product task ID',taskResult.taskId )
                    if(!dbProduct) console.log('>>>stock-x-api trying to publish api task with no product task data',taskResult.data )
                    if(!dbProduct) console.log('>>>stock-x-api trying to publish api task with no product task results',results.map(res=> res.stockxId) )
                    if(!dbProduct) console.log('>>>stock-x-api trying to publish api task with no product task results raw',taskResults.map(res=> res.data.id) )
                    queries.push(service.system.publish('product/update', dbProduct))
                }
            } else if (taskResult.status == 404) {
                //we reset all volatility related components here and assume on 404 its a fresh product but also set volatility score to lowest of 0 making next poll interval to be max possible due to it resulting in the product being placed in the longest bin
                // 778680000 = 9 days = poll interval for 0 volatility score or the longest bucket
                queries.push(db.product.update({queuedAt: null, processAt: moment(Date.now() + 778680000), salesLast72Hours: null, salesLast72HoursChangePercentage: null, lastSalePrice: null, lastSaleChangePercentage: null, volatilityScore: 0.00, volatilityScoreChangePercentage: 0.00}, {where: {url: taskRecord.stockxId}})) //remove the queuedAt to the product so that can be re-added to the queue
                queries.push(db.tasksQueue.update({
                    errorMessage: `${taskResult.status} - ${taskResult.data?.message || 'Unknown'}`, 
                    retryAttempts: taskRecord.retryAttempts += 1, 
                }, {where: {ID: taskRecord.ID}}))

                //set all variants lowestAsk to null so that they can't sync with it anymore
                const product = await db.product.findOne({where: {url: taskRecord.stockxId}})
                await db.productVariant.update({lowestAsk: null}, {where: {productID: product.ID}})
            }
            else {
                queries.push(db.product.update({queuedAt: null}, {where: {url: taskRecord.stockxId}})) //remove the queuedAt to the product so that can be re-added to the queue
                queries.push(db.tasksQueue.update({
                    errorMessage: `${taskResult.status} - ${taskResult.data?.message || 'Unknown'}`, 
                    retryAttempts: taskRecord.retryAttempts += 1
                }, {where: {ID: taskRecord.ID}}))

                if (_configs.raiseErrorOnFail === true) {
                    throw taskResult
                }
            }
        }

        await Promise.all(queries)
    }
}

exports.parseProductsReleases = async () => {
    const today = moment().set({hour:0,minute:0,second:0,millisecond:0}) // needs to pass the date of today at 00:00:00:000
    console.log(`>> Check for new Import tasks For ${today.format("DD/MM/YYYY")} 00:00`)

    for (var pageIdx=1; pageIdx<=2; pageIdx++) {
        try {
            const newProducts = await service.stockx.getNewReleases_v2(today, {pageIdx: pageIdx})
            console.log(`>> Tasks <IMPORT> to queue: ${newProducts.length} - Page ${pageIdx}`)
            for (var product of newProducts) {
                await db.tasksQueue.findOrCreate({defaults: {stockxId: product.urlKey, action: 'import'}, where: {stockxId: product.urlKey}})
            }
        } catch (e) {
            console.log(`>> Some error while checking for new releases at page ${pageIdx}`)
            throw e
        }
    }
}

exports.queueReport = async () => {
    const tasksInQueue = await db.tasksQueue.findAll({where: {completedAt: null, retryAttempts: {[Op.lt]: 5}}})
    const tasksCompletedToday = await db.tasksQueue.findAll({where: {completedAt: {[Op.gte]: moment({hours: 0, minutes: 0})}}})
    const tasksFailedToday = await db.tasksQueue.findAll({where: {updatedAt: {[Op.gte]: moment({hours: 0, minutes: 0})}, retryAttempts: 5}})

    const productCount = await db.product.count({where: {}})
    const productsImportedToday = await db.tasksQueue.findAll({where: {completedAt: {[Op.gte]: moment({hours: 0, minutes: 0})}, action: 'import'}})

    let mostCommonErrorsTodayTableRowsString = ""
    const errorsNames = [...new Set(tasksFailedToday.map(task => task.errorMessage))]
    const errorsReport = []
    for (var errorName of errorsNames) {
        const occurences = tasksFailedToday.filter(task => task.errorMessage == errorName).sort((a, b) => b.updatedAt - a.updatedAt)
        errorsReport.push({
            message: errorName.replace(/[<>]/g, (match) => {
                return {
                  '<': '&lt;',
                  '>': '&gt;'
                }[match];
              }),
            qty: occurences.length,
            mostRecent: occurences[0].updatedAt
        })
    }
    const sortedErrorsReport = errorsReport.sort((a, b) => b.qty - a.qty)
    sortedErrorsReport.map(errorReport => {
        mostCommonErrorsTodayTableRowsString += `<tr style="font-size: 16px">              
            <td>${errorReport.message}</td>     
            <td>${moment(errorReport.mostRecent).fromNow()}</td>  
            <td>${errorReport.qty}</td>     
        </tr>   `
    })

    await axios.post('https://production-email-6dwjvpqvqa-nw.a.run.app', {
        receivers: ['s.rosa@wiredhub.io', 'r.sauchelli@wiredhub.io', 'millie@theeditldn.com'],
        subject: `[STOCKX API] ERRORS REPORT ${moment().format("DD/MM/YYYY")}`,
        message:  `<div style="width: 800px; margin: auto;">
        <h2>Tasks</h2>
        <table style="width: 100%;"> 
        <tr>              
            <td>To Process</td>     
            <td>Completed Today</td>     
            <td>Failed Today</td>
        </tr>             
        <tr style="font-size: 24px">              
            <td>${tasksInQueue.length}</td>     
            <td>${tasksCompletedToday.length}</td>     
            <td>${tasksFailedToday.length}</td>     
        </tr>                 
        </table>
    
        <h2>Products</h2>
        <table style="width: 100%;"> 
        <tr>              
            <td>Products in Catalogue</td>     
            <td>Products Imported Today</td>     
        </tr>             
        <tr style="font-size: 24px">              
            <td>${productCount}</td>     
            <td>${productsImportedToday.length}</td>     
        </tr>                 
        </table>

        <h2>Errors Today</h2>
        <table style="width: 100%;">
            <tr>              
                <td>Message</td>   
                <td>Last Seen</td>
                <td>Qty</td>  
            </tr>
            ${mostCommonErrorsTodayTableRowsString}
        </table>
        </div>
        `,
        attachments: [] 
    })
}
