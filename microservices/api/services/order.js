const db = require('../libs/db')
const utils = require('../libs/utils')
const service = require('./main')
const logger = require('../libs/logger');
const Op = require('sequelize').Op;
const configs = require('../configs');
const { v1: uuidv1, v4: uuidv4 } = require('uuid');
const axios = require('axios');
const moment = require('moment')

exports.getOne = async(user, orderID) => {
    const query = {
        where: {
            ID: orderID
        },
        order: [
            ['orderLineItems', 'ID', 'DESC'],
            ['transactions', 'ID', 'ASC']
        ],
        include: [
            { model: db.user, as: 'user'},
            { model: db.address, as: 'consignee', required: false },
            { model: db.address, as: 'consignor', required: false },
            { model: db.orderType, as: 'type' },
            { model: db.saleChannel, required: false, as: 'saleChannel', include: [{
                    model: db.transactionRate, as: 'fees',
                }]},
            { model: db.status, as: 'status' },
            { model: db.transaction, as: 'transactions'},
            {
                model: db.orderLineItem,
                as: 'orderLineItems',
                include: [
                    { model: db.status, as: 'status' },
                    { model: db.item, as: 'item', include: [
                        { model: db.status, as: 'status' },
                        { model: db.account, required: true, as: 'account' },
                        { model: db.warehouse, required: false, as: 'warehouse' },
                    ]},
                    { model: db.fulfillment, required: false, as: 'fulfillment', include: [
                        { model: db.status, as: 'status' },
                    ]},
                    { model: db.product, required: true, as: 'product' },
                    { model: db.productVariant, required: true, as: 'variant' },
                    { model: db.inventory, as: 'inventory' },
                ]
            },
            { model: db.account, as: 'account' }
        ]
    }

    const order = await db.order.findOne(query)
    if (!order) {
        return
    }
    // need to be run separately for speed purposes
    const fulfillmentIDs = [...new Set(order.orderLineItems.map(oli => oli.fulfillmentID))]
    const orderFulfillments = await db.fulfillment.findAll({
        where: {ID: fulfillmentIDs},
        include: [
            { model: db.status, as: 'status' }
        ]
    })

    order.dataValues.fulfillments = orderFulfillments
    order.fulfillments = orderFulfillments
    return order
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
        { model: db.user, as: 'user'},
        { model: db.account, as: 'account', required: true},
        { model: db.saleChannel, as: 'saleChannel'},
        { model: db.address,   as: 'consignor'},
        { model: db.address,   as: 'consignee'},
        { model: db.transaction, as: 'transactions'},
        { model: db.orderType,   as: 'type', required: true},
        { model: db.status,      as: 'status', required: true},
        { model: db.orderLineItem, as: 'orderLineItems'},
        { model: db.fulfillment, as: 'fulfillments', include: [
            { model: db.status, as: 'status'},
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
                    {'$order.createdAt$':    {[Op.substring]: params.search}},
                    {'$order.reference1$':   {[Op.substring]: params.search}},
                    {'$order.tags$':         {[Op.substring]: params.search}},
                    {'$account.name$':       {[Op.substring]: params.search}},
                    {'$type.name$':       {[Op.substring]: params.search}},
                    {'$status.name$':       {[Op.substring]: params.search}},
                    {'$order.ID$':       {[Op.substring]: params.search}},
                ]})
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
            }
        }

    let results = await db.order.findAndCountAll(query)

    return results
}

exports.getTransactions = async(user, orderID) => {
    /**
     * 
     * returns a list of transactions for the given order
     */
    const simpleOrder = await db.order.findOne({where: {ID: orderID}})

    let txs;
    if (simpleOrder.parentOrderID) {
        txs1 = (await service.transaction.getAll(user, 0, 100, {orderID: simpleOrder.parentOrderID, toAccountID: simpleOrder.accountID})).rows
        txs2 = (await service.transaction.getAll(user, 0, 100, {orderID: simpleOrder.parentOrderID, fromAccountID: simpleOrder.accountID})).rows
        txs = [...txs1, ...txs2]
    } else {
        txs = (await service.transaction.getAll(user, 0, 100, {orderID: simpleOrder.ID})).rows
    }

    return txs
}

exports.create = async(user, rawOrder) => {
    /*
    {
        accountID:      number
        foreignID:      string | optional
        reference1:     string | optional
        type:           string | [transfer, inbound, outbound]
        arrivalDate:    Date   | optional
        parentOrderID:  number | optional - for consignment orders
        siblingOrderID: number | optional - for trasnfer orders
        fulfillment: {
            setAsDispatched: boolean
            setAsDelivered: boolean
            destinationAddressID: number
        }
        consignee: object                      | required only for type: "outbound"
        details: [{
            inventoryRecordID: number | required only for type: "transfer", "outbound"
            itemID:            number | required only for type "outbound" if inventoryRecordID & quantity not passed
            quantity:          number | optional only if type: "outbound" and itemID is passed
            productID:         number | optional only if type: "outbound" and itemID is passed
            productVariantID:  number | optional only if type: "outbound" and itemID is passed
            price:             number | optional
            cost:              number | optional
            notes:             string | optional
            priceSourceMargin: number | optional

            barcode: number | optional
            containerBarcode: number | optional
            product: {
                code: string
                description: string
                eanCode: string | optional
                category: string | optonal
                variant: string | optional
                variant_foreignID: string | optional
                pieces: number | 1
                weight: number
                volume: number
            } | optional - if productID & variantID defined or genericProduct is true
        }],
        transactions: [{
            grossAmount:   number |
            currency: string | [gbp, usd, eur]
            type:     string | [sale, refund, shipping, cancellation_fee, payout, discount]
        }]
    }
    */
    logger.info("Generating Order", {data: rawOrder})

    if (rawOrder.type == "transfer") {
        return service.order.createTransferOrder(user, rawOrder)
    } // end order type transfer
    else if (rawOrder.type == "inbound") {
    /**
        accountID:      number
        foreignID:      string | optional
        reference1:     string | optional
        type:           inbound
        arrivalDate:    Date   | optional
        fulfillment: {         | optional
            courier:                     string  | optional | default: 'manual',
            setAsDelivered:              boolean | optional | default: false
            originAddressID:             number  | optional | default: null
        },
        consignee:      object | not implemented
        consigneeID:    number
        consignorID:    number | optional
        details: [{

        }]
     * 
     */
        logger.silly("Generating order inbound")
        const orderTypeInbound = await db.orderType.findOne({ where: { name: 'inbound' } })
        const defaultOrderStatusID = await service.status.getID('fulfill')

        // validation
        if (typeof rawOrder.accountID != 'number')                throw new Error("Missing AccountID")
        if (typeof user.ID != 'number')                           throw new Error("Missing userID")
        if (typeof rawOrder.consigneeID != 'number')              throw new Error("Missing consigneeID")
        if (rawOrder.tags != null && typeof rawOrder.tags != 'string')   throw new Error("Tags should be a string")


        const newOrder = {
            accountID: rawOrder.accountID,
            foreignID: rawOrder.foreignID || null,
            userID: user.ID,
            typeID: orderTypeInbound.ID,
            arrivalDate: rawOrder.arrivalDate || null,
            consignorID: rawOrder.consignorID || null,
            consigneeID: rawOrder.consigneeID,
            reference1: rawOrder.reference1 ? rawOrder.reference1.toLowerCase().trim() : null,
            statusID: defaultOrderStatusID,
            tags: rawOrder.tags || ''
        }

        const orderIn = await db.order.create(newOrder)
        const orderLineItems = await exports.addOrderLineItems(user, orderIn.ID, rawOrder.details)

        // If order in gets created with autofulfill
        if (rawOrder.fulfillment != undefined){
            //Create fulfillment
            const fulfillment = await service.fulfillment.create(user, {
                orderID:                orderIn.ID,
                destinationAddressID:   orderIn.consigneeID,
                originAddressID:        orderIn.consignorID || null,
                courier:                rawOrder.fulfillment.serviceProvider || null,
                orderLineItems:         orderLineItems.map(orderLineItem => { return { ID: orderLineItem.ID } }),
                setAsDelivered:         rawOrder.fulfillment.setAsDelivered || false
            })
            
        }

        let _orderInbound = await service.order.getOne(user, orderIn.ID)
        // add defult tags if any
        const defaultTags = []

        const consignmentTag = _orderInbound.orderLineItems.find(oli => oli.item.accountID != _orderInbound.accountID)
        if (consignmentTag) {
            defaultTags.push('consignment')
        }

        if (defaultTags.length > 0) {
            const newTags = _orderInbound.tags.split(",").concat(defaultTags).filter(tag => tag != "")
            await db.order.update({tags: newTags.join(",")}, {where: {ID: _orderInbound.ID}})
            _orderInbound = await service.order.getOne(user, _orderInbound.ID)
        }
        
        // if all the order line items have cost, then we can and we generate invoice on the background
        const olisWithoutCost = _orderInbound.orderLineItems.filter(oli => oli.cost == null)
        if (olisWithoutCost.length == 0) {
            const serviceUser = await service.account.serviceUser(orderIn.accountID)
            await service.gcloud.addTask(
                'api-jobs',
                'GET',
                `${configs.microservices.api}/api/order/${orderIn.ID}/download/invoice`,
                {
                    authorization: `Bearer ${serviceUser.apiKey}`,
                    provenance: 'purchase-order/created'
                },
                null,
                null,
                60 // wait 60 seconds to generate invoice. problem with data consistency
            )
        }
        await service.gcloud.publishEvent(user, 'purchase-order/created', _orderInbound)
        return _orderInbound
    }
    else if (rawOrder.type == "outbound") {
        return service.order.createSaleOrder(user, rawOrder)
    }

}

