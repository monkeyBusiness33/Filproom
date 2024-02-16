const db = require('../libs/db')
const Op = require('sequelize').Op;
const service = require('./main')
const utils = require('../libs/utils')
const moment = require('moment');
const logger = require('../libs/logger');
const configs = require("../configs");
const { v1: uuidv1 } = require('uuid');

exports.getOne = async (user, orderLineItemID) => {
    const query = {
        where: {
            ID: orderLineItemID
        },
        include: [
            { model: db.item,                              as: 'item', include: [
                {model: db.account, as: 'account', required: true},
                {model: db.warehouse, as: 'warehouse'}
            ]},
            { model: db.product,                           as: 'product', include: [
                {model: db.productCategory, as: 'category'}
            ]},
            { model: db.productVariant,                    as: 'variant'},
            { model: db.order,                             as: 'order', include: [
                { model: db.orderType, as: 'type'},
                {model: db.account, as: 'account', required: true}
            ]},
            { model: db.fulfillment,                       as: 'fulfillment'},
            { model: db.status,                            as: 'status'},
            { model: db.transaction,                       as: 'transaction'},
        ]
    }

    return db.orderLineItem.findOne(query)
}

exports.getAll = async (user, offset, limit, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 30,
        distinct: true,
        order: [['ID', 'DESC']]
    }

    query.include = [
        {model: db.product,  as: 'product', required: true, include: [
                {model: db.productCategory, as: 'category', required: true}
            ]},
        {model: db.order,    as: 'order', required: true, include: [
                {model: db.account, as: 'account', required: true},
                {model: db.orderType, as: 'type', required:true},
                {model: db.address, as: 'consignee' },
                {model: db.address, as: 'consignor'},
                {model: db.saleChannel, as: 'saleChannel'}
            ]},
        {model: db.fulfillment, as: 'fulfillment', include: [
            {model: db.status, as: 'status'}
        ]},
        {model: db.productVariant, as: 'variant', required:true},
        {model: db.item, as: 'item', required:true, include: [
                {model:db.account, as:'account', required:true},
                {model: db.warehouse, as: 'warehouse'},
                {model: db.inventory, as: 'inventory'}
            ]},
        {model: db.status, as: 'status', required:true}

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
                    {'$item.account.name$': {[Op.substring]: params.search}},
                    {'$item.account.ID$': {[Op.substring]: params.search}},
                    {'$product.description$': {[Op.substring]: params.search}},
                    {'$product.code$': {[Op.substring]: params.search}},
                    {'$product.foreignID$': {[Op.substring]: params.search}},
                    {'$variant.name$': {[Op.substring]: params.search}},
                    {'$order.ID$': {[Op.substring]: params.search}},
                    {'$order.reference1$': {[Op.substring]: params.search}},
                    {'$orderLineItem.notes$': {[Op.substring]: params.search}}
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

    return db.orderLineItem.findAndCountAll(query)
}

exports.create = async (user, orderLineItem) => {
    if (orderLineItem.status) {
        const statusID = await service.status.getID(orderLineItem.status)
        orderLineItem.statusID = statusID

        if (orderLineItem.status == 'dispatched') {
            orderLineItem.dispatchedAt = moment()
        }

        if (orderLineItem.status == 'delivered') {
            orderLineItem.deliveredAt = moment()
        }
    }
    return db.orderLineItem.create({
        accountID: orderLineItem.accountID,
        statusID: orderLineItem.statusID,
        orderID: orderLineItem.orderID,
        itemID : orderLineItem.itemID,
        productID: orderLineItem.productID,
        productVariantID: orderLineItem.productVariantID,
        fulfillmentID: orderLineItem.fulfillmentID,
        price: orderLineItem.price,
        cost: orderLineItem.cost,
        profit :  orderLineItem.profit,
        payout :  orderLineItem.payout,
        fees : orderLineItem.fees,
        notes: orderLineItem.notes,
        inventoryID: orderLineItem.inventoryID,
        orderTypeID: orderLineItem.orderTypeID,
        dispatchedAt: orderLineItem.dispatchedAt,
        deliveredAt: orderLineItem.deliveredAt
    })
}

