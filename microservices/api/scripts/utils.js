const fs = require('fs')
const axios = require('axios')
const moment = require('moment')
const service = require('../services/main')

exports.getShopifyProducts = async (accountID, refetch = false) => {
    let shopifyProducts = []
    const serviceUser = await service.account.serviceUser(accountID)
    // get shopify client and session
    const {shopify, shopifySession} = await service.bridge.shopify.client( accountID)
    const dumpedFilePath = `./scripts/data/shopify_products_accountID_${accountID}.json`

    const productsCount = (await shopify.rest.Product.count({session: shopifySession})).count;

    const storename = shopify.config.hostName.split('.')[0]
    // check if products already dumped
    if (fs.existsSync(dumpedFilePath) && !refetch) {
        shopifyProducts = JSON.parse(fs.readFileSync(dumpedFilePath, 'utf8'))
        if (productsCount == shopifyProducts.length) {
            return shopifyProducts
        } else {
            console.log(`New Products to Fetch: ${productsCount - shopifyProducts.length}`)
            shopifyProducts = []
        }
    }

    console.log(`Fetching Shopify Products for ${storename}`)
    let idx = 0
    let pageInfo;

    do {
        const response = await shopify.rest.Product.all({
            ...pageInfo?.nextPage?.query,
            session:shopifySession,
            limit: 250,
        });

        const pageProducts = response.data;
        shopifyProducts = shopifyProducts.concat(pageProducts)
        idx += pageProducts.length
        console.log(`${idx}/${productsCount}`)

        pageInfo = response.pageInfo;
    } while (pageInfo?.nextPage);


    console.log(`>> Dumped ${shopifyProducts.length} Products`)

    // add sale channel form where they coming from to every product
    shopifyProducts = shopifyProducts.map(product => {
        product.saleChannel = storename
        return product
    })

    fs.writeFileSync(dumpedFilePath, JSON.stringify(shopifyProducts))

    return shopifyProducts
}

exports.getShopifyOrders = async (accountID, refetch = false) => {
    let shopifyOrders = []
    let shopifyFulfillments = []
    const serviceUser = await service.account.serviceUser(accountID)
    // get shopify client and session
    const {shopify, shopifySession} = await service.bridge.shopify.client( accountID)
    const dumpedOrdersFilePath = `./scripts/data/shopify_orders_accountID_${accountID}.json`
    const dumpedFulfillmentsFilePath = `./scripts/data/shopify_fulfillments_accountID_${accountID}.json`
    const storename = shopify.config.hostName.split('.')[0]


    // check if orders dump is updated
    if (fs.existsSync(dumpedOrdersFilePath) && fs.existsSync(dumpedFulfillmentsFilePath) && !refetch) {
        shopifyOrders = JSON.parse(fs.readFileSync(dumpedOrdersFilePath, 'utf8'))
        shopifyFulfillments = JSON.parse(fs.readFileSync(dumpedFulfillmentsFilePath, 'utf8'))

        if (shopifyOrders.length != 0) {
            const latestOrderFetched = shopifyOrders[0]
            const latestOrdersResp = await shopify.rest.Order.all({
                session: shopifySession,
                status:'any',
                since_id: latestOrderFetched.id,
            })
    
            const latestOrders = latestOrdersResp.data
            const latestOrderOnShopify = latestOrders[latestOrders.length - 1]
    
            if (!latestOrderOnShopify || latestOrderFetched.id == latestOrderOnShopify.id) {
                return {shopifyOrders, shopifyFulfillments}
            } else {
                shopifyOrders = []
            }
        }

    }

    const sinceDatetime = moment().subtract(30, 'days')
    console.log(`>> Fetching Orders since ${sinceDatetime.toISOString()}`)
    const ordersCount = (await shopify.rest.Order.count({session: shopifySession, status:'any', created_at_min: sinceDatetime.toISOString()})).count;

    console.log(`Fetching Shopify Orders`)
    let idx = 0
    let pageInfo;
    do {
        let options = {
            session:shopifySession,
            status:'any',
            created_at_min: sinceDatetime.toISOString(),
            limit: 250,
        };
        if (pageInfo?.nextPage) {
            options = {
                session: shopifySession,
                ...pageInfo?.nextPage?.query,
                limit: 250,
            };
        }
        const response = await shopify.rest.Order.all(options);

        const pageOrders = response.data;
        shopifyOrders = shopifyOrders.concat(pageOrders)
        idx += pageOrders.length
        console.log(`${idx}/${ordersCount}`)
        pageInfo = response.pageInfo;
    } while (pageInfo?.nextPage);


    // add sale channel form where they coming from to every product
    shopifyOrders = shopifyOrders.map(order => {
        order.saleChannel = storename
        order.fulfillments.map(fulfillment => {
            fulfillment.saleChannel = storename
            shopifyFulfillments.push(fulfillment)
        })
        return order
    })


    console.log(`>> Dumped ${shopifyOrders.length} Orders`)
    console.log(`>> Dumped ${shopifyFulfillments.length} Fulfillments`)


    fs.writeFileSync(dumpedOrdersFilePath, JSON.stringify(shopifyOrders))
    fs.writeFileSync(dumpedFulfillmentsFilePath, JSON.stringify(shopifyFulfillments))
    return {shopifyOrders, shopifyFulfillments}
}

