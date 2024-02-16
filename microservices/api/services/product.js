
const db = require('../libs/db')
const logger = require("../libs/logger");
const Op = require('sequelize').Op;
const service = require('./main')
const utils = require('../libs/utils')
const configs = require("../configs");
const moment = require('moment')

exports.getById = async (user, productID, params = {includeDeletedVariants: false}) => {
    /**
     * Scenario where all the variants of the product has been deleted, we should not let to return the product
     */
    const query = {
        where: { 
            ID: productID
        },
        include: [
            {model: db.account, as: 'account'},
            {model: db.productImage,   as: 'images'},
            {model: db.productCategory,as: 'category'},
            {model: db.product,        as: 'sourceProduct'},
            {model: db.productVariant, as: 'variants', include: [
                {model: db.productVariant, as: 'sourceProductVariant', required: false }
            ]},
            {model: db.productMatchLookup,        as: 'matches', separate: true, include: [
                {model: db.product, as: 'externalProduct'},
                {model: db.productVariant, as: 'externalVariant'},
            ]},
        ],
        order: [
            ['variants', 'position', 'asc'],
            ['images', 'position', 'asc'],
        ]
    }

    if (!params.includeDeletedVariants) {
        query.include.find(includeObj => includeObj.as == 'variants').where = {status: 'active'}
    }

    const product = await db.product.findOne(query)
    return product;
}

exports.getAll = async (user, offset, limit, sort, params) => {
    let query = {
        where: [], 
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [
            ['ID', 'desc'],
            ['variants', 'position', 'asc']
        ]
    }

    query.include = [
        {model: db.productCategory,  required: false, as: 'category'},
        {model: db.productVariant,   required: false, as: 'variants', where: {status: 'active'}}, //exclude deleted by default
        {model: db.product, as: 'sourceProduct', required: false},
        {model: db.productImage, as: 'images', required: false},
        {model: db.account, as: 'account', required: false},
    ]

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }
        switch (paramKey) {
            case 'sort': 
                query = utils.addSorting(query, params['sort'])
                query.order.push( ['variants', 'position', 'asc'])
                break;
            case 'accountIDs':
                query = utils.addFilter(query, 'accountID', params[paramKey])
                break;
            case 'statuses':
                query = utils.addFilter(query, 'status', params[paramKey])
                break;
            case 'search':
                query.where.push({[Op.or]: [
                    {'$product.ID$': {[Op.substring]: params.search}},
                    {'$product.title$': {[Op.substring]: params.search}},
                    {'$product.code$': {[Op.substring]: params.search}},
                    {'$product.description$': {[Op.substring]: params.search}},
                ]})
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    return db.product.findAndCountAll(query)

}

exports.getVariantById = async (variantID) => {
    const query = {
        where: {
            ID: variantID,
        },
        include: [
            { model: db.productVariant, as: 'sourceProductVariant'},
            {model: db.product, as: 'product', include: [
                    {model: db.productImage, as: 'images'},
                    {model: db.productCategory, as: 'category'},
                ]}
        ]
    }
    return db.productVariant.findOne(query);
}

exports.getImageById = async (user, imageID) => {
    const query = {
        where: {
            ID: imageID,
        },
        include: [
            {model: db.product, as: 'product'}
        ]
    }
    return db.productImage.findOne(query);
}

exports.getAllCategories = async (user, offset, limit, sort, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [
            ['name', 'asc'],
        ]
    }
    
    if (sort) {
        for (const sortingParam of sort.split(";")) {
            const [key, direction] = sortingParam.split(":")
            query.order.push([db.sequelize.literal(`\`${key}\``), direction])
        }
    }

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }
        
        switch (paramKey) {
            case 'accountIDs':
                query = utils.addFilter(query, 'accountID', params[paramKey])
                break;
            case 'search':
                query.where.push({[Op.or]: [
                        {'$ID$': {[Op.substring]: params.search}},
                        {'$name$': {[Op.substring]: params.search}},
                    ]})
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    query.include = [
        { model: db.account, as: 'account'}
    ]

    let results = await db.productCategory.findAndCountAll(query)
    return Promise.resolve(results)
}

exports.variantsGetAll = async (user, offset, limit, sort, params) => {
    let query = {
        where: {},
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [
            ['ID', 'desc'],
        ]
    }

    query.include = [
        { model: db.productVariant, required: false, as: 'sourceProductVariant'},
        {model: db.product, as: 'product', include: [
            {model: db.productImage, as: 'images'},
            {model: db.productCategory, as: 'category'},
            {model: db.product, required: false, as: 'sourceProduct'},
        ]}
    ]

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }

        switch (paramKey) {
            case 'sort': 
                query = utils.addSorting(query, params['sort'])
                break;
            case 'accountID':
                query = utils.addFilter(query, 'product.accountID', params.accountID)
                break;
            case 'statuses':
                query = utils.addFilter(query, 'status', params.statuses)
                break;
            case 'search':
                query.where[Op.or] = [
                    {'ID': {[Op.substring]: params.search}},
                    {'name': {[Op.substring]: params.search}},
                    {'price': {[Op.substring]: params.search}},
                    {'status': {[Op.substring]: params.search}}
                ]
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    return db.productVariant.findAndCountAll(query)
}

exports.getVariantMatch = async (user, variantID) => {
    /**
     * This function is used to find and retrieve all the variants linked to the variantID
     * 
     * f the user by mistake requests its own thing
     * if admin user request its variant, gfiven the consignor variant (because looking at the stock)
     * @param {Object}    user -         The user making the request. Defines which account variant needs to be returned
     * @param {number}    variantID:     The variant ID of the external account
     * 
     * @returns {Variant[]} - Returns a list of variants the new created product
     */
    logger.info(`Get variants matching to variant ${variantID}`)

    const matches = await db.productMatchLookup.findAll({
        where: {[Op.or]: [
            {'$productVariantID$': variantID},
            {'$externalProductVariantID$': variantID},
        ]},
        include: [
            {model: db.productVariant, as: 'variant', include: [
                {model: db.product, as: 'product'}
            ]},
            {model: db.productVariant, as: 'externalVariant', include: [
                {model: db.product, as: 'product'}
            ]},
        ]
    })

    const variants = []
    //build response by parsing all variants found. If variantID is the internal variant in the match record (record.productVariantID), return externalVariant and viceversa
    matches.map(record => {
        if (record.productVariantID == variantID) {
            variants.push(record.externalVariant)
        } else {
            variants.push(record.variant)
        }
    })

    return variants
}

