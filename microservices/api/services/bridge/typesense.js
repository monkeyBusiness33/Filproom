const db = require('../../libs/db.js')
const logger=require('../../libs/logger.js')
const service = require('../main.js')
const utils = require('../../libs/utils.js')
const Op = require('sequelize').Op
const moment = require('moment')
const configs = require('../../configs.js')

const Typesense = require('typesense')
const tsClient = new Typesense.Client({
        nodes: [{
          host: '4dobaxu5r6sgti2qp.a1.typesense.net', // For Typesense Cloud use xxx.a1.typesense.net
          port: '443',      // For Typesense Cloud use 443
          protocol: 'https'   // For Typesense Cloud use https
        }],
        apiKey: 'usbCLcTWQ3OiDPhg5YESmzTJmQDFuq1x',
        connectionTimeoutSeconds: 5
})

const indexName ={
        'products': configs.environment != "prod" ? 'products-staging' : 'products',
        'addresses': configs.environment != "prod" ? 'addresses-staging' : 'addresses'
}

exports._queryFiltersParser = (filters) => {
        /**
         * This function is used to map our query syntax to the typesense query syntax
         * 
         * our syntax          |  typesense syntax
         * ---------------------------------------
         * !status:     'active'            => status:!=active
         * accountID:   1,2,3,4             => accountID:[1,2,3,4]
         * releaseDate: startValue:endValue => (releaseDate:>startValue || releaseDate:<endValue)
         */

        if ('or' in filters) throw {status: 500, message: 'op operator not yet supported for smart search'}
        
        let query = []
        for (const queryParam in filters) {
                const value = filters[queryParam]
                if (`${value}`.includes("!")) query.push(`${queryParam}:!=${value.replace('!', '')}`)
                else if (`${value}`.includes(",")) query.push(`${queryParam}:[${value}]`)
                else if (`${value}`.includes(":")) {
                        const [greaterThan, lowerThan] = value.split(":")
                        if (greaterThan) query.push(`${queryParam}:>${greaterThan}`)
                        if (lowerThan) query.push(`${queryParam}:<${lowerThan}`)
                }
                else query.push(`${queryParam}:${value}`)
        }

        query = query.join(' && ')
        return query
}