exports.createTransferOrder = async (user, rawOrder) => {
    /**
    accountID:      number
    foreignID:      string | optional
    reference1:     string | optional
    type:           inbound
    arrivalDate:    Date   | optional
    fulfillment: {         | optional
        setAsDelivered:              boolean | optional | default: false
        originAddressID:             number  | optional | default: null
    },
    consignee:      object | not implemented
    consignorID:    number
    consigneeID:    number
    details: [{

    }]

    * 1. Create transfer-out:
    *      - create body
    *      - addOrderLineItems
    *       - update order totals
    * 2. Create transfer-in
    *      - create body (remember to add siblingOrderID [transfer-out order ID] )
    *      - addOrderLineItems
    *      - update order totals
    * 3. Update siblingOrderID of Transfer Order out
    * 4. Re-fetch updated orders
    *
    *[DEPRECATED] 5. Create fulfilment for transfer-out orderLineItems TODO: check if fulfilment for transfers should always be created right away
    *                 - transfer items to transit draft inventory TODO: design properly
    * 5. Assign created fulfilment to transfer-in orderLineItems
    */
    logger.info("Generating Transfer Order", {data: rawOrder})

    const orderTypeTransferOut = await db.orderType.findOne({ where: { name: 'transfer-out' } })
    const orderTypeTransferIn = await db.orderType.findOne({ where: { name: 'transfer-in' } })
    const toFulfillOrderStatus = await db.status.findOne({ where: { name: 'fulfill' } })
    
    // validation
    if (typeof rawOrder.accountID != 'number')   throw new Error("Missing AccountID")
    if (typeof user.ID != 'number')              throw new Error("Missing userID")
    if (typeof rawOrder.consigneeID != 'number') throw new Error("Missing consigneeID")
    if (typeof rawOrder.consignorID != 'number') throw new Error("Missing consignorID")
    if (rawOrder.details.length == 0)            throw new Error("Missing Order Line Items")

    
    logger.debug("Generating transfer out")
    // Creation of transfer out body
    const orderTransferOutRequest = {
        accountID: rawOrder.accountID,
        userID: user.ID,
        typeID: orderTypeTransferOut.ID,
        consignorID: rawOrder.consignorID,
        consigneeID: rawOrder.consigneeID,
        reference1: rawOrder.reference1 ? rawOrder.reference1.toLowerCase().trim() : null,
        statusID: toFulfillOrderStatus.ID
    }
    let orderTransferOut = await db.order.create(orderTransferOutRequest)

    // add transfer out orderLineItems
    const transferOutOrderLineItems = await service.order.addOrderLineItems(user,orderTransferOut.ID, rawOrder.details)
    
    //TODO - review this fetching of the warehouse - consider using consignee.warehouseID.
    const destinationWarehouse = await db.warehouse.findOne({ where: {addressID: rawOrder.consigneeID} })
    const serviceUser = await service.account.serviceUser(destinationWarehouse.accountID)
    
    logger.debug("Generating transfer in")
    // Creation of transfer in body
    const orderTransferInRequest = {
        accountID: destinationWarehouse.accountID, 
        userID: serviceUser.ID,
        typeID: orderTypeTransferIn.ID,
        siblingOrderID: orderTransferOut.ID,
        consignorID: rawOrder.consignorID,
        consigneeID: rawOrder.consigneeID,
        reference1: rawOrder.reference1 ? rawOrder.reference1.toLowerCase().trim() : null,
        statusID: toFulfillOrderStatus.ID
    }
    let orderTransferIn = await db.order.create(orderTransferInRequest)

    //create transfer in 
    const transferInOrderLineItems = await service.order.addOrderLineItems(serviceUser,orderTransferIn.ID, rawOrder.details)
    //Update Transfer order out sibling ID
    await db.order.update({siblingOrderID: orderTransferIn.ID}, {where: {ID: orderTransferOut.ID}})
    //Updtae transfer order lineitems siblingID
    const queries = []
    for (var ooli of transferOutOrderLineItems) {
        const ioli = transferInOrderLineItems.find(i => i.itemID == ooli.itemID)
        queries.push(db.orderLineItem.update({siblingID: ioli.ID}, {where: {ID: ooli.ID}}))
        queries.push(db.orderLineItem.update({siblingID: ooli.ID}, {where: {ID: ioli.ID}}))
    }
    await Promise.all(queries)

    //!! no current front end usages - can be used in tests
    if (rawOrder.fulfillment){
        const fulfillment = await service.fulfillment.create(user, {
            orderID:                orderTransferOut.ID,
            originAddressID:        rawOrder.consignorID,
            destinationAddressID:   rawOrder.consigneeID,
            courier:                 rawOrder.fulfillment.serviceProvider || null,
            orderLineItems:         transferOutOrderLineItems.map(orderLineItem => { return { ID: orderLineItem.ID } }),
            setAsDispatched:        rawOrder.fulfillment.setAsDispatched,
            setAsDelivered:        rawOrder.fulfillment.setAsDelivered,

        })
    }

    return service.order.getOne(serviceUser, orderTransferOut.ID)
}

exports.update = async(user, orderID, updates) => {
    /*
    */
    logger.info("Update Order", {data: updates})

    if (updates.reference1 !== undefined) {
        updates.reference1 = (updates.reference1 || '').trim().toLowerCase()
    }

    await db.order.update(updates, { where: { ID: orderID }})

    return service.order.getOne(user, orderID)
}

exports.createSaleOrder = async (user, rawOrder) => {
    /**
     * This function record a new sale order
     *  - validate data
     *  - 
     * saleChannelID:            number
     *         consignee:  object  | find or create new consignee
        consigneeID: number | optional | use a consignee already saved
     * foreignID:                string | optional
     * reference1:               string | optional
     * paymentMethod:            string | optional
     * basketStartedAt:          string | optional
     * tags: string of coma-separated words
     *      manual,consignment
     * details: 
     *  - pass a inventoryListingID, quantity and customized price (optional)
     *      [{
     *          inventoryListingID: number
     *          quantity:           number
     *          price:              number | optional
     *      }]
     *  - pass a specific itemID, in this case quantity is not required and a customized price is optional
     *      [{
     *          itemID: number
     *          price:  number | optional
     *      }]
     * transactions: [
     * ]
     * fulfillment: {
     *     courier:                     string  | optional | default: 'manual',
     *     setAsDispatched:             boolean | optional | default: false
     * },
     * 
     */
    logger.info("order.createSaleOrder", {data: rawOrder})

    // validation
    if (typeof rawOrder.saleChannelID != 'number')                throw {status: 500, message: "Missing saleChannelID"}
    if (rawOrder.tags != null && typeof rawOrder.tags != 'string')   throw {status: 500, message: "tags must be a string"}

    const adminServiceUser = await service.account.serviceUser(user.accountID)
    const adminFulfillmentCenter = (await service.account.getFulfillmentCenters(adminServiceUser.accountID))[0]

    // find or create consignee
    if (rawOrder.consignee) {
        rawOrder.consignee.accountID = rawOrder.accountID || adminServiceUser.accountID
        rawOrder.consigneeID = (await service.address.create(adminServiceUser, rawOrder.consignee)).ID
    }

    //admin order
    const saleOrderBody = {
        accountID:     rawOrder.accountID || adminServiceUser.accountID,
        foreignID:     rawOrder.foreignID || null,
        userID:        user.ID,
        saleChannelID: rawOrder.saleChannelID,
        personalShopperAccountID: rawOrder.personalShopperAccountID || null,
        typeID:        4, // outbound type 
        statusID:      10, // pending status
        consigneeID:   rawOrder.consigneeID || null,
        consignorID:   rawOrder.consignorID || adminFulfillmentCenter.addressID,
        reference1:    rawOrder.reference1 ? `${rawOrder.reference1}`.toLowerCase().trim() : null,
        paymentMethod: rawOrder.paymentMethod || null,
        tags:          rawOrder.tags || '',
        accessToken: uuidv4(),
        billingAddressID: rawOrder.billingAddressID || rawOrder.consigneeID,
        notes:         rawOrder.notes,
        basketStartedAt: rawOrder.basketStartedAt || null,
    }

    let saleOrder = await db.order.create(saleOrderBody) 

    // add sale order details
    logger.silly("Add Order Line Items")
    const orderLineItems = await service.order.addOrderLineItems(user, saleOrder.ID, rawOrder.details)
    const consignedOrderLineItems = orderLineItems.filter(oli => oli.item.accountID != saleOrder.accountID)

    let totalAmount = orderLineItems.reduce((totalAmount, oli) => totalAmount += parseFloat(oli.price), 0)
    //add shipping costs from transaction where toAccountID is the accountID of the sale order
    const shippingCosts = (rawOrder.transactions || []).filter(tx => tx.type == 'shipping' && tx.toAccountID == saleOrder.accountID)
    if (shippingCosts.length > 0) {
        totalAmount += shippingCosts.reduce((totalAmount, tx) => totalAmount += parseFloat(tx.grossAmount), 0)
    }



    await db.order.update({totalAmount: totalAmount}, {where: {ID: saleOrder.ID}})
    // generate invoice on the background
    await service.gcloud.addTask(
        'api-jobs',
        'GET',
        `${configs.microservices.api}/api/order/${saleOrder.ID}/download/invoice`,
        {
            authorization: `Bearer ${adminServiceUser.apiKey}`,
            provenance: 'sale-order/created'
        },
        null,
        null,
        60 // wait 60 seconds to generate invoice. problem with data consistency
    )
    // add transactions: discount, shopping costs, sales, payouts
    logger.silly("Generate Transactions")
    const rawTransactions = []
    for (var tx of (rawOrder.transactions || [])) {
        tx.accountID = saleOrder.accountID,
        tx.orderID = saleOrder.ID
        switch (tx.type) {
            case "sale":
                tx.toAccountID = saleOrder.accountID
                break;
            case "discount":
                tx.fromAccountID = saleOrder.accountID
                break;
        }
        rawTransactions.push(tx)
    }

    // payout transactions - get unique accounts consigning for this order in order to generate a payout transaction for each
    for (var consignedOli of consignedOrderLineItems) {
        rawTransactions.push({
            accountID:       saleOrder.accountID,
            grossAmount:     parseFloat(consignedOli.cost),
            currency:        adminServiceUser.account.currency,
            orderID:         saleOrder.ID,
            type:            'payout',
            reference:       `order #${saleOrder.ID} (${saleOrder.reference1}) - ${consignedOli.variant.name}`,
            fromAccountID:   saleOrder.accountID,
            toAccountID:     consignedOli.item.accountID,
            orderLineItemID: consignedOli.ID
        })
    }
    await service.transaction.create(user, rawTransactions)

    // Add default tags if any. like consignment tag
    logger.silly("Generate Tags")
    const defaultTags = []

    if (consignedOrderLineItems.length > 0) {
        defaultTags.push('consignment')
    }

    if (defaultTags.length > 0) {
        const newTags = saleOrder.tags.split(",").concat(defaultTags).filter(tag => tag != "")
        await db.order.update({tags: newTags.join(",")}, {where: {ID: saleOrder.ID}})
    }

    //consignor orders
    logger.silly("Generate Consignors Sale Orders")
    const consignorsAccountIDs = [...new Set(consignedOrderLineItems.map(oli => oli.item.accountID))]
    const consignorFulfillmentCenters = await Promise.all(consignorsAccountIDs.map(accountID => service.account.getFulfillmentCenters(accountID)))
    const consignorServiceUsers = await Promise.all(consignorsAccountIDs.map(accountID => service.account.serviceUser(accountID)))
    for (var consignorAccountID of consignorsAccountIDs){
        const consignorServiceUser = consignorServiceUsers.find(serviceUser => serviceUser.accountID == consignorAccountID)
        const consignorOrderLineItemsReq = consignedOrderLineItems.filter(oli => oli.item.accountID == consignorAccountID)
        const consignorFulfillmentCenter = consignorFulfillmentCenters.find(cfc => cfc[0].accountID == consignorAccountID)[0]

        const consignorOrderRequest = {
            accountID:     consignorAccountID,
            parentOrderID: saleOrder.ID,
            userID:        consignorServiceUser.ID,
            saleChannelID: saleOrder.saleChannelID,
            typeID:        4,
            statusID:      10, // pending status
            consigneeID:   saleOrder.consignorID,    // destination
            consignorID:   consignorFulfillmentCenter.addressID, // origin
            //tags: 'manual', 
            reference1:    saleOrder.reference1,
        }
        let consignorSaleOrder = await db.order.create(consignorOrderRequest)

        // Add order line items 
        const consignorOrderLineItemsRequest = []
        consignorOrderLineItemsReq.map(oli => consignorOrderLineItemsRequest.push({itemID: oli.item.ID, price: oli.price}))
        const consignorOrderLineItems = await service.order.addOrderLineItems(user, consignorSaleOrder.ID, consignorOrderLineItemsRequest)

        const totalAmount = consignorOrderLineItems.reduce((totalAmount, oli) => totalAmount += parseFloat(oli.price), 0)
        await db.order.update({totalAmount: totalAmount}, {where: {ID: consignorSaleOrder.ID}})

        consignorSaleOrder = await service.order.getOne(consignorServiceUser, consignorSaleOrder.ID)

        //publish order event for consignor
        await service.gcloud.publishEvent(consignorServiceUser, 'sale-order/created', consignorSaleOrder)

        // generate invoice on the background
        await service.gcloud.addTask(
            'api-jobs',
            'GET',
            `${configs.microservices.api}/api/order/${consignorSaleOrder.ID}/download/invoice`,
            {authorization: `Bearer ${consignorServiceUser.apiKey}`},
            null,
            null,
            60 // wait 60 seconds to generate invoice. problem with data consistency
        )
    }

    // filter items that can be fulfilled
    const orderLineItemsThatCanBeFulfilled = orderLineItems.filter(oli => oli.item.warehouse && oli.item.warehouse.addressID == saleOrder.consignorID)

    // If order gets created with autofulfill
    if (rawOrder.fulfillment != undefined && orderLineItemsThatCanBeFulfilled.length > 0){
        //Create fulfillment
        const fulfillment = await service.fulfillment.create(user, {
            orderID:                saleOrder.ID,
            originAddressID:        saleOrder.consignorID,
            destinationAddressID:   saleOrder.consigneeID || null,
            courier:                rawOrder.fulfillment.courier || null,
            courierServiceCode:     rawOrder.fulfillment.courierServiceCode || null,
            trackingNumber:         rawOrder.fulfillment.trackingNumber,
            orderLineItems:         orderLineItemsThatCanBeFulfilled.map(oli => { return { ID: oli.ID } }),
            setAsDispatched:        rawOrder.fulfillment.setAsDispatched || false
        })

        if (rawOrder.fulfillment.setAsDelivered){
            await service.fulfillment.deliver(adminServiceUser, {
                fulfillmentID: fulfillment.ID,
                orderLineItems: orderLineItemsThatCanBeFulfilled.map(oli => {return {ID: oli.ID}})
            })
        }

    }

    saleOrder = await service.order.getOne(user, saleOrder.ID)
    await service.gcloud.publishEvent(user, 'sale-order/created', saleOrder)
    return saleOrder

}

