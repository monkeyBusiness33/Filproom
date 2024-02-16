const db = require('../libs/db')
const Op = require('sequelize').Op;
const service = require('./main')
const moment = require('moment')
const utils = require('../libs/utils')
const axios = require('axios')
const configs = require('../configs.js');
const logger = require('../libs/logger');
const { v1: uuidv1 } = require('uuid');

const ShipEngine = require("shipengine");
const shipengine = new ShipEngine(configs.apis.shipEngine);

exports.getOne = async (user, fulfillmentID) => {
    const query = {
        where: {
            ID: fulfillmentID
        },
        include: [
            { model: db.orderLineItem, as: 'orderLineItems', include: [
                { model: db.orderType, as: 'orderType'},
                { model: db.status, as: 'status'},
                { model: db.product, as: 'product', include: [
                        { model: db.productCategory, as: 'category' }
                    ]
                },
                { model: db.productVariant, as: 'variant' },
                { model: db.inventory, as: 'inventory' },
                { model: db.item, as: 'item', include: [
                        { model: db.inventory, as: 'inventory' },
                        { model: db.product, as: 'product', include: [
                                { model: db.productCategory, as: 'category' }
                            ]
                        },
                        { model: db.productVariant, as: 'variant' },
                        { model: db.warehouse,  as: 'warehouse' },
                        { model: db.account, as: 'account'}
                    ]
                },
            ]},
            { model: db.address, as: 'destination'},
            { model: db.address, as: 'origin'},
            { model: db.order, as: 'inboundOrder', include: [
                { model: db.orderType, as: 'type' },
                { model: db.account, as: 'account'},
            ]},
            { model: db.order, as: 'outboundOrder', include: [
                { model: db.orderType, as: 'type' },
                { model: db.account, as: 'account'},
            ]},
            { model: db.status, as: 'status'},
            { model: db.courier, required: false, as: 'courier'},
            { model: db.transaction, required: false, as: 'transactions'},
            { model: db.user, required: false, as: 'createdByUser'},
        ]
    }

    return db.fulfillment.findOne(query)
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
        { model: db.order, as: 'inboundOrder', include: [
            {model: db.orderType, as: 'type'}
        ]},
        { model: db.order, as: 'outboundOrder', include: [
            {model: db.orderType, as: 'type'}
        ]},
        { model: db.orderLineItem, as: 'orderLineItems', include: [
                {model: db.status, as: 'status'},
                {model: db.orderType, as: 'orderType'}
            ]
        },
        {model: db.status, as: 'status'},
        { model: db.courier, required: false, as: 'courier'},
    ]

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }
        switch (paramKey) {
            case 'sort': 
                query = utils.addSorting(query, params['sort'])
                break;
            case 'status':
                query = utils.addFilter(query, 'status.name', params[paramKey])
                break;
            case 'search':
                query.where.push({[Op.or]: [
                    {'$fulfillment.ID$':                       {[Op.substring]: params.search}},
                    {'$fulfillment.reference1$':               {[Op.substring]: params.search}},
                    {'$fulfillment.inboundOrderID$':           {[Op.substring]: params.search}},
                    {'$fulfillment.outboundOrderID$':           {[Op.substring]: params.search}},
                ]})
                break;
            case 'type' :
                if (params.type.includes('outbound') || params.type.includes('transfer-out')) {
                    query = utils.addFilter(query, 'outboundOrder.type.name', params.type)
                } 
                
                if (params.type.includes('inbound') || params.type.includes('transfer-in')) {
                    query = utils.addFilter(query, 'inboundOrder.type.name', params.type)
                }
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    return db.fulfillment.findAndCountAll(query)
}

exports.getShippingLabel = async (user, fulfillmentID) => {
    const shipment = await db.fulfillment.findOne({where: {ID: fulfillmentID}})
    if (!shipment.shippingLabelFilename) {
        throw {status: 404, message: "Shipping label not found"}
    }

    const response = {
        base64ShippingLabel: ''
    }
    const resourceResp = await axios.get(`${configs.apis.gcloud.resourcesPath}/resources/${shipment.shippingLabelFilename}`, {responseType: 'arraybuffer'});
    const resourceBase64 = Buffer.from(resourceResp.data).toString('base64');

    if (shipment.shippingLabelFilename.includes('png')) {
        response['base64ShippingLabel'] = `data:image/png;base64,${resourceBase64}`
    } else if (shipment.shippingLabelFilename.includes('pdf')) {
        response['base64ShippingLabel'] = `data:application/pdf;base64,${resourceBase64}`
    }

    return response
}

