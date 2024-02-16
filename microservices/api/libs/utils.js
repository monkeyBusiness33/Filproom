const fs = require('fs')
const Op = require('sequelize').Op;
const db = require('./db')
const configs = require('../configs')

const rateLimit = require('express-rate-limit');

exports.rateLimiterAPI = rateLimit({
  windowMs: 1000, //  5s in milliseconds
  max: 2, // which represents the number of allowed requests per window per user
  message: 'You hit the maximum of 2 requests per 5 seconds!', // which specifies the response message users get when they have exceeded the allowed limit
  standardHeaders: true, // which specifies whether the appropriate headers should be added to the response showing the enforced limit (X-RateLimit-Limit), current usage (X-RateLimit-Remaining), and time to wait before retrying (Retry-After) when the limit is reached
  legacyHeaders: false,
  skip: (request, response) => {
    //return true to skip the rate limiter
    return true

    if (request.headers.token_decoded && request.headers.token_decoded.user.role.type == 'developer') {
        return false
    } else {
        return true
    }
  },
});

exports.rateLimiterAuth = rateLimit({
    windowMs: 5000, //  5s in milliseconds
    max: 1, // which represents the number of allowed requests per window per user
    message: 'Not today!', // which specifies the response message users get when they have exceeded the allowed limit
    standardHeaders: true, // which specifies whether the appropriate headers should be added to the response showing the enforced limit (X-RateLimit-Limit), current usage (X-RateLimit-Remaining), and time to wait before retrying (Retry-After) when the limit is reached
    legacyHeaders: false,
    skip: (request, response) => {
        //return true to skip the rate limiter
        return configs.environment == 'local'
    },
})

exports.getStripeRedirectRootURL =  () => {
    if(configs.environment == "prod") {
        return "https://app.fliproom.io/"
    }
    else if(configs.environment == "staging"){
        return "https://staging.fliproom.io/"
    }
    else{
        return "http://localhost:8100/"
    }
}
exports.generateBarcodeFormat = (accountName, barcodePointerValue) => {
    const s = "0000000000" + barcodePointerValue;
    const paddedPointer =  s.substr(s.length - 10);

    const barcodeTxt = `WMSA${accountName.slice(0, 3).toUpperCase()}Z${paddedPointer}`
    return barcodeTxt
}

exports.buildEmailMessage = (templateName, configs) => {
    let templateString = fs.readFileSync(`./assets/${templateName}.html`, 'utf-8')
    for (var variableName in configs) {
        if (Array.isArray(configs[variableName])) {
            let _listTxt = ""
            const placeholderStart = `{{#${variableName}}}`
            const placeholderEnd = `{{/${variableName}}}`

            // iterate through the list and replace the line template with the values - save them in a new string
            for (var listItem of configs[variableName]) {
                // get the line template from the content between variableName reference
                let htmlListItemTemplate = templateString.slice(templateString.indexOf(placeholderStart) + placeholderStart.length, templateString.indexOf(placeholderEnd))
                for (var key in listItem) {
                    htmlListItemTemplate = htmlListItemTemplate.replace(`{{${key}}}`, listItem[key])
                }
                _listTxt += htmlListItemTemplate + "\n"
            }

            // replace the content between the variableName reference with the generated text
            templateString = templateString.replace(templateString.slice(templateString.indexOf(placeholderStart), templateString.indexOf(placeholderEnd) + placeholderEnd.length), _listTxt)
        } else {
            templateString = templateString.replace(`{{${variableName}}}`, `${configs[variableName]}`)
        }
    }
    return templateString
}

exports.applyRangeFilter = (paramValue) => {
    const range =  paramValue.split(':')
    if (range[1] == '') {
        return { [Op.gte]: range[0]}
    }
    
    if (range[0] == '') {
        return { [Op.lte]: range[1]}
    }

    return  { [Op.between]: [range[0], range[1]] }
}