exports.accept = async(user, body) => {
    /**
     * Accept order. 
     * The method accepts a list of order line items to be accepted
     * fetches the olis of siblign orders and parent order
     * updates all of the olis fetched
     * 
     * - if consignor order and item already consigned to stock in an admin warehouse - assign transfer fulfillment to current order outbound 
     * 
     * Example
     * {
     *   orderID: number | required
     *   orderLineItems: [
     *      {
     *         ID: number,    | required
     *      }
     *   ]
     * }
     */

    logger.info("Order Accept", {data: body})
    const order = await service.order.getOne(user, body.orderID)

    // orders affected which should have theirs status updated
    const idsOrdersAffected = ([order.ID, order.siblingOrderID, order.parentOrderID]).filter(o => o != null)

    const orderLineItemsToAccept = []
    // requested
    body.orderLineItems.map(oli => orderLineItemsToAccept.push({ID: oli.ID}))
    // siblings
    order.orderLineItems.filter(oli => body.orderLineItems.find(o => o.ID == oli.ID) && oli.siblingID != null).map(oli => orderLineItemsToAccept.push({ID: oli.siblingID})) 
    // parents
    const parentOlis = await db.orderLineItem.findAll({where: {orderID: order.parentOrderID, itemID: order.orderLineItems.filter(oli => body.orderLineItems.find(o => o.ID == oli.ID)).map(oli => oli.itemID)}})
    parentOlis.map(oli => orderLineItemsToAccept.push({ID: oli.ID}))

    await service.orderLineItem.accept(user, orderLineItemsToAccept)

    // if consignor order and item already consigned to stock in an admin warehouse - assign transfer fulfillment to current order outbound 
    const orderLineItemsToAutofulfill = order.orderLineItems.filter(oli => body.orderLineItems.find(o => o.ID == oli.ID)).filter(oli => oli.item.warehouse && oli.item.warehouse.accountID != order.accountID && oli.fulfillmentID == null)
    if (order.parentOrderID && orderLineItemsToAutofulfill.length > 0) {
        logger.silly("Auto accept order line item")
        const orderLineItemsTransferOut = await db.orderLineItem.findAll({
            where: {
                itemID: orderLineItemsToAutofulfill.map(oli => oli.itemID), 
                fulfillmentID: {[Op.not]: null},
                accountID: order.accountID
            },
            include: [
                {model: db.status, as: 'status'},
                {model: db.orderType, as: 'orderType', where: {name: 'transfer-out'}}
            ]
        })

        const updates = []
        for (var toli of orderLineItemsTransferOut) {
            const oli = orderLineItemsToAutofulfill.find(oli => oli.itemID == toli.itemID)
            updates.push({
                ID:            oli.ID,
                status:        toli.status.name,
                fulfillmentID: toli.fulfillmentID,
                acceptedAt:    toli.createdAt,
                dispatchedAt:  toli.dispatchedAt,
                deliveredAt:   toli.deliveredAt
            })
        }
        await Promise.all(updates.map(update => service.orderLineItem.update(user, update.ID, update)))
    }

    await Promise.all(idsOrdersAffected.map(orderID => service.order.adjustStatus(orderID)))

    return service.order.getOne(user, order.ID)
}