exports.create = async (user, rawFulfillment) => {
    /**
     * 
     * {
     *      orderID:                number
     *      foreignID:              string  | optional
     *      reference1:             string  | optional
     *      originAddressID:        number  | required only for outbound orders
     *      destinationAddressID:   number  | required only for inbound orders
     *      trackingNumber:         string  | optional
     *      courier:                string  | optional
     *      courierServiceCode:     string  | required only if courier set
     *      setAsDelivered:         boolean | optional | valid only for inbound fulfillments - skip items scan
     *      setAsDispatched:        boolean | optional | valid only for outbound fulfillments - skip items scan
     *      orderLineItems:  [
     *          {
     *              ID: number
     *          }
     *      ]
     *      
     * }

     * 
     */
    

    logger.info("Generating fulfillment")
    const createdStatusID = await service.status.getID("created")
    const transitStatusID = await service.status.getID("transit")
    rawFulfillment.order = rawFulfillment.order ? rawFulfillment.order : await service.order.getOne(user, rawFulfillment.orderID)

    // validation
    if (typeof rawFulfillment.order.ID != 'number') throw new Error("Missing OrderID")

    if (typeof rawFulfillment.originAddressID != 'number' && (rawFulfillment.order.type.name == "outbound" || rawFulfillment.order.type.name == "transfer-out")) {
        throw new Error("Missing originAddressID")
    }

    if (typeof rawFulfillment.destinationAddressID != 'number' && (rawFulfillment.order.type.name == "inbound" || rawFulfillment.order.type.name == "transfer-in")) {
        throw new Error("Missing destinationAddressID")
    }

    if (rawFulfillment.orderLineItems.length == 0) throw new Error("Missing Order Line Items")

    if (rawFulfillment.courier && rawFulfillment.courier != 'manual' && !rawFulfillment.courierServiceCode) throw {status: 400, message: `Missing courierServiceCode for courier ${rawFulfillment.courier}`}

    let courier;
    if (rawFulfillment.courier && rawFulfillment.courier) {
        courier = await db.courier.findOne({where: {code: rawFulfillment.courier.trim().toLowerCase()}})
    }
    const fulfillment = await db.fulfillment.create({
        foreignID:              rawFulfillment.foreignID,
        reference1:             rawFulfillment.reference1,
        originAddressID:        rawFulfillment.originAddressID || null,
        destinationAddressID:   rawFulfillment.destinationAddressID || null,
        inboundOrderID:         (rawFulfillment.order.type.name == "inbound" || rawFulfillment.order.type.name == "transfer-in") ? rawFulfillment.order.ID : (rawFulfillment.order.type.name == "transfer-out" ? rawFulfillment.order.siblingOrderID : null), // link sibling order (transfer-in) to fulfillment as well
        outboundOrderID:        (rawFulfillment.order.type.name == "outbound" || rawFulfillment.order.type.name == "transfer-out") ? rawFulfillment.order.ID : null,
        trackingNumber:         rawFulfillment.trackingNumber || null,
        courierID:              courier ? courier.ID : null,
        courierServiceCode:     rawFulfillment.courierServiceCode || null,
        statusID: rawFulfillment.setAsDelivered == true ? transitStatusID : createdStatusID,
        createdByUserID:        user.ID,
    })
    logger.silly("Fulfillment Generated")

    logger.silly("Fetching Sibling Order Line Items")
    let orderLineItemsToFulfill = []
    rawFulfillment.orderLineItems.map(oli => orderLineItemsToFulfill.push(rawFulfillment.order.orderLineItems.find(_oli => _oli.ID == oli.ID)))
    logger.silly("Siblign Order Line Items Fetched")
    
    logger.silly("Check if order has a sibling")
    //check if order has a sibling - if so update the fulfillment status of the sibling orderLineItems as well
    if (rawFulfillment.order.siblingOrderID){
        // fetch sibling orderLineItems - use itemIDs of orderLineOItems in rawFulfillment and orderID as sibling order ID
        const siblingOrderLineItems = await db.orderLineItem.findAll({where: {orderID: rawFulfillment.order.siblingOrderID, itemID: orderLineItemsToFulfill.map(oli => oli.itemID)}})
        orderLineItemsToFulfill = orderLineItemsToFulfill.concat(siblingOrderLineItems)
    }
    await Promise.all(orderLineItemsToFulfill.map(orderLineItem => service.orderLineItem.update(user, orderLineItem.ID, {fulfillmentID: fulfillment.ID, status: (rawFulfillment.setAsDelivered == true ? 'dispatched' : 'fulfilling')})))
    logger.silly("Sibling Order Line Items updated")

    // used for inbound fulfillment, skip inbound scan
    if ((rawFulfillment.order.type.name == "inbound" || rawFulfillment.order.type.name == "transfer-in") && rawFulfillment.setAsDelivered == true) { 
        logger.silly("Skip Inbound fulfillment")
        const body = {
            fulfillmentID: fulfillment.ID,
            orderLineItems: rawFulfillment.orderLineItems.map(oli => {return {
                ID: oli.ID
            }})
        }
        await service.fulfillment.deliver(user, body)
    }

    // used for outbound fulfillment, skip items scan
    if ((rawFulfillment.order.type.name == "outbound" || rawFulfillment.order.type.name == "transfer-out") && rawFulfillment.setAsDispatched == true) { 
        logger.silly("Skip Outbound fulfillment")

        const body = {
            fulfillmentID: fulfillment.ID,
            orderLineItems: rawFulfillment.orderLineItems.map(oli => {return {
                ID: oli.ID
            }})
        }

        await service.fulfillment.dispatch(user, body)
    }

    //TODO: move to cloud task
    // Fulfillment for consignor orders going to the admin warehouse should generate an order inbound (sibling order) & connect this fulfillment
    if (rawFulfillment.order.type.name == 'outbound' && rawFulfillment.order.parentOrderID ){
        const parentOrder = await db.order.findOne({where: {ID: rawFulfillment.order.parentOrderID}})
        const serviceUser = await service.account.serviceUser(parentOrder.accountID)
        const _destinationFulfillmentCentres = await service.account.getFulfillmentCenters(serviceUser.accountID)
        
        const oliIDs = rawFulfillment.orderLineItems.map(oli => oli.ID)
        const orderLineItemsToDuplicate = rawFulfillment.order.orderLineItems.filter(oli => oliIDs.includes(oli.ID))
        const adminInboundOrder = {
            accountID: serviceUser.accountID,
            reference1: `${rawFulfillment.order.reference1}`, // consignment order- needs custom ID to avoid adding to other inbound orders
            type: 'inbound',
            consignorID: rawFulfillment.order.consignorID,
            consigneeID: _destinationFulfillmentCentres[0].addressID,
            details: []
        }

        orderLineItemsToDuplicate.map(orderLineItem => {
            adminInboundOrder.details.push({
                itemID:orderLineItem.itemID,
                fulfillmentID: fulfillment.ID,
                price: orderLineItem.price,
                cost: orderLineItem.payout, //the cost for the admin order is the consignor payout
                notes: `${rawFulfillment.order.reference1}`
            })
        })

        // set destination warehouse for the fulfillment
        const orderIn = await service.order.create(serviceUser, adminInboundOrder)
        await db.fulfillment.update({
            inboundOrderID: orderIn.ID,
            destinationAddressID: _destinationFulfillmentCentres[0].addressID,
        }, {where: {ID: fulfillment.ID}})

        // link the two orders
        await db.order.update({siblingOrderID: rawFulfillment.order.ID}, {where: {ID: orderIn.ID}})
        await db.order.update({siblingOrderID: orderIn.ID}, {where: {ID: rawFulfillment.order.ID}})

        // link sibling order line items and set them as dispatched if not using courier
        const queries = []
        const orderLineItemsStatusID = fulfillment.courierID ? (await service.status.getID('fulfilling')) : (await service.status.getID('dispatched'))
        orderLineItemsToDuplicate.map(orderLineItem => {
            const siblingOrderLineItem = orderIn.orderLineItems.find(i => i.itemID == orderLineItem.itemID)
            queries.push(db.orderLineItem.update({siblingID: siblingOrderLineItem.ID, statusID: orderLineItemsStatusID}, {where: {ID: orderLineItem.ID}}))
            queries.push(db.orderLineItem.update({siblingID: orderLineItem.ID, statusID: orderLineItemsStatusID}, {where: {ID: siblingOrderLineItem.ID}}))
        })
        await Promise.all(queries)
        
        //recalculate order status
        await service.order.adjustStatus(orderIn.ID)
    }

    // generate courier shipping label
    if (fulfillment.courierID && rawFulfillment.orderLineItems.length > 0) {
        logger.silly("Generate Shipping label")
        try {
            const responseObject = await service.fulfillment.generateShippingLabel(user, fulfillment.ID)

            const _fulfillment = await db.fulfillment.findOne({
                where: {ID: fulfillment.ID},
                include: [
                    {model: db.order, as: 'inboundOrder', include: [
                        {model: db.account, as: 'account'}
                    ]},
                    {model: db.order, as: 'outboundOrder', include: [
                        {model: db.account, as: 'account'}
                    ]},
                ]
            })
            // if the courier belongs to the inbound order account. Then we create the “shipping” transaction using orderID the inbound order.
            // Alternatively, if the courier belongs to the consignor order, a transaction of type “shipping” is generated on the outbound order
            // in order to determine to which order assign the transaction, we check the accountIDBilled on the response object and compare it to the accountID of the inbound and outbound orders
            const orderOfAccountBilled = ([_fulfillment.outboundOrder, _fulfillment.inboundOrder]).find(order => order?.accountID == responseObject.shipmentCost.accountIDBilled)
            const orderOfAccountNotBilled = ([_fulfillment.outboundOrder, _fulfillment.inboundOrder]).find(order => order && order?.ID != orderOfAccountBilled.ID)
            await service.transaction.create(user, [{
                accountID:     orderOfAccountBilled.accountID,
                grossAmount:        responseObject.shipmentCost.amount,
                currency:      responseObject.shipmentCost.currency,
                type:          'shipping',
                orderID:       orderOfAccountBilled.ID,
                fromAccountID: responseObject.shipmentCost.accountIDBilled, 
                reference:     ([orderOfAccountBilled.reference1, orderOfAccountNotBilled?.account.name]).filter(string => string).join(" - "),
                fulfillmentID: fulfillment.ID,
                status:        'paid'
            }])

            await db.fulfillment.update(responseObject, {where: {ID: fulfillment.ID}})

            // if shipping label generated successfully - subscribe to courier updates
            await service.fulfillment.subscribeToUpdates(courier.code, responseObject.trackingNumber)
        } catch (e) {
            console.log(e)
            throw {status: 500, message: e.message}
        }
    }

    // recalculate order status
    await service.order.adjustStatus(rawFulfillment.order.ID)
    // Calculate fulfillment status
    await service.fulfillment.adjustStatus(fulfillment.ID)

    const fulfillmentObj = await service.fulfillment.getOne(user, fulfillment.ID)
    //if fulfilling order connected to shopify - create fulfillment on shopify
    if (fulfillmentObj.outboundOrder?.foreignID) {
        const serviceUser = await service.account.serviceUser(user.accountID)
        await service.gcloud.addTask(
            'shopify-jobs', 
            'POST', 
            `${configs.microservices.api}/api/bridge/egress/shopify/fulfillment/create`, 
            {
                authorization: `Bearer ${serviceUser.apiKey}`
            },
            null,
            fulfillmentObj
        )
    }

    await service.gcloud.publishEvent(user, 'fulfillment/created', fulfillmentObj)
    return fulfillmentObj
}