exports.parseFilterSyntax = (query) => {

    /**
     * 
     *  "*"  = "all/not null"
     * "!*" = "null"
     * ":" = "from:to"
     * "!" = "exclude"
     * "~" = "includes"
     * 
     */
    queryString = String(query).trim()

    // Apply list
    if (queryString.includes(",")) {
        return queryString.split(",").map(value => value.trim())

        // TODO recursion to process queryString below individually?
        // return queryString.split(",").map(value => exports.parseFilterSyntax(value))
    }

    // Apply range
    if (queryString.includes(":")) {
        return exports.applyRangeFilter(queryString)
    }

    switch(queryString) {
        case "*": // any value that is not null
            return {[Op.not]: null}
        case "!*": // is null
            return {[Op.eq]: null}
        case "true":
            return true
        case "false":
            return false
    }

    // exclude from query
    if (queryString[0] == "!") {
        return {[Op.ne]: queryString.slice(1)}
    }

    if (queryString[0] == "~") {
        return {[Op.substring]: queryString.slice(1)}
    }

    // otherwise return as string
    return queryString
}

exports.addFilter = (queryObj, field, value) => {
    // don't add filter if value is empty string
    //TODO: check empty string - why value != false??
    if (value == "" && value != false) {
        return queryObj
    }

    if (field == "or") {
        const params = value.split("|")
        const orConditions = []
        for (const param of params) {
            let [key, value] = param.split("=")
            value = exports.parseFilterSyntax(value)
            const orCondition = {}
            orCondition[key] = value
            orConditions.push(orCondition)
        }


        queryObj.where.push({ [Op.or]: orConditions })

        return queryObj
    }

    // preprocess value (convert operators from string to sequelize objects)
    value = exports.parseFilterSyntax(value)
    
    const records = field.split(".")
    if (records.length == 1) {
        const column = records[0]
        const cond = {}
        cond[column] = value
        queryObj.where.push(cond)

        return queryObj
    }

    if (records.length == 2) {
        const [table1, column] = records
        const includeIdx = queryObj.include.findIndex(include => include.as == table1)
        // add where if missing
        if (typeof queryObj.include[includeIdx].where === 'undefined') {
            queryObj.include[includeIdx].where = {}
        } 
        // add condition
        queryObj.include[includeIdx].where[column] = value
        queryObj.include[includeIdx]['required'] = true
    }

    if (records.length == 3) {
        const [table1, table2, column] = records
        const includeIdx1 = queryObj.include.findIndex(include => include.as == table1)
        const includeIdx2 = queryObj.include[includeIdx1].include.findIndex(include => include.as == table2)
        // require parent
        queryObj.include[includeIdx1]['required'] = true

        // add where if missing
        if (typeof queryObj.include[includeIdx1].include[includeIdx2].where === 'undefined') {
            queryObj.include[includeIdx1].include[includeIdx2].where = {}
        }
        // add condition
        queryObj.include[includeIdx1].include[includeIdx2].where[column] = value
        queryObj.include[includeIdx1].include[includeIdx2]['required'] = true
    }

    if (records.length == 4) {
        const [table1, table2, table3, column] = records
        const includeIdx1 = queryObj.include.findIndex(include => include.as == table1)
        const includeIdx2 = queryObj.include[includeIdx1].include.findIndex(include => include.as == table2)
        const includeIdx3 = queryObj.include[includeIdx1].include[includeIdx2].include.findIndex(include => include.as == table3)
        // require parent
        queryObj.include[includeIdx1]['required'] = true
        queryObj.include[includeIdx1].include[includeIdx2]['required'] = true
        // add where if missing
        if (typeof queryObj.include[includeIdx1].include[includeIdx2].include[includeIdx3].where === 'undefined') {
            queryObj.include[includeIdx1].include[includeIdx2].include[includeIdx3].where = {}
        }
        // add condition
        queryObj.include[includeIdx1].include[includeIdx2].include[includeIdx3].where[column] = value
        queryObj.include[includeIdx1].include[includeIdx2].include[includeIdx3]['required'] = true
    }


    return  queryObj
}