exports.search = async (user, search, params) => {
    logger.info(`product.search`, {data: {search: search, params: params}})

    if (!search) throw {status: 400, message: `Missing search parameter`}

    const typesenseFilters = {
    }

    for (var paramKey in params) {
        const paramValue = params[paramKey]
        if (!paramValue) continue
        if (['offset', 'limit', 'sort', 'search'].includes(paramKey)) continue

        switch (paramKey) {
            case 'accountID':
                typesenseFilters['account.ID'] = params[paramKey]
                break;
            case 'releaseDate':
                let [greaterThan,lowerThan] = paramValue.split(":")
                greaterThan = greaterThan ? moment(greaterThan).unix() : ''
                lowerThan = lowerThan ? moment(lowerThan).unix() : ''
                typesenseFilters['releaseDate_unix'] = [greaterThan,lowerThan].join(":")
                break;
            case 'accountIDs':
                typesenseFilters['account.ID'] = params[paramKey]
                break;
            case 'public':
                typesenseFilters['public'] = (params['public'] == 'true') ? 1 : 0
                break;
            default:
                typesenseFilters[paramKey] = params[paramKey]
                break;
        }
    }

    //if no account ID, set public to true
    if (!('account.ID' in typesenseFilters)) {
        typesenseFilters['public'] = 1
    }

    const response = await service.bridge.typesense.productsIndex.search(search, typesenseFilters, params.sort, {offset: params.offset, limit: params.limit})

    return {
        rows:  response.hits,
        count: response.found
    }
}

exports.import = async (user, productID) => {
    /**
     * 
     * Imports a given product into the user account or just returns the existing product if it already exists (matched)
     * @param {Object} user - The user making the request
     * @param {number} productID - The ID of the product to import
     * @returns {[Product, boolean]} - Returns the account product and a boolean indicating if the product was created or not.
     * 
     */
    logger.info(`product.import - productID ${productID} on account ${user.accountID}`)

    // check that user is not importing one of its own products
    const externalAccountProductSimple = await db.product.findOne({where: {ID: productID}})
    if (user.accountID == externalAccountProductSimple.accountID) throw {status: 400, message: `Can't match an internal product to another internal product`}

    //check if there is an existing match for the external product
    const existingProductMatch = await db.productMatchLookup.findOne({where: {externalProductID: externalAccountProductSimple.ID, accountID: user.accountID}})
    if (existingProductMatch) {
        //fetch and return existing product
        const accountProduct = await service.product.getById(user, existingProductMatch.productID)
        return [accountProduct, false]
    }

    // fetch product to import 
    const externalAccountServiceUser =  await service.account.serviceUser(externalAccountProductSimple.accountID)
    const externalAccountProduct =  await service.product.getById(externalAccountServiceUser, externalAccountProductSimple.ID)

    if (!externalAccountProduct) throw {status: 400, message: `No product found with ID ${externalAccountProduct.ID}`}


    logger.info(`ProductID ${productID} not found on accountID ${user.accountID}  - Importing..`)
    // trim product obejct from metadata
    const body = JSON.parse(JSON.stringify(externalAccountProduct));
    // clear product from account data
    delete body.foreignID
    delete body.ID
    body.category = body.category.name
    body.accountID = user.accountID
    body.variants = body.variants.map(variant => {
        delete variant.ID
        delete variant.foreignID
        delete variant.productID
        return variant
    })
    body.images = body.images.map(image => {
        delete image.ID
        delete image.foreignID
        delete image.productID
        return image
    })


    //create product
    const newInternalProduct = await service.product.create(user, body, {forceCreate: true})

    //create egress
    await service.product.createEgress(user, newInternalProduct.ID)


    // match products
    const variantMatchesQueries = []
    newInternalProduct.variants.map(_internalVariant => {
        const externalVariantFound = externalAccountProduct.variants.find(_externalVariant => _externalVariant.name.trim().toLowerCase() == _internalVariant.name.trim().toLowerCase() )
        //HANDLE MAPPING ERRORS
        if (!externalVariantFound){throw new Error(`No external variant found while trying to create map for internal variant: ${_internalVariant.ID} | external prod ID: ${externalAccountProduct.ID}`)}
        variantMatchesQueries.push({
            productVariantID: _internalVariant.ID,
            productID: newInternalProduct.ID,
            accountID: user.accountID,
            externalProductVariantID: externalVariantFound.ID,
            externalProductID: externalVariantFound.productID,
            externalAccountID: externalAccountProduct.accountID
        })
    })
    logger.info(`Creating product match records ${newInternalProduct.ID}-${user.accountID} => ${externalAccountProduct.ID}-${externalAccountProduct.accountID}`, {data: variantMatchesQueries})
    await db.productMatchLookup.bulkCreate(variantMatchesQueries)


    return [newInternalProduct, true]    
}

