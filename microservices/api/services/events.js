const db = require('../libs/db')
const Op = require('sequelize').Op;
const utils = require('../libs/utils')
const service = require('./main')
const moment = require('moment')
const logger = require('../libs/logger');

exports.getById = async (user, eventId) => {
    /**
     * This function is used to query a single event by ID
     */

    const query = {
        where: {
            accountID: user.accountID,
            ID: eventId
        },
        include: [
            { model: db.account,         as: 'account'},
            { model: db.user,            as: 'user'},
        ]
    }

    const event = await db.event.findOne(query)

    if (!event) {
        throw {status: 404, message: `Event ${eventId} not found`}
    }

    return event
}

exports.getAll = async (user, offset, limit, params) => {
    /**
     * This function is used to query a list of events  
     */

    let query = {
        where: [
            {accountID: user.accountID}
        ],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        order: [
            ['timestamp', 'DESC']
        ]
    }

    query.include = [
        { model: db.account,         as: 'account'},
        { model: db.user,            as: 'user'},
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
                ]})
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }


    const result = await db.event.findAndCountAll(query)

    return result
}

exports.create = async (user, body) => {
    /**
     * This function is used to record an event in the database
     */
    logger.info('event.create', {data: body});

    (['resource', 'action']).forEach(key => {
        if (!(key in body)) {
            throw {status: 400, message: `Missing ${key}`}
        }
    });

    const supportedActions = ['viewed', 'interested', 'not-interested', 'dismissed', 'completed', 'view-product', 'opened']
    if (!supportedActions.includes(body.action)) {
        throw {status: 400, message: `Unsupported action ${body.action}`}
    }

    const event = await db.event.create({
        accountID: user.accountID,
        userID: user.ID,
        resource: body.resource,
        action: body.action,
        timestamp: body.timestamp || moment(),
    })

    return service.events.getById(user, event.ID)
}
