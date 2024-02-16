const db = require('../libs/db')
const utils = require('../libs/utils')
const configs = require('../configs')
const service = require('./main')
const Op = require('sequelize').Op;
const logger=require('../libs/logger.js')
const axios = require('axios')


exports.getByID = async (user, inventoryListingID) => {
    const query = {
        where: {
            ID: inventoryListingID
        },
        include: [
            {model: db.account, as: 'account'},
            { model: db.product, as: 'product', include: [
                    {model: db.productCategory, as: 'category'},
                ]
            },
            {model: db.productVariant, as: 'variant'},
            {model: db.inventory, as: 'inventory', include: [
                {model: db.item, as: 'items'}
            ]},
            {model: db.saleChannel, as: 'saleChannel', attributes: {exclude: ['shopifyAPIAuth']}, include: [
                {model: db.transactionRate, as: 'fees'}
            ]},
        ],
    }

    return db.inventoryListing.findOne(query)
}

exports.getAll = async (user, offset, limit, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [
            ['ID', 'DESC'],
        ]
    }


    query.include = [
        {model: db.inventory, as: 'inventory', required: true, include: [
            {model: db.warehouse, as: 'warehouse'},
            {model: db.item, as: 'items'}
        ]},
        {model: db.account, as: 'account', required: true},
        {model: db.saleChannel, as: 'saleChannel', required: true},
        {model: db.product, as: 'product', required: true, include: [
                {model: db.productCategory, as: 'category'},
                { model: db.product,  as: 'sourceProduct', required: false},
            ]
        },
        { model: db.productVariant,    as: 'variant', required: true, include: [
                {model: db.productVariant, as: 'sourceProductVariant', required: false}
            ]
        },
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
                break;
            case 'search':
                query.where.push({[Op.or]: [
                    {'$inventory.notes$': {[Op.substring]: params.search}},
                    {'$product.code$': {[Op.substring]: params.search}},
                    {'$product.title$': {[Op.substring]: params.search}},
                    {'$variant.name$': {[Op.substring]: params.search}},
                    {'$variant.foreignID$': {[Op.substring]: params.search}},
                    {'$account.name$': {[Op.substring]: params.search}},
                    {'$inventory.quantity$': {[Op.substring]: params.search}},
                    {'$inventory.cost$': {[Op.substring]: params.search}},
                    {'$inventoryListing.payout$': {[Op.substring]: params.search}},
                    {'$inventoryListing.status$': {[Op.substring]: params.search}},
                    {'$inventoryListing.price$': {[Op.substring]: params.search}},
                ]})
                break;
            case 'IDs':
                query = utils.addFilter(query, 'ID', params[paramKey])
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }


    const result = await db.inventoryListing.findAndCountAll(query)
    if (params.groupBy){ // manually count if using groupBY siunce sequelize doesn't allow to do it
        result.count = result.count.length
    }
    return result
}

exports.create = async (user, _newListings) => {
    /**
     * user:        User
     * newListings: InventoryListing[]
     * 
     * InventoryListing: {
     *      saleChannelID: 
     *      accountID: 
     *      inventoryID:
     *      productID:
     *      productVariantID:
     *      status
     *      payout
     *      priceSourceName
     *      priceSourceMargin
     *      lacedID
     * }
     * 
     */
    logger.info("Create Listings", {data: _newListings})

    let newListings = JSON.parse(JSON.stringify(_newListings)) // clone
    //compute price from payouts
    const saleChannels = await db.saleChannel.findAll({where: {
        ID: newListings.map(listing => listing.saleChannelID),
    }, include: [
        {model: db.transactionRate, as: 'fees'}
    ]})
    const products = await db.product.findAll({where: {ID: newListings.map(listing => listing.productID)}})
    newListings = newListings.map(listing => {
        const saleChannel = saleChannels.find(sc => sc.ID == listing.saleChannelID)
        const product = products.find(p => p.ID == listing.productID)
        listing.product = product
        listing.price = utils.computeSaleChannelPrice(saleChannel, listing)
        return listing
    })


    return Promise.all(newListings.map(listing => db.inventoryListing.findOrCreate({
        defaults: {
            saleChannelID: listing.saleChannelID, 
            accountID: listing.accountID,
            inventoryID: listing.inventoryID,
            productID: listing.productID,
            productVariantID: listing.productVariantID,
            status: listing.status,
            payout: listing.payout,
            price:  listing.price,
            priceSourceName: listing.priceSourceName,
            priceSourceMargin: listing.priceSourceMargin,
            isActiveListing:  listing.isActiveListing,
            lacedID: listing.lacedID,
        },
        where: {
            saleChannelID: listing.saleChannelID, 
            accountID: listing.accountID,
            inventoryID: listing.inventoryID,
            productID: listing.productID,
            productVariantID: listing.productVariantID,
        }
    })))
}

