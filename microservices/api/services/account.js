const jwt = require('jsonwebtoken')

const db = require('../libs/db')
const Op = require('sequelize').Op;
const service = require('./main')
const utils = require('../libs/utils')
const axios = require('axios')
const configs = require('../configs')
const logger = require('../libs/logger')
const moment = require('moment')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

exports.getAll = async (userID, offset, limit, sort, params) => {
    const query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [['ID', 'DESC']],
    }

    if (sort) {
        query.order = []
        for (const sortingParam of sort.split(";")) {
            const [key, direction] = sortingParam.split(":")
            query.order.push([db.sequelize.literal(`\`${key}\``), direction])
        }
    }

    for (var paramKey in params) {
        switch (paramKey) {
            case 'accountIDs':
                query = utils.addFilter(query, 'accountID', params[paramKey])
                break;
            case 'foreignID':
                query = utils.addFilter(query, 'account.foreignID', params[paramKey])
                break;
            case 'foreignIDs':
                query = utils.addFilter(query, 'account.foreignID', params[paramKey])
                break;
            case 'search':
                query.where.push({[Op.or]: [
                    {'$account.ID$': {[Op.substring]: params.search}},
                    {'$account.name$': {[Op.substring]: params.search}},
                    {'$account.createdAt$': {[Op.substring]: params.search}},
                ]})
                break;
            case 'account':
                query = utils.addFilter(query, 'account.name', params[paramKey])
                break;
            default:
                break;
        }
    }

    query.include = [
        {
            model: db.user,
            required: true,
            as: 'users',
            where: {ID: userID},
        },
    ]

    let results = await db.account.findAndCountAll(query)

    return Promise.resolve(results)
}

exports.getOne = async (user, accountID) => {
    const query = {
        where: {
            ID: accountID
        },
        include: [
            {
                model: db.user,
                as: 'users',
                where: {ID: user.ID}
            },
            {model: db.warehouse, as: 'warehouses', include: [
                { model: db.address, required: true, as: 'address'}
            ]},
        ]
    }

    return db.account.findOne(query)
}

exports.create = async (newAccount) => {
    /**
     * email: string
     * password: string
     * name: string
     * surname: string
     * 
     * consignInvite
     * -- used to automatically assign new account as consignment to another account
     */

        //TODO: manage consign invite through approval process
        //TODO: remove temporary patch for edit-ldn consignors
        if(newAccount.consignInvite == 'edit-ldn') {
            newAccount.consignInvite = null
        }

    const address = {
        name: (newAccount.name || '').trim().toLowerCase(),
        surname: (newAccount.surname || '').trim().toLowerCase(),
        address: 'default',
        addressExtra: 'default',
        postcode: 'default',
        city: 'default',
        country: 'default',
        email: '',
        phoneCountryCode: '',
        phoneNumber: ''
    }
    address.fullName = `${address.name} ${address.surname}`

    // Organization Account for a new joining user
    const account = await db.account.create({
      name: address.fullName,
        //TODO: ADJUST [PLATFORM MIGRATION PATCH] | used to identify editldn consignors
      isConsignor: newAccount.consignInvite == 'edit-ldn',
    })
    await db.account.update(
      { resourcesAccountID: account.ID },
      { where: { ID: account.ID } }
    )
    address.accountID = account.ID
    const accountAddress = await db.address.create(address)
  
    // Creating a role for the account of type Organization
    const superAdminRole = await db.role.create({
      name: 'super admin',
      notes: '',
      type: 'organization',
      accountID: account.ID
    })

    const guestRole = await db.role.create({
        name: 'guest',
        notes: '',
        type: 'guest',
        accountID: account.ID
    })
  
    // Updating the organization account to set the role as organization - deprecated TODO: remove never used
    await db.account.update(
      { roleID: superAdminRole.ID},
      { where: { ID: account.ID }}
    )

    const resources = await db.resource.findAll()
    const resourcesAllowed = [
        'inventory.view',
        'inventory.create',
        'inventory.update',
        'inventory.view_cost',
        'product.view',
        'product.create',
        'product.update',
        'transaction.view',
        'transaction.create',
        'transaction.update',
        'transaction.pay',
        'fulfillment.update',
        'address.view',
        'address.create',
        'address.update',
        'listing.update',
        
        'order.view',
        'order.update',     //(order reference, consignee and consignor, cost and notes))
        'order.accept',   //(order line item accept)
        'order.cancel',   //(order line item cancel)
        'order.refund',   //(order refund)
        'order.replace',  //(order line item replace)
        'order.fulfill',  //(order line item fulfill)
        'order.dispatch', //(order line item dispatch)
        'order.deliver', //( order line item deliver)
        
        'account.edit',
        'account.delete',
    ]
    if (!newAccount.consignInvite) {
        resourcesAllowed.push('purchase.view')
        resourcesAllowed.push('report.view')   
        resourcesAllowed.push('order.create')   

        //resourcesAllowed.push('inventory.virtual')   
        //resourcesAllowed.push('service.marketOracle')   
    }
    const permissionQueries = []
    resourcesAllowed.map(resourceName => {
        const resourceObj = resources.find(r => r.name == resourceName)
        permissionQueries.push({roleID: superAdminRole.ID, resourceID: resourceObj.ID})
    })
    await db.permission.bulkCreate(permissionQueries)

    // Creating a service User of the new coming user
    await service.user.create_v2({
        accountID: account.ID
    }, 'service-user')

    const adminUser = await service.user.create_v2({
        accountID: account.ID,
        name: (newAccount.name || '').trim().toLowerCase(),
        surname: (newAccount.surname || '').trim().toLowerCase(),
        email: newAccount.email,
        password: newAccount.password,
    }, 'admin')

    await service.user.create_v2({
        accountID: account.ID,
        password: newAccount.password,
    }, 'guest')

    // warehouse
    const warehouse = await db.warehouse.create({
        name: `Storage #${account.ID}`,
        accountID: account.ID,
        addressID: accountAddress.ID,
        fulfillmentCentre: 1
    })
    await db.account_warehouse.create({
        accountID: account.ID,
        warehouseID: warehouse.ID
    })



    // Sale Channel - if not consigning 
    if (!newAccount.consignInvite) {
        const saleChannel = await db.saleChannel.create({
            accountID: account.ID,
            title: 'my sales channel',
            platform: 'store',
            syncProgress: 100
        })
        await db.account_saleChannel.create({accountID: account.ID, saleChannelID: saleChannel.ID})
    }

    // manage consign invite
    if (newAccount.consignInvite) {
        const findAdminAccountQuery = {}
        switch (newAccount.consignInvite) {
            default:
                findAdminAccountQuery['name'] = newAccount.consignInvite.replace(/-/g, " ");
                break;
        }
        const adminAccount = await db.account.findOne({
            where: findAdminAccountQuery,
            include: [
                {model: db.user, as: 'users', include: [
                    {model: db.role, as: 'roles', where: {type: ['organization', 'personal-shopper']}, required: true}
                ]},
                {model: db.saleChannel, as: 'saleChannels'}
            ]
        })

        if (!adminAccount) {
            throw {status: 400, message: `Invalid consign invite ${newAccount.consignInvite}`}
        }

        await service.account.setupConsignment(adminAccount.ID)
        await service.account.connectConsignor(adminAccount.ID, account.ID, {retailerSaleChannels: adminAccount.saleChannels})
    }

    return service.user.getOne(adminUser, adminUser.ID)
}