exports.update = async (user, fulfillmentID, updates) => {
    /**
     *      status:             string  | optional
     *      reference1:             string  | optional
     *      trackingNumber:         string  | optional
     *      courier:                string  | optional
     *      courierServiceCode:     string  | required only if courier set
     */
    logger.info(`Update fulfillment`, {data: updates})
    const currentFulfillmentData = await service.fulfillment.getOne(user, fulfillmentID)
    if (updates.status) {
        const statusID = await service.status.getID(updates.status)
        updates.statusID = statusID
    }

    let courierObj
    if (updates.courier) {
        courierObj = await db.courier.findOne({where: {code: updates.courier.trim().toLowerCase()}})
        delete updates.courier
    }

    await db.fulfillment.update(updates, {
        where: {ID: fulfillmentID}
    })

    // if generating shipping label on fulfillment update, it might happen that the fulfillment doesn't have origin and it set on the update. 
    // So the label should be generated after the origin has been added to the fulfillment, otherwise can't generate shipping label since missing origin
    if (courierObj && !currentFulfillmentData.shippingLabelFilename) {
        // need to set courier and courierServiceCode before generating the label
        await db.fulfillment.update({courierID: courierObj.ID, courierServiceCode: updates.courierServiceCode}, {where: {ID: fulfillmentID}})
        try {
            responseObject = await service.fulfillment.generateShippingLabel(user, fulfillmentID)
            await db.fulfillment.update(responseObject, {
                where: {ID: fulfillmentID}
            })

            // if the courier belongs to the inbound order account. Then we create the “shipping” transaction using orderID the inbound order.
            // Alternatively, if the courier belongs to the consignor order, a transaction of type “shipping” is generated on the outbound order
            // in order to determine to which order assign the transaction, we check the accountIDBilled on the response object and compare it to the accountID of the inbound and outbound orders
            const orderOfAccountBilled = ([currentFulfillmentData.outboundOrder, currentFulfillmentData.inboundOrder]).find(order => order?.accountID == responseObject.shipmentCost.accountIDBilled)
            const orderOfAccountNotBilled = ([currentFulfillmentData.outboundOrder, currentFulfillmentData.inboundOrder]).find(order => order && order?.ID != orderOfAccountBilled.ID)
            const serviceUser = await service.account.serviceUser(orderOfAccountBilled.accountID)

            await service.transaction.create(serviceUser, [{
                accountID:     orderOfAccountBilled.accountID,
                grossAmount:        responseObject.shipmentCost.amount,
                currency:      responseObject.shipmentCost.currency,
                type:          'shipping',
                orderID:       orderOfAccountBilled.ID,
                fromAccountID: responseObject.shipmentCost.accountIDBilled, 
                reference:     ([orderOfAccountBilled.reference1, orderOfAccountNotBilled?.account.name]).filter(string => string).join(" - "),
                fulfillmentID: fulfillmentID,
                status:        'paid'
            }])

            // if shipping label generated successfully - subscribe to courier updates
            await service.fulfillment.subscribeToUpdates(courierObj.code, responseObject.trackingNumber)
        } catch (e) {
            throw {status: 500, message: e.message}
        }
    }

    const fulfillmentObj = await service.fulfillment.getOne(user, fulfillmentID)

    //if fulfilling order connected to shopify - update fulfillment on shopify
    if (fulfillmentObj.outboundOrder?.foreignID) {
        const serviceUser = await service.account.serviceUser(user.accountID)
        await service.gcloud.addTask(
            'shopify-jobs', 
            'POST', 
            `${configs.microservices.api}/api/bridge/egress/shopify/fulfillment/update`, 
            {
                authorization: `Bearer ${serviceUser.apiKey}`
            },
            null,
            fulfillmentObj
        )
    }

    await service.gcloud.publishEvent(user, 'fulfillment/updated', fulfillmentObj)

    return fulfillmentObj
}

