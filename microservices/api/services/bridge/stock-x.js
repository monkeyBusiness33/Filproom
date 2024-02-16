const logger = require("../../libs/logger");
const service = require("../main");
const db = require("../../libs/db");
const {Op} = require("sequelize");
const configs = require("../../configs");
const {v1: uuidv1} = require("uuid");
const utils = require('../../libs/utils')
const moment = require('moment')
const axios = require('axios')

exports.webhook = {
    productCreated: async (stockxProduct) => {
        logger.info("stockx.webhook.productCreated")
        // check if already created
        const dbStockxProduct = await db.product.findOne({where: {stockxId: stockxProduct.stockxId}})

        if (dbStockxProduct) {
            logger.info(`Stock X webhook product/created ${stockxProduct.stockxId} already exists`)
            return
        }

        //Parse stock-x product into correct format so that it can be created on the database
        if (stockxProduct.imageReferenceUrl.indexOf('?') != -1) {
            stockxProduct.imageReferenceUrl = stockxProduct.imageReferenceUrl.slice(0, stockxProduct.imageReferenceUrl.indexOf('?'))
            //handle special characters
            const urlList = stockxProduct.imageReferenceUrl.split('/')
            urlList[urlList.length - 1] = encodeURIComponent(urlList[urlList.length - 1])
            stockxProduct.imageReferenceUrl = urlList.join("/")
        }

        //download the image as save it locally as base64
        let imageBase64;
        try {
            const resp = await axios({
                method: 'get',
                url: stockxProduct.imageReferenceUrl,
                responseType: 'arraybuffer'
            })
            imageBase64 = Buffer.from(resp.data, 'binary').toString('base64')
        } catch (e) {
            logger.error(`Error downloading image for product ${stockxProduct.stockxId}`)
        }

        const publicProduct = {
            code: stockxProduct.styleId,
            title: stockxProduct.title,
            description: stockxProduct.description,
            weight: 0.001,
            volume: 0.001,
            pieces: 1,
            public: 1,
            category: stockxProduct.category,
            images: [],
            stockxId: stockxProduct.stockxId,
            variants: [],
            //new features for product
            brand: stockxProduct.brand,
            category2: stockxProduct.category2,
            releaseDate: stockxProduct.releaseDate,
            gender: stockxProduct.gender,
            color: stockxProduct.color,
            retailPrice: stockxProduct.retailPrice,
            salesLast72Hours:  stockxProduct.salesLast72Hours,
            salesLast72HoursChangePercentage: stockxProduct.salesLast72HoursChangePercentage,
            lastSalePrice: stockxProduct.lastSalePrice,
            lastSaleChangePercentage:  stockxProduct.lastSaleChangePercentage,
            volatilityScore:     stockxProduct.volatilityScore,
            volatilityScoreChangePercentage: stockxProduct.volatilityScoreChangePercentage,
        }

        if (imageBase64) {
            publicProduct.images.push({base64: imageBase64})
        }

        stockxProduct.variants.map(_variant => {
            // get correct variant name
            let variantName = 'default'
            if (_variant.extraSizes == '' && _variant.baseSize != '') {
                variantName = _variant.baseSize + _variant.baseType
            } else if (_variant.extraSizes != '' && _variant.extraSizes != null) {
                variantName = _variant.extraSizes.replace(/,/g, ' - ')
            }

            publicProduct.variants.push({
                name: variantName,
                price: _variant.lowestAsk,
                position: _variant.position,
                stockxId: _variant.stockxId,
                gtin:   _variant.gtin,
                usSize: _variant.usSize ,
                ukSize: _variant.ukSize,
                jpSize: _variant.jpSize,
                euSize: _variant.euSize,
                usmSize: _variant.usmSize,
                uswSize: _variant.uswSize,
                status: 'active',
                untracked: 0
            })
        })

        return service.product.create(null, publicProduct, {forceCreate: true})
    },
    productUpdated: async (stockxProduct) => {
        /**
         * 
         * 
         */
        // TAke new price form stock X and update variants that are synced with a margin
        logger.info(`stockx.webhook.productUpdated ${stockxProduct.stockxId}`)

        //if stockxId changed for a product - update the stockxid to product and variants
        if(stockxProduct.previousStockxId){
            logger.info(`Updating Deprecated Stock X Product with stockxId ${stockxProduct.stockxId} and url key ${stockxProduct.urlKey}`)
            await db.product.update({stockxId: stockxProduct.stockxId}, {where: {stockxId: stockxProduct.previousStockxId}})
            //update stockxProduct.variants with new stockxId
            const oldVariantRequests = []
            stockxProduct.variants.map(_variant => {
                if(_variant.previousStockxId){
                    //update stockxId
                    oldVariantRequests.push(db.productVariant.update({stockxId: _variant.stockxId}, {where: {stockxId: _variant.previousStockxId}}))
                }
            })
            await Promise.all(oldVariantRequests)
        }

        /**
        //marketplace listing supdate - deprecated
        logger.info(`Update Marketplace listings for product ${stockxProduct.stockxId}`)
        const marketplaceListings = await db.marketplaceListing.findAll({
            include: [
                {model: db.productVariant, as: 'variant', where: { stockxId: stockxProduct.variants.map(_stockxVar => _stockxVar.stockxId), status: 'active', untracked: 0}},
                {model: db.status, as: 'status', required: true, where: {name: {[Op.and]: [{[Op.ne]: 'deleted'}, {[Op.ne]: 'claimed'}]}}}
            ]
        })

        const marketplaceUpdates = []
        for (let stockxVariant of stockxProduct.variants){
            //update marketplace listings steals
            const mplStealTrue = marketplaceListings.filter(mpListing => mpListing.variant.stockxId == stockxVariant.stockxId && mpListing.price <= stockxVariant.lowestAsk)
            const mplStealFalse = marketplaceListings.filter(mpListing =>  mpListing.variant.stockxId == stockxVariant.stockxId && mpListing.price > stockxVariant.lowestAsk)
            if(mplStealTrue.length> 0)marketplaceUpdates.push(db.marketplaceListing.update({steal: true},{where: {ID: mplStealTrue.map(mpl => mpl.ID)}}))
            if(mplStealFalse.length> 0) marketplaceUpdates.push(db.marketplaceListing.update({steal: false},{where: {ID: mplStealFalse.map(mpl => mpl.ID)}}))
        }
        await Promise.all(marketplaceUpdates)
        */

        // get all private variants linked to public variants in order to update their listings
        const privateVariants = await db.productVariant.findAll({
            where: {
                untracked: 0,
            },
            include: [{
                model: db.productVariant,
                as: 'sourceProductVariant',
                required: true,
                where: {
                    stockxId: stockxProduct.variants.map(_stockxVar => _stockxVar.stockxId),
                }
            },
            {model: db.product, as: 'product'}
        ]
        })


        // get all active listings with priceSourceName set
        logger.info(`Fetch Listings`)
        const inventoryListings = await db.inventoryListing.findAll({
            where: {
                status: ['active', 'drafted'],
                productVariantID: privateVariants.map(variant => variant.ID),
                priceSourceName: 'stockx'
            },
            include: [
                {model: db.saleChannel, as: 'saleChannel', include: [
                    {model: db.account, as: 'account'} // used to fetch currency to use for the listing
                ]}
            ]
        })

        const listingsUpdatesQueries = []
        const variantsUpdated = new Set()
        //fetch serviceUsers necessary for the update of the listing price
        const uniqueAccountsIDsAffected = [...new Set(privateVariants.map(v => v.product.accountID))]
        const serviceUsers = await Promise.all(uniqueAccountsIDsAffected.map(accountID => service.account.serviceUser(accountID)))

        logger.info(`Update Listings Prices`)
        for (let invListing of inventoryListings) {
            const dbVariant = privateVariants.find(variant => variant.ID == invListing.productVariantID)
            const sourceVariant  = dbVariant.sourceProductVariant
            const updatedStockVariant = stockxProduct.variants.find(_stockxVar => _stockxVar.stockxId == sourceVariant.stockxId)

            //TODO: move these inventory updates to a webhook too?
            if (updatedStockVariant.lowestAsk > 0) {
                //TODO: start to use different regions prices on stock x
                let costPrice = (((updatedStockVariant.lowestAsk) * 1.05) +15) * utils.getExchangeRate('gbp', invListing.saleChannel.account.currency)  // Fee, Shipping
                const margin = invListing.priceSourceMargin
                let unitPrice = (costPrice / (1 - (margin / 100)))
                unitPrice = parseFloat(unitPrice.toFixed(2))
                logger.silly(`DEBUG - Show me the math - stockx ${updatedStockVariant.lowestAsk} costPrice ${costPrice} margin ${margin} unitPrice ${unitPrice}`)
                
                //check if price change exceeds threshold
                const amountChangeRate = Math.abs(1 - (unitPrice / invListing.price))
                //check that update exceeds a determined %2.5 change
                if (amountChangeRate > 0.025) {
                    const serviceUser = serviceUsers.find(user => user.accountID == invListing.accountID)
                    listingsUpdatesQueries.push(service.inventoryListing.update(serviceUser, invListing.ID, {payout: unitPrice}))
                    //Add private variant for updates
                    variantsUpdated.add(dbVariant.ID)
                } else {
                    logger.info(`Listing ${invListing.ID} - Market Price Change Blocked -> RATE_CHANGE (%): ${amountChangeRate * 100} | RATE_THRESHOLD_MARGIN (%): 2.5`)
                }
            }
        }

        // apply changes in batches
        const inventoryListingsBatchUpdates = utils.batchArray(listingsUpdatesQueries, 100)
        for (var batch of inventoryListingsBatchUpdates) {
            await Promise.all(batch)
        }

        // trigger shopify updates
        logger.info(`Update Listings On Shopify`)
        await Promise.all(Array.from(variantsUpdated).map(variantID => {
                return service.gcloud.addTask(
                    'shopify-jobs',
                    'POST',
                    `${configs.microservices.api}/api/bridge/egress/shopify/variant/sync`,
                    {
                        provenance: 'stockx/product/updated',
                    },
                    null,
                    {
                        variantID: variantID,
                    })
                })
        )


        logger.info(`Update Public Product data`)        
        const _pp = await db.product.findOne({where: {stockxId: stockxProduct.stockxId}})
        const publicProduct = await service.product.getById(null, _pp.ID, {includeDeletedVariants: true})
        //update product
        const publicProductUpdates = {
            code: stockxProduct.styleId,
            title: stockxProduct.title,
            description: stockxProduct.description,
            //new features for product
            brand: stockxProduct.brand,
            category: stockxProduct.category,
            category2: stockxProduct.category2,
            releaseDate: stockxProduct.releaseDate,
            gender: stockxProduct.gender,
            color: stockxProduct.color,
            price: stockxProduct.price,
            retailPrice: stockxProduct.retailPrice,
            salesLast72Hours:  stockxProduct.salesLast72Hours,
            salesLast72HoursChangePercentage: stockxProduct.salesLast72HoursChangePercentage,
            lastSalePrice: stockxProduct.lastSalePrice,
            lastSaleChangePercentage:  stockxProduct.lastSaleChangePercentage,
            volatilityScore:     stockxProduct.volatilityScore,
            volatilityScoreChangePercentage: stockxProduct.volatilityScoreChangePercentage,
            variants: []
        }


        //update public and private variants
        const variantsToUpdateOnShopify = []
        for (var stockxv of stockxProduct.variants) {
            const publicv = publicProduct.variants.find(_publicv => _publicv.stockxId == stockxv.stockxId)

            //TODO: variants to create
            if (!publicv) {
                continue
            }

            // get all private variants linked and without gtin (user din't set it manually)
            const privateVariantsToUpdate = privateVariants.filter(_privatev => (_privatev.sourceProductVariantID == publicv.ID && !_privatev.gtin))

            const updates = {
                ID: publicv.ID,
                price: stockxv.lowestAsk > 0 ? stockxv.lowestAsk : null,
            }
            //if gtin available - update it for public and private variants
            if (stockxv?.gtin) {
                updates.gtin = stockxv.gtin
                await db.productVariant.update({gtin: stockxv.gtin}, {where: {ID: privateVariantsToUpdate.map(v => v.ID)}})
                // if some of the private variants are on shopify - update them on shopify later too
                privateVariantsToUpdate.filter(v => v.foreignID != null).map(v => variantsToUpdateOnShopify.push(v))
            }

            publicProductUpdates.variants.push(updates)
        }

        for (var serviceUser of serviceUsers) {
            const accountVariants = variantsToUpdateOnShopify.filter(v => v.product.accountID == serviceUser.accountID)
            await service.product.updateVariantsEgress(serviceUser, accountVariants.map(v => v.ID))
        }

        return service.product.update(null, publicProduct.ID, publicProductUpdates)
    },
}
