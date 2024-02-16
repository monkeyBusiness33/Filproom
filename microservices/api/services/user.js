const db = require('../libs/db')
const Op = require('sequelize').Op;
const logger=require('../libs/logger.js')
const configs=require('../configs')
const utils = require("../libs/utils")
const service = require('./main')

exports.getUserSession = async (userID) => {
    const user = await db.user.findOne({
        where: {
            ID: userID
        },
        attributes: Object.keys(db.user.getAttributes()),
        include: [
            { model: db.account, as: 'account', include: [
                {model: db.address, as: 'billingAddress'},
                {model: db.saleChannel, as: 'saleChannels', include: [
                    {model: db.transactionRate, as: 'fees'},
                    {model: db.account, as: 'account'}
                ]},
                {model: db.warehouse, as:'warehouses', include: [
                    {model:db.address, as: 'address'}
                ]},
            ]}
        ],
        order: []
    })

    if (!user) throw { status: 404, message: "user not found"};

    //used to return the user roles - needs to be separate because if too many consingors memory overflow occurs
    user.dataValues.roles = await db.role.findAll({
        include: [
            {model: db.user, as: 'users', where: {ID: user.ID}, required: true},
            { model: db.permission, as: 'permissions', include: [
                { model: db.resource, as: 'resource'}
            ]}
        ]
    })

    const betaEmails = ['demo@fliproom.io', 'reseller@fliproom.io','dean@theeditldn.com', 'jack.dark@btinternet.com',
        'victoria_photography@outlook.com', 'victoria@theeditldn.com', 'm.s.patel568@gmail.com','yasmin@theeditldn.com',
        'deandobson8@gmail.com', 'hitopsneaks86@gmail.com', 'fabrice@theeditldn.com', 'ziya@theeditldn.com',
        'lloyd@theeditldn.com', 'marina@theeditldn.com', 'millie@theeditldn.com', 'info@reseller2reseller.com',
        'ben.pickering7@outlook.com', 'alabi1234@hotmail.com', 'jackwywy1@googlemail.com',
        'ljwright1@hotmail.co.uk', 'georgehamblin12@icloud.com', 'ghostedshhh@gmail.com','danylo@theeditldn.com',"antonio.sigillo@outlook.it", "milanostoreback@gmail.com",
                "andrea.speakers@gmail.com", "eftiqorri@gmail.com", "giuliagalassi79@yahoo.it", "abollini03@gmail.com",
        "jasminegelso97@gmail.com", "backfirenze@gmail.com", "onestreetsrl@gmail.com",'yasminh2010x@gmail.com', 'sinbalsneakers@outlook.com', 'sinbalsneakers@outlook.com',  'r.sauchelli@wiredhub.io']
    const internalEmails =  ['demo@fliproom.io', 'reseller@fliproom.io', 'r.sauchelli@wiredhub.io', 's.rosa@wiredhub.io']

    //HERE DEFINE THE EMAILS THAT CAN ACCESS THE DIFFERENT EXPERIMENTS CURRENTLY RUNNING
    //laced-pricing-announcement
    const lacedPricingAnnouncementExpEmails = [...internalEmails]; // clone internal emails list to avoid mutation
    if (user.accountID != 3) lacedPricingAnnouncementExpEmails.push(user.email)

    //integrations-laced
    const integrationsLacedExpEmails = [...internalEmails]; // clone internal emails list to avoid mutation
    const editLDNSaleChannel = user.account.saleChannels.find(saleChannel => saleChannel.accountID == 3)
    if (configs.environment == "local" || (user.accountID != 3 && !editLDNSaleChannel) || user.accountID == 2830) {
        integrationsLacedExpEmails.push(user.email)
    }

    // used to assign experiments to various users by email
    const experiments = [
        {name: 'laced-pricing-announcement', emails: lacedPricingAnnouncementExpEmails},
        {name: 'integrations-laced', emails: integrationsLacedExpEmails},
    ]

    user.dataValues.experiments = experiments.filter(experiment => experiment.emails.includes(user.email)).map(experiment => experiment.name)

    return user
}