exports.adjustStatus = async(fulfillmentID) => {
    logger.info(`fulfillment.adjustStatus`, {data: {fulfillmentID}})

    const fulfillment = await db.fulfillment.findOne({
        where: {ID: fulfillmentID},
        include: [
            {model: db.orderLineItem, as: 'orderLineItems', include: [
                { model: db.orderType, as: 'orderType'},
                { model: db.status, as: 'status'}
            ]}
        ]
    })
    
    let orderLineItemsStatuses = new Set()
    fulfillment.orderLineItems.map(oli => orderLineItemsStatuses.add(oli.status.name))

    let fulfillmentStatus = 'created' // default status to overwrite
    //              outbound     inbound
    // create    : fulfilling - created
    // transit   : dispatched - dispatched
    // transit   : dispatched - n/a
    // transit   : n/a        - fulfilling
    // delivered : delivered  - delivered
    // delivered : n/a        - delivered
    // delivered : delivered  - n/a 


    // outbound has only dispatched and inbound is not fully confirmed
    if (orderLineItemsStatuses.has('dispatched')) {
        fulfillmentStatus = 'transit'
    }

    // outbound has only dispatched and inbound is fully confirmed
    if (!orderLineItemsStatuses.has('dispatched') && orderLineItemsStatuses.has('delivered')) {
        fulfillmentStatus = 'delivered'
    }

    // DEPRECATED - TO REMOVE IN FOLLOWING VERSIONS
    if (orderLineItemsStatuses.has('fulfilling') && fulfillment.outboundOrderID == null) {
        fulfillmentStatus = 'transit'
    }
    // DEPRECATED - TO REMOVE IN FOLLOWING VERSIONS
    if (orderLineItemsStatuses.has('fulfilling') && fulfillment.outboundOrderID != null) {
        fulfillmentStatus = 'created'
    }

    // 
    if (fulfillment.orderLineItems.length == 0) {
        fulfillmentStatus = 'deleted'
    }

    const updates = {
        statusID: await service.status.getID(fulfillmentStatus)
    }
    
    // if updating order to final status
    if (fulfillmentStatus == "delivered") {
        updates.completedAt = moment().toISOString()
    }

    // 
    if (fulfillmentStatus == "deleted") {
        updates.canceledAt = moment().toISOString()
    }

    //TODO: consider changing to service update : might create even more requests
    await db.fulfillment.update(updates, {where: {ID: fulfillmentID}})
}