exports.update = async (user, inventoryListingID, updates) => {
    /**
     * {
     *      ID
     *      priceSourceName
     *      priceSourceMargin
     *      payout
     *      status
     *      price
     * }
     * 
     */
    logger.info("Update Listing", {data: updates})
    const _currentInventoryListing = await service.inventoryListing.getByID(user, inventoryListingID)

    const _updates = {}

    for (var key of ['priceSourceName', 'priceSourceMargin', 'status', 'payout', 'price']) {
        if (updates[key] !== undefined) {
            _updates[key] = updates[key]
        }
    }

    // payout and price updat eneeds to be exclusive - otherwise they will update each other. Prioritize payout
    if ('payout' in updates) {
        const saleChannel = await service.account.getSaleChannel(_currentInventoryListing.saleChannelID)
        _currentInventoryListing.dataValues.payout = updates['payout']
        _updates['price'] = utils.computeSaleChannelPrice(saleChannel, _currentInventoryListing)
    } else if ('price' in updates) {
        const saleChannel = await service.account.getSaleChannel(_currentInventoryListing.saleChannelID)
        const saleFigures = utils.breakdownSalePrice(saleChannel, _currentInventoryListing.product, _currentInventoryListing.accountID, updates['price'])
        _updates['payout'] = saleFigures.payout
    }

    await db.inventoryListing.update(_updates, {
        where: {ID: inventoryListingID}
    })

    return service.inventoryListing.getByID(user, inventoryListingID)
}

exports.reconnect = async (user, inventoryListingID, productVariantID) => {
    /**
     * This funcction is used to reconnect an existing listing to a new variant. Used usually when the listing has been disconnected due to the external variant
     * being deleted
     */
    logger.info("Reconnect Listing", {data: inventoryListingID})
    const productVariant = await service.product.getVariantById(productVariantID)
    const inventoryListing = await service.inventoryListing.getByID(user, inventoryListingID)

    if (productVariant.product.accountID != inventoryListing.saleChannel.accountID) throw {status: 400, message: "can't reconnect listing. Variant accountID and sale channel accountID don't match"}

    // update all listings with the same external product variant
    await db.inventoryListing.update({
        productID: productVariant.productID,
        productVariantID: productVariant.ID,
        status: 'active'
    }, {
        where: {productVariantID: inventoryListing.productVariantID, accountID: inventoryListing.accountID}
    })

    return service.inventoryListing.getByID(user, inventoryListingID)
}

exports.delete = async (user, inventoryListingIDs) => {
    /**
     * This function is used to delete a listing
     * 
     */
    logger.info("Delete Listings", {data: inventoryListingIDs})
    const listings = await db.inventoryListing.findAll({where: {ID: inventoryListingIDs}})

    const accountListings = listings.filter(listing => listing.accountID != user.accountID)

    if (accountListings.length != 0) throw {status: 403, message: 'You are not allowed to delete this listing'}

    await db.inventoryListing.update({status: 'deleted'}, {where: {ID: inventoryListingIDs}})

    return "ok"
}

exports.activeListing = async (user, productVariantID, saleChannelID, returnRaw = false) => {
    /**
     * Given the variant and the sale channel, this function returns the current selling listing:
     *
     *  - If the sale channel has sameDayDelivery enabled, it prioritises listings based on their location
     *    Items prioritised by location can be undercut by items that are priced lower than 'sameDayDeliveryExternalPriorityMargin'
     *    Items prioritised at a location need to be in a warehouse that is a fulfillment center for the sale channel
     *
     *  - If the sale channel has sameDayDelivery disabled, it prioritises listings based on their price and upload time
     *    listings can be undercut simply by being priced lower
     *
     *
     * @param {number} productVariantID - The ID of the product variant
     * @param {number} saleChannelID - The ID of the sale channel on which the product variant is selling
     * @param {boolean} returnRaw - If set to true, returns the ordered inventory listing instead of returning only the best selling listing
     * 
     * @returns {inventoryListing} - The selected inventory listing that is selling
     */

    const records = await service.inventoryListing.getAll(user, 0, 250, {
        saleChannelID: saleChannelID, 
        productVariantID: productVariantID, 
        'inventory.quantity': '1:',
        status: 'active',
        sort: 'id:asc'
    })

    const saleChannel = await service.saleChannel.getByID(user, saleChannelID)

    const sortedListings = records.rows
        .sort((listingA, listingB) => {
            // saleChannel has sameDayDelivery enabled - apply conditional sorting
            if (saleChannel.sameDayDelivery){
                const listingAAtInternalFulCentre = listingA.inventory.warehouse?.fulfillmentCentre && listingA.inventory.warehouse?.accountID == saleChannel.accountID
                const listingBAtInternalFulCentre = listingB.inventory.warehouse?.fulfillmentCentre && listingB.inventory.warehouse?.accountID == saleChannel.accountID

                // if listingA in internal fulfilment centre and listing B in external fulfilment centre
                if (listingAAtInternalFulCentre && !listingBAtInternalFulCentre){
                    if(saleChannel.sameDayDeliveryInternalPriorityMargin){
                        // price for listing B to beat listing A
                        const priceToBeat = listingA.price - (listingA.price * (saleChannel.sameDayDeliveryInternalPriorityMargin /100))
                        //listing B beats listing A's undercutting price from sameDayDeliveryInternalPriorityMargin - listing B goes first
                        return listingB.price < priceToBeat ? 1 : -1
                    }
                    else {
                        // listing A beats listing B - listing A goes first because it is in internal fulfilment centre
                        return -1
                    }
                }

                // if listingB in internal fulfilment centre and listing A in external fulfilment centre
                if (listingBAtInternalFulCentre && !listingAAtInternalFulCentre){
                    if(saleChannel.sameDayDeliveryInternalPriorityMargin) {
                        // price for listing A to beat listing B
                        const priceToBeat = listingB.price - (listingB.price * (saleChannel.sameDayDeliveryInternalPriorityMargin / 100))
                        //listing A beats listing B's undercutting price from sameDayDeliveryInternalPriorityMargin - listing A goes first
                        return listingA.price < priceToBeat ? -1 : 1
                    }
                    else {
                        // listing B beats listing A - listing B goes first because it is in internal fulfilment centre
                        return 1
                    }
                }
            }

            // if listingA has a lower price  - listingA goes first
            if (parseFloat(listingA.price) < parseFloat(listingB.price)) {
                return -1
            }
            // if listingB has a lower price  - listingB goes first
            if (parseFloat(listingA.price) > parseFloat(listingB.price)) {
                return 1
            }

            // if listingA is older  - listingA goes first
            if (listingA.ID < listingB.ID) {
                return -1
            } else { // if listingB is older - listingB goes first 
                return 1
            }
        })

    let activeListing = null

    // update activePick flag
    if(sortedListings.length > 0 ){
        activeListing = sortedListings[0]
        //update the listings activePick flag
        await db.inventoryListing.update({isActiveListing: false}, {where: {isActiveListing:true, saleChannelID: saleChannelID, productVariantID:productVariantID }})
        await db.inventoryListing.update( {isActiveListing: true},{where: {ID: activeListing.ID, saleChannelID: saleChannelID, productVariantID:productVariantID }})
    }

    if (returnRaw) {
        return sortedListings
    }

    return activeListing
}

