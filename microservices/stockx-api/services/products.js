const configs = require('../configs')
const db = require('../libs/db')
const {Op} = require('sequelize')
const moment = require('moment')
const service = require('./main')

exports.getOne = async (id) => {
    const query = {
        where: {
            [Op.or] : {
                ID: id,
                stockxId: id
            }
        },
        order: [['ID', 'DESC']],
    }

    query.include = [
        { model: db.productVariant, as: 'variants', where: {'hidden': 0}, required:false},
    ]

    return db.product.findOne(query)
}

exports.getAll = async (offset, limit, sort, params) => {
    const query = {
        where: { },
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
            case 'stockxIds':
                query.where.stockxId = params.stockxIds.split(',')
                break;
            case 'stockxId':
                query.where.stockxId = params.stockxId
                break;
            case 'url':
                query.where.url = params.url
                break;
            case 'styleIds':
                query.where.styleId = params.styleIds.split(',')
                break;
            case 'styleId':
                query.where.styleId = params.styleId
                break;
            case 'search':
                query.where[Op.or] = [
                        {'$product.stockxId$': {[Op.substring]: params.search}},
                        {'$product.styleId$': {[Op.substring]: params.search}},
                    ]
                break;
            default:
                break;
        }
    }

    query.include = [
        { model: db.productVariant, required: false, as: 'variants', where: {'hidden': 0}, order: [['variants', 'position', 'asc']]},
    ]

    let results = await db.product.findAndCountAll(query)

    return results
}

exports.getAllVariants = async (offset, limit, sort, params) => {
    const query = {
        where: { },
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [['ID', 'DESC']],
        subQuery: false
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
            case 'stockxIds':
                query.where.stockxId = params.stockxIds.split(',')
                break;
            case 'stockxId':
                query.where.stockxId = params.stockxId
                break;
            case 'search':
                query.where[Op.or] = [
                    {'$stockxIds$': {[Op.substring]: params.search}},
                ]
                break;
            default:
                break;
        }
    }


    query.include = [
        { model: db.product, required: true, as: 'product'},
    ]

    let results = await db.productVariant.findAndCountAll(query)

    return Promise.resolve(results)
}

exports.getOneVariant = async (stockxId) => {
    const query = {
        where: { stockxId: stockxId},
        subQuery: false
    }
    query.include = [
        { model: db.product, required: true, as: 'product'},
    ]

    let results = await db.productVariant.findOne(query)

    return Promise.resolve(results)
}

exports.create = async (stockxProduct) => {
    /**
     * stockx product required as parameter
     */
    console.log(`product.create ${stockxProduct.id} - ${stockxProduct.urlKey}}`)

    let productBody = {
        stockxId: stockxProduct.id,
        url: stockxProduct.urlKey,
        processAt: moment(Date.now() + service.products.calculateTimeToNextPoll(service.products.getBucketNumber(null))),
        importedDate: moment(),
    }
    const extractedStockxProductFeatures = service.products.convertStockxProductToDBProduct(stockxProduct)
    productBody = Object.assign({}, productBody, extractedStockxProductFeatures);

    const [dbProduct] = await db.product.findOrCreate({
        defaults: productBody,
        where: {
            stockxId: productBody.stockxId
        }
    })

    //handle scenario where stockx creates products without variants
    if (!stockxProduct.variants) return service.products.getOne(dbProduct.ID)

    for (var idx = 0 ; idx < stockxProduct.variants.length ; idx++) {
        const stockxVariant = stockxProduct.variants[idx]
        let variantBody = {
            productID: dbProduct.ID,
            stockxId: stockxVariant.id,
            position: idx
        }
        const extractedStockxVariantFeatures = service.products.convertStockxVariantToDBVariant(stockxVariant)
        variantBody = Object.assign({}, variantBody, extractedStockxVariantFeatures);

        const [_dbVariant] = await db.productVariant.findOrCreate({
            defaults: variantBody,
            where: {stockxId: stockxVariant.id}
        })
    }

    return service.products.getOne(dbProduct.ID)
}