//TODO: remove provenanve
exports.cancel = async(user, body, provenance = null) => {
    /**
     * This function is used to cancel items in an order
     * The method accept a list of order line items to be cancelled as well as if restock.
     * To cancel the whole order, all order line items need to be passed. Empty list will through an error
     * This method works for either inbound or outbound. 
     * - cancel inbound item (purchase) - unstock (item is deleted)
     * - cancel inbound item (transfer) - 
     * - cancel outbound item (sale) - 
     * - cancel outbound item (transfer) - 
     * 
     * 
     * Inbound orders can be cancelled only if they don't have a siblingOrderID. Inbound orders don't have a restock option
     * 
     * Example inbound
     * {
     *   orderID: number | required
     *   orderLineItems: [
     *      {
     *         ID: number,    | required
     *         reason: string | optional
     *      }
     *   ]
     * }
     * 
     * Example outbound
     * {
     *   orderID: number | required
     *   orderLineItems: [
     *      {
     *         ID:            number  | required
     *         reason:        string  | optional
     *         restock:       boolean | required
     *         warehouseID:   number | optional
     *      }
     *   ]
     * }
     * 
     * Example Transfer
     * {
     *   orderID: number | required
     *   orderLineItems: [
     *      {
     *         ID:      number  | required
     *         reason:  string  | optional
     *         restock: boolean | required
     *      }
     *   ]
     * }
     */
    logger.info("order.cancel", {data: body})

    const order = await service.order.getOne(user, body.orderID)
    const serviceUser = await service.account.serviceUser(user.accountID)

    let adminOrder;
    let adminServiceUser;
    let consignorOrder;
    let consignorServiceUser;

    if (order.parentOrderID) {
        const _po = await db.order.findOne({where: {ID: order.parentOrderID}})
        adminServiceUser = await service.account.serviceUser(_po.accountID)
        adminOrder = await service.order.getOne(adminServiceUser, order.parentOrderID)
        consignorOrder = order
        consignorServiceUser = serviceUser
    } else {
        adminOrder = order
        adminServiceUser = serviceUser
    }

    if (body.orderLineItems.length == 0) throw {status: 400, message: '0 order line items to cancel. Include at least one order line item to cancel'}

    let orderLineItemsCancelled = []
    const itemsCancelled = []
    for (var oliRecord of body.orderLineItems) { // get the full object of the oli ID passed & apply checks
        const oli = order.orderLineItems.find(oli => oli.ID == oliRecord.ID)

        if (oliRecord.restock && !oliRecord.warehouseID) throw {status: 400, message: "Missing warehouseID. restock:true requires a warehouseID"}

        if (oli.status.name == 'delivered' && order.type.name != "outbound") throw {status: 400, message: "Can't cancel item already delivered. Only sale orders can be cancelled after delivery"}
        if (oli.status.name == 'delivered' && order.type.name == "outbound" && order.parentOrderID) throw {status: 400, message: "Can't cancel consignment sale order delivered. Only internal sale orders can be cancelled after delivery"}

        if (oliRecord.ID == undefined) throw {status: 400, message: "Missing order line item ID"}
        if (oli.canceledAt != null) throw {status: 400, message: "Order line item has been already deleted"}
        if (oli.item.deletedAt != null) throw {status: 400, message: "Item has been already deleted"}

        if (oli.item.inventoryID == null && order.type.name == "inbound") throw {status: 400, message: `Order line item with idx ${i} is sold. Cancel from the sale order`}

        orderLineItemsCancelled.push(oli)
        itemsCancelled.push(oli.item)
    }

    // 1. Cancel order line item - get item olis not completed (currently not delivered and not canceled)
    logger.info(`Cancel order line items`)
    const allItemOlis = await db.orderLineItem.findAll({
        where: {itemID: itemsCancelled.map(item => item.ID)},
        include: [
            {model: db.order, as: 'order'},
        ]
    })

    const openOlisToCancel = allItemOlis.filter(oli => oli.canceledAt == null && oli.deliveredAt == null)

    let olisToCancel = []
    let idsFulfillmentsAffected = []
    let idsOrdersAffected = []
    for (var oli of orderLineItemsCancelled) {
        const record = body.orderLineItems.find(r => r.ID == oli.ID)
        const openOlis = openOlisToCancel.filter(o => o.itemID == oli.itemID)

        for (var otherOli of openOlis) {
            if (otherOli.fulfillmentID != null) {
                idsFulfillmentsAffected.push(otherOli.fulfillmentID)
            }
            idsOrdersAffected.push(otherOli.orderID)
            olisToCancel.push({orderLineItemID: otherOli.ID, reason: record.reason}) // copy the reason to all the order line items affected
        }

        if (oli.fulfillmentID != null) {
            idsFulfillmentsAffected.push(oli.fulfillmentID)
        }
        idsOrdersAffected.push(oli.orderID)
        olisToCancel.push({orderLineItemID: oli.ID, reason: record.reason}) // copy the reason to all the order line items affected
    }
    await service.orderLineItem.cancel(user, olisToCancel)

    // 2. Restock - restock or delete items
    for (var oliRecord of body.orderLineItems) {
        const oli = order.orderLineItems.find(oli => oli.ID == oliRecord.ID)
        // purchase order - 
        //      unstock - Note: item is in stock so it needs to be unstocked and deleted
        if (order.type.name == "inbound") {
            await db.orderLineItem.update({restocked: false}, {where: {ID: oli.ID}})
            await service.inventory.unstock(user, [{inventoryID: oli.item.inventoryID, itemID: oli.itemID}])
        } 

        // transfer order
        //      restocked - update oli and sibling oli, update item and inventory
        //      unstocked - update oli and sibling oli, item is in stock so it needs to be unstocked and deleted
        if ((order.type.name == "transfer-in" || order.type.name == "transfer-out") && oliRecord.restock == true) {
            await service.inventory.restock(user, [{inventoryID: oli.item.inventoryID, itemID: oli.itemID, warehouseID: oliRecord.warehouseID}])
            await db.orderLineItem.update({restocked: true}, {where: {ID: [oli.ID, oli.siblingID]}})
        } else if ((order.type.name == "transfer-in" || order.type.name == "transfer-out") && oliRecord.restock == false) {
            await service.inventory.unstock(user, [{inventoryID: oli.item.inventoryID, itemID: oli.itemID}])
            await db.orderLineItem.update({restocked: false}, {where: {ID: [oli.ID, oli.siblingID]}})
        } 
        // sale order
        //      restocked - update oli and sibling oli, update item and inventory
        //      unstocked - update oli and sibling oli, item is not in stock so only delete
        if (order.type.name == "outbound" && oliRecord.restock == true) {
            //need to use oli.inventoryID instead of item.inventoryID because item already sold
            await service.inventory.restock(user, [{inventoryID: oli.inventoryID, itemID: oli.itemID, warehouseID: oliRecord.warehouseID}])
            await db.orderLineItem.update({restocked: true}, {where: {ID: [oli.ID, oli.siblingID]}})
        } else if (order.type.name == "outbound" && oliRecord.restock == false) {
            // no unstock. only item.delete since item has already been removed from the stock
            await service.item.delete(user, [{itemID: oli.itemID}])
            await db.orderLineItem.update({restocked: false}, {where: {ID: [oli.ID, oli.siblingID]}})
        }
    }

    // 3. set replacement pending - only for outbound
    if (order.type.name == "outbound") {
        logger.info('Outbound oli cancelled: set oli to replace-pending ')
        for (let oli of orderLineItemsCancelled){
            const adminOrderLineItem = adminOrder.orderLineItems.find(o => o.itemID == oli.itemID)
            // update order line item in admin order with request of replacement
            await service.orderLineItem.update(adminServiceUser, adminOrderLineItem.ID, {replacePending: true})
            idsOrdersAffected.push(order.ID)

            // if consignment item canceled
            if (adminOrderLineItem.item.accountID != adminOrder.accountID) {
                const consignorOrderOrderLineItem = allItemOlis.find(o => o.itemID == oli.itemID && o.order.parentOrderID == adminOrder.ID)

                //find transaction and cancel it
                const oliTx = adminOrder.transactions.find(tx => tx.orderLineItemID == adminOrderLineItem.ID && tx.type == 'payout')
                await service.transaction.cancel(adminServiceUser, oliTx.ID)

                //update totalAmount on consignment sale order
                await db.order.update({totalAmount: db.sequelize.literal(`totalAmount - ${consignorOrderOrderLineItem.price}`)}, {where: {ID: consignorOrderOrderLineItem.orderID}})

                //update invoice
                const orderLineItemAccountServiceUser = await service.account.serviceUser(adminOrderLineItem.item.accountID)
                await service.gcloud.addTask(
                    'api-jobs',
                    'GET',
                    `${configs.microservices.api}/api/order/${consignorOrderOrderLineItem.orderID}/download/invoice?refresh=true`,
                    {authorization: `Bearer ${orderLineItemAccountServiceUser.apiKey}`},
                    null,
                    null,
                    60 // wait 60 seconds to generate invoice. problem with data consistency
                )
            }
        }
    }

    // update fulfillments affected
    idsFulfillmentsAffected = [...new Set(idsFulfillmentsAffected)]
    await Promise.all(idsFulfillmentsAffected.map(fID => service.fulfillment.cancel(user, fID)))
    
    // update orders affected
    idsOrdersAffected = [...new Set(idsOrdersAffected)]
    await Promise.all(idsOrdersAffected.map(oID => service.order.adjustStatus(oID)))
    await Promise.all(idsOrdersAffected.map(oID => service.order.adjustOrderTotals(user, oID)))

    const orderUpdated = await service.order.getOne(user, body.orderID)

    //HANDLE NOTIFICATIONS
    //Item cancellations
    for (let oli of orderLineItemsCancelled){
        await service.gcloud.publishEvent(user, 'order-line-item/canceled', oli)
    }

    //Order Cancellations
    await service.gcloud.publishEvent(user, 'sale-order/canceled', orderUpdated)
    return orderUpdated
}

exports.refund = async(user, orderId, orderLineItems, origin = "api") => {
    /**
     * This function refunds an order.
     * - Updates the the order line items to be refunded
     * - Generates a refund transaction equal to the sale price of the order line items
     * - updates the external sale channel if necessary
     * 
     * Parameters:
     *  user: The user who is requesting the refund
     *  orderId: The ID of the order to be refunded
     *  orderLineItems: An array of order line items to be refunded
     *     [
     *        {ID: number}
     *     ]
     *  origin: The origin of the refund request (e.g., "api", "shopify")
     * 
     * Returns:
     *  The order after it has been refunded
     * 
     * Throws:
     *  An error if the order is a child order
     *  An error if the orderLineItems array is empty
     * 
     */

    logger.info(`order.refund`, {data: {
        orderId: orderId, 
        orderLineItems: orderLineItems
    }})

    const order = await service.order.getOne(user, orderId)
    if (order.parentOrderID) {
        throw {status: 500, messsage: 'refunds are possible only from admin order'}
    }

    if (orderLineItems.length == 0) {
        throw {status: 500, messsage: 'order line items list to refund is empty'}
    }

    const serviceUser = await service.account.serviceUser(order.accountID)
    const orderLineItemsToRefund = order.orderLineItems.filter(oli => orderLineItems.find(_o => _o.ID == oli.ID))

    // set order line items as refunded
    await service.orderLineItem.refund(serviceUser, orderLineItemsToRefund)

    // generate refund transaction
    await service.transaction.create(serviceUser, [{
        accountID:    order.accountID,
        grossAmount:        orderLineItemsToRefund.reduce((sum, oli) => sum += parseFloat(oli.price), 0),
        currency:      order.account.currency,
        type:          'refund',
        orderID:       order.ID,
        fromAccountID: order.accountID, 
        toAccountID:   null,
        reference:     order.reference1,
        status:        'paid',
    }])

    // update order status
    await service.order.adjustStatus(order.ID)

     //update order total amount
    const totalAmount = parseFloat(order.totalAmount) - orderLineItemsToRefund.reduce((sum, oli) => sum += parseFloat(oli.price), 0)
    await db.order.update({totalAmount: totalAmount}, {where: {ID: order.ID}})

    // refresh invoice
    await service.gcloud.addTask(
        'api-jobs',
        'GET',
        `${configs.microservices.api}/api/order/${order.ID}/download/invoice?refresh=true`,
        {authorization: `Bearer ${serviceUser.apiKey}`},
        null,
        null,
        60 // wait 60 seconds to generate invoice. problem with data consistency
    )

    // update any external sale channel if necessary
    if (order.saleChannel.platform == 'shopify' && origin != "shopify") {
        await service.gcloud.addTask(
            'shopify-jobs', 
            'post', 
            `${configs.microservices.api}/api/bridge/egress/shopify/order/refund`,
            {authorization: `Bearer ${serviceUser.apiKey}`},
            null,
            {
                ID: orderId,
                orderLineItems: orderLineItemsToRefund
            })
    }
    return service.order.getOne(user, orderId)
}

