const db = require('../libs/db')
const utils = require('../libs/utils')
const configs = require('../configs')
const service = require('./main')
const Op = require('sequelize').Op;
const logger=require('../libs/logger.js')

exports.getByID = async (user, saleChannelID) => {
    const query = {
        where: {
            ID: saleChannelID
        },
        include: [
            { model: db.account, as: 'account'},
            { model: db.transactionRate, as: 'fees'},
        ],
    }

    return db.saleChannel.findOne(query)
}

exports.create = async (user, body) => {
    /**
     * {
     *      title
     *      description
     *      platform
     * }
     * 
     */
    logger.info("Create Sale Channel", {data: body})

    const saleChannel = await db.saleChannel.create({
        accountID:   user.accountID,
        title:       body.title,
        description: body.description,
        isDefault:   1,
        email:       body.email,
        password:    body.password,
        platform:         body.platform,
        shopifyStoreName: body.shopifyStoreName,
        shopifyAPIAuth:   body.shopifyAPIAuth,
        allowVirtualInventory: body.allowVirtualInventory || 0,
        markup:                body.markup || 0,
        taxRate:               body.taxRate || 0,
        syncProgress:       body.platform == 'store' ? 100 : 0, // set to synced if local store, set to 0 if shopify
        policyUrl:             body.policyUrl,
        sameDayDeliveryInternalPriorityMargin: body.sameDayDeliveryInternalPriorityMargin,
        sameDayDelivery: body.sameDayDelivery,
    })

    await db.account_saleChannel.create({accountID: saleChannel.accountID, saleChannelID: saleChannel.ID})

    // if shopify - sync local data with online store
    if (saleChannel.platform == "shopify") {
        const serviceUser = await service.account.serviceUser(user.accountID)

        await service.gcloud.addTask('api-jobs', 'POST', 
        `${configs.microservices.api}/api/workflows/syncShopifySaleChannel`, 
        {
            authorization: `Bearer ${serviceUser.apiKey}`
        }, 
        null,
        {
            saleChannelID: saleChannel.ID,
        })
    }

    return service.saleChannel.getByID(user, saleChannel.ID)
}

exports.update = async (user, saleChannelID, updates) => {
    /**
     * {
     *      title
     *      description
     * }
     * 
     */
    logger.info("Update Sale Channel", {data: updates})

    const _updates = {}

    for (var key of ['title', 'description', 'allowVirtualInventory', 'markup', 'taxRate', 'policyUrl']) {
        if (updates[key] !== undefined) {
            _updates[key] = updates[key]
        }
    }

    await db.saleChannel.update(_updates, {
        where: {ID: saleChannelID}
    })

    return service.saleChannel.getByID(user, saleChannelID)
}

exports.getConsignor = async (user, saleChannelID, accountID) => {
    return db.account.findOne({
        where: {
            ID: accountID
        },
        include: [
            {model: db.saleChannel, as: 'saleChannels', where: {ID: saleChannelID}, required: true}
        ]
    })
}

