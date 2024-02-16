const db = require('../libs/db')
const Op = require('sequelize').Op;
const service = require('../services/main')
const utils = require('../libs/utils')
const logger = require('../libs/logger')
const configs = require("../configs");

exports.getByID = async (user, inventoryID) => {
    const query = {
        where: {
            ID: inventoryID
        },
        include: [
            {
                model: db.product, as: 'product', include: [
                    {model: db.productCategory, as: 'category'},
                ]
            },
            { model: db.account,         as: 'account', required: true},
            { model: db.productVariant, as: 'variant', include: [{model: db.productVariant, as: 'sourceProductVariant'}]},
            { model: db.warehouse,         as: 'warehouse'},
            { model: db.item, as: 'items'},
            { model: db.inventoryListing,  as: 'listings', include: [
                {model: db.product, as: 'product'},
                {model: db.saleChannel, as: 'saleChannel',
                    include: [
                        {model: db.account, as: 'account'},
                        {model: db.transactionRate, as: 'fees'}]
                },
                {model: db.productVariant, as: 'variant', required:true, include: [
                    {model: db.productVariant, as: 'sourceProductVariant'}
                ]},
            ]},
        ]
    }

    return  db.inventory.findOne(query)
}

exports.getAll = async (user, offset, limit, params) => {
    let query = {
        where: [],
        //need to set all default attributes in case group by is used. otherwise would return only the synthetic attributes defined in the group by 
        attributes: Object.keys(db.inventory.getAttributes()),
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [
            ['ID', 'DESC']
        ]
    }

    // Apply the condition that quantity must be greater than or equal to 1
    // only if params.quantity is not present
    if (!params.quantity) {
        query.where.push({ quantity: { [Op.gte]: 1 } });
    }

    query.include = [
        {model: db.product, as: 'product', required: true, include: [ //required: true necessary to do search
                {model: db.productCategory, required: true, as: 'category'}, //required: true necessary to do search
            ]
        },
        { model: db.productVariant,  required: true,  as: 'variant'}, //required: true necessary to do search
        { model: db.warehouse,         as: 'warehouse'},
        { model: db.account,         as: 'account', required: true}, //required: true necessary to do search
        { model: db.item,              as: 'items'},
        { model: db.inventoryListing,  as: 'listings', include: [
            {model: db.productVariant, as: 'variant'}
        ]},
        { model: db.saleChannel,  as: 'saleChannels'},
    ]

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }

        switch (paramKey) {
            case 'sort':
                query = utils.addSorting(query, params['sort'])
                break;
            case 'groupBy':
                query.group = params['groupBy'].split(',')
                //if grouping, create synthetic attributes
                query.attributes.push([db.sequelize.fn('sum', db.sequelize.col('quantity')), 'totalQuantity'])
                query.attributes.push([db.sequelize.literal('SUM(inventory.quantity*inventory.cost)'), 'totalCost'])
                query.attributes.push([db.sequelize.literal('COUNT(DISTINCT(productVariantID))'), 'variantsAvailable'])
                break;
            case 'search':
                query.where.push({[Op.or]: [
                    {'$inventory.cost$': {[Op.substring]: params.search}},
                    {'$inventory.notes$': {[Op.substring]: params.search}},
                    {'$account.name$': {[Op.substring]: params.search}},
                    {'$product.code$': {[Op.substring]: params.search}},
                    {'$product.title$': {[Op.substring]: params.search}},
                    {'$product.foreignID$': {[Op.substring]: params.search}},
                    {'$product.description$': {[Op.substring]: params.search}},
                    {'$product.category.name$': {[Op.substring]: params.search}},
                    {'$variant.name$': {[Op.substring]: params.search}}
                ]})
                break;
            case 'IDs':
                query = utils.addFilter(query, 'ID', params.IDs)
                break;
            case 'accountIDs':
                query.where.push({'$inventory.accountID$': utils.parseFilterSyntax(params.accountIDs)})
                break;
            case 'productIDs':
                query.where.push({'$inventory.productID$': utils.parseFilterSyntax(params.productIDs)})
                break;
            case 'warehouseIDs':
                query.where.push({'$inventory.warehouseID$': utils.parseFilterSyntax(params.warehouseIDs)})
                break;
            case 'variantIDs':
                query.where.push({'$inventory.productVariantID$': utils.parseFilterSyntax(params.variantIDs)})
                break;
            case 'status':
                query = utils.addFilter(query, 'status.name', params.status)
                break;
            case 'code':
                query = utils.addFilter(query, 'product.code', params.code)
                break;
            case 'title':
                query = utils.addFilter(query, 'product.title', params.title)
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }


    const result = await db.inventory.findAndCountAll(query)
    if (query.group){ // manually count if using groupBY siunce sequelize doesn't allow to do it
        result.count = result.count.length
    }

    return result
}