exports.create = async (user, body, configs = {forceCreate: false}) => {
    /**
     * 
     * @param {Object} user - The user making the request (optional). This is used to define the product.accountID. To generate public products. Do not pass the user
     * @param {string}    body.title:     the title of the product
     * @param {(string)}  body.foreignID: A foreign ID for the product (optional)
     * @param {(number)}  body.sourceProductID: The ID of the public product (optional)
     * @param {(string)}  body.category:  the category of the product (optional)
     * @param {(string)}  body.code:      the code of the product (optional)
     * @param {(string)}  body.eanCode:   the eanCode of the product (optional)
     * @param {(string)}  body.description: the description of the product (optional). If it is not provided, the the title will be used as description.
     * @param {(string)}  body.status:    the status of the product (optional). If it is not provided, the status will be set to "active".
     * @param {Variant[]} body.variants:  a list of product variants
     * @param {(boolean)} configs.forceCreate: If true, the product will be created even if it already exists. If false, the product will not be created if it already exists.
     * 
     * @returns {Product} - Returns the new created product
     */

    logger.info('Generate Product', {data: {
        accountID: body.accountID,
        title: body.title,
        description: body.description,
        code: body.code,
        public: body.public,
        configs: configs
    }})

    if (!body.accountID && body.public != true) throw {status: 400, message: `Missing accountID`}
  
    // Generate category
    let productCategoryBody = {
        accountID:  body.accountID || null,
        name: (body.category || 'various').trim().toLowerCase()
    }

    const [productCategory, _] = await db.productCategory.findOrCreate({
        where: productCategoryBody,
        defaults: productCategoryBody
    })

    if (!body.title) throw {status: 400, message: `Product title is required`}

    // Find or Create Product
    const newProduct = {
      accountID:       body.accountID || null,
      foreignID:       body.foreignID || null,
      sourceProductID: body.sourceProductID || null,
      code:            body.code ? body.code.trim() : '',
      title:           body.title.trim(),
      eanCode:         body.eanCode || null,
      description:     body.description || body.title.trim(),
      volume:          body.volume || 0.01,
      weight:          body.weight || 0.01,
      pieces:          body.pieces || 1   ,
      status:          body.status || 'active',
      untracked:       body.untracked || false,
      stockxId:        body.stockxId || null,
      public:          body.public || false,  
      categoryID:      productCategory.ID,
      brand:           body.brand || null,
      category2:       body.category2 || null,
      releaseDate:     body.releaseDate || null,
      gender:          body.gender || null,
      color:           body.color || null,
      retailPrice:     body.retailPrice || null,
      salesLast72Hours:                 body.salesLast72Hours || null,
      salesLast72HoursChangePercentage: body.salesLast72HoursChangePercentage || null,
      lastSalePrice:                    body.lastSalePrice || null,
      lastSaleChangePercentage:         body.lastSaleChangePercentage || null,
      volatilityScore:                  body.volatilityScore || null,
      volatilityScoreChangePercentage:  body.volatilityScoreChangePercentage || null,
    }

    //be sure if creating a public product - it doesn't have an accountID
    if (newProduct.public == true) {
        newProduct.accountID = null
    } 

    const query = {
        where: {
            accountID: newProduct.accountID,
            code: newProduct.code,
            title: newProduct.title,
            status: newProduct.status, //CHANGE: Added because preventing to create new products that were previously deleted
        },
        defaults: newProduct
    }

    //used to force create a new product
    if( configs.forceCreate) {
        logger.info('Force create product')
        query.where.createdAt = new Date()
    }

    const [product, created] = await db.product.findOrCreate(query)

    // add product variants
    const productVariants = await service.product.addVariants(user, product.ID, body.variants)

    // add product images
    const productImages = await service.product.addImages(user, product.ID, body.images)
    
    const newCreatedProduct = await service.product.getById(user, product.ID)

    //typesense indexing
    await service.bridge.typesense.productsIndex.addOrUpdate(product.ID)

    return newCreatedProduct
}

exports.createVariantMatch = async (user, productVariantID, externalProductVariantID) => {
    /**
     * This function is used to create a match between variants of two different accounts. 
     * 
     * f the user by mistake requests its own thing
     * if admin user request its variant, gfiven the consignor variant (because looking at the stock)
     * @param {Object}    user -         The user making the request. Defines which account variant needs to be returned
     * @param {number}    productVariantID:     The variant ID of the user making the request
     * @param {number}    externalProductVariantID:     The external account variant ID to match with
     * 
     */
    logger.info(`Create variant match ${productVariantID} => ${externalProductVariantID}`)

    if (!externalProductVariantID) throw {status: 400, message: `Missing externalProductVariantID`}
    
    const productVariant = await db.productVariant.findOne({where: {ID: productVariantID}, include: [{model: db.product, as: 'product'}]})
    const externalProductVariant = await db.productVariant.findOne({where: {ID: externalProductVariantID}, include: [{model: db.product, as: 'product'}]})


    const match = await db.productMatchLookup.findOne({
        where: {
            productVariantID: productVariantID,
            externalAccountID: externalProductVariant.product.accountID,
        }
    })

    if (match) {
        throw {status: 400, message: `Variant ${productVariantID} is already matched on this external account`}
    }

    return db.productMatchLookup.create({
        accountID: productVariant.product.accountID,
        productID: productVariant.productID,
        productVariantID: productVariantID,
        externalAccountID: externalProductVariant.product.accountID,
        externalProductID: externalProductVariant.productID,
        externalProductVariantID: externalProductVariantID,
    })
}