exports.update = async (user, accountID, updates) => {
    if (!await service.user.isAuthorized(user.ID, accountID)) {
        return
    }

    if (updates.name) {
        updates.name = updates.name.trim().toLowerCase()
    }

    if (updates.logoBase64) {
        let logoFilename = await service.gcloud.save(updates.logoBase64, 'png')
        updates.logo = logoFilename
    }
    await db.account.update(updates, {where: {ID: accountID}})
    return db.account.findOne({where: {ID: accountID}})
}

exports.delete = async (user, accountID) => {
    if (!await service.user.isAuthorized(user.ID, accountID)) {
        return
    }

    user = await db.user.findOne({where: {accountID: accountID, email: {[Op.not]: null}}, attributes: ['email']})
    const account = await db.account.findOne({where: {ID: accountID}})
    const inventory = await db.inventory.findAll({where: {accountID: accountID}})

    await service.bridge.sendGrid.sendEmail({
        to: ['s.rosa@wiredhub.io'],
        subject: `[REQUEST] Account Delete`,
        body: `Request to delete account ID ${accountID} - email ${user.email} submitted. Is consignor: ${account.isConsignor} - Inventory Records ${inventory.length}`,
        attachments: [] 
    })

    return "ok"
}

exports.serviceUser = async (accountID) => {
    const query = {
        where: {
            accountID: accountID,
            apiKey: {[Op.not]: null}
        },
        include: [
            {model: db.account, as: 'account', attributes: ['ID', 'name', 'currency', 'logo']},
            {model: db.role, as: 'roles'}
        ]
    }

    const user = await db.user.findOne(query);
    user.resources = []; // hacky way to add resources to the user object return value so that it has same structure as the user object embedded inside the jwt
    return user;
}

exports.getFulfillmentCenters = async (accountID) => {
    const warehouses = await db.warehouse.findAll({
        where: {accountID : accountID, fulfillmentCentre: 1}, 
        include: [
            {model: db.address, as: 'address'}
        ]})
    return warehouses
}

exports.getWarehouses = async (accountID) => {
    const warehouses = await db.warehouse.findAll({
        where: {accountID : accountID}, 
        include: [
            { model: db.address, as: 'address'}
        ]})
    return warehouses
}

exports.getSaleChannels = async (accountID) => {
    return db.saleChannel.findAll({
        where: {
            accountID : accountID, 
        }, 
        include: [
            {model: db.transactionRate, as: 'fees'}
        ]})
}

exports.getSaleChannel = async (saleChannelID) => {
    return db.saleChannel.findOne({
        where: {
            ID : saleChannelID, 
        }, 
        include: [
            {model: db.transactionRate, as: 'fees'}
        ]})
}

exports.generateItemBarcodes = async (user, accountID, quantity) => {
    // be sure quantity is above 0 and below 100. If not - cap it to 1 or 100
    quantity = parseInt(quantity)
    quantity = quantity > 0 ? (quantity > 100 ? 100 : quantity) : 1
    const serviceUser = await service.account.serviceUser(user.accountID)

    const data = {
        barcodeType: 'qrcode',
        templateSize: {
            height: '2.9cm',
            width: '6.2cm'
        },
        templateData: []
    }
    for (let i = 0; i < parseInt(quantity); i++) {
        data.templateData.push({
            accountLogoUrl: `${configs.apis.gcloud.resourcesPath}/resources/${serviceUser.account.logo}`,
            barcodeValue: `${Math.random().toString(36).slice(10) + (new Date()).getTime().toString(16)}`.toLowerCase()
        })
        await delay(5) //5 ms delay between barcodes to avoid printing the same barcode
    }
    try {
        const resp = await axios.post(configs.microservices.pdfGenerator + `/generate/barcodes/barcode-item`, data, {responseType: 'arraybuffer'})
        const pdfBuffer = resp.data
        return pdfBuffer
    } catch (e) {
        throw {status: e.response.status, message: `Impossible to generate barcodes`}
    }
}