exports.update = async (stockxProduct) => {
    /**
     * stockx product required as parameter
     */
    console.log("product.update")
    let deprecatedProduct
    const deprecatedKeyMatches = {} //{newStockxId: oldStockxId}
    let currentProduct = await service.products.getOne(stockxProduct.id)

    if(!currentProduct){
        //throw new Error(`Update Product Failed | Product not found with id ${stockxProduct.id}`)
        // product exists on db - but mightve changed on stock x
        console.log(`Product not found with id ${stockxProduct.id} and url ${stockxProduct.urlKey} | Attempt to update existing product by urlKey`)
        // try to find product by urlKey
        const alternateProducts = await service.products.getAll(0,999, null, {url: stockxProduct.urlKey})
        //check there is only one product match
        if (alternateProducts.rows.length == 1){
            deprecatedProduct = alternateProducts.rows[0]
            //fetch full deprecated product
            deprecatedProduct = await service.products.getOne(deprecatedProduct.ID)
            //update stockxId on product and variants

            //variant updates
            let variantUpdates = []


            for (var variant of deprecatedProduct.variants){
                // try to find exis[ting match by base size that should always be present
                console.log("Attempting to update variant with base size", variant.stockxId, variant.baseSize)
                let stockxVariant = stockxProduct.variants.find(record => record.sizeChart.baseSize.trim().toLowerCase() == variant.baseSize.trim().toLowerCase())
                if (!stockxVariant){
                    console.log("No match found for variant with base size", variant.baseSize)
                }
                else {
                    deprecatedKeyMatches[variant.stockxId] = stockxVariant.id
                   variantUpdates.push(db.productVariant.update({stockxId: stockxVariant.id}, {where: {ID: variant.ID}}))
                }
            }
            await Promise.all(variantUpdates)
            deprecatedKeyMatches[stockxProduct.id] = deprecatedProduct.stockxId
            await db.product.update({stockxId: stockxProduct.id}, {where: {ID: deprecatedProduct.ID}})
            //fetch updated product
            currentProduct = await service.products.getOne(stockxProduct.id)

        } else {
            //can happen if there were no url matches or multiple url matches
            throw new Error(`Deprecated Product Update Failed Incorrect Matches Found `)
        }

    }

    if(!currentProduct){
        //TODO: remove this after issue fixed
        console.log(`Update Product Failed -> `, stockxProduct)
        console.log(`Product not found with id ${stockxProduct.id}`)
        throw new Error(`Update Product Failed | Product not found` )
    }

    const salesLast72HoursChangePercentage = service.products.calculateSalesLast72HoursChangePercentage(currentProduct.salesLast72Hours, stockxProduct.market?.salesInformation?.salesLast72Hours);
    const lastSaleChangePercentage = stockxProduct.market?.statistics?.lastSale?.changePercentage;

    const volatilityScore = service.products.calculateVolatilityPercentage(salesLast72HoursChangePercentage, lastSaleChangePercentage);
    const volatilityScoreChangePercentage = service.products.calculateVolatilityScoreChangePercentage(currentProduct.volatilityScore, volatilityScore);

    const updatedBucketNumber = service.products.getUpdatedBucketNumber(currentProduct.volatilityScore, volatilityScore);

    // update product
    let productUpdates = {
        processAt: moment(Date.now() + service.products.calculateTimeToNextPoll(updatedBucketNumber)),
        salesLast72HoursChangePercentage: salesLast72HoursChangePercentage,
        volatilityScore,
        volatilityScoreChangePercentage
    }
    const extractedStockxProductFeatures = service.products.convertStockxProductToDBProduct(stockxProduct)
    productUpdates = Object.assign({}, productUpdates, extractedStockxProductFeatures);
    await db.product.update(productUpdates, {where: {stockxId: stockxProduct.id}})

    console.log("saving product history record")
    await db.productHistory.create({
        productID:              currentProduct.ID,
        price:               stockxProduct.market?.salesInformation?.lastSale || null,
        salesLast72Hours:  stockxProduct.market?.salesInformation?.salesLast72Hours || 0,
        lastSalePrice:       stockxProduct.market?.salesInformation?.lastSale || null,
        salesLast72HoursChangePercentage:  salesLast72HoursChangePercentage,
        lastSaleChangePercentage:  stockxProduct.market?.statistics?.lastSale?.changePercentage || 0.0,
        volatilityScore:     volatilityScore,
        volatilityScoreChangePercentage:     volatilityScoreChangePercentage,
        updatedBucketNumber:        updatedBucketNumber,
        retailPrice:         stockxProduct.traits.find(trait => trait.name == "Retail Price")?.value.trim().toLowerCase(),
        date: moment()
    });


    console.log("update product variants")
    const queriesForProductVariants = []
    for (var idx = 0 ; idx < stockxProduct.variants.length ; idx++) {
        const stockxVariant = stockxProduct.variants[idx]
        const dbVariant = currentProduct.variants.find(dbVariant => dbVariant.stockxId == stockxVariant.id)
        let variantBody = {
            position: idx
        }

        const extractedStockxVariantFeatures = service.products.convertStockxVariantToDBVariant(stockxVariant)
        variantBody = Object.assign({}, variantBody, extractedStockxVariantFeatures);

        if (dbVariant) {
            queriesForProductVariants.push(db.productVariant.update(variantBody, {where: {ID: dbVariant.ID}}))
        } else {
            variantBody.productID = currentProduct.ID
            variantBody.stockxId = stockxVariant.id

            queriesForProductVariants.push(db.productVariant.create(variantBody))
        }
    }
    await Promise.all(queriesForProductVariants)

    const updatedProduct = await service.products.getOne(stockxProduct.id)

    //append deprecated key matches
    if(deprecatedProduct){
        updatedProduct.previousStockxId = deprecatedKeyMatches[updatedProduct.stockxId]
        updatedProduct.variants.forEach(variant => {
            variant.previousStockxId = deprecatedKeyMatches[variant.stockxId] ? deprecatedKeyMatches[variant.stockxId] : null
        })
    }

    console.log("save variants history")
    await Promise.all(updatedProduct.variants.map(dbVariant => db.productVariantHistory.create({ // save new history record
        productVariantStockxId: dbVariant.stockxId,
        lowestAsk:              dbVariant.lowestAsk ,
        highestBid:             dbVariant.highestBid ,
        numberOfAsks:           dbVariant.numberOfAsks ,
        numberOfBids:           dbVariant.numberOfBids ,
        lastSale:               dbVariant.lastSale ,
        date: moment()
    })))

    return updatedProduct
}