exports.update = async (user, orderLineItemID, updates) => {
    logger.info("Order Line Item Update", {data: updates})
    if (updates.cost) {
        /**
         * price - fees = payout - cost = profit
         * if orderLineItem belongs to user => update cost and profit
         * 
         * if orderLineItem is consigned
         * - retailerOrder => update cost and profit on retailer oli
         * - resellerOrder => update fees, payout, profit on reseller oli
         */

        const orderLineItem = await service.orderLineItem.getOne(user, orderLineItemID)
        updates.cost = parseFloat(updates.cost)
        updates.profit =  parseFloat(orderLineItem.payout) - updates.cost

        //updating consignment fees and payout
        if (orderLineItem.item.accountID != orderLineItem.order.accountID) {
            const consignorOrder = await db.order.findOne({
                where: {parentOrderID: orderLineItem.orderID, accountID: orderLineItem.item.accountID},
                include: [
                    {model: db.orderLineItem, as: 'orderLineItems'},
                ]
            })

            // use the new admin oli cost (consignor payout) to recompute fees and profits
            const consignorOrderLineItem = consignorOrder.orderLineItems.find(oli => oli.itemID == orderLineItem.itemID)
            await db.orderLineItem.update({
                fees:  parseFloat(consignorOrderLineItem.price) - parseFloat(updates.cost),
                payout: updates.cost,
                profit: parseFloat(updates.cost) - parseFloat(consignorOrderLineItem.cost)
            }, {where: {ID: consignorOrderLineItem.ID}})

            // update payout transaction for consigned order line item
            if (orderLineItem.transaction.status != "unpaid") throw {status: 500, message: 'Cannot update consigned item payout if transaction already paid'}

            await db.transaction.update({
                grossAmount: updates.cost,
            }, {where: {orderLineItemID: orderLineItem.ID}})
        }
    }

    if (updates.status) {
        const statusID = await service.status.getID(updates.status)
        updates.statusID = statusID
    }

    await db.orderLineItem.update(updates, {
        where: {ID: orderLineItemID}
    })

    return service.orderLineItem.getOne(user, orderLineItemID)
}

exports.accept = async (user, body) => {
    /**
     * Mark order line item as accepted 
     * body: [
     *  {
     *      ID: number  | required
     *  }
     * ]
     */
    logger.info("Accept Order Line Item")

    const toFulfillStatusID = await service.status.getID('fulfill')
    //Throw Errors if any
    const orderLineItems = await db.orderLineItem.findAll({where: {ID: body.map(record => record.ID)}})
    orderLineItems.map(oli => {if (oli.canceledAt) throw new Error("Order line item has been already deleted")} )

    await db.orderLineItem.update({statusID: toFulfillStatusID, acceptedAt: moment().toISOString()}, {where: {ID: body.map(record => record.ID)}})
}

exports.dispatch = async (user, body) => {
    /**
     * Mark order line item as outbounded
     * body: [
     *  {
     *      ID: number  | required
     *  }
     * ]
     */

    logger.silly("Dispatch Order Line Items")
    const dispatchedStatusID = await service.status.getID('dispatched')
    await Promise.all(body.map(record => db.orderLineItem.update({statusID: dispatchedStatusID, dispatchedAt: moment().toISOString()}, {where: {ID: record.ID}})))
}

exports.deliver = async (user, body) => {
    /**
     * Mark order line item as delivered
     * body: [
     *  {
     *      ID: number  | required
     *  }
     * ]
     */
    logger.info("Deliver Order Line Items")

    const deliveredStatusID = await service.status.getID('delivered')
    await Promise.all(body.map(record => db.orderLineItem.update({statusID: deliveredStatusID, deliveredAt: moment().toISOString()}, {where: {ID: record.ID}})))
}

exports.cancel = async (user, body) => {
    /**
     * Function used to cancel an order line item 
     * body: [
     *  {
     *      orderLineItemID: number  | required
     *      reason           string  | optional
     *  }
     * ]
     */

    const deletedStatusID = await service.status.getID('deleted')
    await Promise.all(body.map(record => db.orderLineItem.update({fulfillmentID: null, statusID: deletedStatusID, deliveredAt: null ,canceledAt: moment().toISOString(), canceledReason: `${record.reason ? record.reason : ''}`.trim().toLowerCase()}, {where: {ID: record.orderLineItemID}})))
}

exports.refund = async (user, orderLineItems) => {
    /**
     * Function used to refund order line items
     * orderLineItems: [
     *  {
     *      ID: number  | required
     *  }
     * ]
     */
    const deletedStatusID = await service.status.getID('deleted')
    await db.orderLineItem.update({replacePending: false, statusID: deletedStatusID, refundedAt: moment().toISOString()}, {where: {ID: orderLineItems.map(record => record.ID)}})
}