exports.create = async (user, newInventoryRecord, opts = {createItems: true}) => {
    /**
     * 
     * New create inventory logic
     * 
     * {
     *      accountID: number
     *      productID: 
     *      productVariantID: 
     *      quantity: 
     *      virtual: 
     *      cost: number (optional)
     *      notes: string (optional)
     *      status: string (optional)
     *      warehouseID: number
     * }
     */
    logger.info(`inventory.create`, {data: newInventoryRecord})

    for (const attribute of ['accountID', 'productID', 'productVariantID', 'quantity', 'warehouseID']) {
        if ((attribute == "warehouseID") && newInventoryRecord.virtual) continue //skip warehouse validation for virtual inventory

        if (newInventoryRecord[attribute] == undefined) throw {status: 400, message: `Missing ${attribute}`}
    }

    const _inventoryRecord = {
        accountID:           newInventoryRecord.accountID,
        productID:           newInventoryRecord.productID,
        productVariantID:    newInventoryRecord.productVariantID,
        virtual:             newInventoryRecord.virtual,
        quantity:            newInventoryRecord.quantity,
        quantityAtHand:      0, // always set to 0 on creation
        quantityIncoming:    0,
        cost:                newInventoryRecord.cost || null,
        notes:               newInventoryRecord.notes || null,
        warehouseID:         newInventoryRecord.warehouseID || null
    }

    // quantity always set as incoming on creation - would be moved to at hand when delivered
    _inventoryRecord.quantityIncoming = _inventoryRecord.quantity

    let inventoryRecord
    //Code used to prevent creation of duplicate virtual inventory for the same product variant on virtual inventory creation
    if (newInventoryRecord.virtual) {
        [inventoryRecord] = await db.inventory.findOrCreate({
            defaults: _inventoryRecord,
            where: {
                accountID:           _inventoryRecord.accountID,
                productVariantID:    _inventoryRecord.productVariantID,
                virtual:             _inventoryRecord.virtual,
            }
        })
    } else {
        inventoryRecord = await db.inventory.create(_inventoryRecord)
    }

    // create items if not virtual
    if (!inventoryRecord.virtual && opts.createItems) {
        const itemsCreationQueries = []
        for (let i = 0; i < newInventoryRecord.quantity; i++) {
            itemsCreationQueries.push(service.item.create(user, {
                accountID:           inventoryRecord.accountID,
                productID:           inventoryRecord.productID,
                productVariantID:    inventoryRecord.productVariantID,
                inventoryID:         inventoryRecord.ID
            }))
        }
        await Promise.all(itemsCreationQueries)
    }


    return service.inventory.getByID(user, inventoryRecord.ID)
}

exports.update = async (user, inventoryID, updates) => {
    /**
     * 
     * This function is used to update inventory records
     * 
     * @param {number} inventoryID - inventory ID
     * @param {object} updates.notes - notes
     * @param {object} updates.adjustQuantity - quantity to add/remove. number < can be only negative at the moment
     * @param {object} updates.cost - cost
     * 
     */

    logger.info(`inventory.update`, {data: updates})
    const inventoryRecord = await service.inventory.getByID(user, inventoryID)

    const _updates = {}
    for (const key in updates) {
        //limit the fields that can be updated
        if (['notes', 'adjustQuantity', 'cost'].includes(key)) {
            _updates[key] = updates[key]
        }

        if (key == "quantity") {
            throw {status: 400, message: "Use adjustQuantity to update quantity"}
        }
    }

    if (_updates.notes) {
        _updates.notes = _updates.notes.trim().toLowerCase()
    }

    if (_updates.adjustQuantity && !inventoryRecord.virtual && _updates.adjustQuantity < 0 ) {
        await service.inventory.unstock(user, [{inventoryID: inventoryID, quantity: _updates.adjustQuantity}])
    } else if (_updates.adjustQuantity && inventoryRecord.virtual) {
        _updates.quantity = _updates.adjustQuantity > 0 ? 10 : 0
        _updates.quantityIncoming = _updates.quantity 
    }
    // NOT IMPLEMENTED
    //else if (_updates.adjustQuantity && !inventoryRecord.virtual && _updates.adjustQuantity > 0){
    //    // create
    //    // warehousing service? - TODO
    //}

    await db.inventory.update(_updates, {where: {ID: inventoryID}})

    return service.inventory.getByID(user, inventoryID)
}

