const db = require('../libs/db')
const axios = require('axios')
const configs = require('../configs')
const service = require('./main')
const utils = require('../libs/utils')

exports.getAll = async (user, offset, limit, sort, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [['ID', 'DESC']],
    }

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }
        switch (paramKey) {
            case 'sort': 
                query = utils.addSorting(query, params['sort'])
                break;
            case 'IDs':
                query = utils.addFilter(query, 'ID', params.IDs)
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    query.include = [
        {model: db.account, as: 'account'}
    ]

    return db.warehouse.findAndCountAll(query)
}

exports.getByID = async (user, warehouseID) => {
    return db.warehouse.findOne({
        where: {ID: warehouseID},
        include: [
            { model: db.account, as: 'accounts'}
        ]
    })
}

exports.create = async (user, rawWarehouse) => {
    if (!await service.user.isAuthorized(user.ID, rawWarehouse.accountID)) {
        return
    }

    const newWarehouse = {
        name: rawWarehouse.name.trim().toLowerCase(),
        fulfillmentCentre: rawWarehouse.fulfillmentCentre,
        accountID: rawWarehouse.accountID,
        addressID: rawWarehouse.addressID
    }

    const warehouse = await db.warehouse.create(newWarehouse)

    await db.account_warehouse.findOrCreate({defaults: {}, where: {warehouseID: warehouse.ID, accountID: rawWarehouse.accountID}})

    return service.warehouse.getByID(user, warehouse.ID)
}

exports.update = async (user, warehouseID, updates)=>{
    if (updates.name) {
        updates.name = updates.name.trim().toLowerCase()
    }

    await db.warehouse.update(updates, {where: {ID: warehouseID}})

    return service.warehouse.getByID(user, warehouseID)
}