exports.setupConsignment = async (accountID) => {
    /**
     * This function is used to setup consignment for an account so that he can start to have consignors
     */
    //if not available yet - create the role to enable resources access (product.view) for consignors
    const [consignmentRole, isCreated] = await db.role.findOrCreate({
        defaults: {
            name: 'consignors',
            notes: '',
            type: 'consignment',
            accountID: accountID
        },
        where: {
            name: 'consignors',
            accountID: accountID
        }
    })
    if (isCreated) {
        const resources = await db.resource.findAll()
        // create retailer role - what consignors can do with retailer resources
        const resourcesForRetailerConsignorsRoles = [
            {name: 'product.view', rule: "*"},
            {name: 'transaction.view', rule: "toAccount.ID:own OR fromAccount.ID:own"},
        ]
        await Promise.all(resourcesForRetailerConsignorsRoles.map(resourceObj => {
            const resourceID = resources.find(r => r.name == resourceObj.name).ID
            return db.permission.create({roleID: consignmentRole.ID, resourceID: resourceID, rule: resourceObj.rule})
        }))
    }

    return consignmentRole
}

exports.connectConsignor = async (retailerAccountID, consignorAccountID, opts={retailerSaleChannels: []}) => {
    /**
     * This function is used to connect an account to another account for consignment
     */
    const retailerRoleForConsignors = await db.role.findOne({where: {name: 'consignors', accountID: retailerAccountID}})
    const consignorAccount = await db.account.findOne({
        where: {ID: consignorAccountID},
        include: [
            {model: db.user, as: 'users', where: {email: {[Op.not]: null}}}
        ]
    })
    const retailerAccount = await db.account.findOne({
        where: {ID: retailerAccountID},
        include: [
            {model: db.user, as: 'users', where: {email: {[Op.not]: null}}}
        ]
    })

    if (!consignorAccountID) throw {status: 500, message: 'Missing consignorAccountID'}
    if (!retailerAccountID) throw {status: 500, message: 'Missing retailerAccountID'}
    if (opts.retailerSaleChannels.length == 0) throw {status: 500, message: 'Missing retailerSaleChannels'}

    await db.consignment.create({accountID: retailerAccountID, consignorAccountID: consignorAccountID})
    await Promise.all(opts.retailerSaleChannels.map(sc => db.account_saleChannel.create({accountID: consignorAccountID, saleChannelID: sc.ID, tier: 'bronze'})))

    // assign retailer role to consignors. This defines what consignor can do with retailer resources
    await Promise.all(consignorAccount.users.map(user => db.user_role.create({roleID: retailerRoleForConsignors.ID, userID: user.ID})))

    //assign consignor role to retailer. This defines what the retailer can do with consignor resources
    const resources = await db.resource.findAll()
    const consignorRoleForRetailer = await db.role.create({
        name: retailerAccount.name,
        notes: '',
        type: 'consignment',
        accountID: consignorAccountID
    })
    const resourcesForConsignorRole = [
        {name: 'product.view', rule: "*"},
        {name: 'inventory.view', rule: "*"},
        {name: 'listing.update', rule: `saleChannel.accountID:own`},
        {name: 'inventory.update', rule: 'warehouse.accountID:own'}
    ]
    await Promise.all(resourcesForConsignorRole.map(resource => {
        const resourceObj = resources.find(r => r.name == resource.name)
        return db.permission.create({roleID: consignorRoleForRetailer.ID, resourceID: resourceObj.ID, rule: resource.rule})
    }))

    await Promise.all(retailerAccount.users.map(user => db.user_role.create({roleID: consignorRoleForRetailer.ID, userID: user.ID})))

    //reset caches
    await Promise.all(retailerAccount.users.map(user => service.bridge.cache.delete(`user:${user.ID}`)))
    await Promise.all(consignorAccount.users.map(user => service.bridge.cache.delete(`user:${user.ID}`)))

}

exports.getConsignorBankDetails = async (user, counterpartyId) => {
    /**
     * This function is used to return the bank details for a consignor
     * 
     * @param {object} consignorUser         - the consignor user making the request to add its bank details to the account for consignment
     * @param {string} counterpartyId        - the counterparty id from which return the details form
     * 
     */
    logger.info(`account.getConsignorBankDetails`, {data: counterpartyId})

    const consignment = await db.consignment.findOne({where: {revolutCounterpartyID: counterpartyId}})
    if (consignment.accountID !== user.accountID && consignment.consignorAccountID !== user.accountID) throw {status: 403, message: `You are not authorized to access this consignor bank details`}

    const serviceUser = await service.account.serviceUser(consignment.accountID)
    return service.bridge.revolut.getCounterparty(serviceUser, counterpartyId)
}