exports.addImages = async (user, productID, images = []) => {
    /**
     * 
     * This function adds images to a product identified by its productID.
     * @param {Object}    user              - The user making the request
     * @param {number}    productID         - The ID of the product to which add the images
     * @param {Image[]}   images:           - a list of product images to add
     * @param {(string)}  image.foreignID:  - a foreign ID to reference the resource by external systems (optional)
     * @param {(string)}  image.src:        - the url of the resource - either src or base64 are required
     * @param {(string)}  image.base64:     - image in base64 data:application/pdf;base64... - either src or base64 are required
     * @param {(string)}  image.filename:   - not used
     * @param {(number)}  image.position:   - the index of the image in the list (optional) otherwise using the order of the list
     * 
     * @returns {Image[]} a list of product images or an empty list
     * 
     */
    logger.info(`Add images to productID ${productID}`)

    const sortedImages = images.sort((a, b) => a.position - b.position)
    const productImagesQueries = []
    for (var idx =0; idx < sortedImages.length; idx++) {
        const imageBody = sortedImages[idx]
        if (!imageBody.src && !imageBody.base64) throw {status: 400, message: `Image ${idx} is missing either src or base64`}

        if (imageBody.base64) {
            const imageType = imageBody.base64.includes('data:image/png;') ? 'png' : 'jpg'
            const filename = await service.gcloud.save(imageBody.base64 , imageType)
            imageBody.src = `https://storage.googleapis.com/${configs.apis.gcloud.bucket_name}/resources/${filename}`
        }

        productImagesQueries.push({
            productID: productID,
            foreignID: imageBody.foreignID || null,
            src:       imageBody.src,
            filename:  imageBody.filename || null,
            position:  imageBody.position || idx
        })
    }

    const createdProductImages = await db.productImage.bulkCreate(productImagesQueries)

    // update imageReference and images order
    const productImages = await db.productImage.findAll({where: {productID: productID}, order: [['position', 'ASC']]})
    const refImageUrl = productImages[0]?.src || null
    if (productImages.length > 0){
        await Promise.all(productImages.map(async (img, idx) => db.productImage.update({position: idx}, {where: {ID: img.ID}})))
    }
    await db.product.update({imageReference: refImageUrl}, {where: {ID: productID}})

    return createdProductImages
}

exports.addVariants = async (user, productID, variants) => {
    /**
     * This function adds variants to a product identified by its productID.
     * @param {Object}    user                            - The user making the request
     * @param {number}    productID                       - The ID of the product to which add the variants
     * @param {Variant[]} variants:                       - a list of product variants to add (optional). If the list is empty, a default variant will be created.
     * @param {string}    variant.name:                   - The name for the variant
     * @param {(string)}  variant.status:                 - The variant status (optional). Default is 'active'
     * @param {(booelan)} variant.untracked:              - If the variant is untracked from external sale channels (optional). Default is false
     * @param {(number)}  variant.position:               - the index of the variant in the list (optional) otherwise using the order of the list
     * @param {(number)}  variant.sourceProductVariantID: - The ID of the public variant (optional)
     * @param {(string)}  variant.foreignID:              - The foreignID of the variant (optional)
     * @param {(string)}  variant.stockxId:               - The stockxId of the variant on stockx (optional)
     * 
     * @returns {Variant[]} a list of product variants or an empty list
     */
    logger.info(`Add variants to productID ${productID}`)

    const variantsQueries = []
    if (variants.length == 0) {
        variantsQueries.push({
            productID:                  productID,
            name:                      'default',
            status:                    'active',
            untracked:                  false,
            position:                   0
        })
    }

    const sortedVariants = variants.sort((a, b) => a.position - b.position)
    sortedVariants.forEach((variant, idx) => {
        if (!variant.name) throw {status: 400, message: `Variant ${idx} is missing name`}

        variantsQueries.push({
            productID:                  productID,
            name:                      (variant.name || 'default').trim(),
            foreignID:                  variant.foreignID || null,
            sourceProductVariantID:     variant.sourceProductVariantID || null,
            weight:                     variant.weight || 0.01,
            volume:                     variant.volume || 0.01,
            usSize:                     variant.usSize,
            ukSize:                     variant.ukSize,
            jpSize:                     variant.jpSize,
            euSize:                     variant.euSize,
            usmSize:                    variant.usmSize,
            uswSize:                    variant.uswSize,
            gtin:                       variant.gtin,
            status:                     variant.status || 'active',
            untracked:                  variant.untracked || false,
            stockxId:                   variant.stockxId  || null,
            price:                      variant.price || null, // deprecated ???
            position:                   idx
        })
    })

    // Remove duplicate variants
    const uniqueVariantsQueries = variantsQueries.filter((item, index, array) => array.findIndex(variant => variant.name === item.name) === index);

    return db.productVariant.bulkCreate(uniqueVariantsQueries)
}

exports.update = async (user, productID, updates) => {
    /**
     * @param {Object}    user                     - The user making the request
     * @param {number}    productID                - The ID of the product to update
     * @param {string}    updates.category         - 
     * @param {Object[]}  updates.variants         - 
     * @param {Object[]}  updates.images           - 
     *
     * @returns {Product} - Returns the updated product
     */

    const currentProduct = await service.product.getById(user, productID, {includeDeletedVariants: true})
    logger.info('product.update', {data: {ID: productID, updates: updates}})

    if (currentProduct.public && user) throw {status: 401, message: `Can't update a public product`}

    if (updates.category) {
        // Generate category
        const productCategory = {
            accountID: user ? user.accountID : null,
            name: updates['category'] ? updates['category'].trim() : 'various'
        }
        const [category] = await db.productCategory.findOrCreate({
            where: productCategory,
            defaults: productCategory
        })
        updates.categoryID = category.ID
        delete updates.category
    }

    await db.product.update(updates, {where: {ID: productID}})

    if (updates.images?.length > 0) {
        await service.product.updateImages(user, productID, updates.images)
    }

    if (updates.variants?.length > 0) {
        await service.product.updateVariants(user, productID, updates.variants)
    }

    //typesense indexing
    await service.bridge.typesense.productsIndex.addOrUpdate(productID)

    return service.product.getById(user, productID)
}