exports.replace = async(user, body) => {
    /**
     * 
     * Replace 
     * The method accept a list of order line items to be replaced or canceled definetely.
     * This method works only for outbound orders. 
     *
     * Example 'Source the replacement'
     * {
     *   orderID: number | required
     *   orderLineItems: [
     *      {
     *         ID:     number    | required
     *         action: 'source'  | required
     *      }
     *   ]
     * }
     * 
     * Example 'Manually pick the replacement'
     * {
     *   orderID: number | required
     *   orderLineItems: [
     *      {
     *         ID:     number    | required
     *         action: 'manual'  | required
     *         itemID:  number   | required
     *      }
     *   ]
     * }
     * Example 'Refund the item trying to be replaced'
     * {
     *   orderID: number | required
     *   orderLineItems: [
     *      {
     *         ID:     number    | required
     *         action: 'refund'  | required
     *      }
     *   ]
     * }
     */
    logger.info("Order Replace", {data: body})

    const order = await service.order.getOne(user, body.orderID)
    const serviceUser = await service.account.serviceUser(user.accountID)

    if (body.orderLineItems.length == 0) throw new Error("Pass the order line items to replace")
    if (order.type.name != "outbound") throw new Error("Can replace only outbound orders")

    let orderLineItems = []
    for (var oliRecord of body.orderLineItems) { // get the full object of the oli ID passed & apply checks
        const oli = order.orderLineItems.find(oli => oli.ID == oliRecord.ID)
        if (oliRecord.ID == undefined) throw new Error("Missing order line item ID")
        if (oliRecord.action == undefined) throw new Error("Missing action: string")
        if (oliRecord.action == 'manual' && oliRecord.itemID == undefined) throw new Error("Missing itemID: number")

        orderLineItems.push(oli)
    }

    let idsOrdersAffected = []
    const orderLineItemsToRefund = []
    const newOrderLineItemsAdded = []
    // check for order line items to replace - if replacement available use it, otherwise add oli as pending
    for (var oliRecord of body.orderLineItems) {
        logger.silly(`Processing Order Line Item ${oliRecord.ID}`)
        const oli = orderLineItems.find(o => o.ID == oliRecord.ID)
        const updates = {}
        if (oli.replacePending == true) {
            updates['replacePending'] = false
        }
        await service.orderLineItem.update(serviceUser, oli.ID, updates)

        // this is deprecated - should call order.refund directly later on
        if (oliRecord.action == "refund") {
            logger.info('Replacement:refund triggered')
            idsOrdersAffected.push(order.ID)
            orderLineItemsToRefund.push({ID: oli.ID})
        } else if (oliRecord.action == "source") {
            logger.info('Replacement:source triggered')

            // sourcing order
            const fulfillmenCenterForSourcing = (await service.account.getFulfillmentCenters(order.accountID))[0]
            const inventoryRecord = await service.inventory.create(serviceUser, {
                accountID: order.accountID,
                productID: oli.productID,
                productVariantID: oli.productVariantID,
                quantity: 1,
                virtual: 0,
                notes: (`sourced - sale #${order.ID}`).trim() ,
                warehouseID: fulfillmenCenterForSourcing.ID
            })
            const sourcingOrderBody = {
                accountID: order.accountID,
                reference1: `sourcing for sale #${order.ID} - ${order.reference1 || ''}`, // sourcing source - needs custom ID to avoid adding to old sourcing order
                type: 'inbound',
                tags: 'sourcing',
                consigneeID: fulfillmenCenterForSourcing.addressID,
                details: [{
                    itemID: inventoryRecord.items[0].ID,
                    price: oli.price,
                    notes: (`sourced - sale #${order.ID}`).trim(),
                }]
            }
            const sourcingOrder = await service.order.create(user, sourcingOrderBody)
            //TODO: check might not always work
            const orderLineItemGenerated = sourcingOrder.orderLineItems.find(o => o.productVariantID == oli.productVariantID)
            //TODO: status confirmed not doing anything
            await service.order.addOrderLineItems(user, order.ID, [{itemID: orderLineItemGenerated.itemID,price: oli.price}])
            idsOrdersAffected.push(order.ID)
        } else if (oliRecord.action == "manual") {
            logger.info('Replacement:manual triggered')
            const orderDetail = [{
                itemID: oliRecord.itemID,
                price: oli.price
            }]

            const item = await db.item.findOne({where: {ID: oliRecord.itemID}})
            //get listing data for the sales channel
            const inventoryListing = await db.inventoryListing.findOne({where: {inventoryID: item.inventoryID, saleChannelID: order.saleChannelID}})
            const isConsignorItem = item.accountID != order.accountID


            let adminOrder;
            let adminServiceUser;
            if (order.parentOrderID) {
                const _po = await db.order.findOne({where: {ID: order.parentOrderID}})
                adminServiceUser = await service.account.serviceUser(_po.accountID)
                adminOrder = await service.order.getOne(adminServiceUser, order.parentOrderID)
            } else {
                adminOrder = order
                adminServiceUser = serviceUser
            }

            //patch admin order cost if it is a consignor item - to not override payout set by them
            if(isConsignorItem) orderDetail[0]['cost'] = inventoryListing.payout
            let [newOrderLineItemInAdminOrder] = await service.order.addOrderLineItems(user, adminOrder.ID, orderDetail)
            idsOrdersAffected.push(order.ID)

            // If item belongs to another account - generate consignor order
            if (isConsignorItem) {
                const fulfillmenCenter = await service.account.getFulfillmentCenters(item.accountID)
                const consignorServiceUser = await service.account.serviceUser(item.accountID)

                const rawConsignorOrder = {
                    accountID: item.accountID,
                    foreignID: adminOrder.foreignID,
                    parentOrderID: adminOrder.ID,
                    saleChannelID: adminOrder.saleChannelID,
                    userID: consignorServiceUser.ID,
                    typeID: 4,
                    consigneeID: adminOrder.consignorID,
                    consignorID: fulfillmenCenter[0].addressID,
                    reference1: adminOrder.reference1,
                    statusID: 10,
                    details: [{
                        itemID: newOrderLineItemInAdminOrder.itemID, price: oli.price, payout: inventoryListing.payout
                    }]
                }
                const consignorOrder = await db.order.create(rawConsignorOrder)
                await service.order.addOrderLineItems(consignorServiceUser, consignorOrder.ID, rawConsignorOrder.details)

                //update totalAmount on consignment sale order
                await db.order.update({totalAmount: db.sequelize.literal(`totalAmount + ${newOrderLineItemInAdminOrder.price}`)}, {where: {ID: consignorOrder.ID}})
                const newConsignorOrder = await service.order.getOne(consignorServiceUser, consignorOrder.ID)
                //publish order created event
                await service.gcloud.publishEvent(consignorServiceUser, 'sale-order/created', newConsignorOrder)
                //update invoice
                await service.gcloud.addTask(
                    'api-jobs',
                    'GET',
                    `${configs.microservices.api}/api/order/${consignorOrder.ID}/download/invoice?refresh=true`,
                    {authorization: `Bearer ${consignorServiceUser.apiKey}`},
                    null,
                    null,
                    60 // wait 60 seconds to generate invoice. problem with data consistency
                )

                newOrderLineItemsAdded.push({accountID: item.accountID, payout: inventoryListing.payout, adminOrderLineItemID: newOrderLineItemInAdminOrder.ID})
                idsOrdersAffected.push(consignorOrder.ID)
            }

        }
    }

    // generate refund transactions if item cancelled and is not pendingreplacement
    if (orderLineItemsToRefund.length > 0) {
        await service.order.refund(serviceUser, order.ID, orderLineItemsToRefund)
    }

    if (newOrderLineItemsAdded.length > 0) {
        await service.transaction.create(serviceUser, newOrderLineItemsAdded.map(accountPayout => {return {
            accountID:    order.accountID,
            grossAmount:        accountPayout.payout,
            currency:      order.account.currency,
            type:          'payout',
            orderID:       order.ID,
            fromAccountID: order.accountID, 
            toAccountID:   accountPayout.accountID,
            orderLineItemID: accountPayout.adminOrderLineItemID
        }}))
    }

    // update orders affected
    idsOrdersAffected = [...new Set(idsOrdersAffected)]
    await Promise.all(idsOrdersAffected.map(oID => service.order.adjustStatus(oID)))

    const orderUpdated = await service.order.getOne(user, body.orderID)
    await service.gcloud.publishEvent(user, 'order/replaced', orderUpdated)
    return orderUpdated
}

/**
    Adding orderLineItems to orders:
        INBOUND ORDERS:
                1. Find or create product TODO: consider removing since not used anymore
                2. Create Inventory records
                3. Create Items
                4. Create orderLineItems
                details: [
                    productID: number
                    productVariantID: number
                    quantity: number
                    price: number
                    cost: number
                    notes: string
                    priceSourceMargin: number
                ]

        TODO: use (user, orderID, details) instead of (user, details, orderID)

        OUTBOUND ORDERS:
                - Add by inventory - remove from inventory
                - Add by items - doesnt remove from inventory
                details: [{
                    quantity: -2,
                    inventoryRecordID|itemID
                    TODO: For when sourcing inventory needs to be created on on the spot add price, prodVariant and product ?
                }]

        TRANSFER ORDERS [IN, OUT]

 */