exports.getSetSession = async (userID, forceSet = false) => {
    /**
     * This function is used to get the user session and set it in the cache for faster access
     */
    logger.info(`user.getSetSession - ${userID}`)
    let user = await service.bridge.cache.get(`user:${userID}`)

    if (!user || forceSet) {
        user = await db.user.findOne({
            where: {ID: userID},
            attributes: ['ID', 'accountID', 'activatedAt', 'apiKey', 'email'], //activatedAt and apiKey needed for the route checks in app.js. Email needed temporary to detect personal shopper
            include: [
                {model: db.role, as: 'roles', attributes: ['ID', 'name', 'type', 'accountID'], through: {attributes: []}, include: [
                    { model: db.permission, required: false, as: 'permissions', attributes: ['rule'], include: [
                        { model: db.resource, required: true, as: 'resource', attributes: ['name']}
                    ]}
                ]}
            ],
        })
        if (!user) throw { status: 500, message: "user not found"};
        await service.bridge.cache.set(`user:${userID}`, JSON.stringify(user))
    } else {
        user = JSON.parse(user)
    }
    
    return user 
}

exports.refreshAPIKey = async (userID) => {
    /**
     * This function is used to refresh the user API Key
     */
    const user = await db.user.findOne({where: {ID: userID}})
    const jwtToken = service.auth.signToken(user)
    await db.user.update({ apiKey: jwtToken }, { where: { ID: userID } })

    //invalidate cache
    await service.bridge.cache.delete(`user:${userID}`)
    return jwtToken
}

exports.getOne = async (_user, ID) => {
    const user = await db.user.findOne({
        where: {
            ID: ID
        },
        include: [
            { model: db.account, as: 'account'},
            { model: db.role, as: 'roles'},
            
        ],
        order: []
    })

    if (!user) throw { status: 404, message: "user not found"};

    return user
}

exports.addPermissions = async (user, userID, permissions) => {
    const serviceUser = await service.account.serviceUser(user.accountID)
    const _user = await service.user.getOne(serviceUser, userID)
    const internalRole = _user.roles.find(role => role.accountID == user.accountID)
    const resources = await db.resource.findAll({where: {name: permissions}})
    await Promise.all(resources.map(resource => db.permission.findOrCreate({defaults: {roleID: internalRole.ID, resourceID: resource.ID}, where: {roleID: internalRole.ID, resourceID: resource.ID}})))
    await service.bridge.cache.delete(`user:${userID}`)
}

exports.deletePermissions = async (user, userID, permissions) => {
    const serviceUser = await service.account.serviceUser(user.accountID)
    const _user = await service.user.getOne(serviceUser, userID)
    const internalRole = _user.roles.find(role => role.accountID == user.accountID)
    const resources = await db.resource.findAll({where: {name: permissions}})
    await Promise.all(resources.map(resource => db.permission.destroy({where: {roleID: internalRole.ID, resourceID: resource.ID}})))
    await service.bridge.cache.delete(`user:${userID}`)
}

exports.update = async (user, ID, updates) => {
    for (const field in updates) {
        if (['name', 'surname', 'gender', 'email', 'username'].includes(field)) {
            updates[field] = updates[field].trim().toLowerCase()
        } else if (field == 'activated') {
            updates['activatedAt'] = updates.activated != 0 ? new Date() : null
        } else if (['password', 'phoneNumber'].includes(field)) {
            updates[field] = updates[field].trim()
        } else {
            updates[field] = updates[field]
        }
    }

    const _u = await db.user.findOne({where: {ID: ID}})
    const userWasActive = _u.activatedAt
    await db.user.update( updates, { where: {ID: ID}, individualHooks: true})

    // Send email if user has been activated & has valid email address
    if (!userWasActive && updates['activatedAt'] && _u.email) {
        await exports.sendWelcomeEmail(user, ID)
    }

    //invalidate cache
    await service.bridge.cache.delete(`user:${ID}`)

    return exports.getOne(user, ID)
}