exports.getListingBidRecommendation= async (user, warehouseID, saleChannelID, variantID) => {
    /**
     * Given the inventory listing price and location info the next best undercutting price is computed
     * @param {User} user - User making the request
     * @param {number} saleChannelID - The ID of the sale channel on which the product variant is selling
     * @param {number} variantID - The ID of the product variant
     * @param {number} warehouseID - Warehouse to check against
     *
     * @returns {
     *     isMyListing: boolean, // if true, the next best price is from account making the request
     *     recommendedListingPrice: number // The current best price
     * } - The next best undercutting price
     */


    const undercutInfo ={
        isMyListing: true,
        recommendedListingPrice: null
    }

    const selectedListing = await db.inventoryListing.findOne({where: {productVariantID: variantID, saleChannelID: saleChannelID, isActiveListing: true}, include: [{model: db.inventory, as: 'inventory', include: [{model: db.warehouse, as: 'warehouse'}]},{model: db.saleChannel, as: 'saleChannel'}]})
    if(selectedListing ){
        undercutInfo.isMyListing = selectedListing.accountID == user.accountID
        selectedListing.price = parseFloat(Number(selectedListing.price));
        //competing listing is my listing
        if(undercutInfo.isMyListing){
            undercutInfo.recommendedListingPrice = (selectedListing.price - 1)
            return undercutInfo
        }

        // fetch sale channel
        const saleChannel = await db.saleChannel.findOne({where: {ID: saleChannelID}})

        const warehouse = warehouseID? await db.warehouse.findOne({where: {ID: warehouseID}}) : null
        const competingListingAtPrioritisedLocation = saleChannel.sameDayDelivery && (selectedListing.inventory.warehouseID && selectedListing.inventory.warehouse.fulfillmentCentre && selectedListing.inventory.warehouse.accountID == saleChannel.accountID)
        const myListingAtPrioritisedLocation = saleChannel.sameDayDelivery && ( warehouseID && warehouse.fulfillmentCentre && warehouse.accountID == saleChannel.accountID)
        //My inventory is not at prioritised location - competing listing is at prioritised location
        if(!myListingAtPrioritisedLocation && competingListingAtPrioritisedLocation){
            undercutInfo.recommendedListingPrice = ((selectedListing.price - (selectedListing.price * (saleChannel.sameDayDeliveryInternalPriorityMargin / 100))) -1)
        }
        //if inventory is at prioritised location  - competing listing is not at prioritised location
        else if(myListingAtPrioritisedLocation && !competingListingAtPrioritisedLocation){
            undercutInfo.recommendedListingPrice = ((selectedListing.price + (selectedListing.price * (saleChannel.sameDayDeliveryInternalPriorityMargin / 100))) -1)
        }
        //my inventory is not at prioritised location - competing listing is not at prioritised location
        else{
            undercutInfo.recommendedListingPrice = (selectedListing.price - 1)
        }

        undercutInfo.recommendedListingPrice = parseFloat(undercutInfo.recommendedListingPrice.toFixed(2))
    }
    return undercutInfo
}