exports.addOrderLineItems = async(user, orderID, details) => {
    logger.info("order.addOrderLineItems", {data: {
        orderID: orderID, 
        details: details
    }})
    // New order line items created
    let newOrderLineItems = []
    // Variant IDs to adjust on e-shop
    let uniqueVariantIDs = new Set()
    const order = await service.order.getOne(user,orderID)
    let orderLineItemRequests = []
    if (order.type.name == 'outbound') {
        /**
         * 1. Decrease quantity
         * details: [
         *  {inventoryListingID: number, quantity: number, price: number}
         * ]
         * 
         * 2. Assign Item to order
         * details: [
         *   {itemID: number, price: number} CHANGES {... ,  cost: number,  payout: number} REVISE: Temp fix replace issue | used in replace function
         * ]
         * 
         * All parameters
         * {
         *  inventoryListingID: number (required with quantity and if itemID not set)
         *  itemID: number  (required if inventoryListingID and quantity are not set)
         *  quantity: numbr (required with inventoryListingID and if itemID not set)
         *  price: number
         *  notes: string
         * }
         * 
         * 
         */
        logger.debug("order.addOrderLineItems:outbound")
        
        // store order details per item and complete it by mapping order details by inventory to itemIDs (duplicate order details extracting items) 
        const adminOrder = order.parentOrderID ? await db.order.findOne({where: {ID: order.parentOrderID}}) : order
        const saleChannel = (await service.account.getSaleChannels(adminOrder.accountID)).find(sc => sc.ID == adminOrder.saleChannelID)
        const orderDetails = details.filter(detail => detail.itemID != null)

        //determine if we have a inventory.virtual record in the sale - if so - create a sourcing order for the sale order
        let sourcingOrder;
        let fulfillmenCenterForSourcing;
        const inventoryListings = await Promise.all(details.filter(detail => detail.inventoryListingID != null).map(detail => service.inventoryListing.getByID(user, detail.inventoryListingID)))
        if (inventoryListings.filter(listing => listing?.inventory.virtual).length > 0) {
            logger.silly("Detected virtual inventory in order - generate sourcing order for sale order")
            //Get warehouse to send that order to
            fulfillmenCenterForSourcing = (await service.account.getFulfillmentCenters(order.accountID))[0]
            //sourcing order
            const body = {
                accountID: order.accountID,
                reference1: `sourcing for sale #${order.ID} - ${order.reference1 || ''}`, // sourcing source - needs custom ID to avoid adding to old sourcing order
                type: 'inbound',
                tags: 'sourcing',
                consigneeID: fulfillmenCenterForSourcing.addressID,
                details: []
            }
            sourcingOrder = await service.order.create(user, body)
        }
        
        for (var invListing of inventoryListings) {
            const orderDetail = details.find(detail => detail.inventoryListingID == invListing?.ID)
            if (!orderDetail) throw {status: 400, message: `InventoryListingID does not exist`}

            // if virtual inventory - create items and add to sourcing order
            if (invListing.inventory.virtual == 1) {
                //sourcing order
                const inventoryRecord = await service.inventory.create(user, {
                    accountID: invListing.inventory.accountID,
                    productID: invListing.inventory.productID,
                    productVariantID: invListing.inventory.productVariantID,
                    quantity: orderDetail.quantity,
                    virtual: 0,
                    notes: (`sourced - sale #${order.ID}`).trim() ,
                    warehouseID: fulfillmenCenterForSourcing.ID
                })

                const details = []
                inventoryRecord.items.map(item => details.push({
                    itemID: item.ID, 
                    price: orderDetail.price, 
                    notes: (`sourced - sale #${order.ID}`).trim()
                }))
                
                const orderLineItems = await service.order.addOrderLineItems(user, sourcingOrder.ID, details)
                orderLineItems.map(oli => orderDetails.push({
                    itemID: oli.itemID,
                    price: orderDetail.price,
                    notes: orderDetail.notes
                }))
            } 
            //if physical record - extract item from inventory and prioritize items with barcode 
            else {
                const itemsWithBarcodeFirst = invListing.inventory.items.sort((itemA, itemB) => itemA.barcode == null ? 1 : -1)
                itemsWithBarcodeFirst.slice(0, orderDetail.quantity)
                .map(item => orderDetails.push({
                    itemID: item.ID,
                    price: orderDetail.price,
                    notes: orderDetail.notes
                }))
            }
        }

        // Fetch details of all items assigned to the order 
        const orderItems = await db.item.findAll({ where: { ID: orderDetails.map(detail => detail.itemID)}, include: [
            { model: db.inventory, as: 'inventory'}, 
            { model: db.account, as: 'account'},
            { model: db.product, as: 'product'},
            { model: db.warehouse, as: 'warehouse'},
        ] })

        // fetch inventory listing used to correctly set consignor payout
        const itemsListings = await db.inventoryListing.findAll({where: {saleChannelID: saleChannel.ID, inventoryID: [... new Set(orderItems.map(item => item.inventoryID))]}})

        const orderLineItems = [] // Store the items selected for the order
        const itemsUpdates = []
        for (var orderDetail of orderDetails) {
            const item = orderItems.find(item => orderDetail.itemID == item.ID)
            const listing = itemsListings.find(listing => listing.inventoryID == item.inventoryID)

            logger.silly("Calculate order line item figures")
            // calculate fees, cost and profit from price and payout depending on account 
            const saleFigures = utils.breakdownSalePrice(saleChannel, item.product, item.accountID, orderDetail.price)

            if (order.parentOrderID) { //consignment sale order
                saleFigures['fees'] = saleFigures.price - parseFloat(listing.payout)
                saleFigures['payout'] = parseFloat(listing.payout)
                saleFigures['cost'] = parseFloat(item.inventory.cost) || 0
                saleFigures['profit'] = saleFigures.payout - saleFigures.cost
            } else { // main sale
                saleFigures['fees'] = saleFigures.taxAmount + saleFigures.markupAmount
                saleFigures['payout'] = saleFigures.price - saleFigures.fees
                saleFigures['cost'] = item.accountID != order.accountID ? parseFloat(listing.payout) : (item.inventory.cost  || 0)
                saleFigures['profit'] = saleFigures.payout - saleFigures.cost
            }

            let {productID, productVariantID} = item
            if (item.accountID != order.accountID) {
                logger.silly("Map product to consignment account products")
                const matchedProductVariant = await service.product.matchVariant(user, productVariantID, order.accountID)
                productID = matchedProductVariant.productID
                productVariantID = matchedProductVariant.ID
            }


            const orderLineItem = {
                accountID:        order.accountID,
                orderID:          order.ID,
                orderTypeID:      order.typeID,
                productID:        productID,
                productVariantID: productVariantID,
                inventoryID:      item.inventory.ID,
                itemID:           item.ID,
                status:  'pending',
                notes:   orderDetail.notes || item.inventory.notes || null,
                price:   saleFigures.price,
                fees:    saleFigures.fees,
                payout:  saleFigures.payout,
                cost:    saleFigures.cost,
                profit:  saleFigures.profit,
            }

            // update items - Remove inventory ID from item if accountID of item matches accountID of order
            if (order.accountID == item.accountID)  {
                itemsUpdates.push({
                    itemID: item.ID,
                    inventoryID: null
                })

                item.statusID == 7 ? await service.inventory.adjustIncoming(item.inventory.ID, -1) : await service.inventory.adjustAtHand(item.inventory.ID, -1)
            }

            orderLineItems.push(orderLineItem)
            uniqueVariantIDs.add(item.productVariantID)
        }

        logger.silly("Create order line items & update items")
        newOrderLineItems = await Promise.all(orderLineItems.map(oli => service.orderLineItem.create(user, oli)))
        await Promise.all(itemsUpdates.map(updates => service.item.update(user, updates.itemID, updates)))

        logger.silly("Compute order line items to auto-accept")
        // accept all order line items if at location owned by the order's admin account
        const orderLineItemsToAccept = []
        orderItems.map((item, idx) => {
            const oli = newOrderLineItems.find(oli => oli.itemID == item.ID)
            if (item.warehouse && item.warehouse.accountID == adminOrder.accountID && oli.acceptedAt == null) {
                orderLineItemsToAccept.push(oli)
            }
        })
        if (orderLineItemsToAccept.length > 0) {
            logger.silly("Auto-accept order line items", {data: orderLineItemsToAccept})
            const serviceUser = await service.account.serviceUser(order.accountID)
            await service.order.accept(serviceUser, {
                orderID: orderID,
                orderLineItems: orderLineItemsToAccept
            })
        } else {
            logger.silly("No order line items to auto-accept")
        }
    }
    else if (order.type.name == 'inbound') {
        /*
         * Assign items to inbound orders or generate items for sourcing orders
         *   details: [
         *       {
         *           itemID: required
         *           fulfillmentID: optional - 
         *           price: number (optional)
         *           cost: number  (optional)
         *           notes: string (optional)
         *       }
         *   ]
         *
         */
        logger.silly("Add Inbound order line items")
        
        details.map((detail, idx) => {
            if (detail.itemID) return
            throw new Error(`Invalid Order Line Item details ${idx}`)
        })

        const items = await db.item.findAll({where: {ID: details.map(d => d.itemID)}})

        for (let item of items) {
            const detail = details.find(d => d.itemID == item.ID)
            let {productID, productVariantID} = item
            if (item.accountID != order.accountID) {
                logger.silly("Map product to consignment account products")
                const matchedProductVariant = await service.product.matchVariant(user, productVariantID, order.accountID)
                productID = matchedProductVariant.productID
                productVariantID = matchedProductVariant.ID
            }

            // Generate Order Line Item 
            orderLineItemRequests.push(service.orderLineItem.create(user, {
                accountID:        order.accountID,
                status:           (detail.status || 'fulfill'),
                orderID:          order.ID,
                orderTypeID:      order.typeID,
                itemID:           item.ID,
                inventoryID:      item.inventoryID,
                fulfillmentID:    detail.fulfillmentID, //use fulfilment ID to match fulfillment between order out consignor and order in admin
                productID:        productID,
                productVariantID: productVariantID,
                price:            detail.price || null,
                cost:             detail.cost || null,
                notes:            detail.notes || null,
            }))

            uniqueVariantIDs.add(item.productVariantID)
        }
        
        newOrderLineItems = await Promise.all(orderLineItemRequests)
    }
    else if (order.type.name == 'transfer-out'){
        /**
         * This function creates the order line items for a transfer out order
         * - Decrease quantity from current inventory
         * - Create new inventory at destination location & listings
         * - Update items (inventoryID, status)
         * - Create order line items. If sending to external account, use product and variant IDs oof external account product
         * 
         * details: [
         *  {itemID: number}
         * ]
         */

        const destinationWarehouse = await db.warehouse.findOne({
            where: {addressID: order.consigneeID},
        })

        // fetch items to transfer and the inventory records affected
        const itemsSelectedToTransfer = await db.item.findAll({where: {ID: details.map(detail => detail.itemID)}})
        const uniqueInventoryRecordsAffected = await db.inventory.findAll({
            where: {ID: [... new Set(itemsSelectedToTransfer.map(item => item.inventoryID))]},
            include: [
                {model: db.inventoryListing, as: 'listings'}
            ]
        })

        //move inventory records if items still in stock (doesn't apply to iytems to transfer because sold)
        for (var invRecord of uniqueInventoryRecordsAffected) {
            const items = itemsSelectedToTransfer.filter(item => item.inventoryID == invRecord.ID)

            // decrease qty from current item inventory record
            const quantityAtLocation = items.filter(item => !item.statusID)
            await service.inventory.adjustAtHand(invRecord.ID, -quantityAtLocation.length);

            const quantityinTransit = items.filter(item => item.statusID)
            await service.inventory.adjustIncoming(invRecord.ID, -quantityinTransit.length);

            //create new inventory record at destination location & listings
            let newInventoryRecord = JSON.parse(JSON.stringify(invRecord.dataValues))
            delete newInventoryRecord.ID
            newInventoryRecord.warehouseID = destinationWarehouse.ID
            newInventoryRecord.quantity = items.length
            newInventoryRecord = await service.inventory.create(user, newInventoryRecord, {createItems: false})

            //duplicate listings
            await Promise.all(invRecord.listings.map(listing => {
                let newListing = JSON.parse(JSON.stringify(listing.dataValues))
                delete newListing.ID
                newListing.inventoryID = newInventoryRecord.ID
                return db.inventoryListing.create(newListing)
            }))

            // update items status and inventory record
            await service.item.update(user, items.map(_item => _item.ID ), {inventoryID: newInventoryRecord.ID, status: 'transit'});
        }

        //create order line items
        for (const item of itemsSelectedToTransfer) {
            const oldInvRecord = uniqueInventoryRecordsAffected.find(inv => inv.ID == item.inventoryID)

            let {productID, productVariantID} = item
            //handle scenario when consignor item is transferred between internal locations of retailer - keep consistency for productID and productVariantID
            if (item.accountID != order.accountID) {
                logger.silly("Map product to consignment account products")
                const productVariantMatches = await service.product.getVariantMatch(user, productVariantID)
                const productVariant = productVariantMatches.find(v => v.product.accountID == order.accountID)
                productID = productVariant.product.ID
                productVariantID = productVariant.ID
            }

            orderLineItemRequests.push(service.orderLineItem.create(user, {
                accountID: order.accountID,
                status: 'fulfill',
                orderID: order.ID,
                orderTypeID: order.typeID,
                itemID: item.ID,
                notes: oldInvRecord?.notes,
                inventoryID: oldInvRecord?.ID, //uses "old" inventory record at origin location
                cost: oldInvRecord?.cost,
                productID: productID,
                productVariantID: productVariantID
            }))
        }

        newOrderLineItems = await Promise.all(orderLineItemRequests)
    }
    else if (order.type.name == 'transfer-in') {
        /**
         * This function creates the order line items for a transfer in order
         * - Create order line items. If sending to external account, use product and variant IDs oof external account product
         * 
         * details: [
         *  {itemID: number}
         * ]
         */
        let itemsSelectedToTransfer = await db.item.findAll({
            where: {ID: details.map(detail => detail.itemID)},
            include: [
                {model: db.inventory, as: 'inventory'}, // to be able to copy the notes
            ]
        })

        for (var item of itemsSelectedToTransfer) {
            let {productID, productVariantID} = item
            if (item.accountID != order.accountID) {
                logger.silly("Map product to consignment account products")
                const productVariantMatches = await service.product.getVariantMatch(user, productVariantID)
                const productVariant = productVariantMatches.find(v => v.product.accountID == order.accountID)
                productID = productVariant.product.ID
                productVariantID = productVariant.ID
            }

            orderLineItemRequests.push(service.orderLineItem.create(user, {
                accountID: order.accountID,
                status: 'fulfill',
                orderID: order.ID,
                orderTypeID: order.typeID,
                itemID: item.ID,
                inventoryID: item.inventoryID, // uses "new" inventory record at destination location
                cost: item.inventory?.cost,
                notes: item.inventory?.notes,
                productID: productID,
                productVariantID: productVariantID
            }))
        }
        
        newOrderLineItems = await Promise.all(orderLineItemRequests)
    }

    await service.order.adjustOrderTotals(user, order.ID)
    await service.order.adjustStatus(order.ID)
    return db.orderLineItem.findAll({
        where: {ID: newOrderLineItems.map(oli => oli.ID)},
        include: [
            {model: db.item, as: 'item', include: [
                {model: db.warehouse, as: 'warehouse'},
            ]},
            {model: db.productVariant, as: 'variant'},
        ]
    }) 
}