exports.getConsignors = async (user, saleChannelID, offset, limit, params) => {
    /**
     * {
     *      title
     *      description
     * }
     * 
     */
    logger.info("Get Sale Channel Consignors")

    let query = {
        where: {
            ID: {[Op.not]: user.accountID}
        },
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [
            ['ID', 'DESC'],
        ],
    }

    query.include = [
        { model: db.saleChannel,  as: 'saleChannels', where: {ID: saleChannelID}}
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
                query.where[Op.or] = [
                    {'$account.name$': {[Op.substring]: params.search}}
                ]
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    const result = await db.account.findAndCountAll(query)

    return result
}

exports.addAccount = async (user, saleChannelID, accountID) => {
    //this function adds a consignor to a sale channel


    //fetch the sale channel
    const saleChannel = await exports.getByID(user, saleChannelID)
    //Authorize the user to add a consignor to the sale channel
    if(user.accountID != saleChannel.accountID){
        throw new Error("You are not authorized to add a consignor to this sale channel")
    }
    //check if the consignor already exists in the sale channel
    const consignor = await service.saleChannel.getConsignor(user, saleChannelID, accountID)
    if(consignor){
        throw new Error("This account is already already associated sale channel")
    }
    logger.info("Link an account to sale channel ID", {account: consignor})

    //add the consignor to the sale channel
    //TODO: allow tier to be passed from the request
    await db.account_saleChannel.create({accountID: accountID, saleChannelID: saleChannelID, tier: 'bronze', status: 'active'})

    return service.saleChannel.getConsignor(user, saleChannelID, accountID)
}

exports.updateConsignor = async (user, saleChannelID, accountID, updates) => {
    let _updates = {}

    for (var key of ['tier', 'status']) {
        if (updates[key] !== undefined) {
            _updates[key] = updates[key]
        }
    }

    if (_updates['status'] !== undefined) {
        const serviceUser = await service.account.serviceUser(accountID)
        await service.gcloud.addTask('api-jobs', 'POST', 
        `${configs.microservices.api}/api/workflows/updateSaleChannelConsignorListings`, 
        {
            authorization: `Bearer ${serviceUser.apiKey}`
        }, 
        null,
        {
            accountID: accountID,
            saleChannelID: saleChannelID,
            status: _updates['status']
        })
    }

    await db.account_saleChannel.update(_updates, {where: {saleChannelID: saleChannelID, accountID: accountID}})

    return service.saleChannel.getConsignor(user, saleChannelID, accountID)
}

exports.createConsignmentFees = async (user, saleChannelID, fees) => {
    let newRates = []
    fees.map(commissionRate => {
        newRates.push({
            minPrice: commissionRate.minPrice,
            maxPrice: commissionRate.maxPrice,
            value: commissionRate.value,
            type: commissionRate.type,
            saleChannelID: saleChannelID
        })
    })

    await db.transactionRate.bulkCreate(newRates)

    return service.saleChannel.getByID(user, saleChannelID)
}

exports.updateConsignmentFees = async (user, saleChannelID, fees) => {
    const queries = []
    fees.map((commissionRate, idx) => {
        const _updates = {}

        if (commissionRate.ID == null) {
            throw new Error(`Missing commissionRate ID for line idx ${idx}`)
        }

        for (var key of ['minPrice', 'maxPrice', 'value', 'type']) {
            if (commissionRate[key] !== undefined) {
                _updates[key] = commissionRate[key]
            }
        }
        queries.push(db.transactionRate.update(_updates, {where: {ID: commissionRate.ID}}))
    })
    await Promise.all(queries)

    return service.saleChannel.getByID(user, saleChannelID)
}

exports.deleteConsignmentFee = async (user, feeID) => {
    await db.transactionRate.destroy({where: {ID: feeID}})
}

/**
 * This function add listings to all existing inventory to a sale chanell
 * 
 * @param {*} user 
 * @param {number} saleChannelID 
 * 
 * TODO:
 * - call it during saleChannel.create() if param passed
 */
exports.addListings = async (user, saleChannelID) => {

    //TODO: extend - currently works only if account has less than 1000 inventory records active
    const inventory = await service.inventory.getAll(user, 0, 1000, {accountID: user.accountID})

    const inventoryWithoutListing = inventory.rows.filter(invRec => !invRec.listings.find(l => l.saleChannelID == saleChannelID))

    await Promise.all(inventoryWithoutListing.map(invRec => {
        return service.inventoryListing.create(user, [{
            saleChannelID: saleChannelID,
            accountID: user.accountID,
            inventoryID: invRec.ID,
            productID: invRec.productID,
            productVariantID: invRec.productVariantID,
            status: 'active',
            payout: invRec.listings[0].payout,
        }])
    }))
}

/**
 * Used to validate the credentials of a Laced account and check for account validilty.
 * 
 * @param {*} user 
 * @param {string} email 
 * @param {string} password 
 * @returns A json object with the following structure: { valid: boolean, message: string }. Also might throw error if request fails.
 */
exports.validateLacedCredentials = async (user, email, password) => {

    const client = service.bridge.laced.client.createInstance();

    /**
     * Attempt account login on Laced
     * 
     * First CSRF token is fetched which is needed to make the login request
     * Second, login request is made with the CSRF token and the credentials
     */
    try {
        const csrfToken = await service.bridge.laced.account.getLoginPage(client);
        const success = await service.bridge.laced.account.login(client, csrfToken, email, password);

        if (!success) return  { valid: false, message: 'Laced account login failed. Please check the credentials!' }
    } catch(e) {
        throw e; // TODO: Only happens if request error is thrown
    }

    /**
     * If account is successfully logged in, check to make sure it is completed
     * This is needed as non completed accounts have partial to no functionality available under Laced system
     */
    try {
        const isAccountCompleted = await service.bridge.laced.account.checkAccount(client);

        if (!isAccountCompleted) return { valid: false, message: 'Laced account setup failed. Please complete your account!' }
    } catch(e) {
        throw e; // TODO: Only happens if request error is thrown
    }

    return { valid: true, message: 'Laced account setup successful!' }
}