exports.getChartSize = (variant, chartName) => {
    let region = variant.sizeChart.displayOptions.find(opt => opt.type == chartName)
    return region ? region.size : null
}

exports.convertStockxProductToDBProduct = (stockxProduct) => {
    //console.log("convertStockxProductToDBProduct", stockxProduct)
    return {
        brand: stockxProduct.brand.trim().toLowerCase(), // adidas
        category: stockxProduct.productCategory.trim().toLowerCase(), // sneakers
        category2: stockxProduct.primaryCategory.trim().toLowerCase(), // yeezy
        title: stockxProduct.title.trim().toLowerCase(),
        description: stockxProduct.description.trim().toLowerCase(),
        styleId: stockxProduct.styleId,
        imageReferenceUrl: stockxProduct.media.imageUrl,
        price: stockxProduct.market?.salesInformation?.lastSale || null,
        salesLast72Hours: stockxProduct.market?.salesInformation?.salesLast72Hours || 0,
        lastSalePrice: stockxProduct.market?.salesInformation?.lastSale || null,
        lastSaleChangePercentage: stockxProduct.market?.statistics?.lastSale?.changePercentage || 0.0,
        releaseDate: stockxProduct.traits.find(trait => trait.name == "Release Date")?.value || null,
        gender: stockxProduct.gender,
        color: stockxProduct?.traits.find(trait => trait.name == "Colorway")?.value.trim().toLowerCase(),
        retailPrice: stockxProduct?.traits.find(trait => trait.name == "Retail Price")?.value.trim().toLowerCase(),
    }
}

exports.convertStockxVariantToDBVariant = (stockxVariant) => {
    //console.log("convertStockxVariantToDBVariant", stockxVariant)
    const body = {
        lowestAsk:    stockxVariant?.market?.bidAskData?.lowestAsk || stockxVariant?.market?.state?.lowestAsk?.amount || null,
        highestBid:   stockxVariant?.market?.bidAskData?.highestBid || stockxVariant?.market?.state?.highestBid?.amount || null,
        numberOfAsks: stockxVariant?.market?.bidAskData?.numberOfAsks || stockxVariant?.market?.state?.numberOfAsks || null,
        numberOfBids: stockxVariant?.market?.bidAskData?.numberOfBids || stockxVariant?.market?.state?.numberOfBids || null,
        lastSale:     stockxVariant?.market?.salesInformation?.lastSale || null,
        gtin:         stockxVariant.gtins.find(record => record.type == "UPC")?.identifier || null,
        ean13:        stockxVariant.gtins.find(record => record.type == "EAN-13")?.identifier || null,
        hidden:       stockxVariant.hidden,

        usSize:      exports.getChartSize(stockxVariant, 'us'),
        ukSize:      exports.getChartSize(stockxVariant, 'uk'),
        jpSize:      exports.getChartSize(stockxVariant, 'jp'),
        euSize:      exports.getChartSize(stockxVariant, 'eu'),
        usmSize:     exports.getChartSize(stockxVariant, 'us m'),
        uswSize:     exports.getChartSize(stockxVariant, 'us w'),

        baseType:   stockxVariant.sizeChart?.baseType || stockxVariant.traits.size || '',
        baseSize:   stockxVariant.sizeChart?.baseSize || stockxVariant.traits.size || '',
        extraTypes: stockxVariant.sizeChart?.displayOptions.map(record => record.type.trim().toLowerCase()).join(',') || '',
        extraSizes: stockxVariant.sizeChart?.displayOptions.map(record => record.size.trim().toLowerCase()).join(',') || '',
    }

    body.usSize = (body.usSize || body.usmSize || body.uswSize)
    return body
}