exports.adjustOrderTotals = async(user, orderID) => {
    logger.info(`adjustOrderTotals`, {data: orderID})

    const order = await exports.getOne(user, orderID)

    let updates = {
        volume: 0,
        weight: 0,
        quantity: 0
    }

    order.orderLineItems.map(orderLineItem => {
        /**
         * Don't count rejected items in orders that dont match in accountIDs:
         *  - to handle adding of extra items so quantity is displayed correctly
         */
        if ((orderLineItem.status.name == 'rejected' && orderLineItem.item.accountID == order.accountID) || orderLineItem.canceledAt == null) {
            updates.volume += parseFloat(orderLineItem.item.volume)
            updates.weight += parseFloat(orderLineItem.item.weight)
            updates.quantity += 1
        }
    })
    
    //TODO: consider changing to service update : might create even more requests
    return db.order.update(updates, { where: { ID: orderID } })
}

exports.adjustStatus = async(orderID) => {
    /**
     * Update order status depending on the order line items statuses
     */
    logger.info(`order.adjustStatus`, {data: {orderID}})
    const order = await db.order.findOne({where: {
        ID: orderID
    }, include: [
        {model: db.status, as: 'status'},
        {model: db.orderLineItem, as: 'orderLineItems', include: [
            {model: db.status, as: 'status'}
        ]}
    ]})
    let orderLineItemStatuses = new Set()
    let pendingReplacementFound = false
    order.orderLineItems.map(orderLineItem => {
        orderLineItemStatuses.add(orderLineItem.status.name)
        if(orderLineItem.replacePending && !pendingReplacementFound) pendingReplacementFound = true
    })

    let orderStatus = order.status.name

    const hasPending = orderLineItemStatuses.has('pending')
    const hasDeleted = orderLineItemStatuses.has('deleted')
    const hasToFulfill = orderLineItemStatuses.has('fulfill')
    const hasFulfilling = orderLineItemStatuses.has('fulfilling')
    const hasDispatched = orderLineItemStatuses.has('dispatched')
    const hasDelivered = orderLineItemStatuses.has('delivered')
    //CHANGE: orders out will contain a pending replacement which should set order status to 'PENDING' and not 'DELETED'
    const hasPendingReplacement = pendingReplacementFound

    if (hasDeleted) orderStatus = 'deleted'
    if (hasPending || (hasPendingReplacement && hasDeleted)) orderStatus = 'pending'
    if (hasToFulfill) orderStatus = 'fulfill'

    if (hasPending && orderLineItemStatuses.size != 1) orderStatus = 'partially-confirmed'
    if (hasToFulfill && (orderLineItemStatuses.size == 1 || (orderLineItemStatuses.size == 2 && hasDeleted))) orderStatus = 'fulfill'

    if (hasFulfilling && orderLineItemStatuses.size != 1 && !hasDeleted) orderStatus = 'partially-fulfilling'
    if (hasFulfilling && (orderLineItemStatuses.size == 1 || (orderLineItemStatuses.size == 2 && hasDeleted))) orderStatus = 'fulfilling'

    if (hasDispatched && orderLineItemStatuses.size != 1 && !hasDeleted) orderStatus = 'partially-dispatched'
    if (hasDispatched && (orderLineItemStatuses.size == 1 || (orderLineItemStatuses.size == 2 && hasDeleted))) orderStatus = 'dispatched'

    if (hasDelivered && orderLineItemStatuses.size != 1 && !hasDeleted) orderStatus = 'partially-delivered'
    if (hasDelivered && (orderLineItemStatuses.size == 1 || (orderLineItemStatuses.size == 2 && hasDeleted))) orderStatus = 'delivered'

    const updates = {
        statusID: await service.status.getID(orderStatus)
    }
    
    // if updating order to final status
    if (orderStatus == "delivered") {
        updates.completedAt = new Date()
    }

    if ((hasFulfilling || hasDispatched ||hasDelivered) && !order.fulfillmentStartedAt) { 
        updates.fulfillmentStartedAt = new Date()
    }

    if ((orderStatus == "dispatched" || orderStatus == 'delivered') && !order.fulfillmentCompletedAt) { 
        updates.fulfillmentCompletedAt = new Date()
    }

    //TODO: consider changing to service update : might create even more requests
    await db.order.update(updates, {where: {ID: orderID}})
}

exports.getAvailableCouriers = async(user, orderID) => {
    /**
     * shipFrom and shipTo couriers are always available to be selected. 
     * In the scenario where none is available, the Fliproom couriers become available and are returned
     */

    const order = await service.order.getOne(user, orderID)
    const accountCouriers = await db.courier.findAll({
        where: {accountID: [order.consignor?.accountID || null, order.consignee?.accountID || null]}, 
        include: [
            {model: db.account,as: 'account', include: [
                {model: db.address, as: 'billingAddress'}
            ]}
        ]
    })

    if (accountCouriers.length > 0) { // return account private couriers
        return accountCouriers
    } else { // return fliproom couriers
        return db.courier.findAll({where: {accountID: null}})
    }
}

exports.downloadReceipt = async(user, orderID) => {
    const order = await service.order.getOne(user, orderID)

    // if exists return - else generate
    if (order.receiptFilename) {
        const resp1 = await axios.get(`${configs.apis.gcloud.resourcesPath}/resources/${order.receiptFilename}`, {responseType: 'arraybuffer'})
        return {
            receiptBase64: `data:image/png;base64,${Buffer.from(resp1.data).toString('base64')}`
        }
    }

    const currencySymbol = {
        'GBP': '£',
        'USD': '$',
        'EUR': '€',
    }

    const data = {
        fileType: 'png',
        templateData: {
            salePointName: order.account.name,
            salePointAddressLine1: `${order.consignor.addressExtra ? order.consignor.addressExtra + ', ' : ''}${order.consignor.address}`,
            salePointAddressLine2: `${order.consignor.postcode}, ${order.consignor.city}`,
            orderNumber:            order.ID,
            orderReference:         order.reference1,
            orderDate:              moment(order.createdAt).format("HH:mm:ss M/d/yy"),
            lineItems: [
            ],
            subTotal: 0,
            currency: currencySymbol[order.account.currency], 
            notes: 'Thank you and see you again!'
        }
    }
    const productIDs = [... new Set(order.orderLineItems.filter(oli => !oli.canceledAt).map(oli => oli.productID))]
    productIDs.map(productID => {
        olis = order.orderLineItems.filter(o => (o.productID == productID && !o.canceledAt))
        data.templateData.lineItems.push({quantity: olis.length, title: olis[0].product.title, amount: olis.reduce((tot, li) => tot += parseFloat(li.price), 0).toFixed(2)})
    })
    data.templateData.subTotal = (data.templateData.lineItems.reduce((tot, li) => tot += parseFloat(li.grossAmount), 0)).toFixed(2)

    const resp2 = await axios.post(`${configs.microservices.pdfGenerator}/generate/receipt`, data, {responseType: 'arraybuffer'})
    const dataBase64 = Buffer.from(resp2.data).toString('base64')

    const filename = await service.gcloud.save(dataBase64, 'png')
    await service.order.update(user, orderID, {receiptFilename: filename})

    return {
        receiptBase64: `data:image/png;base64,${dataBase64}`
    }
}

exports.downloadCustomerInvoice = async(user, orderID) => {
    /**
     *
     * @param {User} user              // user requesting the invoice
     * @param {string} orderID         // order ID
     */

    logger.info(`Generate customer invoice for orderID ${orderID}`)
    const order = await service.order.getOne(user, orderID)
    // This can happen when transaction that originated this order has been reverted
    if (!order) throw {status: 404, message: `Order not found`}
    // Throw error if order is not outbound
    if (order.type.name != "outbound") throw {status: 400, message: `The order type is not valid. Invoices can be generated only for outbound orders`}
    // Throw error if  order is missing customer information
    if (!order.consignee) throw {status: 400, message: `The order is missing customer information. Please add customer information and try again`}
    const recipient = order.consignee

    const currencySymbol = {
        'GBP': '£',
        'USD': '$',
        'EUR': '€',
    }

    const data = {
        fileType: 'png',
        templateData: {
            accountLogo:`${configs.apis.gcloud.resourcesPath}/company_assets/personal_shopping_logo.png`,
            bannerImage: `${configs.apis.gcloud.resourcesPath}/company_assets/head_banner_black.png`,
            invoiceTitle: 'Shopping with The Edit Ldn',
            invoiceSubTitle: 'Invoiced by Wiredhub Limited',
            //invoice data
            invoiceID:  order.ID,
            invoiceDate: moment(order.createdAt).format('D/M/yyyy'),
            invoiceReference: `Order #${order.ID} - ${order.reference1 || ''}`,
            //Sender Info
            senderAccountName: 'Wiredhub Limited',
            senderVATNumber: '13020153',
            senderAddressLine1: '2 Broom Hall High Street, Broom',
            senderPostcode: 'SG18 9ND',
            senderCityAndCountry: 'Biggleswade, England',
            //Recipient Info
            recipientName: `${recipient.fullName || ''}`,
            recipientAddressLine1:  `${recipient.addressExtra || ''} ${recipient.address}`,
            recipientPostcode: `${recipient.postcode|| ''}`,
            recipientCityAndCountry: `${recipient.city || ''}, ${recipient.country}`,

            lineItems: [
            ],
            currency: currencySymbol[order.account.currency],
            subTotal: 0,
            VATRate:  order.account.taxRate || 0,
            VATAmount: 0,
            totalAmount: 0,
            notes: null
        }
    }

    // compute invoice line items
    order.orderLineItems.filter(oli => !oli.canceledAt).map(oli => {
        // if ooutbound order - use price, if inbound order use cost
        const lineItemAmount = order.type.name == "outbound" ? parseFloat(oli.price) : parseFloat(oli.cost)

        data.templateData.subTotal += lineItemAmount
        data.templateData.lineItems.push({
            title: `${oli.product.title || ''}`.toUpperCase(),
            code: `${oli.product.code || ''}`.toUpperCase(),
            variant: `${oli.variant.name || ''}`.toUpperCase(),
            itemId: oli.item.ID,
            amount: (lineItemAmount).toFixed(2) ,// check if invoice is for a consignment order
            currency: currencySymbol[order.account.currency]
        })
    })

    // add shipping fees
    const shippingFeeTransaction = order.transactions.find(t => t.type == 'shipping')
    const shippingAmount = parseFloat((shippingFeeTransaction?.toAccountID == order.accountID ? shippingFeeTransaction.grossAmount : 0) || 0)
    data.templateData.subTotal += shippingAmount
    data.templateData.lineItems.push({
        title: 'Shipping Costs',
        amount: (shippingAmount).toFixed(2),
        currency: currencySymbol[order.account.currency]
    })

    // used to prevent overflow during running sum
    data.templateData.subTotal = (data.templateData.subTotal).toFixed(2)
    data.templateData.totalAmount = (parseFloat(data.templateData.subTotal)).toFixed(2)


    let resp2
    try {
        resp2 = await axios.post(`${configs.microservices.pdfGenerator}/generate/invoice-v2`, data, {responseType: 'arraybuffer'})
    } catch (e) {
        throw {status: 500, message: `Impossible generating invoice | ${e.response}`}
    }
    const dataBase64 = Buffer.from(resp2.data).toString('base64')

    const filename = await service.gcloud.save(dataBase64, 'png')

    return {
        invoiceBase64: `data:image/png;base64,${dataBase64}`
    }

}