exports.updateVariants = async (user, productID, rawVariants) => {
    /**
     * This function uses to update variants
     * @param {Object}    user                   - The user making the request
     * @param {number}    productID              - The ID of the product to which delete variants
     * @param {string}    rawVariants.ID:        - ID of the variant to update
     * @param {string}    rawVariants.name:      - The name to update the variant.ID with
     * @param {string}    rawVariants.stockxId:  - 
     * @param {string}    rawVariants.foreignID: - 
     * @param {number}    rawVariants.lacedID:  -  ID of the laced variant
     * @param {lacedName}    rawVariants.lacedID: - name of the laced variant
     * @param {string}    rawVariants.weight:    -
     * @param {string}    rawVariants.volume:    -  
     * @param {string}    rawVariants.untracked: -  
     * @param {string}    rawVariants.gtin:      - 
     * @param {string}    rawVariants.status:    - the new variant status active, drafed, deleted
     * @param {string}    rawVariants.position:  - 
     * 
     * @returns {ProductVariant[]}           - The updated variants 
     */

    logger.info(`Update Product Variants`, {data: rawVariants})
    // Create Body for update on fields that are coming in the body
    // Update the variant if the body has the variantID in it
    const updateQueries = []
    const deleteQueries = []
    for (const variant of rawVariants) {
        const _variantUpdates = {}

        for (var key in variant) {
            if (key != "ID") {
                _variantUpdates[key] = variant[key]
            }
        }
        updateQueries.push(db.productVariant.update(_variantUpdates, {where: {ID: variant.ID}}))

        if (variant.status == 'deleted' ){
            deleteQueries.push(service.product.deleteVariants(user, productID, [variant.ID], variant.untracked))
        }
    }
    await Promise.all(updateQueries)
    await Promise.all(deleteQueries)

    return Promise.all(rawVariants.map(variant =>  service.product.getVariantById(variant.ID)))
}

exports.updateImages = async (user, productID, rawImages) => {
    /**
     * 
     * This function adds images to a product identified by its productID.
     * @param {Object}    user              - The user making the request
     * @param {number}    productID         - The ID of the product to which add the images
     * @param {Image[]}   images:           - a list of product images to add
     * @param {(string)}  image.foreignID:  - a foreign ID to reference the resource by external systems (optional)
     * @param {string}    image.src:        - the url of the resource
     * @param {(string)}  image.filename:   - not used
     * @param {(number)}  image.position:   - the index of the image in the list (optional) otherwise using the order of the list
     * 
     * @returns {Image[]} a list of product images or an empty list
     * 
     */
    logger.info(`Updates images for productID ${productID}`, {data: {productID: productID, rawImages: rawImages}})

    for (const imageUpdates of rawImages) {
        if (!imageUpdates.ID) throw {status: 400, message: `Image is missing ID`}

        await db.productImage.update(imageUpdates, {
            where: {
                ID: imageUpdates.ID
            }
        })
    }

    // update imageReference and images order
    const productImages = await db.productImage.findAll({where: {productID: productID}, order: [['position', 'ASC']]})
    const refImageUrl = productImages[0]?.src || null
    if (productImages.length > 0){
        await Promise.all(productImages.map(async (img, idx) => db.productImage.update({position: idx}, {where: {ID: img.ID}})))
    }
    await db.product.update({imageReference: refImageUrl}, {where: {ID: productID}})

    return Promise.all(rawImages.map(image =>  service.product.getImageById(user, image.ID)))

}

exports.deleteVariants = async (user, productID, variantIDs, untracked = false) => {
    /**
     * This function sets variants as deleted .
     * @param {Object}    user              - The user making the request
     * @param {number}    productID         - The ID of the product to which delete variants
     * @param {number[]}   variantIDs:       - The IDs of the variants to delete
     * @param {boolean}   untracked:       - Untrack the variant also 
     * 
     * @returns {null}
     */

    logger.info(`product.deleteVariants`, {data: variantIDs})

    // remove inventory associated to that variant
    const variantInventory = await db.inventory.findAll({where:{productVariantID: variantIDs, quantity: {[Op.gt]: 0}} })
    
    const unstockRequestBody = variantInventory.map(invRecord => {return {inventoryID: invRecord.ID, quantity: invRecord.quantity}})
    await service.inventory.unstock(user, unstockRequestBody)

    //set internal listings as deleted
    await db.inventoryListing.update({status: 'deleted'}, {where: {productVariantID: variantIDs, accountID: user.accountID}})
    //set external listings as disconnected
    await db.inventoryListing.update({status: 'disconnected'}, {where: {productVariantID: variantIDs, accountID: {[Op.not]: user.accountID}}})

    // remove product match lookup
    await db.productMatchLookup.destroy({where: {externalProductVariantID: variantIDs}})

    //set variant as deleted
    await db.productVariant.update({status: 'deleted', untracked: untracked}, {where: {ID: variantIDs}})


}

exports.deleteImages = async (user, productID, productImagesIDs) => {
    logger.info(`product.deleteImages`, {productID: productID, productImagesIDs: productImagesIDs})

    /**
     * productImagesIDs: number[]
     */
    await db.productImage.destroy({where: {ID: productImagesIDs}})

    // update imageReference and images order
    const productImages = await db.productImage.findAll({where: {productID: productID}, order: [['position', 'ASC']]})
    const refImageUrl = productImages[0]?.src || null
    if (productImages.length > 0){
        await Promise.all(productImages.map(async (img, idx) => db.productImage.update({position: idx}, {where: {ID: img.ID}})))
    }
    await db.product.update({imageReference: refImageUrl}, {where: {ID: productID}})
    return "ok"
}

exports.createEgress= async (user, productID) => {
    /***
     * This function is used to generate a product on external platforms

     * @param {Object}     user          The user making the request. Defines which account variant needs to be returned
     * @param {number}     productID     The ID of the product just created
     * 
     * @returns {Product}                The DB product that is going to be generated on the external platforms 
     * 
     */
    const dbProduct = await service.product.getById(user, productID)
    const serviceUser = await service.account.serviceUser(dbProduct.accountID)

    await service.gcloud.addTask(
        'shopify-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/shopify/product/create`,
        {authorization: `Bearer ${serviceUser.apiKey}`},
        null,
        dbProduct
    )

    await Promise.all(dbProduct.variants.map(_variant => service.gcloud.addTask(
        'gmerchant-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/google-merchant/variant/update`,
        {authorization: `Bearer ${serviceUser.apiKey}`},
        null,
        {
            variantID: _variant.ID
        },
        12*60*60 // wait 12 hrs to push updates, since might happen that product is not on google merchant yet
    )))

    await service.gcloud.publishEvent(user, 'product/created', dbProduct)
    
    return dbProduct
}