/**
 * Used to calculate the percentage change between salesLast72Hours of a product
 */
exports.calculateSalesLast72HoursChangePercentage = (oldValue, newValue) => {
    console.log(`calculateSalesLast72HoursChangePercentage ${oldValue} => ${newValue}`);

    /**
     * Handling edge cases where both values are either null/undefined/0 (0 is falsy is JS) - return 0.0
     */
    if (!oldValue && !newValue) return 0.0;

    /**
     * Edge case where one of the value is null/undefined/0 (0 is falsy is JS) - return the non missing value
     * 
     * LOGIC: 
     *  1. If new value is 0, percentage change formula defaults to 1 which isnt true for the purpose we are trying to achieve
     *      - For instance if oldValue for sales is 30, newValue for sales is 0, the result should be -30 and not 1.0 as its a 30x multiplier
     *  2. If old value is 0, percentage change formula defaults to infinity due to 0 denominator which isnt true for the purpose we are trying to achieve
     *      - For instance if oldValue for sales is 0, newValue for sales is 30, the result should be 30 and not infinity as its a 30x multiplier
     */
    if (!oldValue) return newValue;
    if (!newValue) return -oldValue;

    /**
     * This formula is designed to replicate the formula used by StockX to calculate the lastSaleChangePercentage to have similar relation and scale.
     */
    return (newValue - oldValue) / oldValue;
}

/**
 * Used to calculate percentile for volatility to use for polling interval
 */
exports.calculateVolatilityPercentage = (salesLast72HoursChangePercentageDifference, lastSaleChangePercentageDifference) => {
    console.log("calculateVolatilityPercentage ", {salesLast72HoursChangePercentageDifference, lastSaleChangePercentageDifference});

    /**
     * Handling edge cases where the value is null
     * Ex. if the product is new and has no lastSaleChangePercentage or no salesLast72HoursChangePercentage
     * Ex. if the stockx product response has missing variable or parsing breaks
     */
    if (!salesLast72HoursChangePercentageDifference) salesLast72HoursChangePercentageDifference = 0;
    if (!lastSaleChangePercentageDifference) lastSaleChangePercentageDifference = 0;

    /**
     * Volatilty score is calculated by doing a simple average of the two variables.
     * 
     * NOTE: Math.abs is performed because we want to calculate total volatility. Volatility itself is directionless.
     * NOTE: Denominator is set to 2 as combined range is 0-2 for most general cases.
     */
    return (Math.abs(salesLast72HoursChangePercentageDifference) + Math.abs(lastSaleChangePercentageDifference)) / 2;
}

/**
 * Used to calculate percentage change between volatility scores
 */
exports.calculateVolatilityScoreChangePercentage = (oldValue, newValue) => {
    console.log(`calculateVolatilityScoreChangePercentage ${oldValue} => ${newValue}`);

    /**
     * Handling edge cases where both values are either null/undefined/0 (0 is falsy is JS) - return 0.0
     */
    if (!oldValue && !newValue) return 0.0;

    /**
     * Edge case where one of the value is null/undefined/0 (0 is falsy is JS) - return the non missing value
     * 
     * LOGIC: 
     *  1. If new value is 0, percentage change formula defaults to 1 which isnt true for the purpose we are trying to achieve
     *      - For instance if oldValue for volatility is 1.1, newValue for volatility is 0, the result should be -1.1 and not 1.0 as its a 1.1x multiplier
     *  2. If old value is 0, percentage change formula defaults to infinity due to 0 denominator which isnt true for the purpose we are trying to achieve
     *      - For instance if oldValue for volatility is 0.0, newValue for volatility is 1.2, the result should be 1.2 and not infinity as its a 1.2x multiplier
     */
    if (!oldValue) return newValue;
    if (!newValue) return -oldValue;

    /**
     * This formula is designed to replicate the formula used by StockX to calculate the lastSaleChangePercentage to have similar relation and scale.
     */
    return (newValue - oldValue) / oldValue;
}

/**
 * Takes volatility score and calculates what bucket it should be placed in
 */
