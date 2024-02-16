const db = require('../libs/db')
const Op = require('sequelize').Op;
const service = require('./main')
const utils = require('../libs/utils')
const moment = require('moment');
const logger = require('../libs/logger');

//TODO: to make faster remove additional account includes see where they are used
exports.getOne = async (user, jobLineItemID) => {
    logger.info('Getting job line item')
    const query = {
        where: {
            ID: jobLineItemID
        },
        include: [
            {model: db.account, required: true, as: 'account'},
            { model: db.item, as: 'item', include: [
                    {model: db.account, as: 'account', required: true},
                    {model: db.warehouse, as: 'warehouse'},
                    {model: db.order, as: 'orders', include: [
                        {model: db.account, as: 'account'},
                        {model: db.orderType, as: 'type'}, 
                        {model: db.address, as: 'consignor'}
                    ]}
                ]},
            { model: db.product,                           as: 'product', include: [
                    {model: db.productCategory, as: 'category'}
                ]},
            { model: db.productVariant,                    as: 'variant'},
            {model: db.warehouse, as: 'warehouse'},
            { model: db.job,                             as: 'job', include: [
                    { model: db.type, as: 'type'},
                    {model: db.warehouse, as: 'warehouse'},
                    {model: db.account, as: 'account', required: true}
            ]},
            { model: db.status,                            as: 'status'}
        ]
    }

    return db.jobLineItem.findOne(query)
}

exports.getAll = async (user, offset, limit, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 30,
        distinct: true,
        order: [['updatedAt', 'DESC']]
    }

    query.include = [
        {model: db.account, required: true, as: 'account'},
        { model: db.item, as: 'item', required: true, include: [
                {model: db.account, as: 'account', required: true},
                {model: db.warehouse, as: 'warehouse'},
            ]},
        { model: db.product,  as: 'product', required: true, include: [
                {model: db.productCategory, as: 'category'}
            ]},
        { model: db.productVariant,as: 'variant', required: true},
        { model: db.job, as: 'job', required: true, include: [
                { model: db.type, as: 'type'},
                {model: db.warehouse, as: 'warehouse', required: true},
                {model: db.account, as: 'account', required: true},
            ]},
        { model: db.status,as: 'status'},
        {model: db.warehouse, as: 'warehouse', required: true}

    ]

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }
        switch (paramKey) {
            case 'sort':
                query = utils.addSorting(query, params['sort'])
                break;
            case 'search':
                query.where.push({[Op.or]: [
                    {'$product.title$': {[Op.substring]: params.search}},
                    {'$item.barcode$': {[Op.substring]: params.search}},
                    //{'$item.warehouse.name$': {[Op.substring]: params.search}}, ITEM ANOMALY ISSUE
                    {'$item.account.name$': {[Op.substring]: params.search}},
                    {'$item.account.ID$': {[Op.substring]: params.search}},
                    {'$product.description$': {[Op.substring]: params.search}},
                    {'$product.code$': {[Op.substring]: params.search}},
                    {'$product.foreignID$': {[Op.substring]: params.search}},
                    {'$variant.name$': {[Op.substring]: params.search}},
                    {'$job.ID$': {[Op.substring]: params.search}},
                    {'$job.warehouse.name$': {[Op.substring]: params.search}},
                    {'$jobLineItem.notes$': {[Op.substring]: params.search}}
                ]})
                break;
            case 'IDs':
                query = utils.addFilter(query, 'ID', params[paramKey])
                break;
            case 'accountIDs':
                query = utils.addFilter(query, 'accountID', params[paramKey])
                break;
            case 'warehouseID':
                query = utils.addFilter(query, 'item.warehouseID', params.warehouseID)
                break;
            case 'barcode':
                query = utils.addFilter(query, 'item.barcode', params.barcode)
                break;
            case 'status':
                query = utils.addFilter(query, 'status.name', params.status)
                break;
            case 'type':
                query = utils.addFilter(query, 'order.type.name', params.type)
                break;
            case 'typeID':
                query = utils.addFilter(query, 'order.type.ID', params.typeID)
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    return db.jobLineItem.findAndCountAll(query)
}

exports.create = async (user, jobLineItem) => {
    const job = await db.job.findOne({where: {ID: jobLineItem.jobID}})
    if (!await service.user.isAuthorized(user.ID,  job.accountID)) {
        return
    }
    if (jobLineItem.status) {
        const statusID = await service.status.getID(jobLineItem.status)
        jobLineItem.statusID = statusID
    }
    const updatedJLI = await db.jobLineItem.create({
        accountID: job.accountID,
        itemID : jobLineItem.itemID,
        productID: jobLineItem.productID,
        productVariantID: jobLineItem.productVariantID,
        jobID: jobLineItem.jobID,
        jobTypeID: job.typeID,
        statusID: jobLineItem.statusID,
        action: jobLineItem.action,
        actionCreatedAt: jobLineItem.actionCreatedAt,
        notes: jobLineItem.notes,
        inventoryID: jobLineItem.inventoryID,
        warehouseID : jobLineItem.warehouseID
    })
    await service.job.adjustQuantity(job.ID)
    await service.job.adjustStatus(job.ID)
    return updatedJLI
}

// batch create used in initial generation of STOCK-TAKE job
// stock take jobs can have a lot of items so this function is used to generate batches of JLIs from a list of items for a specific job

exports.batchCreate = async (user, job, items) => {
    if (!await service.user.isAuthorized(user.ID,  job.accountID)) {
        return
    }
    const pendingStatusID = await service.status.getID('pending')
    const rawJobLineItems = []

    const externalItems = items.filter(item => item.accountID != job.accountID)

    const productMatchLookups = await db.productMatchLookup.findAll({
        where: {
            productVariantID: Array.from(new Set(externalItems.map(item => item.productVariantID)))
        },
        include: [
            {model: db.productVariant, as: 'externalVariant'}
        ]
    })

    items.map((item, idx) => {
        let {productID, productVariantID} = item
        const rawJobLineItem ={
            accountID: job.accountID,
            itemID : item.ID,
            productID: productID,
            productVariantID: productVariantID,
            jobID: job.ID,
            jobTypeID: job.typeID,
            statusID: pendingStatusID,
            notes: item.notes,
            inventoryID: item.inventoryID,
            warehouseID : item.warehouseID,
            actionCreatedAt: null,
            action: null,
        }

        if (item.accountID != job.accountID) {
            const matchRecord = productMatchLookups.find(recordMatch => recordMatch.productVariantID == item.productVariantID)
            //if there are missing listing create job-line-item with action 'add-listing'
            if(!matchRecord){
                rawJobLineItem.action = 'add-listing'
                rawJobLineItem.actionCreatedAt = new Date()
            }
            else {
                rawJobLineItem.productID = matchRecord.externalVariant.productID
                rawJobLineItem.productVariantID = matchRecord.externalVariant.ID
            }

        }

        rawJobLineItems.push(rawJobLineItem)
    })

    return db.jobLineItem.bulkCreate(rawJobLineItems)
}

exports.update = async (user, jobLineItemID, updates) => {
    logger.info("Job Line Item Update", {data: updates})
    const jobLineItem = await db.jobLineItem.findOne({where: {ID : jobLineItemID}})
    if (!await service.user.isAuthorized(user.ID,  jobLineItem.accountID)) {
        return
    }
    if (updates.status) {
        const statusID = await service.status.getID(updates.status)
        updates.statusID = statusID
    }
    await db.jobLineItem.update(updates, {
        where: {ID: jobLineItemID}
    })
    return service.jobLineItem.getOne(user, jobLineItemID)
}