exports.generateDictionary = (dataArray, key) =>{
    const dictionary = {}
    dataArray.map(_var => {
        const key = `${_var[`${key}`]}`
        dictionary[key] = _var
    })
    return dictionary
}



exports.batchArray = (array, batchSize) =>{
    const batchedArrays = []
    while (array.length > 0) {
        batchedArrays.push(array.splice(0,batchSize))
    }
    return batchedArrays
}


exports.processBatchedRequests = async (batchedRequests) => {
    let count = 1
    for (let batch of batchedRequests){
        console.log(batch)
        await Promise.all(batch)
        console.log('Completed requestBatch: ', count, '/', batchedRequests.length)
        count ++
    }
}

exports.getStockxProducts = async () => {
    let stockxProducts = []
    const dumpedFilePath = './scripts/data/stockx_products.json'

    // count check - fetch only if count is different
    const resp = await axios.get('https://production-stockx-api-6dwjvpqvqa-nw.a.run.app/api/products', {params: {}})
    const productsCount = resp.data.count

 
    // check if products already dumped
    if (fs.existsSync(dumpedFilePath)) {
        stockxProducts = JSON.parse(fs.readFileSync(dumpedFilePath, 'utf8'))

        if (productsCount == stockxProducts.length) {
            return stockxProducts
        } else {
            console.log(`New Products to Fetch: ${productsCount - stockxProducts.length}`)
            stockxProducts = []
        }
    }

    const batchSize = 500
    let batches = Math.ceil(productsCount / batchSize)
    for (let i = 0; i < batches ; i++){
        try{
            const reqParams = {
                offset:  i * batchSize,
                limit:  batchSize,
                sort: 'id:desc'
            }
            //console.log(reqParams)
            const resp = await axios.get('https://production-stockx-api-6dwjvpqvqa-nw.a.run.app/api/products', {params: reqParams})
            stockxProducts = stockxProducts.concat(resp.data.rows)
            batches = Math.ceil(resp.data.count / batchSize)
            console.log(`Fetched ${stockxProducts.length}/${productsCount}`)
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        catch (e) {
            console.log(e)
            continue
        }
    }

    fs.writeFileSync(dumpedFilePath, JSON.stringify(stockxProducts))

    return stockxProducts
}

exports.parseSizeChart = (sizeName, sizeChartCountry = "us") => {
    switch(sizeChartCountry) {
        case "us":
            // get eu size - split by -, searcj us and then trim and lowercase
            const usSize = (sizeName.split("-").find(c => c.trim().toLowerCase().includes("us")) || '').trim().toLowerCase()
            return usSize.replace("us", "").replace("m", "").replace("w", "").replace("c", "").replace("y", "").replace("*", "").replace("(", "").replace(")", "").trim()
        case "eu":
            // split by -, lowercase, trim, find eu. remove eu, remove ( and )
            const euSize = (sizeName.split("-").find(c => c.trim().toLowerCase().includes("eu")) || '').trim().toLowerCase()
            if (euSize.includes("eu 38.5")) {
                return "38.5"
            }
            return euSize.replace("eu", "").replace("(", "").replace(")", "").trim()
    }
}

//sleep function
exports.sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.areVariantsEqual = (variantName1, variantName2) => {
    const euSize1 = exports.parseSizeChart(variantName1, "eu")
    const usSize1 = exports.parseSizeChart(variantName1, "us")
    const euSize2 = exports.parseSizeChart(variantName2, "eu")
    const usSize2 = exports.parseSizeChart(variantName2, "us")
    return ((euSize1 && euSize1 == euSize2) || (usSize1 && usSize1 == usSize2) || (variantName1.trim().toLowerCase() == variantName2.trim().toLowerCase()))
}
