const db = require('../libs/db')
const logger=require('../libs/logger.js')
const service = require('./main')
const utils = require('../libs/utils')
const Op = require('sequelize').Op
const moment = require('moment')

exports.getOne = async (user, itemID) => {
    return db.item.findOne({
        where: {
            ID: itemID
        }, include: [
            { model: db.status, as: 'status', required: false},
            { model: db.account, as: 'account'},
            {model: db.product, as: 'product', include: [
                    {model: db.productCategory, as: 'category'}
                ]},
            {model: db.order, as: 'order', include: [
                    { model: db.account, as: 'account'},
                    {model: db.orderLineItem, as: 'orderLineItems', where: {itemID: itemID}},
                ]},
            {model: db.order, as: 'orders', include: [
                    {model: db.address, as: 'consignee', required: false},
                    {model: db.address, as: 'consignor', required: false},
                    {model: db.account, as: 'account'},
                    {model: db.orderType, as: 'type'},
                    {model: db.orderLineItem, as: 'orderLineItems', where: {itemID: itemID}},
                    {model: db.status, as: 'status'},
            ]},
            { model: db.inventory, as: 'inventory', include: [
                {model: db.inventoryListing, as:'listings'}
            ]},
            { model: db.warehouse, as: 'warehouse'},
            {model: db.productVariant, as: 'variant', include: [
                {model: db.productVariant, as: 'sourceProductVariant'}
            ]},
        ]
    })
}

exports.getAll = async (offset, limit, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [['ID', 'DESC']]
    }

    query.include = [
        { model: db.account, as: 'account', required:true},
        { model: db.status, as: 'status', required: false},
        { model: db.product, as: 'product', required:true, include: [
            {model: db.productCategory, as: 'category'}
        ]},
        { model: db.order, as: 'order', include: [
                { model: db.account, as: 'account'},
            ]},
        { model: db.warehouse, as: 'warehouse'},
        { model: db.productVariant, as: 'variant', required:true},
        { model: db.inventory, as: 'inventory', include: [
            {model: db.inventoryListing, as:'listings', include: [
                    {model: db.saleChannel, as:'saleChannel'}
                ]}
        ]},
        { model: db.jobLineItem, as: 'jobLineItems', include: [
            {model: db.job, as: 'job'}, 
            {model: db.warehouse, as: 'warehouse'}
        ]}
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
                    {'$product.description$': {[Op.substring]: params.search}},
                    {'$product.code$': {[Op.substring]: params.search}},
                    {'$product.foreignID$': {[Op.substring]: params.search}},
                    {'$variant.name$': {[Op.substring]: params.search}},
                    {'$account.name$': {[Op.substring]: params.search}}
                ]})
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    return db.item.findAndCountAll(query)
}

exports.create = async (user, newItem) => {
    const item = {
        accountID: newItem.accountID,
        productID: newItem.productID, 
        productVariantID: newItem.productVariantID,
        barcode: (newItem.barcode && newItem.barcode.trim() != "") ? newItem.barcode.toUpperCase() : null,
        orderID: newItem.orderID,
        volume: 0.001,
        weight: 0.001,
        statusID: 7, //transit as default
        inventoryID: newItem.inventoryID,
    }

    return db.item.create(item)
}

exports.update = async (user, itemIDs, updates) => {
    logger.silly("Update Items", {data: updates})
    if (updates.status){
        updates.statusID = await service.status.getID(updates.status.toLowerCase().trim())
    }
    
    if (updates.barcode){
        updates.barcode = updates.barcode.toLowerCase().trim()
    }

    return db.item.update( updates, {where: {ID: itemIDs}})
}

exports.delete = async (user, body) => {
    /**
     * Example
     * body: [
     *  {itemID: number}
     * ]
     */

    const deletedStatusID = await service.status.getID('deleted')

    await db.item.update({statusID: deletedStatusID, deletedAt: moment().toISOString(), inventoryID: null, warehouseID: null}, {where: {ID: body.map(record => record.itemID)}})
}

//used to check if item with barcode exists
exports.barcodeExists = async (barcode) => {
    if(!barcode) return false
    const item = await db.item.findOne({where: {barcode: barcode.toLowerCase().trim()}})
    return !!item
}