exports.productsIndex = {
        /**
         * 
         * Sorting on a string field is only allowed if that field has the sort property enabled in the collection schema.
         * sort_by=title(missing_values: last):desc
         * 
         */
        search: async (query, filters = {}, sort = 'createdAt:desc', opts={offset: 0 , limit: 50}) => {
                /**
                 * You can exclude words in your query explicitly, prefix the word with the - operator, e.g. q: 'electric car -tesla'
                 * 
                 * Supported searches: "my products", "consignment products", "most sold 72 hrs public products", "latest releases", "upcoming releases"
                 */
                logger.info("typesense.addressesIndex.search", {query, filters, sort, opts});

                const filtersString = service.bridge.typesense._queryFiltersParser(filters)
                const searchParameters = {
                        'q'         : query,
                        'query_by'  : 'code,title,description,brand,account.name', //The order of the fields is important: a record that matches on a field earlier in the list is considered more relevant than a record matched on a field later in the list
                        'filter_by' : filtersString,
                        'sort_by'   : sort.replace(";", ","),
                        'offset'    : opts.offset,
                        'limit'     : opts.limit                }

                const response = await tsClient.collections(indexName.products).documents().search(searchParameters)
                response.hits = response.hits.map((hit) => hit.document)
                return response
        },
        addOrUpdate: async (productID) => {
                /**
                 * This function is used to add or update a product in typesense. The product to add or upudate is identified by productID.
                 * In the scenario where productID is not provided, all products are added or updated. (reindexing) 
                 */
                logger.info("typesense.productIndex.addOrUpdate")
                if (configs.environment == "local") {
                        logger.warn("typesense.productIndex.addOrUpdate skipped for local environment")
                        return 
                }

                const filter = {
                }

                if (productID) {
                        filter.ID = productID
                }
                let dbProducts = await db.product.findAll({
                        where: filter,
                        include: [
                                { model: db.account, as: 'account', attributes: ['ID', 'name']},
                                {model: db.productCategory,  required: false, as: 'category'},
                                {model: db.product, required: false, as: 'sourceProduct'}
                                ],
                        order: [['ID', 'DESC']]
                        },
                )

                //preprocess data for typesense indexing
                dbProducts = dbProducts.map((product) => service.bridge.typesense.productsIndex.prepare(product))
                dbProductsBatched = utils.batchArray(dbProducts, 1000)
                let idx = 0
                for (const batch of dbProductsBatched) {
                        console.log(idx, dbProductsBatched.length)
                        await tsClient.collections(indexName.products).documents().import(batch, {action: 'upsert'})
                        idx += 1
                        //sleep for 1 second to avoid rate limiting using set timeout and not utils.sleep since we are in a loop
                        await new Promise(resolve => setTimeout(resolve, 100));
                }
        },
        prepare: (dbProduct) => {
                /**
                 * This function is used to prepare a product object for typesense indexing
                 */

                //strip all sequelize metadata
                dbProduct = JSON.parse(JSON.stringify(dbProduct))

                //typsense identifier is id and id should be a string
                dbProduct.id = `${dbProduct.ID}`

                //typesense doesn't support boolean - convert to number instead
                dbProduct.public = dbProduct.public ? 1 : 0

                //typesense doesn't support date - convert to number instead
                dbProduct.createdAt_unix = moment(dbProduct.createdAt).unix()
                dbProduct.releaseDate_unix = moment(dbProduct.releaseDate).unix()

                return dbProduct
        },
        setupIndex: async (_indexName = indexName.products) => {
                logger.info("typesense.productIndex.setupIndex")
                await tsClient.collections().create({
                        "name": _indexName,
                        "fields": [
                        {
                        "name": ".*",
                        "optional": true,
                        "sort": false,
                        "type": "auto"
                        },
                        {
                        "name": "createdAt",
                        "type": "string",
                        "facet": true,
                        "optional": false,
                        "sort": true
                        },
                        {
                        "name": "createdAt_unix",
                        "type": "int64",
                        "facet": true,
                        "optional": false,
                        },
                        {
                        "name": "title",
                        "type": "string",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        {
                        "name": "description",
                        "type": "string",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        {
                        "name": "code",
                        "type": "string",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        {
                        "name": "releaseDate_unix",
                        "type": "int64",
                        "facet": true,
                        "optional": true,
                        },
                        {
                        "name": "salesLast72Hours",
                        "type": "int32",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        {
                        "name": "releaseDate",
                        "type": "string",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        ],
                        "default_sorting_field": "createdAt",
                        "enable_nested_fields": true
                })
                
        }
}

exports.addressesIndex = {
        search: async (query, filters = '', sort = 'createdAt:desc', opts = {offset: 0, limit: 50}) => {
                /**
                 * This method performs a search on the Typesense addresses collection.
                 * It uses query parameters and optional filters, sort, and pagination options.
                 */
                logger.info("typesense.addressesIndex.search", {query, filters, sort, opts});
                const filtersString = service.bridge.typesense._queryFiltersParser(filters)

                const searchParameters = {
                    'q': query,
                    'query_by': 'fullName, address, city, postcode, country',
                    'filter_by': filtersString,
                    'sort_by': sort.replace(";", ","),
                    'offset': opts.offset,
                    'limit': opts.limit
                }
        
                const response = await tsClient.collections(indexName.addresses).documents().search(searchParameters);
                response.hits = response.hits.map((hit) => hit.document)
                return response
            },

        addOrUpdate: async (addressID) => {
                logger.info("typesense.addressesIndex.addOrUpdate")
                if (configs.environment == "local") {
                        logger.warn("typesense.addressesIndex.addOrUpdate skipped for local environment")
                        return 
                }

                const filter = {}
                if (addressID) {
                        filter.ID = addressID
                }
                const dbAddresses = await db.address.findAll({
                        where: filter,
                        include: [
                                { model: db.account, attributes: ['ID', 'name'], as: 'account'},
                        ]})
                dbAddresses.forEach((address, idx) => {
                        //convert date to unix timestamp so that can be sorted using typesense
                        dbAddresses[idx] = service.bridge.typesense.addressesIndex.prepare(dbAddresses[idx])
                })

                dbAddressesBatched = utils.batchArray(dbAddresses, 1000)
                let idx = 0
                for (const batch of dbAddressesBatched) {
                        console.log(idx, dbAddressesBatched.length)
                        await tsClient.collections(indexName.addresses).documents().import(batch, {action: 'upsert'})
                        idx += 1
                        //sleep for 1 second to avoid rate limiting using set timeout and not utils.sleep since we are in a loop
                        await new Promise(resolve => setTimeout(resolve, 100));
                }
        },
        prepare: (dbAddress) => {
                /**
                 * This function is used to prepare a address object for typesense indexing
                 */

                //strip all sequelize metadata
                dbAddress = JSON.parse(JSON.stringify(dbAddress))

                //typsense identifier is id and id should be a string
                dbAddress.id = `${dbAddress.ID}`


                //typesense doesn't support date - convert to number instead
                dbAddress.createdAt_unix = moment(dbAddress.createdAt).unix()

                return dbAddress
        },
        setupIndex: async (_indexName = indexName.addresses) => {
                logger.info("typesense.addressesIndex.setupIndex")
                await tsClient.collections().create({
                        "name": _indexName,
                        "fields": [
                        {
                        "name": ".*",
                        "optional": true,
                        "sort": false,
                        "type": "auto"
                        },
                        {
                        "name": "createdAt",
                        "type": "string",
                        "facet": true,
                        "optional": false,
                        "sort": true
                        },
                        {
                        "name": "createdAt_unix",
                        "type": "int64",
                        "facet": true,
                        "optional": false,
                        },
                        {
                        "name": "fullName",
                        "type": "string",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        {
                        "name": "address",
                        "type": "string",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        {
                        "name": "city",
                        "type": "string",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        {
                        "name": "postcode",
                        "type": "string",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        {
                        "name": "country",
                        "type": "string",
                        "facet": true,
                        "optional": true,
                        "sort": true
                        },
                        ],
                        "default_sorting_field": "createdAt",
                        "enable_nested_fields": true
                })         
        }
}