exports.addConsignorBankDetails = async (consignorUser, body) => {
    /**
     * This function is used to add the bank details to an account for consignment
     * 
     * @param {object} consignorUser         - the consignor user making the request to add its bank details to the account for consignment
     * @param {string} body.gateway - the gateway to add the bank details to. Only revolut for now
     * @param {string} body.accountID - the account ID for which the user is doing consignment for 
     * @param {string} body.companyName   - (revolut) the name of the account if it is a business account
     * @param {string} body.sortCode      - (revolut) the sort code of the bank account
     * @param {string} body.accountNumber - (revolut) the account number of the bank account
     * @param {Address} body.address       - (revolut) the address of registered with the bank account
     * @param {string} body.stripeAuthID  - (stripe) the account number of the bank account
     * 
     */
    logger.info(`account.addConsignorBankDetails`, {data: body})

    if (body.gateway != 'revolut' && body.gateway != 'stripe') throw {status: 400, message: 'Invalid gateway. Only revolut is allowed at the moment'}
    if (!body.accountID) throw {status: 400, message: 'Missing accountID'}
    
    switch (body.gateway) {
        case 'revolut':
            if (!body.sortCode) throw {status: 400, message: 'Missing sortCode'}
            if (!body.accountNumber) throw {status: 400, message: 'Missing accountNumber'}
            if (!body.address) throw {status: 400, message: 'Missing address'}
    
            const accountServiceUser = await service.account.serviceUser(body.accountID)
            const revolutCounterparty = await service.bridge.revolut.createCounterparty(accountServiceUser, body)
            await db.consignment.update({revolutCounterpartyID: revolutCounterparty.id}, {where: {accountID: body.accountID, consignorAccountID: consignorUser.accountID}})
            break;
        case 'stripe': 
            if (!body.stripeAuthID) throw {status: 400, message: 'Missing stripeAuthID'}
        
            const stripeAccount = await service.bridge.stripe.account.create(consignorUser, body.accountID, body.stripeAuthID)

            await db.consignment.update({stripeAccountID: stripeAccount.id, stripeDefaultDestinationID: stripeAccount.external_accounts.data[0].id}, {where: {accountID: body.accountID, consignorAccountID: consignorUser.accountID}})

            //deprecated - remove once migrated to paymentsv2
            await db.account.update({
                stripeAccountID: stripeAccount.id,
                defaultStripeDestinationID: stripeAccount.external_accounts.data[0].id
            }, {where: {ID: consignorUser.accountID}})
            break;
    }
    return db.consignment.findOne({where: {accountID: body.accountID, consignorAccountID: consignorUser.accountID}})
}

exports.deleteConsignorBankDetails = async (consignorUser, body) => {
    /**
     * This function is used to add the bank details to an account for consignment
     * 
     * @param {object} consignorUser         - the consignor user making the request to add its bank details to the account for consignment
     * @param {string} body.gateway - the gateway to add the bank details to. Only revolut for now
     * @param {string} body.accountID - the account ID for which the user is doing consignment for 
     * 
     * TODO: move here stripe account deletion as well
     */
    logger.info(`account.deleteConsignorBankDetails`, {data: body})

    if (body.gateway != 'revolut') throw {status: 400, message: 'Invalid gateway. Only revolut is allowed at the moment'}

    switch (body.gateway) {
        case 'revolut':
            const accountServiceUser = await service.account.serviceUser(body.accountID)
            const consignment = await db.consignment.findOne({where: {accountID: body.accountID, consignorAccountID: consignorUser.accountID}})
            await service.bridge.revolut.deleteCounterparty(accountServiceUser, consignment.revolutCounterpartyID)
            await db.consignment.update({revolutCounterpartyID: null}, {where: {accountID: body.accountID, consignorAccountID: consignorUser.accountID}})
            break;
    }

    return "ok"
}

exports.getConsignorInfo = async (user, accountID, consignorAccountID) => {
    /**
     * This function is used to add the bank details to an account for consignment
     * 
     * @param {object} User                      - the user making the request
     * @param {string} body.consignorAccountID   - the account ID of the consignor
     * 
     */
    logger.info(`account.getConsignorInfo`, {data: {consignorAccountID: consignorAccountID, accountID: accountID}})

    return db.consignment.findOne({
        where: {accountID: accountID, consignorAccountID: consignorAccountID},
        include: [
            {model: db.saleChannel, as: 'saleChannels', required: false, where: {accountID: accountID}},
        ]
    })
}

exports.updateConsignorSaleChannelStatus = async (user, accountID, saleChannelID, status) => {
    /**
     * This function is used to update the consignment status for a specific sale channel
     * 
     * @param {object} User                      - the user making the request
     * @param {number} accountID                 - the account ID of the consignor
     * @param {number} saleChannelID             - the sale channel to update
     * @param {string} status                    - the updated status: active or vacation
     * 
     */
    logger.info(`account.updateConsignorSaleChannelStatus`, {data: {accountID: accountID, saleChannelID: saleChannelID, status: status}})

    const saleChannel = await db.saleChannel.findOne({where: {ID: saleChannelID}})
    if (status != 'active' && status != 'vacation') throw {status: 400, message: 'Invalid status. Only active or vacation is allowed at the moment'}
    if (saleChannel.accountID == accountID) throw {status: 400, message: `can't change status to internal sale channel from this endpoint`}

    const consignorSaleChannel = await db.account_saleChannel.findOne({where: {saleChannelID: saleChannelID, accountID: accountID}})

    if (consignorSaleChannel.status != status) {
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
                status: status
            }
        )
    }

    await db.account_saleChannel.update({status: status}, {where: {saleChannelID: saleChannelID, accountID: accountID}})

    return db.consignment.findOne({
        where: {
            accountID: saleChannel.accountID,
            consignorAccountID: accountID
        },
        include: [
            {model: db.saleChannel, as: 'saleChannels'},
        ]
    })
}