exports.generateShippingLabel = async (user, fulfillmentID) => {
    const fulfillment = await service.fulfillment.getOne(user, fulfillmentID)
    const shipTo = fulfillment.destination
    const shipFrom = fulfillment.origin

    // compoute total fulfillment weight. A minimun of 0.5kg per item
    const uniqueItemsIDs = [...new Set(fulfillment.orderLineItems.filter(oli => oli.canceledAt == null).map(oli => oli.itemID))] // avoid duplicate size due to duplicates olis in a cross-account fulfillment
    const totalWeight = uniqueItemsIDs.reduce((tot, itemID) => {
        const oli = fulfillment.orderLineItems.find(oli => oli.itemID == itemID)
        return tot += (oli.item.weight > 0.5 ? oli.item.weight :  0.5)
    }, 0)

    //Reference Mappings-> UPS: ref1 (35), ref2(35) ; DHL: ref1 (35)
    //Reference1 : #<inbound orderID>_<order ref>
    //Reference2 : FR_fulfillmentIDfulfillmentref
    // always use the inbound orders as a referenece -when none us
    const referencedOrder = fulfillment.inboundOrder ? fulfillment.inboundOrder : fulfillment.outboundOrder
    const reference1 = (`#${referencedOrder.ID} ${referencedOrder.reference1 ? '_'+referencedOrder.reference1 : ''}`).substring(0,35)
    const reference2 = (`FR_${fulfillment.ID}` + (fulfillment.reference1? `_${fulfillment.reference1}`: '')).substring(0,35)
    const params = {
        label_format: "png",
        label_download_type: "inline",
        shipment: {
          service_code: fulfillment.courierServiceCode, 
          ship_to: {
            name: shipTo.fullName,
            phone: `${shipTo.phoneCountryCode} ${shipTo.phoneNumber}`,
            email: shipTo.email,
            address_line1: shipTo.address,
            city_locality: shipTo.city,
            state_province: shipTo.countyCode,
            postal_code: shipTo.postcode,
            country_code: shipTo.countryCode,
          },
          ship_from: {
            name: shipFrom.fullName,
            phone: `${shipFrom.phoneCountryCode} ${shipFrom.phoneNumber}`,
            address_line1: shipFrom.address,
            city_locality: shipFrom.city,
            state_province: shipFrom.countyCode,
            postal_code: shipFrom.postcode,
            country_code: shipFrom.countryCode,
          },
          packages: [
            {
                weight: {
                    value: totalWeight,
                    unit: "kilogram",
                },

                label_messages: {
                    reference1: reference1,
                    reference2: reference2
                }
            }

          ]
        },
    };

    // bill third-party account if account's courier
    if (fulfillment.courier.accountID) {
        const account = await db.account.findOne({
            where: {ID: fulfillment.courier.accountID},
            include: [
                {model: db.address, as: 'billingAddress'}
            ]
        })
        params['advanced_options'] = {
            bill_to_account: fulfillment.courier.accountID,
            bill_to_country_code: account.billingAddress.country.toUpperCase(),
            bill_to_party: "third_party",
            bill_to_postal_code: account.billingAddress.postcode.toUpperCase().replace(/\s/g, '')
        }
    }

    logger.info(`Generating Shipping Label`, {data: params})
    let shipment
    try {
        const resp = await axios({
            method: 'post',
            url: 'https://api.shipengine.com/v1/labels',
            headers: {
                'Host': 'api.shipengine.com',
                'API-Key': configs.apis.shipEngine,
                'Content-Type': 'application/json'
            },
            data: params
        })
        shipment = resp.data
    } catch (e) {
        if (e.code == "timeout") {
            throw {status: 500, message: `Impossible to contact the courier. Please try again`}
        } else {
            throw {status: 500, message: e.response.data?.errors[0]?.message ? e.response.data.errors[0].message : JSON.stringify(e.response.data)}

        }
    }

    const accountBilled = await db.account.findOne({where: {ID: fulfillment.courier.accountID}})
    const shippingLabelFilename = await service.gcloud.save(shipment.label_download.href, "png")
    let shippingAmount = shipment.shipment_cost.amount * utils.getExchangeRate(shipment.shipment_cost.currency, accountBilled.currency)
    if (accountBilled.ID == 3 && fulfillment.courier.ID == 2 && fulfillment.courierServiceCode == "ups_standard") {
        //edit ldn ups pricing policy: fixed at 5.11
        shippingAmount = 5.11
    } else if (accountBilled.ID == 3 && fulfillment.courier.ID == 1 && fulfillment.courierServiceCode == "dpd_next_day") {
        //edit ldn dpd pricing policy: fixed at 4.8
        shippingAmount = 4.8
    }
    return {
        shippingID:      shipment.shipment_id,
        shippingLabelID: shipment.label_id,
        trackingNumber: shipment.tracking_number,
        shippingLabelFilename: shippingLabelFilename,
        shipmentCost: {
            currency: accountBilled.currency.toLowerCase(),
            amount:   shippingAmount,
            accountIDBilled: accountBilled.ID
        }
    }
}