exports.addSorting = (queryObj, sortQuery) => {

    // if the sort parameter is passed but its value is null, return the query object without modifying it
    if(!sortQuery) {
        return queryObj
    }

    queryObj.order = []
    for (const sortingParam of sortQuery.split(";")) {
        const [key, direction] = sortingParam.split(":")

        const records = key.split(".")
        if (records.length == 2) {
            const [table1, column] = records
            const includeIdx = queryObj.include.findIndex(include => include.as == table1)

            // add required
            queryObj.include[includeIdx]['required'] = true
        }
    
        if (records.length == 3) {
            const [table1, table2, column] = records
            const includeIdx1 = queryObj.include.findIndex(include => include.as == table1)
            const includeIdx2 = queryObj.include[includeIdx1].include.findIndex(include => include.as == table2)

            // add required
            queryObj.include[includeIdx1]['required'] = true
            queryObj.include[includeIdx1].include[includeIdx2]['required'] = true
        }

        if (records.length == 4) {
            const [table1, table2, table3, column] = records
            const includeIdx1 = queryObj.include.findIndex(include => include.as == table1)
            const includeIdx2 = queryObj.include[includeIdx1].include.findIndex(include => include.as == table2)
            const includeIdx3 = queryObj.include[includeIdx1].include[includeIdx2].include.findIndex(include => include.as == table3)

            // add required
            queryObj.include[includeIdx1]['required'] = true
            queryObj.include[includeIdx1].include[includeIdx2]['required'] = true
            queryObj.include[includeIdx1].include[includeIdx2].include[includeIdx3]['required'] = true
        }
        
        queryObj.order.push([db.sequelize.literal(`\`${key}\``), direction])
    }

    return  queryObj
}

exports.getExchangeRate = (currencyFrom, currencyTo) => {
    const exchangeRates = {
      'USD-USD': 1,
      'USD-GBP': 0.84,
      'USD-EUR': 0.95,
      'GBP-USD': 1.19,
      'GBP-GBP': 1,
      'GBP-EUR': 1.13,
      'EUR-USD': 1.05,
      'EUR-GBP': 0.88,
      'EUR-EUR': 1,
    }
    const exchangeString = `${currencyFrom}-${currencyTo}`.toUpperCase()

    return exchangeRates[exchangeString]
}

exports.currencySymbol = (currency) => {
    currency = currency.toUpperCase()
    const symbols = {
        'GBP': '£',
        'EUR': '€',
        'USD': '$'
    }
    return symbols[currency]
}

//Precision problem js fix
exports.fixNumber = (value) => {
    return Number(value.toPrecision(15))
}


//Returns the price of a listing based on the payout and fee rate
exports.getFeeRate = (saleChannel, inventoryListing) => {
    const sortedFees = (saleChannel.fees || []).sort((txRate1, txRate2) => parseFloat(txRate1.minPrice) < parseFloat(txRate2.minPrice) ? -1 : 1)
    let feeToApplyIndex

    //Price = (Payout + Applicable Fee) / (1 - Applicable Fee)
    if (inventoryListing.payout) {
        /**
         * When payout is set cycle through the fee brackets and work out the price with the following formula:
         * Price = (Payout + Applicable Fee) / (1 - Applicable Fee)
         * find the fee bracket that the lowest price falls into
         */
        const minPayoutsDescendingOrder = sortedFees.map(fee=> exports.getListingPayout(fee.maxPrice, fee.value))
        minPayoutsDescendingOrder.find((payout,index) => {
            if(  inventoryListing.payout < payout || index+1  == minPayoutsDescendingOrder.length ){
                feeToApplyIndex = index
                return true
            }
            if (  inventoryListing.payout >= payout  && inventoryListing.payout <= minPayoutsDescendingOrder[index + 1]){
                feeToApplyIndex = index +1
                return true
            }
        })
    }
    //If no payout is set, then find the fee bracket that the price falls into
    else {
        feeToApplyIndex = sortedFees.findIndex(fee => inventoryListing.price >= fee.minPrice && inventoryListing.price <= fee.maxPrice)
    }
    //Apply no fee if the listing is from the same account as the sale channel or if no fee is found
    if (feeToApplyIndex == -1 || saleChannel.accountID == inventoryListing.accountID) {
        return {minPrice: 0, maxPrice: 999999999999999, value: 0, type: 'percentage'}
    }

    return sortedFees[feeToApplyIndex]

}