exports.createVariantsEgress= async (user, variantIDs) => {
    /**
     * This function is used to generate product variants on external platforms when the endpoint POST product/:ID/variants is called

     * @param {Object}     user          The user making the request. Defines which account variant needs to be returned
     * @param {number[]}   variantIDs    List of the variant ID just created
     * 
     * @returns {ProductVariant[]}       A list of DB variants that are going to be generated on the external platforms 
     */

    const serviceUser = await service.account.serviceUser(user.accountID)
    const dbVariants = await Promise.all(variantIDs.map(ID => service.product.getVariantById(ID)))

    await Promise.all(dbVariants.map(_variant => service.gcloud.addTask(
        'shopify-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/shopify/variant/create`,
        {authorization: `Bearer ${serviceUser.apiKey}`},
        null,
        _variant
    )))

    await Promise.all(dbVariants.map(_variant => service.gcloud.addTask(
        'gmerchant-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/google-merchant/variant/update`,
        {authorization: `Bearer ${serviceUser.apiKey}`},
        null,
        {
            variantID: _variant.ID
        },
        12*60*60 // wait 12 hrs to push updates, since might happen that variant is not on google merchant yet
    )))

    const dbProduct = await service.product.getById(serviceUser, dbVariants[0].productID)
    await service.gcloud.publishEvent(user, 'product/updated', dbProduct)

    return dbVariants
}

exports.createImagesEgress = async (user, imageIDs) => {
    /**
     * This function is used to generate product images on external platforms when the endpoint POST product/:ID/images is called

     * @param {Object}     user          The user making the request. Defines which account variant needs to be returned
     * @param {number[]}   imageIDs      List of the image ID just created
     * 
     * @returns {ProductImage[]}         A list of DB images that are going to be generated on the external platforms 
     */

    const serviceUser = await service.account.serviceUser(user.accountID)
    const dbImages = await Promise.all(imageIDs.map(ID => service.product.getImageById(serviceUser, ID)))

    await Promise.all(dbImages.map(_image => {
        return service.gcloud.addTask(
            'shopify-jobs',
            'POST',
            `${configs.microservices.api}/api/bridge/egress/shopify/product/image/create`,
            {
                provenance: 'product/images/create',
                authorization: `Bearer ${serviceUser.apiKey}`
            },
            null,
            _image)
        })
    )    

    const dbProduct = await service.product.getById(serviceUser, dbImages[0].productID)
    await service.gcloud.publishEvent(user, 'product/updated', dbProduct)

    return dbImages
}

exports.updateEgress= async (user, productID) => {
    //update product from platform to externally linked channels
    //handles update and deletion
    const serviceUser = await service.account.serviceUser(user.accountID)
    const dbProduct = await service.product.getById(serviceUser, productID)

    await service.gcloud.addTask(
        'shopify-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/shopify/product/${dbProduct.status == 'deleted' ? 'delete' : 'update'}`,
        {authorization: `Bearer ${serviceUser.apiKey}`},
        null,
        dbProduct
    )

    await Promise.all(dbProduct.variants.map(_variant => service.gcloud.addTask(
        'gmerchant-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/google-merchant/variant/update`,
        {authorization: `Bearer ${serviceUser.apiKey}`},
        null,
        {
            variantID: _variant.ID
        }
    )))

    await service.gcloud.publishEvent(user, 'product/updated', dbProduct)

    return dbProduct
}

exports.updateVariantsEgress = async (user, variantIDs) => {
    /**
     * This function is used to update product variants on external platforms when the endpoint PUT product/:ID/variants is called

     * @param {Object}     user          The user making the request. Defines which account variant needs to be returned
     * @param {number[]}   variantIDs    List of the variant ID just updated
     * 
     * @returns {ProductVariant[]}       A list of DB variants that are going to be updated on the external platforms 
     */

    const serviceUser = await service.account.serviceUser(user.accountID)
    const dbVariants = await Promise.all( variantIDs.map(ID => service.product.getVariantById(ID)))

    if (dbVariants.length == 0) return []

    await Promise.all(dbVariants.map(_variant => {
        if (_variant.status == 'deleted'){
            return service.gcloud.addTask('shopify-jobs', 'POST',
                `${configs.microservices.api}/api/bridge/egress/shopify/variant/delete`,
                {authorization: `Bearer ${serviceUser.apiKey}`}, 
                null, 
                _variant)
        }
        else {
            return  service.gcloud.addTask('shopify-jobs', 'POST',
                `${configs.microservices.api}/api/bridge/egress/shopify/variant/update`,
                {authorization: `Bearer ${serviceUser.apiKey}`}, 
                null, 
                _variant)
        }
    }))

    await Promise.all(dbVariants.map(_variant => service.gcloud.addTask(
        'gmerchant-jobs',
        'POST',
        `${configs.microservices.api}/api/bridge/egress/google-merchant/variant/update`,
        {authorization: `Bearer ${serviceUser.apiKey}`},
        null,
        {
            variantID: _variant.ID
        }
    )))

    const dbProduct = await service.product.getById(serviceUser, dbVariants[0].productID)
    await service.gcloud.publishEvent(user, 'product/updated', dbProduct)

    return dbVariants
}