exports.cancel = async (user, fulfillmentID) => {
    /**
     * When a user cancel a fulfilling order line item, this method is called. 
     * If all the order line items in the fulfillment have been cancelled, the fulfillment itself is defined as cancelled. 
     */
    logger.info(`Cancel Fulfillment`, {data: {ID: fulfillmentID}})

    const fulfillment = await service.fulfillment.getOne(user, fulfillmentID)

    // if courier shipping label generated and no items left in the fulfillment. Void the shipping label
    const orderLineItemsLeft = fulfillment.orderLineItems.filter(oli => oli.canceledAt == null)
    if (fulfillment.shippingLabelID != null && orderLineItemsLeft.length == 0) {
        logger.info(`Voiding Shipping Label`)

        // actually void shipping label on shipEngine on production (shipEngine doesn't support this command on the sandbox)
        if (configs.environment == "prod") {
            const result = await shipengine.voidLabelWithLabelId(fulfillment.shippingLabelID);
            if (result.approved == false) {
                /**
                 * Possible reasons include:
                 *
                 * The Label is too old to be voided.
                 * The Label has been scanned in, at the originating facility.
                 * The Label has left the originating facility and is in route to the destination.
                 */
                logger.info(`Shipengine - Unable to void the shipping label with ID ${fulfillment.shippingLabelID}`, {data: result})
            }
            else {
                try {
                    await axios.put(
                        `https://api.shipengine.com/v1/shipments/${fulfillment.shippingID}/cancel`,
                        {},
                        {
                            headers: {
                                'API-Key': configs.apis.shipEngine
                            }
                        }
                    )
                } catch (e) {
                    throw {status: e.response?.status || 500, message: `Unable to cancel the shipping label. ${e.response?.data.errors.map(error => error.message).join(", ")}`}
                }
            }
        }

        //if there is a shipping transaction for the fulfillment voided - refund it
        const shippingTransaction = fulfillment.transactions.find(t => t.type == 'shipping' && t.fulfillmentID == fulfillment.ID)
        if (shippingTransaction) {
            const serviceUser = await service.account.serviceUser(shippingTransaction.fromAccountID)
            await service.transaction.create(serviceUser, [{
                accountID:     serviceUser.accountID,
                grossAmount:        shippingTransaction.grossAmount * utils.getExchangeRate(shippingTransaction.currency, serviceUser.account.currency),
                currency:      serviceUser.account.currency,
                type:          'shipping refund',
                orderID:       shippingTransaction.orderID,
                fromAccountID: null,
                toAccountID:   shippingTransaction.fromAccountID,
                fulfillmentID: fulfillment.ID,
                status:        'paid'
            }])
        }

        //if fulfilling order connected to shopify - cancel fulfillment on shopify
        if (fulfillment.outboundOrder?.foreignID) {
            const serviceUser = await service.account.serviceUser(user.accountID)
            await service.gcloud.addTask(
                'shopify-jobs',
                'POST',
                `${configs.microservices.api}/api/bridge/egress/shopify/fulfillment/cancel`,
                {
                    authorization: `Bearer ${serviceUser.apiKey}`
                },
                null,
                {fulfillmentID: fulfillment.ID}
            )
        }
    }

    await service.fulfillment.adjustStatus(fulfillmentID)
}