exports.create_v2 = async (opts, role) => {

    if (!opts.accountID) throw { status: 400, message: "Missing required fields" };
    if (role == "admin" && !opts.email) throw { status: 400, message: "Missing required fields" };

    const rawUserObject = {
        accountID: opts.accountID,
        name: (opts.name || 'your').trim().toLowerCase(),
        surname: (opts.surname || 'name').trim().toLowerCase(),
        email: opts.email ? opts.email.trim().toLowerCase() : null,
        password: opts.password ? opts.password.trim() : null,
        activatedAt: new Date(),
    }

    const rolesToLink = []

    switch (role) {
        case 'service-user':
            rawUserObject.name = 'Service'
            rawUserObject.surname = 'User'
            rawUserObject.password = `${Math.random().toString(36).slice(2)}`
            const serviceUserDefaultRole = await db.role.findOne({where: {name: 'super admin', accountID: opts.accountID}})
            rolesToLink.push(serviceUserDefaultRole)
            break;
        case 'admin':
            //if new admin - duplicate all roles of the service user
            const serviceUser = await service.account.serviceUser(opts.accountID)
            rolesToLink.push(...serviceUser.roles)
            break;
        case 'guest':
            rawUserObject.name = 'Guest'
            rawUserObject.surname = 'User'
            const guestUserRole = await db.role.findOne({where: {name: 'guest', accountID: opts.accountID}})
            rolesToLink.push(guestUserRole)
            break;
        case 'custom':
            const customRoles = await db.role.findAll({where: {name: opts.roles, accountID: opts.accountID}})
            rolesToLink.push(...customRoles)
            break;       
    }

    const user = await db.user.create(rawUserObject)
        
    await db.account_user.findOrCreate({
        where: {accountID: user.accountID, userID: user.ID},
        defaults: {accountID: user.accountID, userID: user.ID},
    })

    // Assigning an API Key as a Authorization Token for background usage of the serviceAccount
    const jwtToken = service.auth.signToken(user)
    await db.user.update({ apiKey: jwtToken }, { where: { ID: user.ID } })

    //setup roles
    await Promise.all(rolesToLink.map(role => db.user_role.create({roleID: role.ID, userID: user.ID})))

    // Send email if user has been activated & has valid email address
    if (user.activatedAt && user.email) {
        await exports.sendWelcomeEmail(user, user.ID)
    }

    return user
}

/**
 * 
 * EVERYTHIGN BELOW HERE TO REFACTOR
 */



exports.getAll = async (user, offset, limit, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [['ID', 'DESC']],
    }

    query.include = [
        { model: db.account, as: 'account', required: true},
        { model: db.role, as: 'role', required: true}
    ]

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }

        switch (paramKey) {
            case 'sort': 
                query = utils.addSorting(query, params['sort'])
                break;
            case 'accountIDs':
                query = utils.addFilter(query, 'accountID', params[paramKey])
                break;
            case 'roleTypes':
                query = utils.addFilter(query, 'role.type', params[paramKey])
                break;
            case 'search':
                query.where.push({[Op.or]: [
                    {'$user.ID$': {[Op.substring]: params.search}},
                    {'$user.name$': {[Op.substring]: params.search}},
                    {'$user.email$': {[Op.substring]: params.search}},
                    {'$account.name$': {[Op.substring]: params.search}},
                    {'$role.name$': {[Op.substring]: params.search}},
                    {'$user.phoneNumber$': {[Op.substring]: params.search}},
                ]})
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    let results = await db.user.findAndCountAll(query)

    return results
}

exports.isAuthorized = async (userID, accountID) => {
    const record = await db.account.findOne({
        where: {
            ID: accountID
        },
        include: [
            {model: db.user, as: 'users', where: {ID: userID}}
        ]}
    )

    if (record == null) {
        console.log("USER NOT AUTHORIZED")
    }

    return record != null
}


exports.sendWelcomeEmail = async (_user, ID) => {
    const user = await exports.getOne(_user, ID)
    const account = await db.account.findOne({where: {ID: _user.accountID}})

    let welcomeMessage = "We are happy to welcome you on our platform"
    if (account.isConsignor) {
        welcomeMessage = "You have been invited by The Edit LDN to join them on Fliproom. We are happy to welcome you on our platform"
    }

    const _configs = {
        accountLogoUrl: `https://app.fliproom.io/assets/fliproom_logo-text.png`,
        nameCapitalized: user.name.charAt(0).toUpperCase() + user.name.slice(1),
        welcomeMessage: welcomeMessage,
    }
    const emailTemplateString = utils.buildEmailMessage('welcome-email-template', _configs)

    const data = {
        to: [user.email],
        subject: `Welcome to Fliproom!`,
        body: emailTemplateString,
        attachments: [] 
    }

    return service.bridge.sendGrid.sendEmail(data);
}