exports.updateImagesEgress= async (user, imageIDs) => {
    /**
     * This function is used to update product images on external platforms when the endpoint PUT product/:ID/images is called

     * @param {Object}     user          The user making the request. Defines which account variant needs to be returned
     * @param {number[]}   imageIDs      List of the image ID just updated
     * 
     * @returns {ProductImage[]}         A list of DB images that are going to be updated on the external platforms 
     */

    const serviceUser = await service.account.serviceUser(user.accountID)
    const dbImages = await Promise.all(imageIDs.map(ID => service.product.getImageById(serviceUser, ID)))

    await Promise.all(dbImages.map(_image =>
        service.gcloud.addTask(
            'shopify-jobs', 
            'POST',
            `${configs.microservices.api}/api/bridge/egress/shopify/product/image/update`,
            {
                provenance: 'product/images/update',
                authorization: `Bearer ${serviceUser.apiKey}`
            }, 
            null, 
            _image
        )
    ))

    const dbProduct = await service.product.getById(serviceUser, dbImages[0].productID)
    await service.gcloud.publishEvent(user, 'product/updated', dbProduct)

    return dbImages
}

exports.deleteVariantsEgress= async (user, productVariants) => {
    /**
     * This function is used to delete product variants on external platforms when the endpoint DELETE product/:ID/variants is called

     * @param {Object}             user                 The user making the request. Defines which account variant needs to be returned
     * @param {ProductVariant[]}   productVariants      List of the variant objects just deleted
     * 
     * @returns {string}         
     */
    
    const serviceUser = await service.account.serviceUser(user.accountID)

    await Promise.all(productVariants.map(productVariant =>
        service.gcloud.addTask('shopify-jobs', 'POST',
            `${configs.microservices.api}/api/bridge/egress/shopify/variant/delete`,
            {authorization: `Bearer ${serviceUser.apiKey}`}, 
            null, 
            productVariant)
    ))

    const dbProduct = await service.product.getById(serviceUser, productVariants[0].productID, {includeDeletedVariants: true})
    await service.gcloud.publishEvent(user, 'product/deleted', dbProduct)

    return "ok"
}

exports.deleteImagesEgress= async (user, productImages) => {
    /**
     * This function is used to delete product images on external platforms when the endpoint DELETE product/:ID/images is called

     * @param {Object}           user               The user making the request. Defines which account variant needs to be returned
     * @param {ProductImage[]}   productImages      List of the image objects just deleted
     * 
     * @returns {string}         
     */
    
    const serviceUser = await service.account.serviceUser(user.accountID)

    await Promise.all(productImages.map(productImg =>
        service.gcloud.addTask(
            'shopify-jobs', 
            'POST',
            `${configs.microservices.api}/api/bridge/egress/shopify/product/image/delete`,
            {
                provenance: 'product/images/delete',
                authorization: `Bearer ${serviceUser.apiKey}`
            }, 
            null, 
            productImg)
    ))

    const dbProduct = await service.product.getById(serviceUser, productImages[0].productID)
    await service.gcloud.publishEvent(user, 'product/updated', dbProduct)

    return "ok"
}

exports.dataCheck = async () => {
    console.log("product.dataCheck()")
    const objectsToCsv = require('objects-to-csv')

    const productReport = []
    const errorsProducts = {
        'privateProductWithoutAccountID': false,
        'productMissingImage': false,
        'productMissingVariants': false,
        'publicProductMissingStockxId': false,
        'unexpectedStockxId': false,
        'publicProductWithAccountID': false,
        'accountDuplicatedProduct': false,
        'unexpectedShopifyID': false,
        'missingShopifyID': false,
        'brandMissmatch': false,
        'category2Missmatch': false,
        'genderMissmatch': false,
        'colorMissmatch': false,
        'retailPriceMissmatch': false,
        'releaseDateMissmatch': false,
        'releaseDateInvalid': false,
        'missingShopifyChannelButForeignID': false,
    }

    const dbProducts = await db.product.findAll({
        where: {},
        include: [
            {model: db.productVariant, as :'variants', required: false},
            {model: db.productImage, as :'images', required: false},
            {model: db.account, as :'account', required: false},
        ],
        order: [['id', 'desc']]
    })

    const uniqueAccountProducts = new Set()
    const shopifySaleChannels = await db.saleChannel.findAll({where: {platform: 'shopify'}})
    const publicProductLookupByID = {}
    dbProducts.filter(p => p.public).map(p => {
        publicProductLookupByID[`${p.ID}`] = p
    })
    const dbVariants = []
    dbProducts.map(product => product.variants.map(variant => dbVariants.push(variant)))

    dbProducts.map(product => {
        const hasPublicProduct = publicProductLookupByID[`${product.sourceProductID}`]
        const productAccountKey = `${product.title}_${product.accountID}_${product.status}`
        const accountHasShopify = shopifySaleChannels.find(sc => sc.accountID == product.accountID)

        const report = {
            'productID':                  product.ID,
            'public':                     product.public ? 'YES' : 'NO',
            'accountID':                  product.accountID,
            'account':                    product.account?.name || '',
            'publicProductID':            hasPublicProduct?.ID || '',
            'code':                      product.code,
            'title':                      product.title,
            'variants':                   product.variants.length,
            'images':                    product.images.length,
            'stockxId':                  product.stockxId,
            'status':                  product.status,
            'createdAt':               moment(product.createdAt),
            'productAccountKey':      productAccountKey,
            'brand':                      product?.brand || '',
            'publicProduct.brand':        hasPublicProduct?.brand || '',
            'category2':                  product?.category2 || '',
            'publicProduct.category2':    hasPublicProduct?.category2 || '',
            'gender':                     product?.gender || '',
            'publicProduct.gender':       hasPublicProduct?.gender || '',
            'color':                      product?.color || '',
            'publicProduct.color':        hasPublicProduct?.color || '',
            'retailPrice':                product?.retailPrice || '',
            'publicProduct.retailPrice':  hasPublicProduct?.retailPrice || '',
            'releaseDate':                product?.releaseDate || '',
            'publicProduct.releaseDate':  hasPublicProduct?.releaseDate || '',
            'duplicatedIDs':          '',
        }


        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errorsProducts))

        if (product.public && !product.stockxId) {
            errorsRecord['publicProductMissingStockxId'] = true
        }

        if (!product.public && !product.accountID) {
            errorsRecord['privateProductWithoutAccountID'] = true
        }

        if (product.public == 0 && product.stockxId != null) {
            errorsRecord['unexpectedStockxId'] = true
        }

        if (product.public && product.accountID != null) {
            errorsRecord['publicProductWithAccountID'] = true
        }

        if (product.variants.length == 0) {
            errorsRecord['productMissingVariants'] = true
        }

        if (uniqueAccountProducts.has(productAccountKey) && !['no sku', null, '', 'NO SKU'].includes(product.code) && !product.public && product.status != 'deleted') {
            errorsRecord['accountDuplicatedProduct'] = true
        } else {
            uniqueAccountProducts.add(productAccountKey)
        }

        // images are expected only for public products or products that are linked to public products
        if (hasPublicProduct && product.images.length == 0) {
            errorsRecord['productMissingImage'] = true
        }

        if (product.foreignID && !accountHasShopify) {
            errorsRecord['unexpectedShopifyID'] = true
        }

        if (product.foreignID == null && accountHasShopify && !product.untracked && ((moment() - moment(product.createdAt)) > 1000 * 60 * 60)) { // only if product created more than 1 hr old
            errorsRecord['missingShopifyID'] = true
        }

        if (hasPublicProduct && product.brand != hasPublicProduct.brand) {
            errorsRecord['brandMissmatch'] = true
        }

        if (hasPublicProduct && product.category2 != hasPublicProduct.category2) {
            errorsRecord['category2Missmatch'] = true
        }

        if (hasPublicProduct && product.gender != hasPublicProduct.gender) {
            errorsRecord['genderMissmatch'] = true
        }

        if (hasPublicProduct && product.color != hasPublicProduct.color) {
            errorsRecord['colorMissmatch'] = true
        }

        if (product.releaseDate && !moment(product.releaseDate).isValid()) {
            errorsRecord['releaseDateInvalid'] = true
        }

        if (product.foreignID != null && !accountHasShopify) {
            errorsRecord['missingShopifyChannelButForeignID'] = true
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            productReport.push(report)
        }
    })

    //export
    const attachments = []
    if (productReport.length > 0) {
        const productReportAsString = await new objectsToCsv(productReport).toString()
        const productReportAttachmentBase64 = Buffer.from(productReportAsString).toString('base64')

        if (!configs.onCloud) {
            await (new objectsToCsv(productReport)).toDisk(`./scripts/checksReports/productReport.csv`)
        }

        attachments.push({
            content: productReportAttachmentBase64,
            filename: `products.csv`,
            type: "text/csv",
            disposition: "attachment"
        })
    }
    let message = `<br><br>Products Report<br>`
    for (var errorType in errorsProducts) {
        message += `${productReport.filter(r => r[errorType]).length} - ${errorType}<br>`
    }

    const data = {
        to: ['s.rosa@wiredhub.io'],//, 'a.singhania@wiredhub.io'],
        subject: `[DATA CHECK] - Products Report - ${moment().format('ll')}`,
        body: message,
        attachments: attachments
    }

    try {
        await service.bridge.sendGrid.sendEmail(data)
    } catch (e) {
        console.log(e.response)
    }


}
/**
 * 
 * DEPRECATED ENDPOINTS
 */


