const db = require('../libs/db')
const Op = require('sequelize').Op;
const service = require('./main')
const utils = require('../libs/utils')
const configs = require("../configs");
const logger = require('../libs/logger');
const ShipEngine = require("shipengine");
const shipengine = new ShipEngine(configs.apis.shipEngine);

exports.getByID = async (user, addressID) => {
    return db.address.findOne({
        where: {ID: addressID},
        include: [
            { model: db.account, required: true, as: 'account'},
            { model: db.warehouse, required: false, as: 'warehouses'},
        ]
    })
}

exports.getAll = async (user, offset, limit, sort, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        order: [['ID', 'DESC']]
    }

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
            case 'search':
                query.where[Op.or] = [
                    {'$fullName$': {[Op.substring]: params.search}},
                    {'$address$': {[Op.substring]: params.search}},
                    {'$postcode$': {[Op.substring]: params.search}},
                    {'$city$': {[Op.substring]: params.search}},
                    {'$country$': {[Op.substring]: params.search}},
                    {'$email$': {[Op.substring]: params.search}},
                    {'$phone$': {[Op.substring]: params.search}},
                ]
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    query.include = [
        { model: db.account, required: true, as: 'account'},
        { model: db.warehouse, required: false, as: 'warehouses'},

    ]

    return db.address.findAndCountAll(query)
}


exports.search = async (user, search, params) => {
    logger.info(`address.search`, {data: {search: search, params: params}});

    if (!params.search) throw {status: 400, message: `Missing search parameter`};

    const typesenseFilters = {
    }

    // Construct the filter query based on the params
    for (var paramKey in params) {
        const paramValue = params[paramKey]
        if (!paramValue) continue
        if (['offset', 'limit', 'sort', 'search'].includes(paramKey)) continue;

        switch (paramValue) {
            case 'accountID':
                typesenseFilters['account.ID'] = params[paramKey]
                break;
            default:
                typesenseFilters[paramKey] = params[paramKey]
                break;
        }
    }


    const response = await service.bridge.typesense.addressesIndex.search(search, typesenseFilters, params.sort, {offset: params.offset, limit: params.limit})

    return {
        rows:  response.hits,
        count: response.found
    }
};



exports.create = async (user, rawAddress) => {
    /**
     * name:             string
     * surname:          string
     * address:          string
     * addressExtra:     string | optional
     * postcode:         string
     * city:             string
     * county:           string
     * countyCode:       string
     * country:          string
     * countryCode:      string
     * email:            string | optional
     * phoneCountryCode: string
     * phoneNumber:      string
     * validate:         string (default: 'no_validation', 'validate_optional', 'validate')
     * 
     */
    logger.info(`Create Address`, {data: rawAddress})
    
    let newAddress = {
        accountID: rawAddress.accountID,
        name: (rawAddress.name || '').trim().toLowerCase(),
        surname: (rawAddress.surname || '').trim().toLowerCase(),
        fullName: `${(rawAddress.name || '').trim().toLowerCase()} ${(rawAddress.surname || '').trim().toLowerCase()}`,
        address: (rawAddress.address || '').trim().toLowerCase(),
        addressExtra: rawAddress.addressExtra ? rawAddress.addressExtra.trim().toLowerCase() : null,
        postcode: (rawAddress.postcode || '').trim().toLowerCase(),
        city: (rawAddress.city || '').trim().toLowerCase(),
        county: (rawAddress.county || '').trim().toLowerCase(),
        countyCode: (rawAddress.countyCode || '').trim().toLowerCase(),
        country: (rawAddress.country || '').trim().toLowerCase(),
        countryCode: (rawAddress.countryCode || '').trim().toLowerCase() ,
        email: rawAddress.email ? rawAddress.email.trim().toLowerCase() : null,
        phoneCountryCode: rawAddress.phoneCountryCode ? rawAddress.phoneCountryCode.trim().toLowerCase() : null,
        phoneNumber: rawAddress.phoneNumber ? rawAddress.phoneNumber.trim().toLowerCase() : null,
        validated: !!rawAddress.validated
    }

    /**
     * Validating address prior to saving.
     * If address isnt valid and validate is mandatory, throws error 422
     */
    if (rawAddress.validate && rawAddress.validate != 'no_validation') {
        newAddress = await service.address.validate(newAddress, rawAddress.validate == 'validate_optional')
        newAddress.validated = !!newAddress.validated
    }

    let [address] = await db.address.findOrCreate(({
        where: newAddress,
        defaults: newAddress
    }))

    //typesense indexing
    await service.bridge.typesense.addressesIndex.addOrUpdate(address.ID)

    return address
}

exports.update = async (user, addressID, updates) => {
    const _updates = { }
    const address = await service.address.getByID(user, addressID)
    
    for (var updateKey in updates) {
        _value = updates[updateKey]
        if (typeof _value === 'string') {
            _value = updates[updateKey].trim().toLowerCase()
        }
        _updates[updateKey] = _value
    }
    
    // fullName
    if (_updates['name'] != undefined || _updates['surname'] != undefined) {
        _updates['fullName'] = `${_updates['name'] || ''} ${_updates['surname'] || ''}`
    }


    await db.address.update( _updates, {
        where: { ID: addressID},
    })

    //typesense indexing
    await service.bridge.typesense.addressesIndex.addOrUpdate(address.ID)

    return service.address.getByID(user, addressID)
}

exports.validate = async (address, optional = false) => {
    /**
     * optional: if pass true, throws error 422 if impossible to validate address
     * 
     * return the validated address
     */
    const addressID = address.ID;

    const params = [{
        name: address.fullName,
        addressLine1: address.address,
        addressLine2: address.addressExtra,
        stateProvince: address.countyCode,
        cityLocality: address.city,
        postalCode: address.postcode,
        countryCode: address.countryCode || address.country
    }];

    let result;
    try {
        result = await shipengine.validateAddresses(params);
    } catch (e) {
        throw {status: 500, message: `An error occured while validating the address. ${e}`}
    }

    if (result[0].status === 'verified') {
        const validatedAddress = result[0].normalizedAddress
        // Success! Print the formatted address
        const updates = {
            validated:     1,
            address:       validatedAddress.addressLine1.toLowerCase(),
            addressExtra:  validatedAddress.addressLine2 ? validatedAddress.addressLine2.toLowerCase() : null,
            countyCode:    validatedAddress.stateProvince,
            city:          validatedAddress.cityLocality.toLowerCase(),
            postcode:      validatedAddress.postalCode.toLowerCase(),
            countryCode:   validatedAddress.countryCode.toLowerCase()
        }

        /**
         * If addressID is not set, it means that the address is not yet saved in the db i.e its a new address.
         * In this case, we return the validated address without updating it in the db
         */
        if (!addressID) return { ...address, ...updates };

        const serviceUser = await service.account.serviceUser(address.accountID)
        await service.address.update(serviceUser, addressID, updates)
        return db.address.findOne({where: {ID: addressID}})
    } else if (result[0].status != 'verified' && optional === true) {
        return address
    } else {
        console.log(result[0].messages)
        throw {status: 422, message: `Impossible validate the address. ${result[0].messages.map(obj => obj.message).join(". ")}`}
    }
}