exports.getStripeBalance = async (user, accountID) => {
    /**
     * Retrieves the account's stripe balance in GBP
     */
    if (!await service.user.isAuthorized(user.ID, accountID)) {
        return
    }
    const account = await db.account.findOne({where: {ID: accountID}})
    if (!account.stripeAPIKey ) {
        return 
    }

    const stripe = require('stripe')(account.stripeAPIKey)
    const res = await stripe.balance.retrieve( {
        stripeAccount: account.stripeAccountID
    });
    //available balance
    let availableBalance =   res.available ? res.available.reduce((sum, obj) => {
        return obj.currency == 'gbp' ? sum + obj.amount : sum
    }, 0): 0;

    //pending balance

    let pendingBalance =  res.pending ? res.pending.reduce((sum, obj) => {
        return obj.currency == 'gbp' ? sum + obj.amount : sum
    }, 0): 0;

    //reserved balance
    let reservedBalance =  res.connect_reserved ?  res.connect_reserved.reduce((sum, obj) => {
        return obj.currency == 'gbp' ? sum + obj.amount : sum
    }, 0) : 0;

    //format balance response
    const balanceFormatted ={
        availableBalance: {amount: availableBalance/100, currency: 'gbp'},
        pendingBalance: {amount: pendingBalance/100, currency: 'gbp'},
        reservedBalance: {amount: reservedBalance/100, currency: 'gbp'}
    }

    return balanceFormatted

}

exports.getStripeAccount = async (user, accountID) => {
    /**
     * Retrieves the account's stripe account details (not connect account but main stripe account)
     */
    const account = await db.account.findOne({where: {ID: accountID}})
    if (account.ID != 3 && !account.isConsignor) {
        throw new Error("This functionality is not available yet")
    }
    const stripe = require('stripe')((await db.account.findOne({where: {ID: 3}, attributes: ['stripeAPIKey']})).stripeAPIKey)

    // if stripe account request comes from admin stripe account, fetch directly, otherwise look up in the consignment table
    if (accountID == 3) {
        stripeAccountID = account.stripeAccountID
    } else {
        const consignment = await db.consignment.findOne({where: {accountID: 3, consignorAccountID: account.ID}}) 
        stripeAccountID = consignment.stripeAccountID
    }
    const stripeAccount = await stripe.accounts.retrieve(stripeAccountID);
    const balance = await stripe.balance.retrieve({
        stripeAccount: stripeAccountID
    })

    return {
        'business_name': stripeAccount.business_profile ? stripeAccount.business_profile.name : null,
        'country': stripeAccount.country,
        'email': stripeAccount.email,
        'external_accounts': stripeAccount.external_accounts,
        'balance': balance,
        'payouts_enabled': stripeAccount.payouts_enabled,
        'requirements': stripeAccount.requirements
    }
}

exports.getStripeLinks = async (accountID, linkName, params) => {
    const account = await db.account.findOne({where: {ID: accountID}})
    if (account.ID != 3 && !account.isConsignor) {
        throw new Error("This functionality is not available yet")
    }
    const stripAdminAccount = await db.account.findOne({where: {ID: 3}})
    const stripe = require('stripe')(stripAdminAccount.stripeAPIKey)

    if (linkName == 'onboarding') {
        return `https://connect.stripe.com/express/oauth/authorize?redirect_uri='https://app.fliproom.io/integrations/the-edit-ldn?retailerAccountID=3&integrationName=The%20Edit%20LND'&client_id=${stripAdminAccount.stripeClientID}&stripe_user[country]=GB`
    }

    if (linkName == 'onboarding-continue') {
        return stripe.accountLinks.create({
            account: stripAdminAccount.stripeAccountID,
            refresh_url: 'https://app.fliproom.io/integrations/the-edit-ldn?retailerAccountID=3&integrationName=The%20Edit%20LND',
            return_url: 'https://app.fliproom.io/integrations/the-edit-ldn?retailerAccountID=3&integrationName=The%20Edit%20LND',
            type: 'account_onboarding',
        });
    }

    if (linkName == 'dashboard') {
        const consignment = await db.consignment.findOne({where: {accountID: stripAdminAccount.ID, consignorAccountID: account.ID}})
        const link = await stripe.accounts.createLoginLink(consignment.stripeAccountID);
        return link.url
    }

}

exports.getShopifySaleChannel = async (accountID) => {
    const saleChannel = await db.saleChannel.findOne({
        where: {
            platform: 'shopify',
            accountID: accountID
        },
        attributes: Object.keys(db.saleChannel.getAttributes()),
        include: [
            {model: db.transactionRate, as: 'fees'}
        ]
    })

    return saleChannel
}

exports.getLacedSaleChannel = async (accountID) => {
    const saleChannel = await db.saleChannel.findOne({
        where: {
            platform: 'laced',
            accountID: accountID
        },
        attributes: Object.keys(db.saleChannel.getAttributes())
    })

    return saleChannel
}