exports.getBucketNumber = (volatilityScore) => {
    console.log("getBucketNumber", volatilityScore);

    /**
     * If volatility score does not exists for a product, we place it in somewhat high bucket so it is updated faster to attain more info.
     * Bucket 7 is polled approximately every 2.1 days.
     * 
     * We check for hard comparison with null and not !volatilityScore because 0 is falsy in JS and 0.0 volatility should not auto shift to high bucket.
     */
    if (volatilityScore === null) return 7;

    /**
     * If volatility score is greater than or equal to 1 (rare cases with very high volatility or new products), we place it in the highest bucket.
     * If volatility score is between 0 and 1, we place it in the bucket corresponding to the volatility score for that bucket.
     */
    return volatilityScore >= 1 ? 9 : Math.floor(volatilityScore * 10);
}

/**
 * Used to calculate the final bucket the product shall be placed in after volatility score change
 */
exports.getUpdatedBucketNumber = (oldVolatilityScore, newVolatilityScore) => {
    console.log(`getUpdatedBucketNumber  ${oldVolatilityScore} => ${newVolatilityScore}`);

    /**
     * If volatility score does not exists for a product, we place it in somewhat high bucket so it is updated faster to attain more info.
     * Bucket 7 is polled approximately every 2.1 days.
     * 
     * We check for hard comparison with null and not !volatilityScore because 0 is falsy in JS and 0.0 volatility should not auto shift to high bucket.
     */
    if (oldVolatilityScore === null) return 7;

    const oldBucketNumber = service.products.getBucketNumber(oldVolatilityScore);
    const newBucketNumber = service.products.getBucketNumber(newVolatilityScore);

    /**
     * We use mean of the two buckets to calculate the final bucket number.
     * Mean is used to move products slowly across the buckets to avoid sudden jumps.
     * 
     * if oldBucketNumber > newBucketNumber, we use floor so final result eventually gets to the exact bucket for that volatility.
     * - For instance if oldBucketNumber is 5 and newBucketNumber is 4, we want to move the product to bucket 4 and not keep it at 5.
     * 
     * if oldBucketNumber <= newBucketNumber, we use ceil so final result eventually gets to the exact bucket for that volatility.
     * - For instance if oldBucketNumber is 4 and newBucketNumber is 5, we want to move the product to bucket 5 and not keep it at 4.
     */
    return oldBucketNumber > newBucketNumber ? Math.floor((oldBucketNumber + newBucketNumber) / 2) : Math.ceil((oldBucketNumber + newBucketNumber) / 2);
}

/**
 * Based on bucket number, assigns a time for next polling interval
 */
exports.calculateTimeToNextPoll = (bucketNumber) => {
    console.log("calculateTimeToNextPoll", bucketNumber);

    /**
     * Just a constant map to map bucket number to time in ms
     */
    const POLL_INTERVAL_MAP = {
        '0': 778680000, // volatilityScore 0.0 - 0.1 ; 0.0 is inclusive, 0.1 is exclusive ; 778680000 ms 261.3 hrs approx 9 days
        '1': 693360000, // volatilityScore 0.1 - 0.2 ; 0.1 is inclusive, 0.2 is exclusive ; 693360000 ms 192.6 hrs
        '2': 608040000, // volatilityScore 0.2 - 0.3 ; 0.2 is inclusive, 0.3 is exclusive ; 608040000 ms 168.9 hrs
        '3': 522720000, // volatilityScore 0.3 - 0.4 ; 0.3 is inclusive, 0.4 is exclusive ; 522720000 ms 145.2 hrs
        '4': 437400000, // volatilityScore 0.4 - 0.5 ; 0.4 is inclusive, 0.5 is exclusive ; 437400000 ms 121.5 hrs
        '5': 352080000, // volatilityScore 0.5 - 0.6 ; 0.5 is inclusive, 0.6 is exclusive ; 352080000 ms 97.8 hrs
        '6': 266760000, // volatilityScore 0.6 - 0.7 ; 0.6 is inclusive, 0.7 is exclusive ; 266760000 ms 74.1 hrs
        '7': 181440000, // volatilityScore 0.7 - 0.8 ; 0.7 is inclusive, 0.8 is exclusive ; 181440000 ms 50.4 hrs
        '8': 96120000, // volatilityScore 0.8 - 0.9 ; 0.8 is inclusive, 0.9 is exclusive ; 96120000 ms 26.7 hrs
        '9': 10800000 // volatilityScore 0.9 - inf ; 0.9 and above ; 10800000 ms 3 hours
    };

    return POLL_INTERVAL_MAP[bucketNumber.toString()];
}