exports.downloadInvoice = async(user, orderID, params = {refresh: "false"}) => {
    /**
     * 
     * @param {User} user              // user requesting the invoice
     * @param {string} orderID         // order ID
     * @param {Object} params          // params to be passed to the invoice generator
     * @param {string} params.refresh  // if true, the invoice will be regenerated. Possible values: "true", "false"
     */
    logger.info(`Generate invoice for orderID ${orderID}`, {data: params})
    const order = await service.order.getOne(user, orderID)

    // This can happen when transaction that originated this order has been reverted
    if (!order) throw {status: 404, message: `Order not found`}

    // if exists return - else generate
    if (order.invoiceFilename && params.refresh !== "true") {
        const resp1 = await axios.get(`${configs.apis.gcloud.resourcesPath}/resources/${order.invoiceFilename}`, {responseType: 'arraybuffer'})
        return {
            invoiceBase64: `data:image/png;base64,${Buffer.from(resp1.data).toString('base64')}`
        }
    }

    const billingAddress = await db.address.findOne({where: {ID: order.account.billingAddressID}})

    // check if valid data
    if (!order.consignee) throw {status: 400, message: `The order is missing customer information. Please add customer information and try again`}
    if (!billingAddress) throw {status: 400, message: `Your account is missing billing address information. Please update your billing address information in the settings and try again`}
    if (order.type.name != "outbound" && order.type.name != "inbound") throw {status: 400, message: `The order type is not valid. Invoices can be generated only for outbound or inbound orders`}
    const olisWithoutCost = order.orderLineItems.filter(oli => !oli.cost)
    if (order.type.name == "inbound" && olisWithoutCost.length > 0) throw {status: 400, message: `The order contains items without cost. Invoices can be generated only for orders with all items with cost`}
    if (order.type.name == "inbound" && !order.consignor) throw {status: 400, message: `The purchase order is missing seller information. Please assign a consignor to the order and try again`}


    const currencySymbol = {
        'GBP': '£',
        'USD': '$',
        'EUR': '€',
    }

    const data = {
        fileType: 'png',
        templateData: {
            accountLogo:      `${configs.apis.gcloud.resourcesPath}/resources/${order.account.logo}`,
            invoiceID:        order.ID,
            invoiceDate:      moment(order.createdAt).format('D/M/yyyy'),
            issueDate:        moment(order.createdAt).format('D/M/yyyy'),
            invoiceTitle:     null,
            invoiceSubTitle: null,
            invoiceReference: `Order #${order.ID} - ${order.reference1 || ''}`,


            senderAccountName: '',
            senderVATNumber: null,
            senderName: '',
            senderAddressLine1: '',
            senderPostcode: '',
            senderCityAndCountry: '',

            recipientName: '',
            recipientAddressLine1:  '',
            recipientPostcode: '',
            recipientCityAndCountry: '',

            lineItems: [
            ],
            currency: currencySymbol[order.account.currency],
            subTotal: 0,
            VATRate:   null,
            VATAmount: null,
            totalAmount: 0,
            notes: []
        }
    }

    if (order.type.name == "outbound") {
        data.templateData.senderVATNumber =   order.account.vatNumber || ''
        data.templateData.senderAccountName =   order.account.name || ''
        data.templateData.senderName =   `${billingAddress.fullName || ''}`
        data.templateData.senderAddressLine1 =   `${billingAddress.addressExtra || ''} ${billingAddress.address}`
        data.templateData.senderPostcode =   `${billingAddress.postcode}`
        data.templateData.senderCityAndCountry =   `${billingAddress.city}, ${billingAddress.country}`

        data.templateData.recipientName = order.consignee.fullName || ''
        data.templateData.recipientAddressLine1 = `${order.consignee.addressExtra || ''} ${order.consignee.address}`
        data.templateData.recipientPostcode = `${order.consignee.postcode}`
        data.templateData.recipientCityAndCountry = `${order.consignee.city}, ${order.consignee.country}`

    } else if (order.type.name == "inbound") {
        data.templateData.VATNumber =   ''
        data.templateData.senderName =   order.consignor.fullName || ''
        data.templateData.senderAddressLine1 =   `${order.consignor.addressExtra || ''} ${order.consignor.address}`
        data.templateData.senderPostcode =   `${order.consignor.postcode}`
        data.templateData.senderCityAndCountry =   `${order.consignor.city}, ${order.consignor.country}`

        data.templateData.recipientName = billingAddress.fullName || ''
        data.templateData.recipientAddressLine1 = `${billingAddress.addressExtra || ''} ${billingAddress.address}`
        data.templateData.recipientPostcode = `${billingAddress.postcode}`
        data.templateData.recipientCityAndCountry = `${billingAddress.city}, ${billingAddress.country}`
    }

    // compute invoice line items
    order.orderLineItems.filter(oli => !oli.canceledAt).map(oli => {
        // if ooutbound order - use price, if inbound order use cost
        const lineItemAmount = order.type.name == "outbound" ? parseFloat(oli.price) : parseFloat(oli.cost)

        data.templateData.subTotal += lineItemAmount
        data.templateData.lineItems.push({
            title: `${oli.product.title || ''}`.toUpperCase(),
            code: `${oli.product.code || ''}`.toUpperCase(),
            variant: `${oli.variant.name || ''}`.toUpperCase(),
            itemId: oli.item.ID,
            amount: (lineItemAmount).toFixed(2) ,// check if invoice is for a consignment order
            currency: currencySymbol[order.account.currency]
        })
    })

    // if outbound order - add shipping fees
    const shippingFeeTransaction = order.transactions.find(t => t.type == 'shipping')
    if (order.type.name == "outbound" && shippingFeeTransaction?.grossAmount > 0 && shippingFeeTransaction.toAccountID == order.accountID) {
        data.templateData.subTotal += shippingFeeTransaction.grossAmount
        data.templateData.lineItems.push({
            title: 'Shipping Costs',
            amount: (shippingFeeTransaction.grossAmount).toFixed(2),
            currency: currencySymbol[order.account.currency]
        })
    }


    // used to prevent overflow during running sum
    data.templateData.subTotal = (data.templateData.subTotal).toFixed(2)

    // if consignment order - add consignment fees
    if (order.parentOrderID) {
        const consignmentFeesTotal = order.orderLineItems.filter(oli => !oli.canceledAt).reduce((tot, oli) => tot += parseFloat(oli.fees), 0)

        data.templateData.subTotal -= consignmentFeesTotal

        data.templateData.lineItems.push({
            title: 'Consignment Fees',
            amount: `- ${(consignmentFeesTotal).toFixed(2)}`,
            currency: currencySymbol[order.account.currency]

        })
    }

    //if sale order - add VAT (inclusive)

    if (order.type.name == "outbound" &&  order.account.taxRate) {
        data.templateData.VATAmount =  (data.templateData.subTotal * (order.account.taxRate / (100 + order.account.taxRate))).toFixed(2)
    }

    data.templateData.totalAmount = (parseFloat(data.templateData.subTotal)).toFixed(2)

    //adapt invoice for UK companies - for VAT margin scheme
    if (order.type.name == "outbound" && ([3, 2202, 2830].includes(order.account.ID))) {
        const purchaseCost = order.orderLineItems.filter(oli => !oli.canceledAt).reduce((tot, oli) => tot += parseFloat(oli.cost), 0)
        const saleMargin = data.templateData.subTotal - purchaseCost
        data.templateData.notes.push(`margin scheme - second hand goods\n`)
        data.templateData.notes.push(`Margin on Sale: ${currencySymbol[order.account.currency]} ${(saleMargin).toFixed(2)}\n`)
        data.templateData.notes.push(`VAT (16.67 %) on Margin: ${currencySymbol[order.account.currency]} ${(saleMargin * 0.1667).toFixed(2)}\n`)
    }

    if (order.type.name == "inbound" && ([3, 2202, 2830].includes(order.account.ID))) {
        data.templateData.notes.push(`margin scheme - second hand goods\n`)
    }

    //join notes if array exists and is not empty else set to null
    if (data.templateData.notes && data.templateData.notes.length > 0) {
        data.templateData.notes = data.templateData.notes.join('\n')
    }
    else {
        data.templateData.notes = null
    }

    let resp2
    try {
        resp2 = await axios.post(`${configs.microservices.pdfGenerator}/generate/${order.type.name == "outbound" ? 'invoice-v2' : 'purchase-order'}`, data, {responseType: 'arraybuffer'})
    } catch (e) {
        throw {status: 500, message: `Impossible generating invoice | ${e.response}`}
    }
    const dataBase64 = Buffer.from(resp2.data).toString('base64')
    
    const filename = await service.gcloud.save(dataBase64, 'png')
    await db.order.update({invoiceFilename: filename}, {where: {ID: order.ID}})

    return {
        invoiceBase64: `data:image/png;base64,${dataBase64}`
    }
}

exports.createCheckout = async(user, orderID, gateway) => {

    if (gateway === 'stripe') {
        return service.bridge.stripe.order.createCheckout(user, orderID);
    } else {
        throw {status: 400, message: `Unsupported Gateway: ${gateway}`}
    }
}

exports.getCheckoutSession = async(user, orderID, body) => {
    let gateway = body.gateway
    let sessionID = body.sessionID
    if (gateway === 'stripe') {

        return service.bridge.stripe.order.getCheckoutSession(user,sessionID);
    }
}