exports.analytics = async (user, accountID, analyticsName, params) => {
    /**
     * This function is used to return a specific analytics data for a specific account 
     * 
     * We have datapoints: sale, listing, inventory. The selected attribute for each datapoint is aggregated into bins based on the interval. 
     * The aggregation method can be: sum, average, count etc.. The aggregation method results in each bin having a value
     * We then apply the accumulation method to the bins. The accumulation method can be: periodic, cumulative, difference.
     * 
     * process
     * 1. parse parameters
     * 2. generate bins based on interval in which the datapoints are fit
     * 3. for each analyticsName - generate bin value (this process differs for each analytics name)
     * 4. apply accumulation method to the bins (if requested)
     * 5. format datapoints and send back in the correct temporal order
     * 
     * analyticsName:      Defines which analytics we have to compute and return. possible values: [sales, listings-age, inventory-age]
     * params.interval:    Defines the timeframe of each bin in which datapoints are aggregated. possible values: [daily, weekly, monthly]
     * params.aggregation: Defines how to aggregate the attribute of the datapoints in the selected interval together. possible values: [sum, average, count]
     * params.accumulation: Defines how the value of each bin is considered respect to the adiacent bins. Possible values [periodic, cumulative, difference]
     */
    const interval = params.interval || 'weekly' //daily, weekly, monthly
    const aggregationMethod = params.aggregation || 'sum' //sum, average, count
    const accumulationMethod = params.accumulation || 'periodic' //periodic, cumulative, difference
    let datapoints;

    //generate bins based on timeframe defines by interval variable
    const bins = {}
            
    // calculate bin count based on interval and start date of june 2021
    // NOTE: oldest bin is 44 days ago / 44 weeks ago / 44 months ago
    // NOTE: this approach of hardcoding bins length will break once Fliproom is older than 44 months and DB has older data that needs accomodation
    for (let i = 0; i < 45; i++) {
        let binDate;
        switch (interval) {
            case 'daily':
                binDate = moment().startOf('day').subtract(i, 'days').toISOString()
                break;
            case 'weekly':
                binDate = moment().startOf('isoWeek').subtract(i, 'isoWeek').toISOString()
                break;
            case 'monthly':
                binDate = moment().startOf('month').subtract(i, 'months').toISOString()
                break;
        }
        
        bins[binDate] = []
    }


    if (analyticsName == 'listings-age') {
        const filters = {
            accountID: accountID,

        }

        if (params.saleChannelID) {
            filters['saleChannelID'] = params.saleChannelID.split(",")
        }
        
        datapoints = await db.inventoryListing.findAll({
            where: filters,
            include: [
                {model: db.inventory, as: 'inventory', where: {quantity: {[Op.gt]: 0}}}
            ]
        })

        //group datapoints by interval
        for (var dp of datapoints) {
            let binKey
            switch (interval) {
                case 'daily':
                    binKey = moment(dp.updatedAt).startOf('day').toISOString()
                    break;
                case 'weekly':
                    binKey = moment(dp.updatedAt).startOf('isoWeek').toISOString()
                    break;
                case 'monthly':
                    binKey = moment(dp.updatedAt).startOf('month').toISOString()
                    break;
            }

            bins[binKey].push(dp)
        }

        //calculate bin value based on aggregation method
        for (var key in bins) {
            const binTotalValue = bins[key].length
            switch (aggregationMethod) {
                case 'sum':
                    bins[key] = binTotalValue
                    break;
            }
        }
    }
    else if (analyticsName == 'sales') {
        const filters = {
            accountID: accountID,
            orderTypeID: 4,
            canceledAt: null
        }

        // here apply filters
        if (params.saleChannelID) {
            filters['$order.saleChannelID$'] = params.saleChannelID.split(",")
        }

        datapoints = await db.orderLineItem.findAll({
            where: filters,
            include: [
                {model: db.order, as: 'order'}
            ]
        })

        //group datapoints by interval
        for (var dp of datapoints) {
            let binKey
            switch (interval) {
                case 'daily':
                    binKey = moment(dp.createdAt).startOf('day').toISOString()
                    break;
                case 'weekly':
                    binKey = moment(dp.createdAt).startOf('isoWeek').toISOString()
                    break;
                case 'monthly':
                    binKey = moment(dp.createdAt).startOf('month').toISOString()
                    break;
            }

            bins[binKey].push(dp)
        }

        //calculate bin value based on aggregation method
        for (var key in bins) {
            const binTotalValue = bins[key].reduce((tot, dp) => tot += parseFloat(dp.payout), 0)
            switch (aggregationMethod) {
                case 'sum':
                    bins[key] = binTotalValue
                    break;
                case 'average':
                    bins[key] = binTotalValue / (bins[key].length || 1)
                    break;          
                case 'count':
                    bins[key] = bins[key].length
                    break;
            }
        }
    }
    else if (analyticsName == 'inventory-value') {
        /**
         * This analytics returns the value of the inventory over time
         * - old datapoints returned are not very accurate since it doesn't take into account that inventory records are removed due to sales or manual removal
         */
        const filters = {
            accountID: accountID,
            quantity: {[Op.gt]: 0},
            cost: {[Op.not]: null}
        }

        datapoints = await db.inventory.findAll({
            where: filters
        })

        //group datapoints by interval
        for (var dp of datapoints) {
            let binKey
            switch (interval) {
                case 'daily':
                    binKey = moment(dp.createdAt).startOf('day').toISOString()
                    break;
                case 'weekly':
                    binKey = moment(dp.createdAt).startOf('isoWeek').toISOString()
                    break;
                case 'monthly':
                    binKey = moment(dp.createdAt).startOf('month').toISOString()
                    break;
            }

            bins[binKey].push(dp)
        }

        //calculate bin value based on aggregation method
        for (var key in bins) {
            const binTotalValue = bins[key].reduce((tot, inv) => tot += (inv.quantity * parseFloat(inv.cost)), 0)
            switch (aggregationMethod) {
                case 'sum':
                    bins[key] = binTotalValue
                    break;
                case 'average':
                    bins[key] = binTotalValue / (bins[key].length || 1)
                    break;          
                case 'count':
                    bins[key] = bins[key].length
                    break;
            }
        }
    }
    else if (analyticsName == 'unrealized-profits') {
        const filters = {
            accountID: accountID,
            quantity: {[Op.gt]: 0},
            cost: {[Op.not]: null}
        }

        datapoints = await db.inventory.findAll({
            where: filters,
            include: [
                {model: db.inventoryListing, as: 'listings', required: true}
            ]
        })

        //group datapoints by interval
        for (var dp of datapoints) {
            let binKey
            switch (interval) {
                case 'daily':
                    binKey = moment(dp.createdAt).startOf('day').toISOString()
                    break;
                case 'weekly':
                    binKey = moment(dp.createdAt).startOf('isoWeek').toISOString()
                    break;
                case 'monthly':
                    binKey = moment(dp.createdAt).startOf('month').toISOString()
                    break;
            }

            bins[binKey].push(dp)
        }

        //calculate bin value based on aggregation method
        for (var key in bins) {
            const binTotalValue = bins[key].reduce((tot, invRec) => {
                    const minListingPayout = Math.min(...invRec.listings.map(listing => parseFloat(listing.payout)))
                    tot += (invRec.quantity * (minListingPayout - parseFloat(invRec.cost)))
                    return tot
                }, 0)
            switch (aggregationMethod) {
                case 'sum':
                    bins[key] = binTotalValue
                    break;
                case 'average':
                    bins[key] = binTotalValue / (bins[key].length || 1)
                    break;          
                case 'count':
                    bins[key] = bins[key].length
                    break;
            }
        }
    } 
    else if (analyticsName == 'inventory-quantity') {
        const filters = {
            accountID: accountID,
            quantity: {[Op.gt]: 0},
        }

        datapoints = await db.inventory.findAll({
            where: filters,
        })

        //group datapoints by interval
        for (var dp of datapoints) {
            let binKey
            switch (interval) {
                case 'daily':
                    binKey = moment(dp.createdAt).startOf('day').toISOString()
                    break;
                case 'weekly':
                    binKey = moment(dp.createdAt).startOf('isoWeek').toISOString()
                    break;
                case 'monthly':
                    binKey = moment(dp.createdAt).startOf('month').toISOString()
                    break;
            }

            bins[binKey].push(dp)
        }

        //calculate bin value based on aggregation method
        for (var key in bins) {
            const binTotalValue = bins[key].reduce((tot, invRec) => tot += invRec.quantity, 0)
            switch (aggregationMethod) {
                case 'sum':
                    bins[key] = binTotalValue
                    break;
                case 'average':
                    bins[key] = binTotalValue / (bins[key].length || 1)
                    break;          
                case 'count':
                    bins[key] = bins[key].length
                    break;
            }
        }
    } else {
        throw {status: 400, message: `Invalid analytics name`}
    }

    //here apply any accumulation method among the value of the bins
    let runningSum = 0
    let previousValue = 0
    // need to reverse the list to apply correctly the cumulative method.
    // in this way, it starts from the least recent bin and accumulates the value or does the difference with the previous bin
    for (var key of Object.keys(bins).reverse()) {
        runningSum += bins[key]
        switch (accumulationMethod) {
            case 'periodic':
                break;
            case 'cumulative':
                bins[key] = runningSum
                break;          
            case 'difference':
                bins[key] = bins[key] - previousValue
                break;
        }
        previousValue = bins[key]
    }

    //format data to send back with first value in the list being the most recent
    const x = []
    const y = []
    for (var key in bins) {
        x.unshift(key)
        y.unshift(bins[key])
    }

    return {x: x, y: y}
}