exports.dispatch = async(user, body) => {
    /**
     * Mark the fulfillment as dispatched. 
     * 
     * {
     *  fulfillmentID: number
     *  orderLineItems: [
     *      {
     *          ID: number
     *      }
     *  ]
     * }
     */

    logger.info("fulfillment.dispatch", {data: body})
    const fulfillment = await service.fulfillment.getOne(user, body.fulfillmentID)

    // outbound order line items
    const orderLineItemsOutbounded = []
    const itemsUpdates = []
    for (var oliRecord of body.orderLineItems) {
        const oli = fulfillment.orderLineItems.find(oli => oli.ID == oliRecord.ID)
        if (oli.siblingID) {
            orderLineItemsOutbounded.push({ID: oli.siblingID})
        }
        orderLineItemsOutbounded.push({ID: oli.ID})
        itemsUpdates.push({itemID: oli.itemID, warehouseID: null})
    }
    await service.orderLineItem.dispatch(user, orderLineItemsOutbounded)
    await Promise.all(itemsUpdates.map(update => service.item.update(user, update.itemID, update)))

    // update orders affected
    const idsOrdersAffected = ([fulfillment.inboundOrderID, fulfillment.outboundOrderID]).filter(x => x)
    await Promise.all(idsOrdersAffected.map(oID => service.order.adjustStatus(oID)))

    await service.fulfillment.adjustStatus(body.fulfillmentID)

    return service.fulfillment.getOne(user, body.fulfillmentID)
}

