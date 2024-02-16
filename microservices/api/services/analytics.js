const db = require('../libs/db')
const Op = require('sequelize').Op;
const utils = require('../libs/utils')
const moment = require('moment')

exports.personalShoppingKPIs = async () => {
    /**
     * Personal Shopping
     */
    const personalShoppingSales = await db.order.findAll({
        where: {
            typeID: 4,
            tags: {[Op.substring]: ['personal-shopping']},
            accountID: {[Op.ne]: 4405}, //exclude demo account
        },
        include: [
            {model: db.account, as: 'account'},
            {model: db.account, as: 'personalShopper'},
            {model: db.orderLineItem, as: 'orderLineItems'},
            {model: db.transaction, as: 'transactions'},
            {model: db.address, as: 'consignee'},
            {model: db.status, as: 'status'},
        ]
    })

    const data = {
        'id': [],
        'basket_started_at': [],
        'created_at': [],
        'link_first_shared_at': [],
        'link_first_opened_at': [],
        'fulfillment_started_at': [],
        'fulfillment_completed_at': [],
        'account_id': [],
        'sale_volume_gbp': [],
        'sale_paid_at': [],
        'sale_funds_received_at': [],
        'items_count': [],
        'financial_status': [],
        'fulfillment_status': [],
        'fliproom_fee': [],
        'customer_id': [],
        'customer_email': [],
        'personal_shopper_id': [],
        'personal_shopper_email': [],
        'created_at_day': [],
        'created_at_week': [],
        'created_at_month': [],
    }
    
    personalShoppingSales.map(record => {
        const saleTx = record.transactions.find(tx => tx.type === 'sale')
        data['id'].push(record.ID)
        data['basket_started_at'].push(record.basketStartedAt)
        data['created_at'].push(record.createdAt)
        data['link_first_shared_at'].push(record.linkFirstSharedAt)
        data['link_first_opened_at'].push(record.linkFirstOpenedAt)
        data['fulfillment_started_at'].push(record.fulfillmentStartedAt)
        data['fulfillment_completed_at'].push(record.fulfillmentCompletedAt)
        data['account_id'].push(record.accountID)
        data['sale_volume_gbp'].push(parseFloat(record.totalAmount) * utils.getExchangeRate(record.account.currency , 'gbp'))
        data['sale_paid_at'].push(saleTx.processingAt)
        data['sale_funds_received_at'].push(saleTx.completedAt)
        data['items_count'].push(record.orderLineItems.length)
        data['financial_status'].push(saleTx.status)
        data['fulfillment_status'].push(record.status.name)
        data['fliproom_fee'].push(parseFloat(record.totalAmount) * 0.0125)
        data['customer_id'].push(record.consigneeID)
        data['customer_email'].push(record.consignee ? record.consignee.email : null)
        data['personal_shopper_id'].push(record.personalShopperAccountID)
        data['personal_shopper_email'].push(record.personalShopper ? record.personalShopper.email : null)
        data['created_at_day'].push(moment(record.createdAt).startOf('day'))
        data['created_at_week'].push(moment(record.createdAt).startOf('week'))
        data['created_at_month'].push(moment(record.createdAt).startOf('month'))
    })

    return data
}

exports.engagementKPIs = async () => {
    /**
     * Engagement
     */
    const events = await db.event.findAll({
        where: {
        },
    })

    const data = {
        'resource': [],
        'action': [],
        'count': [],
    }

    
    
    const announcementsNames = ['laced-interest', 'user-satisfaction', 'inventory-upload-reminder']
    announcementsNames.map(resourceName => {
        const resourceEvents = events.filter(event => event.resource === resourceName)
        const resourceActions = resourceEvents.map(event => event.action)
        const resourceActionsCount = resourceActions.reduce((acc, curr) => {
            acc[curr] = (acc[curr] || 0) + 1
            return acc
        }, {})

        Object.keys(resourceActionsCount).map(action => {
            data['resource'].push(resourceName)
            data['action'].push(action)
            data['count'].push(resourceActionsCount[action])
        })
    })

    return data
}