exports.matchVariant = async (user, productVariantID, externalAccountID, externalProductVariantID = null) => {
    /**
     * Given a productVariantID and an external account return or generate a match between the two accounts products.
     * The account owner of the productVariantID and the productVariantID belonging to the externalAccountID.
     * 
     * if externalProductVariantID passed, you can skip the auto-match process and hardcode the matching
     */
    logger.info(`Product Match`, {data: {productVariantID: productVariantID, externalAccountID: externalAccountID}})

    logger.silly(`Search for previous match`)
    const match = await db.productMatchLookup.findOne({where: {productVariantID: productVariantID, externalAccountID: externalAccountID}})
    if (match) {
        return service.product.getVariantById( match.externalProductVariantID)
    }

    // match doesn't exist but externalProductVariantID paseed - generate match
    const productVariant = await service.product.getVariantById(productVariantID)
    let externalVariant; 

    if (!match && externalProductVariantID) {
        logger.silly(`Match not found - Create Match Manually`)
        externalVariant = await service.product.getVariantById(externalProductVariantID)
    } else {
        logger.silly(`Match not found - try auto-match`)
        const externalAccountProducts = await service.product.getAll(user, 0, 10, 'code:asc', {accountID: externalAccountID, code: productVariant.product.code})
        const externalAccountAvailableProducts = externalAccountProducts.rows.filter(p => (p.status != 'deleted' && p.untracked == 0))
        if (externalAccountProducts.count > 1 && externalAccountAvailableProducts.length == 0) {
            logger.info(`Impossible to match. Product is deleted or untracked `)
            return null
        }

        const matchedProduct = externalAccountAvailableProducts.find((product) => product?.accountID == externalAccountID)
        const matchedVariant = matchedProduct?.variants.find((_variant) => (_variant.name.trim().toLowerCase() == productVariant.name.trim().toLowerCase()) || (_variant.sourceProductVariantID == productVariant.sourceProductVariantID))

        if (!matchedVariant) {
            logger.silly(`Auto-match failed`)
            return null
        }
        externalVariant = await service.product.getVariantById(matchedVariant.ID)
    }   

    // check if there is already a record fro that exzternalVariant, if there are teo records with the same account ID
    const existingMatch = await db.productMatchLookup.findOne({where: {externalProductVariantID: externalVariant.ID, accountID: productVariant.product.accountID}})
    if (existingMatch) {
        logger.silly(`Existing Variant Match Found`)
        return service.product.getVariantById(existingMatch.productVariantID)
    }

    await db.productMatchLookup.create({
        productVariantID: productVariant.ID, productID: productVariant.productID, accountID: productVariant.product.accountID, 
        externalProductVariantID: externalVariant.ID, externalProductID: externalVariant.product.ID, externalAccountID: externalAccountID}
    )

    return externalVariant
}