exports.deliver = async(user, body) => {
    /**
     * Mark the fulfillment as completed. 
     * This sets the order line items as delivered and updates inventory and items
     * if item is linked to inventory - update inventory record (quantityAtHand) and item (location & status)
     * if item is NOT linked to inventory (inbounded already sold) - update item only (location & status)
     * 
     * {
     *  fulfillmentID: number
     *  orderLineItems: [
     *      {
     *          ID: number
     *      }
     *  ]
     * }
     */

    logger.info("fulfillment.deliver")
    if (body.fulfillmentID == null) throw new Error("Missing fulfillmentID")
    if (body.orderLineItems.length == 0) throw new Error("OrderLineItems List is empty")

    // get warehouse and location of destination
    const fulfillment = await service.fulfillment.getOne(user, body.fulfillmentID)
    if (fulfillment.status.name != "transit") throw {status: 400, message: `Fulfillment should have status transit in order to be delivered. Current status ${fulfillment.status.name}`}
    
    // Mark order line item as delivered
    const orderLineItemsInbounded = []
    for (var oliRecord of body.orderLineItems) {
        const oli = fulfillment.orderLineItems.find(oli => oli.ID == oliRecord.ID)
        if (oli.siblingID) {
            orderLineItemsInbounded.push({ID: oli.siblingID})
        }
        orderLineItemsInbounded.push({ID: oli.ID})
    }
    await service.orderLineItem.deliver(user, orderLineItemsInbounded)

    // If the fulfillment destination (inbound order) is an account on the system - update inventory and items
    if (fulfillment.inboundOrder?.ID) {
        const warehouse = await db.warehouse.findOne({
            where: {addressID: fulfillment.destination.ID}, 
            }
            )
        
        // Update inventory records and items
        const itemUpdates = []
        const inventoryRecordID_qtyAtHand = {}
        for (var oliRecord of body.orderLineItems) {
            const oli = fulfillment.orderLineItems.find(oli => oli.ID == oliRecord.ID)

            const itemUpdate = {
                itemID: oli.itemID,
                warehouseID: warehouse.ID
            }

            // if fulfillemnt is inbounding, move item status from transit to default
            if (fulfillment.inboundOrder) {
                itemUpdate['statusID'] = null
            }

            // item not sold - collect inventory records to update
            if (oli.item.inventoryID != null) { 
                inventoryRecordID_qtyAtHand[oli.item.inventoryID] = (inventoryRecordID_qtyAtHand[oli.item.inventoryID] || 0) + 1
            }

            //colletc updates to run in batch
            itemUpdates.push(itemUpdate)
        }

        await Promise.all(itemUpdates.map(update => service.item.update(user, update.itemID, update)))
        for (const inventoryRecordID in inventoryRecordID_qtyAtHand) {
            await service.inventory.moveToAtHand(inventoryRecordID, inventoryRecordID_qtyAtHand[inventoryRecordID])
        }
    }

    // update orders affected
    const idsOrdersAffected = ([fulfillment.inboundOrderID, fulfillment.outboundOrderID]).filter(x => x)

    await Promise.all(idsOrdersAffected.map(oID => service.order.adjustStatus(oID)))
    await service.fulfillment.adjustStatus(body.fulfillmentID)
    return service.fulfillment.getOne(user, body.fulfillmentID)
}

exports.subscribeToUpdates = async(courierCode, trackingNumber) => {
    /**
     * Used when a fulfillment is generated with a courier linked to it. 
     * Subscribe to shipment statu updates. The updates will arrive on the endpoint: webhooks/ship-engine/shipment/updated
     */
    logger.info(`Subscribe to courier updates`, {data: {courierCode: courierCode, trackingNumber: trackingNumber}})

    try {
        const resp = await axios.post(
            `https://api.shipengine.com/v1/tracking/start?carrier_code=${courierCode}&tracking_number=${trackingNumber}`,
            {},
            {
                headers: {
                    'API-Key': `${configs.apis.shipEngine}`
                }
            }
        )
    } catch (e) {
        throw {status: 500, message: `Impossible subscribe to courier updates for tracking number ${trackingNumber}`}
    }

}

exports.computeRates = async(user, body) => {
    /**
     * Compute Rates Given
     * 1. list of couriers
     * 2. origin and destination
     * 3. packages 
     * 
     * 
     * couriers:        [{
     *      ID: 1,
     * }]
     * origin:          Consignee
     * destination:     Consignee
     * packages:        [{
     *      weight: number
     * }]
     */

    logger.info("Compute Rates", {data: body})
    const couriers = await db.courier.findAll({where: {ID: body.couriers.map(courier => courier.ID)}})

    //build list of courier services enabled - depends if shipment is national or international
    let couriersServicesAvailable = []
    for (var courier of couriers) {
        couriersServicesAvailable = couriersServicesAvailable.concat(
            (body.origin.countryCode == body.destination.countryCode ? courier.nationalServices : courier.internationalServices).split(",")    
        )
    }


    const params = {
        rateOptions: {
            carrierIds: couriers.map(courier => courier.foreignID),
        },
        shipment: {
            validateAddress: "validate_and_clean",
            shipFrom: {
                name:          body.origin.fullName,
                phone:         `${body.origin.phoneCountryCode} ${body.origin.phoneNumber}`,
                addressLine1:  body.origin.address,
                cityLocality:  body.origin.city,
                stateProvince: body.origin.countyCode,
                postalCode:    body.origin.postcode,
                countryCode:   body.origin.country,
            },
            shipTo: {
                name:          body.destination.fullName,
                phone:         `${body.destination.phoneCountryCode} ${body.destination.phoneNumber}`,
                addressLine1:  body.destination.address,
                cityLocality:  body.destination.city,
                stateProvince: body.destination.countyCode,
                postalCode:    body.destination.postcode,
                countryCode:   body.destination.country,
            },
            packages: body.packages.map(pkgObj => {return {
                weight: {
                    value: pkgObj.weight,
                    unit: 'kilogram'
                }
            }})
        }
    }

    const response = await shipengine.getRatesWithShipmentDetails(params);

    if (response.rateResponse.errors.length > 0) {
        throw {status: 500, message: response.rateResponse.errors.map(error => error.message).join(". ")}
    }

    return response.rateResponse.rates.filter(rate => couriersServicesAvailable.find(serviceName => serviceName == rate.serviceCode))
}
