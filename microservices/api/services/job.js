const db = require('../libs/db')
const utils = require('../libs/utils')
const configs = require('../configs')
const service = require('./main')
const Op = require('sequelize').Op;
const logger=require('../libs/logger.js')
const axios = require('axios')

exports.getOne = async(user, jobID) => {
    const query = {
        where: {
            ID: jobID
        },
        order: [],
        include: [
            {model: db.account, required: true, as: 'account'},
            { model: db.type, as: 'type' },
            { model: db.status, as: 'status' },
            { model: db.warehouse, as: 'warehouse' },
            { model: db.user, as: 'user'},

        ]
    }

    const job = await db.job.findOne(query)
    return job
}

exports.getAll = async(user, offset, limit, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [
            ['ID', 'DESC']
        ],
    }

    query.include = [
        {model: db.account, required: true, as: 'account'},
        { model: db.warehouse,   as: 'warehouse'},
        { model: db.type,   as: 'type', required: true},
        { model: db.status,      as: 'status', required: true},
        { model: db.user, as: 'user'},
    ]

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }
        switch (paramKey) {
            case 'sort':
                query = utils.addSorting(query, params['sort'])
                break;
            case 'type':
                query = utils.addFilter(query, 'type.name', params.type)
                break;
            case 'status':
                query = utils.addFilter(query, 'status.name', params.status)
                break;
            case 'accountIDs':
                query = utils.addFilter(query, 'accountID', params.accountIDs)
                break;

            case 'search':
                query.where.push({[Op.or]: [
                    {'$job.createdAt$':    {[Op.substring]: params.search}},
                    {'$job.notes$':   {[Op.substring]: params.search}},
                    //{'$order.tags$':         {[Op.substring]: params.search}},
                    {'$account.name$':       {[Op.substring]: params.search}},
                    {'$type.name$':       {[Op.substring]: params.search}},
                    {'$status.name$':       {[Op.substring]: params.search}},
                    {'$job.ID$':       {[Op.substring]: params.search}},
                ]})
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    let results = await db.job.findAndCountAll(query)

    return results
}

/*
   CREATE JOB:

    body : {
        warehouseID: number *
        notes: string *
        accountID: number *
        type: string *
    }
 */
exports.create = async(user, rawJob) => {

    if (!await service.user.isAuthorized(user.ID, rawJob.accountID)) {
        return
    }
    logger.info("Generating Job", {data: rawJob})

    //PARAMETER CHECKS
    utils.requiredFields(rawJob, {warehouseID: 'number', accountID: 'number', type: 'string' })
    // STOCK TAKE JOB CREATION
    /**
     * 1. Get warehouse for the job
     * 2. Get items that belong in that warehouse
     * 3. Create job body
     * 4. create jobLineItems:
     */
    if (rawJob.type == 'stock-take'){
        logger.info("Generating Stock Take Job")
        logger.silly("Getting selected warehouse items")
        // 2. Get items that belong in that warehouse
        const items = await db.item.findAll({where: {warehouseID: rawJob.warehouseID}, include: [{model: db.inventory, as: 'inventory', required:true}]})
        const jobTypeID = await service.type.getID('stock-take')
        const jobStatusID = await service.status.getID('created')
        //3. Create job body
        let job = await db.job.create({
            accountID: rawJob.accountID,
            userID: user.ID,
            typeID: jobTypeID,
            statusID: jobStatusID,
            warehouseID: rawJob.warehouseID,
            quantity: items.length,
            notes: rawJob.notes
        })

        //4. create jobLineItems:jl
        //TODO: maybe move to gloud task for scalibility
        const itemBatches = utils.batchArray(items, 500)
        for (let itemBatch of itemBatches){
            await service.jobLineItem.batchCreate(user,job,itemBatch)
        }
        return exports.getOne(user, job.ID)
    }
}


exports.complete = async(user, jobID) => {

    const job = await db.job.findOne({where: {ID: jobID}})

    if (!await service.user.isAuthorized(user.ID, job.accountID)) {
        return
    }
    logger.info("Manually Completing job Job", {data: job})

    // STOCK TAKE JOB COMPLETION

    /**
     * 1. Resolve anomalies in anomalies checks
     * 2. Confirm Items in confirmation checks
     * 3. adjust job status
     */

    //anomalies
    const anomalyUpdates = {
            statusID: await service.status.getID('confirmed'),
            completedAt: new Date(),
            actionResolvedAt: new Date(),
            notes: '[MANUAL-RESOLVE]'
        }

    await db.jobLineItem.update(anomalyUpdates, {where: {jobID: job.ID, action:  {[Op.ne]: null}, actionResolvedAt: {[Op.eq]: null}}})

    //confirmations
    const confirmationUpdates = {
        statusID: await service.status.getID('confirmed'),
        completedAt: new Date(),
        confirmedAt: new Date(),
        notes: '[MANUAL-CONFIRM]'
    }

    await db.jobLineItem.update(confirmationUpdates, {where: {jobID: job.ID, action:  {[Op.eq]: null}, confirmedAt: {[Op.eq]: null}}})

    await exports.adjustQuantity(jobID)
    await exports.adjustStatus(jobID)

    return exports.getOne(user, jobID)

}


exports.adjustStatus = async(jobID) => {
    /**
     * Status Logic:
     *
     * CREATED : no jobLineItems have been completed so far
     * PROCESSING: some jobLineItems have been completed but not all
     * COMPLETED: all jobLineItems have a completed status
     *
     * For speed purposes:
     * - fetch job body only and determine status of job based on a seperate query for jobLineItems that need to be completed
     */
    let updates = null
    const job = await db.job.findOne({where: {ID: jobID}, include: [{model: db.status, as: 'status'}, {model: db.type, as: 'type'}]})
    //STOCK-TAKE JOBS
    if(job.type.name == 'stock-take'){
        const incompleteJobLineItems = await db.jobLineItem.count({where: {completedAt: {[Op.eq]: null}, jobID: job.ID}})
        //mark job as completed
        if (incompleteJobLineItems == 0 && job.status.name != 'completed'){
            updates = {
                statusID: await service.status.getID('completed'),
                completedAt: new Date()
            }
        }
        // check if job needs to be marked as started
        else if  (job.status.name == 'created') {
            updates = {
                statusID: await service.status.getID('processing'),
                startedAt: new Date()
            }
        }

    }
    //avoid unnecessary requests
    if (!updates){
        return
    }
    else {
        return await db.job.update(updates, {where: {ID: jobID}})
    }
}

exports.adjustQuantity = async(jobID) => {
    let updates = null
    const job = await db.job.findOne({where: {ID: jobID}})
    const jobLineItemsQuantity = await db.jobLineItem.count({where: {jobID: job.ID}})
    if (job.quantity != jobLineItemsQuantity) {
        updates = {quantity: jobLineItemsQuantity}
    }
    //avoid unnecessary requests
    if (!updates){
        return
    }
    else {
        return await db.job.update(updates, {where: {ID: jobID}})
    }
}