//Returns the price of a listing based on the payout and fee rate
exports.computeSaleChannelPrice = (saleChannel, _inventoryListing) => {
    // clone inventoryListing
    let inventoryListing = JSON.parse(JSON.stringify(_inventoryListing))
    //remove inventory listing price so it doesn't override the fee
    delete inventoryListing.price
    const feeToApply = exports.getFeeRate(saleChannel, inventoryListing)
    let feePercentage = saleChannel.accountID == inventoryListing.accountID ? 0 : (feeToApply?.value || 0)
    //add any additional fees - laced charges 6.99 for shipping
    if (saleChannel.platform == 'laced') {inventoryListing.payout = inventoryListing.payout + 6.99}
    let listingPrice = exports.getListingPrice(inventoryListing.payout, feePercentage)

    //add any markup
    listingPrice = listingPrice * 100 / (100 - parseFloat(saleChannel.markup))

    //add any tax rate - the EDIT LDN has 0 tax on kids at harrods
    const isKids = (['ps', 'td', 'kids', 'infants']).find(keyword => inventoryListing.product.title.toLowerCase().includes(keyword));
    if (!(saleChannel.title == 'harrods' && isKids)) {
        listingPrice = listingPrice * (1 + parseFloat(saleChannel.taxRate) / 100)
    }
        
    return listingPrice
}

//Returns the price of a listing based on the payout and fee rate
exports.computeSaleChannelPayout = (saleChannel, _inventoryListing) => {
    let inventoryListing = JSON.parse(JSON.stringify(_inventoryListing))
    let listingPrice = inventoryListing.price
    //remove any tax rate - the EDIT LDN has 0 tax on kids at harrods
    const isKids = (['ps', 'td', 'kids', 'infants']).find(keyword => inventoryListing.product.title.toLowerCase().includes(keyword));
    if (!(saleChannel.title == 'harrods' && isKids)) {
        listingPrice = listingPrice/ (1 + saleChannel.taxRate / 100)
    }
    // remove markup
    listingPrice = listingPrice/(100/(100-saleChannel.markup))
    //get fee to apply - remove payout from listing so it doesn't override the fee
    delete inventoryListing.payout
    const feeToApply = exports.getFeeRate(saleChannel, inventoryListing)
    //get payout from listing price
    let payout = exports.getListingPayout(listingPrice, feeToApply?.value || 0)
    //remove any additional fees - Laced has a £6.99 delivery fee on top of the consignment fee
    if (saleChannel.platform == 'laced') {payout = payout - 6.99}
    return payout
}

exports.getListingPrice = (payout, fee) => {
    return parseFloat(payout) * 100 / (100 - parseFloat(fee))
}

exports.getListingPayout = (price, fee) => {
    return parseFloat(price) * (100 - parseFloat(fee)) / 100
}