exports.unstock = async (user, body) => {
    /**
     * This function is used to unstock inventory items. You have 2 options:
     * 1. You specify which item to unstock using itemID
     * 2. You specify how many items to unstock using quantity. In this way, You don't have control over which item are cancelled
     * 
     * Example:
     * body: [
     *      {inventoryID: number, itemID: number}
     *  ]
     * 
     * body: [
     *      {inventoryID: number, quantity: number}
     *  ]
     */
    logger.info("inventory.unstock", {data: body})

    const inventoryRecords = await service.inventory.getAll(user, 0, 100, {IDs: body.map(record => record.inventoryID)}) // get available items to delete
    const itemsToUnstock = await db.item.findAll({where: {ID: body.map(record => record.itemID)}})

    let itemsToDelete = []
    for (var record of body) {
        if (record.inventoryID == undefined) throw {status: 400, message: "Missing inventory ID"}
        if (record.itemID == undefined && record.quantity == undefined) throw {status: 400, message: "Missing item ID or quantity"}

        const inventoryRecord = inventoryRecords.rows.find(inv => inv.ID == record.inventoryID)

        let qtyChange = 0
        //unstock by itemID
        if (record.itemID != undefined) {
            const item = itemsToUnstock.find(item => item.ID == record.itemID)
            itemsToDelete.push({itemID: record.itemID, inventoryID: record.inventoryID, itemAtHand: item.statusID == null})
            qtyChange = 1
        //unstock by quantity (& not virtual)
        } else if (record.itemID == undefined && inventoryRecord.virtual == 0) { 
            const items = inventoryRecord.items.slice(0, Math.abs(record.quantity))
            items.map(item => itemsToDelete.push({itemID: item.ID, inventoryID: record.inventoryID, itemAtHand: item.statusID == null}))
            qtyChange = Math.abs(record.quantity)
        } else if (record.itemID == undefined && inventoryRecord.virtual == 1) {
            await db.inventory.update({quantity: 0, quantityIncoming: 0}, {where: {ID: inventoryRecord.ID}})
        }
    }

    await service.item.delete(user, itemsToDelete)

    for (const record of itemsToDelete) {
        record.itemAtHand ? await service.inventory.adjustAtHand(record.inventoryID, -1) : await service.inventory.adjustIncoming(record.inventoryID, -1)
    }
}

exports.restock = async (user, body) => {
    /**
     * This function is used to restock inventory items
     * 
     * @param {number}   body[i].inventoryID - inventory ID
     * @param {number}   body[i].itemID - item ID
     * @param {(number)} body[i].warehouseID - warehouse ID where to restock - optional. If not passed, the item is restocked at the last known location determined by the order line item
     * 
     */

    logger.info(`inventory.restock`, {data: body})
    //todo - auth

    for (const record of body) {
        if (!record.inventoryID) throw {status: 400, message: "Missing inventory ID"}
        if (!record.itemID) throw {status: 400, message: "Missing item ID"}
    }

    const inventoryRecords = await db.inventory.findAll({ where: {ID: [...new Set(body.map(record => record.inventoryID))]}, include: [{model: db.inventoryListing, as: 'listings'}]})
    const warehouses = await db.warehouse.findAll({
        where: {ID: [...new Set(body.map(record => record.warehouseID))]}, 
    })

    //get unique inventoryID and warehouseID combinations to group the restock 
    const uniqueInventoryIDWarehouseIKey = [...new Set(body.map(record => `${record.inventoryID}_${record.warehouseID}`))]

    //create new inventory records
    for (const key of uniqueInventoryIDWarehouseIKey) {
        const [inventoryID, warehouseID] = key.split('_')
        const inventoryRecord = inventoryRecords.find(record => record.ID == inventoryID)
        const warehouse = warehouses.find(warehouse => warehouse.ID == warehouseID)
        const itemsToRestockForInvRec = body.filter(record => record.inventoryID == inventoryID && warehouseID && (record.warehouseID == warehouseID))
        
        let inventoryRecordUsedForRestock;
        if (warehouse) {
            //create new inventory record
            let updatedInvRec = inventoryRecord.dataValues
            delete updatedInvRec.ID
            updatedInvRec.warehouseID = warehouse.ID
            updatedInvRec.quantity = itemsToRestockForInvRec.length
            inventoryRecordUsedForRestock = await service.inventory.create(user, updatedInvRec, {createItems: false})
            //duplicate listings
            for (let listing of inventoryRecord.listings) {
                let newListing = listing.dataValues
                delete newListing.ID
                newListing.inventoryID = inventoryRecordUsedForRestock.ID
                await db.inventoryListing.create(newListing)
            }
        } else {
            inventoryRecordUsedForRestock = inventoryRecord
        }

        //move items to stock
        await service.inventory.moveToAtHand(inventoryRecordUsedForRestock.ID, itemsToRestockForInvRec.length)

        await Promise.all(itemsToRestockForInvRec.map(record => service.item.update(user, record.itemID, {
            inventoryID: inventoryRecordUsedForRestock.ID, 
            warehouseID: inventoryRecordUsedForRestock.warehouseID,
            statusID: null
        })))
    }
}

