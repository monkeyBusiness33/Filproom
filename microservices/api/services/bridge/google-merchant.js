const logger = require("../../libs/logger");
const service = require("../main");
const db = require("../../libs/db");
const configs = require("../../configs");
const {google} = require('googleapis');
const utils = require("../../libs/utils");

const gmerchantAccounts = {
    3: {
        merchantId: '206634798',
        filename: 'edit-ldn.json',
        feedId: '10100601624',
        priceCurrency: 'GBP',
        feeds: [
            {targetCountry: 'GB', contentLanguage: 'en', currency: 'GBP'},
            {targetCountry: 'US', contentLanguage: 'en', currency: 'USD'},
        ]
    },
    2530: {
        merchantId: '771657436',
        filename: 'onestreet.json',
        feedId: '10102880886',
        priceCurrency: 'EUR',
        feeds: [
            {targetCountry: 'IT', contentLanguage: 'it', currency: 'EUR'},
        ]
    },
    2211: {
        merchantId: '5089742063',
        filename: 'belfagorsneakers.json',
        feedId: '10312049499',
        priceCurrency: 'EUR',
        feeds: [
            {targetCountry: 'IT', contentLanguage: 'it', currency: 'EUR'},
        ]
    },
}

//G-Merchant supported values: male, female, unisex
const genderMapping = {
    "infant":    "unisex",
    "toddler":   "unisex",
    "preschool": "unisex",
    "child":     "unisex",
    "men":       "male",
    "women":     "female",
    "unisex":    "unisex",
}

//G-merchant supported values: newborn,infant,toddler,kids,adult
const ageGroupMapping = {
    "infant":    "infant",
    "toddler":   "toddler",
    "preschool": "kids",
    "child":     "kids",
    "men":       "adult",
    "women":     "adult",
    "unisex":    "adult",
}

getClient = (accountID) => {
    const auth = new google.auth.GoogleAuth({
        keyFile: `./libs/${gmerchantAccounts[accountID].filename}`,
        scopes: ['https://www.googleapis.com/auth/content'],
    });
    return google.content({
        version: 'v2.1',
        auth: auth
    })
}

exports.product = {
    fetchAll: async (user, accountID) => {
        const gcontent = getClient(accountID)
        const accountMerchantConfig = gmerchantAccounts[accountID]

        const data = []
        let param = {
            merchantId: accountMerchantConfig.merchantId,
            maxResults: 250
        }
        while (true) {
            try {
                const resp = await gcontent.products.list(param)
                data.push(...resp.data.resources)
                param['pageToken'] = resp.data.nextPageToken
                console.log(resp.data.nextPageToken, data.length)
                if (!resp.data.nextPageToken) {
                    break
                }
            } catch (e) {
                console.log(e.response.data.error)
            }
        }

        return data
    }
}

exports.variant = {
    update: async (user, body) => {
        /**
         * 
         * @param{number} body.variantID
         * @param{number} body.data.price
         */
        logger.info("Google merchant variant/update", {data: body})

        const productVariant = await service.product.getVariantById(body.variantID)

        if (!(productVariant.product.accountID in gmerchantAccounts)) {
            console.log("account doesn't have google merchant")
            return 
        }

        const gcontent = getClient(productVariant.product.accountID)
        const accountMerchantConfig = gmerchantAccounts[productVariant.product.accountID]

        for (const feed of accountMerchantConfig.feeds) {

            const requestBody = {
                merchantId: accountMerchantConfig.merchantId,
                feedId: accountMerchantConfig.feedId,
                //productId: `online:${feed.contentLanguage}:${accountMerchantConfig.targetCountry}:shopify_${accountMerchantConfig.targetCountry}_${productVariant.product.foreignID}_${productVariant.foreignID}`,
                requestBody: {
                    channel: 'online',
                    contentLanguage: feed.contentLanguage,
                    targetCountry: feed.targetCountry,
                    offerId: `shopify_${feed.targetCountry}_${productVariant.product.foreignID}_${productVariant.foreignID}`,
                    feedLabel: feed.targetCountry
                }
            }
    
            if (productVariant.product.color) {
                requestBody.requestBody.color = productVariant.product.color
            }
    
            if (productVariant.product.gender) {
                requestBody.requestBody.gender = genderMapping[productVariant.product.gender]
                requestBody.requestBody['age_group'] = ageGroupMapping[productVariant.product.gender]
            }
    
            if (productVariant.gtin) {
                requestBody.requestBody.gtin = productVariant.gtin
            }
    
            //for edit ldn - don't use size system for now
            if (productVariant.product.accountID == 3) {
                requestBody.requestBody.sizes = productVariant.name
            } else if (feed.targetCountry == "GB" && productVariant.ukSize) {
                requestBody.requestBody.sizes = productVariant.ukSize.substring(3) //remove UK<space>
                requestBody.requestBody.size_system = 'UK'
            } else if (feed.targetCountry == "IT" && productVariant.euSize) {
                requestBody.requestBody.sizes = productVariant.euSize.substring(3) //remove EU<space>
                requestBody.requestBody.size_system = 'EU'
            } else if (feed.targetCountry == "US" && productVariant.usSize) {
                requestBody.requestBody.sizes = productVariant.usSize.substring(3) //remove US<space>
                requestBody.requestBody.size_system = 'US'
            }
    
            if (body.data?.price) {
                console.log(accountMerchantConfig.priceCurrency, feed.currency, utils.getExchangeRate(accountMerchantConfig.priceCurrency, feed.currency))

                requestBody.requestBody.price = {
                    value: body.data.price * utils.getExchangeRate(accountMerchantConfig.priceCurrency, feed.currency),
                    currency: feed.currency
                }
            }
    
            //updates.product_type = ''//brand > category > category2
            //requestBody.updateMask = Object.keys(requestBody.requestBody).join(',')
            logger.info("Google merchant - update listing ", {data: requestBody})
            if (configs.environment != "prod") {
                return requestBody
            }
    
            try {
                const resp = await gcontent.products.insert(requestBody)
            } catch (e) {
                if (e.response.code == 404) {
                    logger.warn(`Google Merchant ${feed.targetCountry} Listing - variantID ${body.variantID} not found`)
                } else {
                    logger.warn(`Google Merchant Listing Update Response ${e.response.code}`, {data: e.response.data})
                    continue
                }
                //might happen that product is not on google merchant yet since we don't create products but we only update them . So don't throw error
                //throw {status: e.response.data.error.code, message: e.response.data.error.message}
            }
        }

    },
}