exports.getReportsMetadata = async (user, accountID, params) => {
    const reportsMetadata = await db.reportsMetadata.findAll({
        where: {
            accountID: accountID,
        },
        limit: parseInt(params.limit) || 5,
        order: [
            ['ID', 'DESC']
        ]
    })

    return reportsMetadata
}

exports.getReport = async (user, accountID, reportID) => {
    const reportsMetadata = await db.reportsMetadata.findOne({where: {ID: reportID}})

    if (!reportsMetadata)  throw {status: 404, message: `Report not found`}
    if (reportsMetadata.accountID != accountID)  throw {status: 403, message: `You are not authorized to access this report`}

    // if report not viewed yet, mark it as viewed
    if (!reportsMetadata.viewedAt) {
        await db.reportsMetadata.update({viewedAt: new Date()}, {where: {ID: reportID}})
    }

    const reportDataBase64 = await service.gcloud.downloadFile(`resources/${reportsMetadata.filename}`)
    return JSON.parse(atob(reportDataBase64))
}

exports.createReport = async (user, accountID, reportName, params = {}) => {
    logger.info(`account.createReport - ${reportName}`, {data: {accountID: accountID, params: params}})
    if (reportName == 'disconnected-listings') {
        //get disconnected listings
        const inventoryListing = await db.inventoryListing.findAll({
            where: {
                accountID: accountID,
                status: 'disconnected'
            }
        })

        const reportData = inventoryListing.map(listing => {return {
            inventoryListingID: listing.ID
        }
        })
        
        //if (configs.environment == 'local') return reportData
        // if no records to report. Don't create the report
        if (reportData.length == 0) return


        const filename = await service.gcloud.save(btoa(JSON.stringify(reportData)), 'json')
        const metadata = {
            accountID: accountID, 
            type: 'disconnected-listings',
            filename: filename
        }

        await db.reportsMetadata.create(metadata)

        return {data: reportData, metadata: metadata}

    }

    if (reportName == 'new-product-uploads') {
        if (!params.retailerAccountID) throw {status: 400, message: `Missing retailerAccountID`}

        const productsCreatedSinceLastReport = await db.product.findAll({
            where: {
                accountID: params.retailerAccountID,
                createdAt: {
                    [Op.gt]: moment().subtract(1, 'weeks').toDate()
                }
            }
        })

        const reportData = productsCreatedSinceLastReport.map(product => {
            return {
                productID: product.ID
            }
        })
        //if (configs.environment == 'local') return reportData

        // if no records to report. Don't create the report
        if (reportData.length == 0) return

        const filename = await service.gcloud.save(btoa(JSON.stringify(reportData)), 'json')
        const metadata = {
            accountID: accountID, 
            type: 'new-product-uploads',
            filename: filename
        }

        await db.reportsMetadata.create(metadata)

        return {data: reportData, metadata: metadata}
    }

    if (reportName === 'best-selling-products') {
        if (!params.retailerAccountID) throw {status: 400, message: `Missing retailerAccountID`}

        const olis = await db.orderLineItem.findAll({
            where: {
                accountID: params.retailerAccountID,
                orderTypeID: 4,
                createdAt: {
                    [Op.gt]: moment().subtract(1, 'weeks').toDate()
                }
            },
            include: [
                {model: db.product, as: 'product'}
            ]
        })

        const productIDsCount = olis.map(sale => sale.productID).reduce((acc, productID) => {
            if (acc[productID]) {
                acc[productID] += 1
            } else {
                acc[productID] = 1
            }
            return acc
        }, {})
        const sortedProductIDs = Object.keys(productIDsCount).sort((a, b) => productIDsCount[b] - productIDsCount[a]).slice(0, 10)


        const reportData = sortedProductIDs.map(productID => {
            const productOlis = olis.filter(oli => oli.productID == productID)
            const totalSaleValue = productOlis.reduce((tot, oli) => tot += parseFloat(oli.price || 0), 0)
            const avgSaleValue = Math.floor(totalSaleValue / productOlis.length)

            const productVariantIDsOlis = productOlis.map(oli => oli.productVariantID)
            const productVariantIDsCount = productVariantIDsOlis.reduce((acc, productVariantID) => {
                if (acc[productVariantID]) {
                    acc[productVariantID] += 1
                } else {
                    acc[productVariantID] = 1
                }
                return acc
            }, {})
            const sortedProductVariantIDs = Object.keys(productVariantIDsCount).sort((a, b) => productVariantIDsCount[b] - productVariantIDsCount[a])
            const bestSellingProductVariantID = sortedProductVariantIDs[0]

            return {
                productID: Number(productID),
                numberOfSalesLastWeek: productOlis.length,
                mostSoldVariantID: Number(bestSellingProductVariantID),
                avgSaleValue: avgSaleValue
            }
        })

        //if (configs.environment == 'local') return reportData

        // if no records to report. Don't create the report
        if (reportData.length == 0) return

        const filename = await service.gcloud.save(btoa(JSON.stringify(reportData)), 'json')
        const metadata = {
            accountID: accountID, 
            type: 'best-selling-products',
            filename: filename
        }

        await db.reportsMetadata.create(metadata)

        return {data: reportData, metadata: metadata}
    }

    if (reportName === 'stock-levels') {
        const sales = await db.orderLineItem.findAll({
            where: {
                accountID: accountID,
                createdAt: {
                    [Op.gt]: moment().subtract(1, 'weeks').toDate()
                }
            }
        })

        const productVariantIDs = sales.map(sale => sale.productVariantID)
        const productVariantIDsCount = productVariantIDs.reduce((acc, curr) => {
            if (acc[curr]) {
                acc[curr] += 1
            } else {
                acc[curr] = 1
            }
            return acc
        }, {})
        const sortedProductVariantIDs = Object.keys(productVariantIDsCount).sort((a, b) => productVariantIDsCount[b] - productVariantIDsCount[a])

        const inventory = await db.inventory.findAll({
            where: {
                accountID: accountID,
                productVariantID: sortedProductVariantIDs.map(id => parseInt(id)),
                virtual: 0
            }
        })

        const reportData = []
        sortedProductVariantIDs.map(productVariantID => {
            const weeklySales = sales.filter(sale => sale.productVariantID == productVariantID)
            const totalSaleValue = weeklySales.reduce((tot, oli) => tot += parseFloat(oli.price || 0), 0)
            const avgSaleValue = Math.floor(totalSaleValue / weeklySales.length)

            const productVariantInventory = inventory.filter(inv => inv.productVariantID == productVariantID)
            const totalProductVariantInventoryQuantity = productVariantInventory.reduce((tot, invRec) => tot += invRec.quantity, 0)

            if (totalProductVariantInventoryQuantity <= weeklySales.length) {
                reportData.push({
                    productVariantID: Number(productVariantID),
                    numberOfSalesLastWeek: weeklySales.length,
                    averageSaleValue: avgSaleValue,
                    currentInventoryQuantity: totalProductVariantInventoryQuantity,
                    createdAt: moment(Math.max(...productVariantInventory.map(inv => inv.createdAt)))
                }) 
            }
        }).slice(50)

        // if (configs.environment == 'local') return reportData

        // if no records to report. Don't create the report
        if (reportData.length == 0) return

        const filename = await service.gcloud.save(btoa(JSON.stringify(reportData)), 'json')
        const metadata = {
            accountID: accountID, 
            type: 'stock-levels',
            filename: filename
        }

        await db.reportsMetadata.create(metadata)

        return {data: reportData, metadata: metadata}
    }
}