exports.adjustAtHand = async (inventoryID, delta) => {
    /**
     * This function is used to adjust quantity. Removing/adding quantity from atHand
     * 
     * @param {number} inventoryID - inventory ID
     * @param {number} delta - quantity to remove/add
     * 
     */

    await db.inventory.update({quantityAtHand: db.sequelize.literal(`quantityAtHand + ${delta}`)}, {where: {ID: inventoryID}})
    await db.inventory.update({quantity: db.sequelize.literal(`quantity + ${delta}`)}, {where: {ID: inventoryID}})
}

exports.adjustIncoming = async (inventoryID, delta) => {
    /**
     * This function is used to adjust quantity. Removing/adding quantity from incoming
     * 
     * @param {number} inventoryID - inventory ID
     * @param {number} delta - quantity to remove/add
     * 
     */

    await db.inventory.update({quantityIncoming: db.sequelize.literal(`quantityIncoming + ${delta}`)}, {where: {ID: inventoryID}})
    await db.inventory.update({quantity: db.sequelize.literal(`quantity + ${delta}`)}, {where: {ID: inventoryID}})
}

exports.moveToAtHand = async (inventoryID, quantity) => {
    /**
     * This function is used to move items from incoming to at hand
     * 
     * @param {number} inventoryID - inventory ID
     * @param {number} quantity - quantity to move
     * 
     */
    if (!quantity) throw {status: 400, message: "Missing quantity"}
    if (!inventoryID) throw {status: 400, message: "Missing inventoryID"}

    await db.inventory.update({quantityIncoming: db.sequelize.literal(`quantityIncoming - ${quantity}`)}, {where: {ID: inventoryID}})
    await db.inventory.update({quantityAtHand: db.sequelize.literal(`quantityAtHand + ${quantity}`)}, {where: {ID: inventoryID}})
}

exports.moveToIncoming = async (user, inventoryID, quantity) => {
    /**
     * This function is used to move items from at hand to incoming
     * 
     * @param {number} inventoryID - inventory ID
     * @param {number} quantity - quantity to move
     * 
     */
    if (!quantity) throw {status: 400, message: "Missing quantity"}
    if (!inventoryID) throw {status: 400, message: "Missing inventoryID"}
    
    await db.inventory.update({quantityIncoming: db.sequelize.literal(`quantityIncoming + ${quantity}`)}, {where: {ID: inventoryID}})
    await db.inventory.update({quantityAtHand: db.sequelize.literal(`quantityAtHand - ${quantity}`)}, {where: {ID: inventoryID}})
}