exports.breakdownSalePrice = (saleChannel, product, itemOwnerAccountID, salePrice) => {
    //subtract any tax rate - the EDIT LDN has 0 tax on kids at harrods
    let preTaxPrice = salePrice
    let taxRate = parseFloat(saleChannel.taxRate)
    const isKids = (['ps', 'td', 'kids', 'infants']).find(keyword => product.title.toLowerCase().includes(keyword));
    !(saleChannel.title == 'harrods' && isKids) ? preTaxPrice = salePrice/ (1 + saleChannel.taxRate / 100) : taxRate = 0;

    //compute tax amount
    let taxAmount = (taxRate / 100) * parseFloat(salePrice)

    // remove markup
    preTaxPrice = preTaxPrice/(100/(100-saleChannel.markup))

    const sortedFees = (saleChannel.fees || []).sort((txRate1, txRate2) => parseFloat(txRate1.minPrice) < parseFloat(txRate2.minPrice) ? -1 : 1)
    const feeToApplyIndex = sortedFees.findIndex(fee => salePrice >= fee.minPrice && salePrice <= fee.maxPrice)
    const feeToApply = feeToApplyIndex == -1 ? null : sortedFees[feeToApplyIndex]
    let feePercentage = saleChannel.accountID == itemOwnerAccountID ? 0 : (feeToApply?.value || 0)
    let consignmentFeeAmount = parseFloat(feePercentage) / 100 * preTaxPrice
    let payout = exports.getListingPayout(preTaxPrice, feeToApply?.value || 0)
    let markupAmount = (parseFloat(saleChannel.markup) / 100) * payout

    return {
        price: parseFloat(salePrice),
        taxAmount: taxAmount,
        markupAmount: markupAmount,
        consignmentFeeAmount: consignmentFeeAmount,
        payout: payout
    }
}

exports.createHtmlForMarketplacePublicPage = async (marketplaceListing) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
        <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>Wiredhub</title>
        <meta name="title" content="${marketplaceListing.product.title}">
        <meta property="og:site_name" content="Wiredhub" />
        <meta property="og:title" content="${marketplaceListing.product.title}">
        <meta property="og:description" content="${marketplaceListing.product.description}">
        <meta property="og:type" content="website">
        <meta property="og:image" itemprop="image" content="${marketplaceListing.product.imageReference}">
        <link itemprop="thumbnailUrl" href="${marketplaceListing.product.imageReference}">
        <script>
            function onLoad() {
                window.open("${configs.microservices.app}?redirectID=${marketplaceListing.ID}", "_self")
            }
        </script>
    </head>
    <body onload="onLoad()">
    <span itemprop="thumbnail" itemscope itemtype="http://schema.org/ImageObject">
    <link itemprop="url" href="${marketplaceListing.product.imageReference}">
    </span>
    </body>
    </html>
    `
    await fs.writeFileSync('./assets/marketplace-listing.html', html)
}

exports.titleCase = (str) => {
    if (!str) return ''
    return str.toLowerCase().split(' ').map(function(word) {
      return word.replace(word[0], word[0].toUpperCase());
    }).join(' ');
}

// required fields function
// requiredFields -> [{fieldName: 'type'}]

exports.requiredFields = (rawData, requiredFields) => {
    const missingAttributes = []
    const incorrectTypes = []
    for(var prop in requiredFields){
        if (!rawData[prop]){
            missingAttributes.push(prop)
        }
        else if (typeof rawData[prop] != requiredFields[prop]){
            incorrectTypes.push(prop)
        }
    }
    if (missingAttributes.length > 0 && incorrectTypes.length > 0){
        throw new Error(`Missing ${missingAttributes.join(',')} and ${missingAttributes.join(',')} have incorrect types`)

    }
    else if (missingAttributes.length > 0 ){
        throw new Error(`Missing params: ${missingAttributes.join(',')}`)
    }
    else if ( incorrectTypes.length > 0){
        throw new Error(`Incorrect types were passed for: ${incorrectTypes.join(',')} `)

    }
}

exports.batchArray = (array, batchSize) =>{
    const batchedArrays = []
    while (array.length > 0) {
        batchedArrays.push(array.splice(0,batchSize))
    }
    return batchedArrays
}