exports.createEgress = async (user, inventoryIDs, opts={filteredListingIDs: []}) => {
    /**
     * This function takes a list of listingIDs and depending on the platform these listings are on, 
     * it creates a cloud task to update the listing on that platform
     * 
     * @param {number[]} inventoryListingIDs - A list of inventory listing IDs just created
     * @param {(number[])} filteredListingIDs - A list of listing ID to create. If this list is passed. Only the listingIDs in this list are processed
     * 
     * Shopify Bridge
     * Laced Bridge
     * 
     */

    logger.info(`inventory.createEgress`, {data: inventoryIDs})
    //inventoryIDs contain null values - this happens only when transfering a sale order to the fulfillment location
    if (inventoryIDs.filter(id => id != null).length == 0) return 

    const serviceUser = await service.account.serviceUser(user.accountID)

    let uniqueInventoryIDs = [...new Set(inventoryIDs)]
    let inventoryListings = await db.inventoryListing.findAll({
        where: {
            inventoryID: uniqueInventoryIDs
        }
    })
    //filter the listings to process. Process only listings that are contained in the filteredListingIDs list
    if (opts.filteredListingIDs.length > 0) {
        inventoryListings = inventoryListings.filter(listing => opts.filteredListingIDs.includes(listing.ID))
    }

    // fetch the full invListing object 
    inventoryListings = await Promise.all(inventoryListings.map(listing => service.inventoryListing.getByID(user, listing.ID)))

    // Shopify Bridge
    const shopifyListings = inventoryListings.filter(listing => listing.saleChannel.platform == "shopify")
    const shopifyVariantsIDs = [... new Set(shopifyListings.map(listing => listing.productVariantID))]
    await Promise.all(shopifyVariantsIDs.map(variantID => service.gcloud.addTask(
        'shopify-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/shopify/variant/sync`,
        {
            provenance: 'inventory/createEgress',
            authorization: `Bearer ${serviceUser.apiKey}`
        },
        null,
        {
            variantID: variantID,
        },
        60
    )))
    
    // Laced Bridge
    const lacedListings = inventoryListings.filter(listing => listing.saleChannel.platform == "laced")
    await Promise.all(lacedListings.map(listing => service.gcloud.addTask(
        'api-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/laced/listing/create`,
        {
            provenance: 'listings/createEgress',
            authorization: `Bearer ${serviceUser.apiKey}`
        },
        null,
        {
            inventoryListingID: listing.ID
        },
        60
    )))

    // publish event
    await Promise.all(inventoryListings.map(invListing => service.gcloud.publishEvent(user, 'sale_channel_listing/changed', invListing)))
}

exports.updateEgress = async (user, inventoryIDs, opts={filteredListingIDs: []}) => {
    /**
     * This function takes a list of listingIDs and depending on the platform these listings are on, 
     * it creates a cloud task to update the listing on that platform
     * 
     * @param {number[]} inventoryListingIDs  - A list of inventory listing IDs just created
     * @param {(number[])} filteredListingIDs - A list of listing ID to update. If this list is passed. Only the listingIDs in this list are processed
     * 
     * Shopify Bridge
     * Laced Bridge
     * 
     */

    logger.info(`inventory.updateEgress`, {data: inventoryIDs})
    //inventoryIDs contain null values - this happens only when transfering a sale order to the fulfillment location
    if (inventoryIDs.filter(id => id != null).length == 0) return 

    const serviceUser = await service.account.serviceUser(user.accountID)

    let uniqueInventoryIDs = [...new Set(inventoryIDs)]
    let inventoryListings = await db.inventoryListing.findAll({
        where: {
            inventoryID: uniqueInventoryIDs
        }
    })
    //filter the listings to process. Process only listings that are contained in the filteredListingIDs list
    if (opts.filteredListingIDs.length > 0) {
        inventoryListings = inventoryListings.filter(listing => opts.filteredListingIDs.includes(listing.ID))
    }

    // fetch the full invListing object 
    inventoryListings = await Promise.all(inventoryListings.map(listing => service.inventoryListing.getByID(user, listing.ID)))

    const shopifyListings = inventoryListings.filter(listing => listing.saleChannel.platform == "shopify")
    const shopifyVariantsIDs = [... new Set(shopifyListings.map(listing => listing.productVariantID))]
    await Promise.all(shopifyVariantsIDs.map(variantID => service.gcloud.addTask(
        'shopify-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/shopify/variant/sync`,
        {
            provenance: 'inventory/updateEgress',
            authorization: `Bearer ${serviceUser.apiKey}`
        },
        null,
        {
            variantID: variantID,
        },
        60
    )))
    
    // Laced Bridge
    const lacedListings = inventoryListings.filter(listing => listing.saleChannel.platform == "laced")
    await Promise.all(lacedListings.map(listing => service.gcloud.addTask(
        'api-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/laced/listing/update`,
        {
            provenance: 'listings/updateEgress',
            authorization: `Bearer ${serviceUser.apiKey}`
        },
        null,
        {
            inventoryListing: listing
        },
        60
    )))

    // publish event
    await Promise.all(inventoryListings.map(invListing => service.gcloud.publishEvent(user, 'sale_channel_listing/changed', invListing)))
}
