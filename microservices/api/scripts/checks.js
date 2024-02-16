let envFileName = ""
if (process.argv.includes("production")) {
    console.log('PRODUCTION CONFIGURATION ENABLED')
    envFileName = "production"
} else if (process.argv.includes("staging")) {
    console.log('STAGING CONFIGURATION ENABLED')
    envFileName = "staging"
}
require('dotenv').config({ path: `./${envFileName}.env` })
const configs = require('../configs.js')
configs.sql.connection_name = null //this shouldn;t be set when running staging or production locally. otherwise doesn't allow connection

const utils = require('./utils.js')
const fs = require('fs')
const objectsToCsv = require('objects-to-csv')
const moment = require('moment')


const apiUtils = require('../libs/utils.js')
const db = require('../libs/db')
const { Op } = require("sequelize");
const {v1: uuidv1} = require("uuid");
const resultsDir = './scripts/checksReports'
const service = require('../services/main')
const shopifyChecks = require('./checks/shopify.js')

let accounts;
let accountIDs;
let dbProducts;
let dbVariants;
let dbInventory;
let physicalInventory;
let virtualInventory;
let dbInventoryListings;
let transactions;
let stockxProducts
let stockxVariants
let dbOrders;
let dbOrderLineItems;
let shopifyProducts;
let shopifyVariants;
let shopifyOrders;
let dbItems;
let dbProductMatches;
let dbFulfillments;

async function main() {
/**
     * 
     * 
     * 
     * ORDERS OUT
     * DONE - Check all orders are imported on the platform
     * DONE - shopify order.quantity == mainOrder.quantity 
     * DONE - main order invoice amount == shopify items price
     * DONE - sub-orders invoices totalAmount == mainOrder orderLineItems cost
     * DONE - suborders items == mainOrder items
     * DONE - Main order quantity == suborders.orderLineItems + mainOrder.orderLineItems (internal items)
     * 
     * OTHER CHECKS TODO
     * DONE - ordersin.quantity == items
     * DONE - ordersin status == items + fulfillment right situation
     * DONE - duplicate accounts
     * DONE - every account has warehouse, location 
     * DONE - every account has admin user
     * DONE - edit has access to all accounts
     */

    if (fs.existsSync(resultsDir)){
        fs.rmdirSync(resultsDir, { recursive: true });
    }
    fs.mkdirSync(resultsDir);


    //await ShopifyInventoryChecks()
    //await accountsChecks()

    //await ProductsChecks()
    await ProductVariantsChecks() 
    ////await ProductMatchChecks()
    //await StockxProductsChecks()
    //await StockxProductsVariantsChecks()
    ///////await ShopifyProductsChecks()
    //await algoliaProductsChecks()
    //await googleMerchantChecks()
    
    //await itemsReport()
    await InventoryChecks()
    //await InventoryListingsChecks()

    //await stripeAccountsChecks()
    //await transactionsChecks()

    //await orderLineItemsReport() 

    //await ordersOutboundChecks()
    //await ordersInboundChecks() // Low
}

async function googleMerchantChecks() {
    for (accountID of [3, 2211, 2530]) {
        const serviceUser = await service.account.serviceUser(accountID)
        const gproducts = await service.bridge.gmerchant.product.fetchAll(serviceUser, accountID)
        const gproductsForeignIDs = [... new Set(gproducts.map(p => p.offerId.split("_")[2]))]
        const dbProducts = await db.product.findAll({where: {accountID: accountID, foreignID: gproductsForeignIDs}, include: [{model: db.productVariant, as: 'variants'}]})
    
        const gproductsMissingAgeGroupOrGender = gproducts.filter(p => !p.ageGroup || !p.gender)
        const ageGroupOrGenderAvailable = gproductsMissingAgeGroupOrGender.filter(gproduct => {
            const dbprod = dbProducts.find(p => p.foreignID == gproduct.offerId.split("_")[2])
            return dbprod?.gender
        })
        console.log(`AgeGroupGender Available: ${ageGroupOrGenderAvailable.length}/${gproductsMissingAgeGroupOrGender.length}`)
    
        const gproductsMissingColor = gproducts.filter(p => !p.color)
        const colorAvailable = gproductsMissingColor.filter(gproduct => {
            const dbprod = dbProducts.find(p => p.foreignID == gproduct.offerId.split("_")[2])
            return dbprod?.color
        })
        console.log(`Color Available: ${colorAvailable.length}/${gproductsMissingColor.length}`)
    
        const gproductsMissingGtin = gproducts.filter(p => !p.gtin)
        const gtinAvailable = gproductsMissingGtin.filter(gproduct => {
            const dbprod = dbProducts.find(p => p.foreignID == gproduct.offerId.split("_")[2])
            const dbVariant = dbprod?.variants.find(v => v.foreignID == gproduct.offerId.split("_")[3])
            return dbVariant?.gtin
        })
        console.log(`GTIN Available: ${gtinAvailable.length}/${gproductsMissingGtin.length}`)
    
        const listingsToProcess = [].concat.apply([], [ageGroupOrGenderAvailable, colorAvailable, gtinAvailable])
        const uniqueListingProcessed = new Set()
        console.log(`Listings to process: ${listingsToProcess.length}`)
    
        let idx = 0
        for (var listing of listingsToProcess ) {
            if (uniqueListingProcessed.has(listing.offerId)) {
                continue
            }
            uniqueListingProcessed.add(listing.offerId)
    
            const dbProduct = dbProducts.find(p => p.foreignID == listing.offerId.split("_")[2])
            const dbVariant = dbProduct.variants.find(v => v.foreignID == listing.offerId.split("_")[3])
            console.log(`Updating offerId ${listing.offerId} | ${idx}/${listingsToProcess.length}`)
    
            await service.gcloud.addTask(
                'gmerchant-jobs',
                'POST',
                `${configs.microservices.api}/api/bridge/egress/google-merchant/variant/update`,
                {authorization: `Bearer ${serviceUser.apiKey}`},
                null,
                {
                    variantID: dbVariant.ID
                }
            )
            idx += 1
        }
    }
}

async function ProductVariantsChecks() {
    console.log('\n\n')
    console.log("#############################")
    console.log("#####  VARIANTS CHECKS  ####")
    console.log("#############################")

    const variantsStockxIds = new Set()

    await fetchDBData(['products', 'shopify-products'])
    const shopifySaleChannels = await db.saleChannel.findAll({where: {platform: 'shopify'}})

    const publicProductLookupByID = {}
    const publicVariantLookupByID = {}
    dbProducts.filter(p => p.public).map(p => publicProductLookupByID[p.ID] = p)
    dbProducts.filter(p => p.public).map(p => p.variants.map(v => publicVariantLookupByID[v.ID] = v))


    const shopifyVariantsLookupByForeignID = {}
    shopifyProducts.map(sprod => sprod.variants.map(v => {
        shopifyVariantsLookupByForeignID[v.id] = v
    }))

    const variantsReport = []
    const errorsVariants = {
        'missingName': false,
        'missingStockxId': false,
        'unexpectedStockxId': false,
        'usSizeChartMissmatch': false,
        'ukSizeChartMissmatch': false,
        'euSizeChartMissmatch': false,
        'jpSizeChartMissmatch': false,
        'usmSizeChartMissmatch': false,
        'uswSizeChartMissmatch': false,
        'gtinMissing': false,
        'missingShopifyID': false,
        'unexpectedShopifyID': false,
        'duplicatedPublicVariant': false,
    }

    dbProducts.map(product => {
        const accountHasShopify = shopifySaleChannels.find(sc => sc.accountID == product.accountID)
        product.variants.map(variant => {
            const publicVariant = publicVariantLookupByID[variant.sourceProductVariantID]
            const shopifyVariant = shopifyVariantsLookupByForeignID[variant.foreignID]

            const report = {
                'createdAt':             moment(variant.createdAt).format(),
                'updatedAt':             moment(variant.updatedAt).format(),
                'ID':                    variant.ID,
                'name':                  variant.name,
                'stockxId':              variant.stockxId,
                'status':                variant.status,
                'foreignID':             variant.foreignID,
                'hasPublicVariant':      publicVariant ? 'YES' : 'NO',
                'product.ID':            product.ID,
                'product.public':        product.public ? 'YES' : 'NO',
                'product.accountID':     product.accountID,
                'product.code':          product.code,
                'product.status':        product.status,
                'product.stockxId':      product.stockxId,
                'product.foreignID':     product.foreignID,
                'usSize':                     variant.usSize,
                'publicVariant.usSize':       publicVariant?.usSize,
                'euSize':                     variant.euSize,
                'publicVariant.euSize':       publicVariant?.euSize,
                'ukSize':                     variant.ukSize,
                'publicVariant.ukSize':       publicVariant?.ukSize,
                'publicVariant.jpSize':       publicVariant?.jpSize,
                'publicVariant.usmSize':      publicVariant?.usmSize,
                'publicVariant.uswSize':      publicVariant?.uswSize,
                'publicVariant.gtin':         publicVariant?.gtin,
                'gtin':                       variant.gtin,
            }


            // deep clone object for the record
            const errorsRecord = JSON.parse(JSON.stringify(errorsVariants))

            if ((variant.name == '' || variant.name == null)) {
                errorsRecord['missingName'] = true
            }

            if (product.public == 1 && variant.stockxId == null) {
                errorsRecord['missingStockxId'] = true
            }

            if (product.public == 0 && variant.stockxId != null) {
                errorsRecord['unexpectedStockxId'] = true
            }

            //size chart missmatch
            if (publicVariant && publicVariant.usSize != variant.usSize) {
                errorsRecord['usSizeChartMissmatch'] = true
            }

            if (publicVariant && publicVariant.ukSize != variant.ukSize) {
                errorsRecord['ukSizeChartMissmatch'] = true
            }

            if (publicVariant && publicVariant.euSize != variant.euSize) {
                errorsRecord['euSizeChartMissmatch'] = true
            }

            if (publicVariant && publicVariant.jpSize != variant.jpSize) {
                errorsRecord['jpSizeChartMissmatch'] = true
            }

            if (publicVariant && publicVariant.usmSize != variant.usmSize) {
                errorsRecord['usmSizeChartMissmatch'] = true
            }

            if (publicVariant && publicVariant.uswSize != variant.uswSize) {
                errorsRecord['uswSizeChartMissmatch'] = true
            }

            if (publicVariant && publicVariant.gtin && !variant.gtin && variant.status != 'deleted') {
                errorsRecord['gtinMissing'] = true
            }

            if (accountHasShopify && variant.foreignID == null && !product.untracked) {
                errorsRecord['missingShopifyID'] = true
            }

            if (!shopifyVariant && variant.foreignID && variant.status != 'deleted') {
                errorsRecord['unexpectedShopifyID'] = true
            }

            if (product.public) {
                const key = `${product.stockxId}_${variant.stockxId}`
                if (variantsStockxIds.has(key)) {
                    errorsRecord['duplicatedPublicVariant'] = true
                }
                variantsStockxIds.add(key)
            }
            


            // if any error triggered - add record to report
            if (Object.values(errorsRecord).find(error => error) == true) {
                for (var errorName in errorsRecord) {
                    report[errorName] = errorsRecord[errorName]
                }
                variantsReport.push(report)
            }

        })
    })

    if (variantsReport.length> 0){
        let reportCsv = new objectsToCsv(variantsReport)
        await reportCsv.toDisk(`${resultsDir}/variantsReport.csv`)
    }
    console.log(`Variants Report:`.padEnd(65," "), variantsReport.length)
    for (var errorType in errorsVariants) {
        console.log(`>> ${errorType}`.padEnd(65," "), variantsReport.filter(r => r[errorType]).length)
    }
}

async function ProductMatchChecks() {
    console.log('\n\n')
    console.log("#############################")
    console.log("## PRODUCTS MATCH CHECKS  ##")
    console.log("#############################")
    
    await fetchDBData(['productMatches'])

    const errors = {
        'duplicatedMatches': false,   //an account has multiple matches to the same externalProductVariantID
        'sameAccountID': false,
        'variantNameMissmatch': false,
        'wrongProduct': false,
        'productNameMissmatch': false
    }

    const productsMatchReport = []
    const duplicatedMatches = new Set() // used to find duplicate virtual inventory records (variantIDAccountID)

    const whitelistedMatches = [
        `764222_394866`,	
        `764340_35380`,	
        `770837_394866`,	
        `787673_394864`,	
        `815328_394866`,	
        `774723_695942`,
        '846174_845385',
        '847794_845367',
        '847795_845364',
        '847796_845365',
        '847798_845369',
        '847800_845371',
        '847824_845373',
        '847825_845375',
        '847829_845379',
        '847832_845387',
        '847957_845380',
        '847958_845382',
        '852817_848736',
        '774715_12747',
        '847827_845377',
        '853949_845380',
        '853951_845382',
        '838689_863534',
        '801596_695941',
        '774724_695943',
        '774722_695945',
        '774721_695946',
        '774599_43859',
        '774609_43849',
        '774608_43850',
        '774605_43851',
        '774606_43852',
        '774601_43855',
        '774600_43857',
        '775243_664759',
        '775245_664757',
        '775246_664760',
        '775242_664761',
        '775240_664763',
        '774850_395496',
        '774849_395497',
        '774847_395498',
        `775255_15151`,
        `775248_15146`,
        `775247_15148`,
        `775258_15150`,
        `775254_15149`,
        `775257_15152`,
        `775259_15154`,
        `775260_15155`,
        `775249_15147`,
        `774863_256409`,
        `774862_256410`,
        `774860_256411`,
        `774861_256412`,
        `774859_256413`,
        `774826_258216`,
        `774825_258217`,
        `774824_258218`,
        `774823_258219`,
        `774822_258220`,
        `774821_258221`,
        `774645_12648`,
        `774646_12650`,
        `774644_12651`,
        `774647_12652`,
        `774643_12653`,
        `774642_12656`,
        `774641_12655`,
        `774640_12654`,
        `774639_12657`,
        `774612_257000`,
        `774616_257002`,
        `774613_257003`,
        `775070_39597`,
        `775068_39598`,
        `775072_39599`,
        `775074_39600`,
        `775073_39601`,
        `775076_39603`,
        `774928_258508`,
        `774930_258510`,
        `774926_258511`,
        `774927_258512`,
        `774925_258513`,
        `774922_258514`,
        `774924_258515`,
        `774923_258516`,
        `774920_258518`,
        `774765_403584`,
        `774769_403585`,
        `774768_403586`,
        `774766_403587`,
        `774764_403588`,
        `775292_43872`,
        `775290_43873`,
        `775288_43874`,
        `775286_43875`,
        `775289_43876`,
        `775284_43877`,
        `775281_43880`,
        `774681_37187`,
        `774680_37189`,
        `774679_37190`,
        `774778_674584`,
        `774873_705071`,
        `774870_705073`,
        `774675_37166`,
        `774676_37167`,
        `774673_37168`,
        `774670_37169`,
        `774671_37170`,
        `774669_37171`,
        `774668_37172`,
        `774666_37173`,
        `774667_37174`,
        `774883_257945`,
        `774884_257944`,
        `774886_257944`,
        `774885_257942`,
        `774887_257945`,
        `774915_403964`,
        `774917_403965`,
        `774916_403966`,
        `774912_403967`,
        `774913_403968`,
        `774914_403969`,
        `774909_403970`,
        `774910_403972`,
        `774836_256464`,
        `775311_406692`,
        `775308_406693`,
        `775312_406694`,
        `775306_406699`,
        `775304_250989`,
        `775302_250990`,
        `775299_250992`,
        `775298_250996`,
        `774949_12768`,
        `774936_258493`,
        `774939_258495`,
        `774937_258496`,
        `774935_258497`,
        `774934_258498`,
        `774933_258498`,
        `838689_421496`,
        `718526_688903`,
        `774719_695948`,
        `774718_695949`,
        `774716_695950`,
        `774726_755372`,
        `774727_755371`,
        `774731_755369`,
        `774728_755368`,
        `774702_12546`,
        `774701_12548`,
        `774698_12549`,
        `774697_12550`,
        `774696_12551`,
        `774691_12555`,
        `774692_12558`,
        `774714_12745`,
        `774712_12748`,
        `774711_12749`,
        `774713_12750`,
        `774710_12751`,
        `774709_12753`,
        `775349_34705`,
        `775346_34706`,
        `775348_34707`,
        `775345_34709`,
        `775344_34710`,
        `774544_39998`,
        `774543_39999`,
        `774604_43853`,
        `774603_43854`,
        `774602_43856`,
    ]

    const whitelistedProductMatches = [
        `62578_10659`,
        `75437_76794`,
        `81205_17030`,
        `81305_16688`,
        `76351_39561`,
        `76349_39560`,
        `76349_39560`,
        `76349_39560`,
        `76349_39560`,
        `59410_10096`,
        `59410_10096`,
        `67569_16105`,
        `67569_16105`,
        `66537_13479`,
        `82920_82649`,
        `82920_82649`,
        `82920_82649`,
        `82920_82649`,
        `83084_55206`,
        `83543_83508`,
        `83560_83508`,
        `83596_83508`,
        `83608_81843`,
        `83617_56826`,
        `57227_10096`,
        `57227_10096`,
        `62579_15611`,
        `57712_16105`,
        `66677_16105`,
        `84977_81843`,
        `85374_85247`,
        `85662_85652`,
        `86058_85652`,
        `86122_86094`,
        `86123_86097`,
        `82074_75894`,
        `57227_10096`,
        `75562_75498`,
        `76349_17557`,
        `83617_56826`,
        `70501_17507`,
        `73350_56977`,
        `62579_15611`,
        `66966_13479`,
        `66537_13479`,
        `87377_55856`,
        `61425_17558`,
        `78144_76793`,
        `87630_87338`,
        `87744_53832`,
        `82073_10445`,
        `82061_17657`,
        `82160_73539`,
        `82094_55305`,
        `82161_10693`,
        `88682_88226`,
        `82096_39434`,
        `82092_39633`,
        `82066_10437`,
        `82062_39536`,
        `86172_86153`,
        `91560_10233`,
        `91560_10233`,
        `91560_10233`,
        `91560_10233`,
        `91560_10233`,
        `91560_10233`,
        `91560_10233`,
        `91560_10233`,
        `82130_17162`,
        `82130_17162`,
        `82130_17162`,
        `82130_17162`,
        `82130_17162`,
        `82130_17162`,
        `82104_39662`,
        `82104_39662`,
        `82104_39662`,
        `82104_39662`,
        `82104_39662`,
        `82104_39662`,
        `82104_39662`,
        `82104_39662`,
        `82104_39662`,
        `82082_55872`,
        `82082_55872`,
        `82082_55872`,
        `82082_55872`,
        `82082_55872`,
        `82164_17663`,
        `82164_17663`,
        `82164_17663`,
        `82164_17663`,
        `82164_17663`,
        `82164_17663`,
        `82164_17663`,
        `82070_16869`,
        `82070_16869`,
        `82070_16869`,
        `82084_74266`,
        `82097_76679`,
        `82097_76679`,
        `90694_11716`,
        `90694_11716`,
        `90694_11716`,
        `90694_11716`,
        `90694_11716`,
        `90694_11716`,
        `90694_11716`,
        `90694_11716`,
        `82069_16868`,
        `82069_16868`,
        `82069_16868`,
        `82069_16868`,
        `82069_16868`,
        `82069_16868`,
        `82069_16868`,
        `82069_16868`,
        `82069_16868`,
        `82099_39606`,
        `82099_39606`,
        `82099_39606`,
        `82099_39606`,
        `82099_39606`,
        `82103_55922`,
        `82103_55922`,
        `82103_55922`,
        `82103_55922`,
        `82103_55922`,
        `82103_55922`,
        `82103_55922`,
        `82103_55922`,
        `82093_39454`,
        `82166_56169`,
        `82166_56169`,
        `82166_56169`,
        `82166_56169`,
        `82165_38722`,
        `82165_38722`,
        `82165_38722`,
        `82165_38722`,
        `82106_10447`,
        `82105_39661`,
        `82105_39661`,
        `82105_39661`,
        `82105_39661`,
        `82105_39661`,
        `82105_39661`,
        `82075_80609`,
        `82075_80609`,
        `82075_80609`,
        `82075_80609`,
        `82072_10423`,
        `82072_10423`,
        `82072_10423`,
        `82072_10423`,
        `82072_10423`,
        `82072_10423`,
        `82072_10423`,
        `82172_16641`,
        `82172_16641`,
        `82172_16641`,
        `82172_16641`,
        `82172_16641`,
        `82045_17184`,
        `82045_17184`,
    ]

    // all inventory records
    dbProductMatches.map((record) => {
        const uniqueKey = `${record.variant.ID}_${record.externalProductVariantID}`
        const report = {
            recordID: record.ID,
            createdAt: moment(record.createdAt).utc().format("YYYY-MM-DD HH:mm:ss"),
            'variant.accountID': record.variant.product.accountID,
            'externalVariant.accountID': record.externalVariant.product.accountID,
            productID: record.variant.product.ID,
            externalProductID: record.externalVariant.product.ID,
            productCode: record.variant.product.code,
            externalProductCode: record.externalVariant.product.code,
            'product.title': record.variant.product.title,
            'externalProduct.title': record.externalVariant.product.title,
            variantID: record.productVariantID,
            externalVariantID: record.externalProductVariantID,
            'variant.name': record.variant.name,
            'externalVariant.name': record.externalVariant.name,
            uniqueKey: uniqueKey,
        }


        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errors))

        if (record.variant.product.accountID == record.externalVariant.product.accountID) {
            errorsRecord['sameAccountID'] = true
        }

        if (duplicatedMatches.has(uniqueKey)) {
            errorsRecord['duplicatedMatches'] = true
        }

        if (
            !utils.areVariantsEqual(record.variant.name, record.externalVariant.name) && 
            (record.variant.sourceProductVariantID == null || (record.variant.sourceProductVariantID != record.externalVariant.sourceProductVariantID)) &&
            !whitelistedMatches.includes(`${record.variant.ID}_${record.externalVariant.ID}`)
            ) {
            errorsRecord['variantNameMissmatch'] = true
        }

        if (record.variant.productID == 82195) {
            console.log(record.variant.product.code != "" && record.variant.product.code.trim().toLowerCase() != record.externalVariant.product.code.trim().toLowerCase())
            console.log(record.variant.product.title.trim().toLowerCase() != record.externalVariant.product.title.trim().toLowerCase() && record.variant.product.code == "")
            console.log(record.variant.product.sourceProductID != null && record.variant.product.sourceProductID != record.externalVariant.product.sourceProductID)
        }

        if (
            ((record.variant.product.code != "" && record.variant.product.code.trim().toLowerCase() != record.externalVariant.product.code.trim().toLowerCase()) ||
            (record.variant.product.title.trim().toLowerCase() != record.externalVariant.product.title.trim().toLowerCase() && record.variant.product.code == "")  || 
            (record.variant.product.sourceProductID != null && record.variant.product.sourceProductID != record.externalVariant.product.sourceProductID))
            && !whitelistedProductMatches.includes(`${record.variant.productID}_${record.externalVariant.productID}`)
            ) {
            errorsRecord['productNameMissmatch'] = true
        }

        if (record.variant.productID != record.productID || record.externalVariant.productID != record.externalProductID) {
            errorsRecord['wrongProduct'] = true
        }

        duplicatedMatches.add(uniqueKey)

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            productsMatchReport.push(report)
        }
    })

    
    if (productsMatchReport.length> 0){
        let reportCsv = new objectsToCsv(productsMatchReport)
        await reportCsv.toDisk(`${resultsDir}/productsMatchReport.csv`)
    }
    console.log(`Products Match Report:`.padEnd(65," "), productsMatchReport.length)
    for (var errorType in errors) {
        console.log(`>> ${errorType}`.padEnd(65," "), productsMatchReport.filter(r => r[errorType]).length)
    }
}

async function StockxProductsChecks() {
    /**
     * Products Checks
     */
    console.log('\n\n')
    console.log("#############################")
    console.log("#####  STOCKX CHECKS  ####")
    console.log("#############################")
    await fetchDBData(['products'], false)

    const StockxProductReport = []
    const errorsStockxProducts = {
        'publicProductMissing': false,
        'imageMissing': false,
        'brandMissmatch': false,
        'category2Missmatch': false,
        'genderMissmatch': false,
        'colorMissmatch': false,
        'retailPriceMissmatch': false,
        'releaseDateMissmatch': false,
        'processAtMissing': false,
        'salesLast72HoursMissmatch': false,
        'salesLast72HoursChangePercentageMissmatch': false,
        'lastSalePriceMissmatch': false,
        'lastSaleChangePercentageMissmatch': false,
        'volatilityScoreMissmatch': false,
        'volatilityScoreChangePercentageMissmatch': false,
    }

    const dbPublicProductLookupByStockxId= {}
    dbProducts.filter(p => p.public).map(p => dbPublicProductLookupByStockxId[p.stockxId] = p)

    stockxProducts.map(stockxProd => {
        const createdAtMinutesAgo = Math.floor((Math.abs(new Date() - new Date(stockxProd.createdAt))/1000)/60)
        const publicProduct = dbPublicProductLookupByStockxId[stockxProd.stockxId]
        const updatedSince = moment().utc().subtract(30, 'minutes')

        // try to get dbProduct by using stokcx productId. dbProduct.stockxId has changed is not missing. 
        // Changed because the stockx.title matches a product on dbProduct but its stockxid is dccebdb2-3bd1-440e-8777-4ce95d517708

        const report = {
            productID:          publicProduct?.ID,
            stockxId:           stockxProd.stockxId,
            createdAt:          moment(stockxProd.createdAt).format(),
            code:               stockxProd.styleId,
            title:              stockxProd.title,
            url:                stockxProd.url,
            brand:              stockxProd.brand,
            'product.brand':    publicProduct?.brand,
            category2:          stockxProd.category2,
            'product.category2':publicProduct?.category2,
            gender:             stockxProd.gender,
            'product.gender':   publicProduct?.gender,
            color:              stockxProd.color,
            'product.color':    publicProduct?.color,
            retailPrice:        stockxProd.retailPrice,
            'product.retailPrice':publicProduct?.retailPrice,
            releaseDate:        stockxProd.releaseDate,
            'product.releaseDate':publicProduct?.releaseDate,
            salesLast72Hours:   stockxProd.salesLast72Hours,
            'product.salesLast72Hours':publicProduct?.salesLast72Hours,
            salesLast72HoursChangePercentage: stockxProd.salesLast72HoursChangePercentage,
            'product.salesLast72HoursChangePercentage':publicProduct?.salesLast72HoursChangePercentage,
            volatilityScore:    stockxProd.volatilityScore,
            'product.volatilityScore':publicProduct?.volatilityScore,
            volatilityScoreChangePercentage: stockxProd.volatilityScoreChangePercentage,
            'product.volatilityScoreChangePercentage':publicProduct?.volatilityScoreChangePercentage,
            lastSalePrice:     stockxProd.lastSalePrice,
            'product.lastSalePrice':publicProduct?.lastSalePrice,
            lastSaleChangePercentage:     stockxProd.lastSaleChangePercentage,
            'product.lastSaleChangePercentage':publicProduct?.lastSaleChangePercentage,
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errorsStockxProducts))

        // created more than 30 mins ago but not imported yet
        if (!publicProduct && createdAtMinutesAgo > 30) {
            errorsRecord['publicProductMissing'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.brand != stockxProd.brand) {
            errorsRecord['brandMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.category2 != stockxProd.category2) {
            errorsRecord['category2Missmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.gender != stockxProd.gender) {
            errorsRecord['genderMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.color != stockxProd.color) {
            errorsRecord['colorMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.retailPrice != stockxProd.retailPrice) {
            errorsRecord['retailPriceMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.releaseDate != stockxProd.releaseDate) {
            errorsRecord['releaseDateMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.salesLast72Hours != stockxProd.salesLast72Hours) {
            errorsRecord['salesLast72HoursMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.salesLast72HoursChangePercentage != stockxProd.salesLast72HoursChangePercentage) {
            errorsRecord['salesLast72HoursChangePercentageMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.lastSalePrice != stockxProd.lastSalePrice) {
            errorsRecord['lastSalePriceMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.lastSaleChangePercentage != stockxProd.lastSaleChangePercentage) {
            errorsRecord['lastSaleChangePercentageMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.volatilityScore != stockxProd.volatilityScore) {
            errorsRecord['volatilityScoreMissmatch'] = true
        }

        if (stockxProd.updatedAt < updatedSince && publicProduct?.volatilityScoreChangePercentage != stockxProd.volatilityScoreChangePercentage) {
            errorsRecord['volatilityScoreChangePercentageMissmatch'] = true
        }

        if (stockxProd.processAt == null) {
            errorsRecord['processAtMissing'] = true
        }

        if (stockxProd.imageReferenceUrl == null) {
            errorsRecord['imageMissing'] = true
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            StockxProductReport.push(report)
        }

    })
    console.log(`Stockx Products Report:`.padEnd(65," "), StockxProductReport.length)
    if (StockxProductReport.length > 0) {
        csv = new objectsToCsv(StockxProductReport)
        await csv.toDisk(`${resultsDir}/StockxProductReport.csv`)
    }
    for (var errorType in errorsStockxProducts) {
        console.log(`>> ${errorType}`.padEnd(65," "), StockxProductReport.filter(r => r[errorType]).length)
    }

}


async function StockxProductsVariantsChecks() {
    /**
     * ProductsVariantsChecks
     */
    console.log('\n\n')
    console.log("#############################")
    console.log("#####  STOCKX VARIANTS CHECKS  ####")
    console.log("#############################")
    await fetchDBData(['products'], false)

    let StockxProductVariantReport = []
    const errorsStockxProductsVariants = {
        'publicVariantMissing': false,
        'duplicatedStockxVariant': false,
        'gtinMissmatch': false,
        'priceMissmatch': false
    }

    const dbPublicProductVariantLookupByStockxId= {}
    dbProducts.filter(p => p.public).map(p => p.variants.map(v => dbPublicProductVariantLookupByStockxId[v.stockxId] = v))
    const uniqueStockxVariantIdSet = new Set()

    stockxProducts.map(stockxProd => {
        stockxProd.variants.map(stockxVariant => {
            const createdAtMinutesAgo = Math.floor((Math.abs(new Date() - new Date(stockxProd.createdAt))/1000)/60)
            const publicProductVariant = dbPublicProductVariantLookupByStockxId[stockxVariant.stockxId]
            const updatedSince = moment().utc().subtract(30, 'minutes')
    
            const report = {
                publicvID:          publicProductVariant?.ID,
                stockxId:           stockxVariant.stockxId,
                'product.stockxId':           stockxProd.stockxId,
                'product.code':           stockxProd.styleId,
                createdAt:          moment(stockxProd.createdAt).format(),
                position:               stockxVariant.position,
                gtin:               stockxVariant.gtin,
                'publicv.gtin':    publicProductVariant?.gtin,
                price:               stockxVariant.lowestAsk ? stockxVariant.lowestAsk.toFixed(2) : null,
                'publicv.price':    publicProductVariant?.price,
            }

            // deep clone object for the record
            const errorsRecord = JSON.parse(JSON.stringify(errorsStockxProductsVariants))

            // created more than 30 mins ago but not imported yet
            if (!publicProductVariant && createdAtMinutesAgo > 30) {
                errorsRecord['publicVariantMissing'] = true
                for (var errorName in errorsRecord) {
                    report[errorName] = errorsRecord[errorName]
                }
                StockxProductVariantReport.push(report)
                return
            }

            if (stockxVariant.gtin && !publicProductVariant?.gtin && publicProductVariant?.gtin != stockxVariant.gtin) {
                errorsRecord['gtinMissmatch'] = true
            }

            if (report.price != report['publicv.price']) {
                errorsRecord['priceMissmatch'] = true
            }

            const key = `${stockxProd.stockxId}_${stockxVariant.stockxId}`
            if (uniqueStockxVariantIdSet.has(key)) {
                errorsRecord['duplicatedStockxVariant'] = true
            }

            uniqueStockxVariantIdSet.add(key)

            // if any error triggered - add record to report
            if (Object.values(errorsRecord).find(error => error) == true) {
                for (var errorName in errorsRecord) {
                    report[errorName] = errorsRecord[errorName]
                }
                StockxProductVariantReport.push(report)
            }
        })
    })

    StockxProductVariantReport = StockxProductVariantReport.slice(0, 50000)
    console.log(`Stockx Products Variants Report:`.padEnd(65," "), StockxProductVariantReport.length)
    if (StockxProductVariantReport.length > 0) {
        csv = new objectsToCsv(StockxProductVariantReport)
        await csv.toDisk(`${resultsDir}/StockxProductVariantReport.csv`)
    }
    for (var errorType in errorsStockxProductsVariants) {
        console.log(`>> ${errorType}`.padEnd(65," "), StockxProductVariantReport.filter(r => r[errorType]).length)
    }

}

async function algoliaProductsChecks() {
    await fetchDBData(['products'], false)

    const lookupDBProductByID = {}
    dbProducts.map(product => {
        const key = `${product.ID}`
        if (key in lookupDBProductByID) {
            lookupDBProductByID[key].push(product)
        } else {
            lookupDBProductByID[key] = [product]
        }
    })

    const algoliaProductReport = []
    const errorsProducts = {
        'missingDBProduct': false,
        'missingAccount': false,
        'statusMissmatch': false,
        'untrackedMissmatch': false,
        'descriptionMismatch': false,
    }

    const algoliasearch = require("algoliasearch");
    const algoliaClient = algoliasearch(configs.apis.algolia.appID, configs.apis.algolia.adminAPIKey);
    const productsIdx = algoliaClient.initIndex("products");

    let algoliaProducts = []
    const batches = utils.batchArray(dbProducts, 1000)
    let idx = 0
    for (var batch of batches) {
        const apbatch = await productsIdx.getObjects(batch.map(p => `${p.ID}`))
        algoliaProducts = algoliaProducts.concat(apbatch.results)
        idx += 1
    }
      
    algoliaProducts.map(aproduct => {
        const dbProductsMatch = lookupDBProductByID[`${aproduct.ID}`] || []

        const report = {
            'product.ID':                         aproduct.ID,
            'product.account.ID':                 dbProductsMatch[0].account?.ID,
            'algolia.product.account.ID':         aproduct.account?.ID,
            'product.account.name':               dbProductsMatch[0].account?.name,
            'algolia.product.account.name':       aproduct.account?.name,
            'product.public':                     dbProductsMatch[0].public,
            'algolia.product.public':             aproduct.public,
        }
        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errorsProducts))

        if (dbProductsMatch.length == 0) {
            errorsRecord['missingDBProduct'] = true
        }

        if (!aproduct.account) {
            errorsRecord['missingAccount'] = true
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            algoliaProductReport.push(report)
        }

    })
    console.log(`\n\Algolia Products Report:`.padEnd(65," "), algoliaProductReport.length)
    if (algoliaProductReport.length > 0) {
        csv = new objectsToCsv(algoliaProductReport)
        await csv.toDisk(`${resultsDir}/algoliaProductReport.csv`)
    }
    for (var errorType in errorsProducts) {
        console.log(`>> ${errorType}`.padEnd(65," "), algoliaProductReport.filter(r => r[errorType]).length)
    }
}

async function itemsReport() {
    console.log('\n\n')
    console.log("#############################")
    console.log("#####  ITEMS CHECKS  ####")
    console.log("#############################")
    await fetchDBData(['items'])

    const errors = {
        'itemMissingInboundOrderLineItem': false,   //
        'itemMissingInventoryID': false,   //not deleted at and not sold
        'itemInventoryLocationMissmatch': false,
        'itemSoldWithInventory': false,
        'duplicatedBarcode': false,
        'itemProductAccountMissmatch': false //item.accountID != item.product.accountID
    }

    const itemsReport = []
    const usedBarcodes = new Set()

    const accountsWarehousingService = await db.account.findAll({
        where: {}, 
        include: [
            {model: db.role, as: 'role', required: true, include: [
                { model: db.permission, required: true, as: 'permissions', include: [
                    { model: db.resource, required: true, as: 'resource', where: {name: 'service.warehousing'}}
                ]}
            ]}
        ]})
    const accountIDsWithWarehousingService = accountsWarehousingService.map(account => account.ID)

    dbItems.map(item => {
        const inboundOrdersAssociated = (item.orderLineItems.filter(oli => oli.orderTypeID == 3)).reverse((a, b) =>  a.ID - b.ID);
        const outboundOrdersAssociated = (item.orderLineItems.filter(oli => oli.orderTypeID == 4)).reverse((a, b) =>  a.ID - b.ID);
        const transferInOrdersAssociated = (item.orderLineItems.filter(oli => oli.orderTypeID == 1)).reverse((a, b) =>  a.ID - b.ID);
        const transferOutOrdersAssociated = (item.orderLineItems.filter(oli => oli.orderTypeID == 2)).reverse((a, b) =>  a.ID - b.ID);

        const report = {
            itemID: item.ID,
            createdAt: moment(item.createdAt),
            accountID: item.accountID, 
            productID: item.productID,
            'product.code': item.product.code,
            variantID: item.productVariantID,
            'variant.name': item.variant.name,
            itemStatus: item.status ? item.status.name : '',
            barcode: item.barcode,
            deletedAt: item.deletedAt ? moment(item.deletedAt) : '',
            itemWarehouse: item.warehouseID ? `${item.warehouse.name} (${item.warehouseID})` : '',
            inventoryWarehouseName: item.inventoryID ? item.inventory.warehouse?.name : '',
            inventoryID: item.inventoryID,
            inventoryWarehouseID: item.inventoryID ? item.inventory.warehouseID : '',
            inventoryWarehouseLocationID: '',
            inboundOrdersAssociated:  inboundOrdersAssociated.length,
            outboundOrdersAssociated: outboundOrdersAssociated.length,
            transferInOrdersAssociated: transferInOrdersAssociated.length,
            transferOutOrdersAssociated: transferOutOrdersAssociated.length,
            duplicatedBarcodesItemIDs: '',
            duplicatedBarcodesDeletedAt: '',
            inboundOLI1CreatedAt: inboundOrdersAssociated.length > 0 ? moment(inboundOrdersAssociated[0].createdAt) : '',
            outboundOLI1CreatedAt: outboundOrdersAssociated.length > 0 ? moment(outboundOrdersAssociated[0].createdAt) : '',
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errors))

        if (inboundOrdersAssociated.length == 0) {
            errorsRecord['itemMissingInboundOrderLineItem'] = true
        }

        if (item.deletedAt == null && outboundOrdersAssociated.length == 0 && item.inventoryID == null) {
            errorsRecord['itemMissingInventoryID'] = true
        }

        // if item not sold, not deleted and not in transit
        if (item.inventoryID != null && item.inventory.warehouseID != item.warehouseID && item.statusID == null) {
            errorsRecord['itemInventoryLocationMissmatch'] = true
        }

        // item sold but has inventoryID (exclude case where sold but then order canceled)
        if (item.inventoryID != null && outboundOrdersAssociated.length > 0 && outboundOrdersAssociated[outboundOrdersAssociated.length - 1].canceledAt == null) {
            errorsRecord['itemSoldWithInventory'] = true
        }

        if (item.accountID != item.product.accountID) {
            errorsRecord['itemProductAccountMissmatch'] = true
        }


        if (item.barcode != null && usedBarcodes.has(item.barcode)) {
            const affectedItems = dbItems.filter(i => item.barcode == i.barcode)
            report['duplicatedBarcodesItemIDs'] = affectedItems.map(i => i.ID).join(",")
            report['duplicatedBarcodesDeletedAt'] = affectedItems.map(i => i.deletedAt ? moment(i.deletedAt) : '-').join(",")
            errorsRecord['duplicatedBarcode'] = true
        }

        // keep track of unique barcodes
        if (item.barcode != null && !usedBarcodes.has(item.barcode)) {
            usedBarcodes.add(item.barcode)
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            itemsReport.push(report)
        }
    })

    if (itemsReport.length> 0){
        let reportCsv = new objectsToCsv(itemsReport)
        await reportCsv.toDisk(`${resultsDir}/itemsReport.csv`)
    }
    console.log(`Items Report:`.padEnd(65," "), itemsReport.length)
    for (var errorType in errors) {
        console.log(`>> ${errorType}`.padEnd(65," "), itemsReport.filter(r => r[errorType]).length)
    }
}

async function InventoryChecks() {
    /**
     * Inventory Checks
     * - inventoryItemWarehouseMissmatch => inventory.warehouseID != item.warehouseID
     * - itemsBarcodeDuplicate           => multiple items have the same barcode
     */

    console.log('\n\n')
    console.log("#############################")
    console.log("#####  INVENTORY CHECKS  ####")
    console.log("#############################")
    await fetchDBData(['inventory'])

    const errors = {
        'inventoryQuantityItemsMissmatch': false,   //inventory.quantity != invenotry.items.length
        'virtualInventoryQuantityMissmatch': false, //virtual inventory record has quantity but its not correctly set to 10
        'virtualInventoryItemsMissmatch': false,    //virtual inventory record has items linked to it
        'virtualInventoryAtLocation': false,    //virtual inventory record has a physical location
        'virtualInventoryDuplicateRecords': false,   //more than one virtual inventory record for same variant and account
        'inventoryProductAccountMissmatch': false,// inventory.accountID != inventory.product.accountID
        'missingListingsForInventoryLocation': false, // inventory location has no listings for warehouse's account
        'variantLinkedToWrongProduct': false,       // inventory variant is linked to the wrong product
    }

    const inventoryReport = []
    const virtualRecords = new Set() // used to find duplicate virtual inventory records (variantIDAccountID)


    // all inventory records
    dbInventory.map((invRecord) => {
        const report = {
            inventoryID: invRecord.ID,
            accountID: invRecord.accountID, 
            'isConsignor': invRecord.account.isConsignor, 
            'Inventory Quantity': invRecord.quantity,
            'warehouseID': invRecord.warehouseID,
            'warehouse.accountID': invRecord.warehouse? invRecord.warehouse.accountID : '',
            'Items Quantity': invRecord.items.length,
            'product.ID': invRecord.productID,
            'product.accountID': invRecord.product.accountID,
            'product.code': invRecord.product.code,
            'product.title': invRecord.product.title,
            'product.status': invRecord.product.status,
            'variant.ID': invRecord.variant.ID,
            'variant.productID': invRecord.variant.productID,
            'variant.name': invRecord.variant.name,
            'variants.status': invRecord.variant.status,
            'variant.sourceVariantID': invRecord.variant.sourceVariantID,
            'item.productID': invRecord.items.length > 0 ? invRecord.items[0].productID : '',
            updatedAt: moment(invRecord.updatedAt).format("YYYY-MM-DD HH:mm:ss"),
            virtual: invRecord.virtual,
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errors))

        if (invRecord.virtual == 0 && invRecord.quantity != invRecord.items.length) {
            errorsRecord['inventoryQuantityItemsMissmatch'] = true
        }

        if (invRecord.virtual == 1 && invRecord.quantity == 10 && invRecord.variant.status == 'deleted') {
            errorsRecord['virtualInventoryQuantityMissmatch'] = true
        }

        if (invRecord.virtual && invRecord.items.length > 0) {
            errorsRecord['virtualInventoryItemsMissmatch'] = true
        }

        if (invRecord.virtual) {
            const key = `${invRecord.productVariantID}-${invRecord.accountID}`
            if (virtualRecords.has(key)) {
                errorsRecord['virtualInventoryDuplicateRecords'] = true
            }
            virtualRecords.add(key)
        }

        if (invRecord.accountID != invRecord.product.accountID) {
            errorsRecord['inventoryProductAccountMissmatch'] = true
        }

        if (invRecord.variant.productID != invRecord.productID) {
            errorsRecord['variantLinkedToWrongProduct'] = true
        }

        // inventory at location with missing listing
        const recordListingAccIDs =  invRecord.listings.map(listing => listing.saleChannel.accountID)
        if (invRecord.warehouse && invRecord.quantity > 0 && !recordListingAccIDs.includes(invRecord.warehouse.accountID)) {
            errorsRecord['missingListingsForInventoryLocation'] = true
        }

        if (invRecord.virtual && invRecord.warehouseID != null) {
            errorsRecord['virtualInventoryAtLocation'] = true
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            inventoryReport.push(report)
        }
    })

    
    if (inventoryReport.length> 0){
        let reportCsv = new objectsToCsv(inventoryReport)
        await reportCsv.toDisk(`${resultsDir}/inventoryReport.csv`)
    }
    console.log(`Inventory Report:`.padEnd(65," "), inventoryReport.length)
    for (var errorType in errors) {
        console.log(`>> ${errorType}`.padEnd(65," "), inventoryReport.filter(r => r[errorType]).length)
    }
}

async function InventoryListingsChecks() {
    /**
     * Listings checks
     */
    console.log('\n\n')
    console.log("#####################################")
    console.log("##### INVENTORY LISTINGS CHECKS  ####")
    console.log("#####################################")

    await fetchDBData(['listings'])

    const errors = {
        'priceSourceMargin_missing': false,         //inventory.priceSourceName != null and priceSourceMargin == null
        'priceSourceMargin_below0': false,          //priceSourceMargin < 0
        'priceSourceName_missing': false,           //priceSourceName == null and priceSourceMargin != null
        'priceMissing': false,                      //missing price from inventory record
        'payoutMissing': false,                     //
        'virtualInventorySyncingButNoPrice': false,  // virtual inventory with syncing on, but source variant has no price
        'virtualInventoryNotSyncingButPrice': false, //
        'payout@0': false,                          //
        'payoutHigherThanPrice': false,             //
        'price@0': false,                           //priced at 0
        'duplicateListing': false,                  //variantID, accountID, salechannelID
        'saleChannelProductAccountMissmatch': false,// listing.saleChannel.accountID != listing.product.accountID
        'marketPriceError': false,
        'variantLinkedToWrongProduct': false,       // listing variant is linked to the wrong product
        'inventoryListingVariantNameMissmatch': false,
        'missingVariantMatch': false,               // listing is missing product variant match between accounts
        'deadListing': false,                         // listing variant has been deleted
        'listingPriceMissmatch': false
    }

    const listingsReport = []
    const invListingsRecordsIndex = new Set() // used to check if duplicate listings exist
    const variantExternalAccountIndex = new Set()
    const variantExternalVariantIndex = new Set()

    const _dbProductMatches = await db.productMatchLookup.findAll({where: {
        productVariantID: dbInventoryListings.map(l => l.inventory.productVariantID)
    }})

    _dbProductMatches.map(record => variantExternalAccountIndex.add(`${record.productVariantID}_${record.externalAccountID}`))
    _dbProductMatches.map(record => variantExternalVariantIndex.add(`${record.productVariantID}_${record.externalProductVariantID}`))

    const saleChannels = await db.saleChannel.findAll({
        where: {},
        include: [
            {model: db.transactionRate, as: 'fees'}
        ]
    })
    // all listings records
    dbInventoryListings.map((invListing) => {
        const variantExternalAccountKey = `${invListing.inventory.productVariantID}_${invListing.saleChannel.accountID}`
        const variantExternalVariantKey = `${invListing.inventory.productVariantID}_${invListing.productVariantID}`
        const uniqueListingKey = `${invListing.variant.ID}_${invListing.saleChannelID}_${invListing.inventoryID}`

        const report = {
            'createdAt': moment(invListing.createdAt).format(),
            'updatedAt': moment(invListing.updatedAt).format(),
            inventoryListingID: invListing.ID,
            'accountID': invListing.accountID,
            'saleChannel.ID': invListing.saleChannelID,
            'saleChannel.accountID': invListing.saleChannel.accountID,
            'product.accountID': invListing.product.accountID,
            'product.ID': invListing.productID,
            'inventory.productID': invListing.inventory.productID,
            'product.code': invListing.product.code,
            'inventory.product.code': invListing.inventory.product.code,
            'product.title': invListing.product.title,
            'inventory.product.title': invListing.inventory.product.title,
            'product.status': invListing.product.status,
            'inventory.product.status': invListing.inventory.product.status,
            'variant.ID': invListing.productVariantID,
            'inventory.variantID': invListing.inventory.productVariantID,
            'variant.name': invListing.variant.name,
            'inventory.variant.name': invListing.inventory.variant.name,
            'variant.productID': invListing.variant.productID,
            'variant.status': invListing.variant.status,
            'inventory.status': invListing.inventory.variant.status,
            inventoryID: invListing.inventoryID,
            'inventory.product.accountID': invListing.inventory.product.accountID,
            inventoryQuantity: invListing.inventory.quantity,
            status: invListing.status,
            payout: invListing.payout,
            price: invListing.price,
            'listingPriceComputed': '',
            'Source Variant Price': invListing.variant.sourceProductVariant?.price || '',
            'Margin': invListing.priceSourceMargin,
            'marketPriceComputed': '',
            variantExternalAccountKey: variantExternalAccountKey,
            variantExternalVariantKey: variantExternalVariantKey
        }
        //if pricesourcemargin is set - compute the market price on the fly
        if (invListing.priceSourceMargin) {
            const postFeesMarketPrice = ((invListing.variant.sourceProductVariant?.price * 1.05) + 15)
            let unitPrice = Number((postFeesMarketPrice / (1 - (invListing.priceSourceMargin / 100))).toFixed(2))
            unitPrice = unitPrice > 99999999 ? 99999999.99 : unitPrice
            report['marketPriceComputed'] = invListing.variant.sourceProductVariant?.price ? unitPrice : 0.00
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errors))

        if ((invListing.saleChannelID == 1) && (invListing.accountID != 3) && invListing.inventory.quantity > 0) {
            const saleChannel = saleChannels.find(saleChannel => saleChannel.ID == invListing.saleChannelID)
            report['listingPriceComputed'] = apiUtils.computeSaleChannelPrice(saleChannel, invListing).toFixed(2)

            if (parseFloat(report['listingPriceComputed']) - parseFloat(invListing.price) < -5) {
                errorsRecord['listingPriceMissmatch'] = true
            }
        }

        if (invListing.variant.status == "deleted" && invListing.inventory.quantity > 0) {
            errorsRecord['deadListing'] = true
        }

        // the pair inventory.variantID_listing.variantID doesn't have a productmatch record - 
        // might indicate that the inventory.variantID has been linked to the 
        // wrong external variant if the record doesn't have the missingVariantMatch error 
        // (which indicates if exist a match for the external sale channel. Not exactly which)
        if (invListing.saleChannel.accountID != invListing.accountID && !variantExternalVariantIndex.has(variantExternalVariantKey)) {
            errorsRecord['missingVariantMatch'] = true
        }

        if (invListing.priceSourceName != null && invListing.priceSourceMargin == null) {
            errorsRecord['priceSourceMargin_missing'] = true
        }

        if (invListing.priceSourceMargin < 0) {
            errorsRecord['priceSourceMargin_below0'] = true
        }

        if (invListing.priceSourceName == null && invListing.priceSourceMargin != null) {
            errorsRecord['priceSourceName_missing'] = true
        }

        if (invListing.price == null) {
            errorsRecord['priceMissing'] = true
        }

        if (invListing.saleChannel.accountID != invListing.product.accountID) {
            errorsRecord['saleChannelProductAccountMissmatch'] = true
        }

        if (invListing.variant.productID != invListing.productID) {
            errorsRecord['variantLinkedToWrongProduct'] = true
        }

        if (invListing.price == 0 && invListing.inventory.quantity > 0 && invListing.status == 'active') {
            errorsRecord['price@0'] = true
        }

        if (invListing.payout == null) {
            errorsRecord['payoutMissing'] = true
        }

        // check for edit ldn that stock price is correct
        if (invListing.variant.status != 'deleted' && invListing.priceSourceName && invListing.accountID == 3 && report['marketPriceComputed'] != 0.00 && Math.abs(1 - (report['marketPriceComputed'] / invListing.price)) > 0.025) {
            errorsRecord['marketPriceError'] = true
        }

        if (parseFloat(invListing.payout) > parseFloat(invListing.price)) {
            errorsRecord['payoutHigherThanPrice'] = true
        }

        if (invListingsRecordsIndex.has(uniqueListingKey)) {
            errorsRecord['duplicateListing'] = true
        } else {
            invListingsRecordsIndex.add(uniqueListingKey)
        }

        if (invListing.inventory.virtual && invListing.priceSourceName && invListing.variant.sourceProductVariant?.price == null) {
            errorsRecord['virtualInventorySyncingButNoPrice'] = true
        }

        if (invListing.inventory.virtual && !invListing.priceSourceName && invListing.variant.sourceProductVariant?.price) {
            errorsRecord['virtualInventoryNotSyncingButPrice'] = true
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            listingsReport.push(report)
        }
    })

    if (listingsReport.length> 0){
        let reportCsv = new objectsToCsv(listingsReport)
        await reportCsv.toDisk(`${resultsDir}/listingsReport.csv`)
    }
    console.log(`Listings Report:`.padEnd(65," "), listingsReport.length)
    for (var errorType in errors) {
        console.log(`>> ${errorType}`.padEnd(65," "), listingsReport.filter(r => r[errorType]).length)
    }
}

async function ShopifyInventoryChecks() {
    console.log('\n\n')
    console.log("#####################################")
    console.log("#####  SHOPIFY INVENTORY CHECKS  ####")
    console.log("#####################################")

    const startCheckDate =new Date() ;
    dbInventoryListings = undefined // remove chaced data if run some check before this
    await fetchDBData(['listings'], updatedAtLimit = false)

    const inventoryListingLookupByForeignVariantID = {}
    const lookupShopifyProductByID = {}

    let shopifySaleChannels = await db.saleChannel.findAll({
        where: {platform: 'shopify'}
    })
    const lookupSaleChannelByID = {}
    for (var saleChannel of shopifySaleChannels) {
        lookupSaleChannelByID[saleChannel.ID] = saleChannel
    }

    //refetch shopify products with latest price
    let shopifyProducts = []
    for (var saleChannel of shopifySaleChannels) {
        const saleChannelProducts = await utils.getShopifyProducts(saleChannel.accountID, true)
        shopifyProducts = shopifyProducts.concat(saleChannelProducts)
    }

    
    shopifyProducts.map(sprod => {
        const key = `${sprod.id}`
        lookupShopifyProductByID[key] = sprod
    })
    const shopifyProductsActiveDraft = shopifyProducts.filter(prod => (prod.status == 'active' || prod.status == "draft") && (!prod.tags.includes('wiredhub-untracked'))) // remove archived products
    shopifyVariants = []
    shopifyProductsActiveDraft.map(product => product.variants.map(variant => shopifyVariants.push(variant)))

    // Group inventory listings by variant foreign ID to be sorted later
    dbInventoryListings
    .filter(listing => (listing.saleChannelID in lookupSaleChannelByID))
    .filter(listing => listing.inventory.quantity > 0)
    .filter(listing => listing.status == 'active')
    .filter(listing => listing.variant.foreignID).map(listing => {
        const key = `${listing.variant.foreignID}`
        if (key in inventoryListingLookupByForeignVariantID) {
            inventoryListingLookupByForeignVariantID[key].push(listing)
        } else {
            inventoryListingLookupByForeignVariantID[key] = [listing]
        }
    })

    // select inventory for each variant
    for (var key in inventoryListingLookupByForeignVariantID) {
        const invListingRecords = inventoryListingLookupByForeignVariantID[key]
        // sort them first by ID in order to avoid sorting incongruencies with the inventoryListing.activeListing()
        let sortedInvListingRecords = invListingRecords.sort((listingA, listingB) => listingA.ID < listingB.ID)
        sortedInvListingRecords = invListingRecords.sort((listingA, listingB) => {
            // saleChannel has sameDayDelivery enabled - apply conditional sorting
            if (listingA.saleChannel.sameDayDelivery){
                const listingAAtInternalFulCentre = listingA.inventory.warehouse?.fulfillmentCentre && listingA.inventory.warehouse?.accountID == listingA.saleChannel.accountID
                const listingBAtInternalFulCentre = listingB.inventory.warehouse?.fulfillmentCentre && listingB.inventory.warehouse?.accountID == listingA.saleChannel.accountID

                // if listingA in internal fulfilment centre and listing B in external fulfilment centre
                if (listingAAtInternalFulCentre && !listingBAtInternalFulCentre){
                    if(listingA.saleChannel.sameDayDeliveryInternalPriorityMargin){
                        // price for listing B to beat listing A
                        const priceToBeat = listingA.price - (listingA.price * (listingA.saleChannel.sameDayDeliveryInternalPriorityMargin /100))
                        //listing B beats listing A's undercutting price from sameDayDeliveryInternalPriorityMargin - listing B goes first
                        return listingB.price < priceToBeat ? 1 : -1
                    }
                    else {
                        // listing A beats listing B - listing A goes first because it is in internal fulfilment centre
                        return -1
                    }
                }

                // if listingB in internal fulfilment centre and listing A in external fulfilment centre
                if (listingBAtInternalFulCentre && !listingAAtInternalFulCentre){
                    if(listingA.saleChannel.sameDayDeliveryInternalPriorityMargin) {
                        // price for listing A to beat listing B
                        const priceToBeat = listingB.price - (listingB.price * (listingA.saleChannel.sameDayDeliveryInternalPriorityMargin / 100))
                        //listing A beats listing B's undercutting price from sameDayDeliveryInternalPriorityMargin - listing A goes first
                        return listingA.price < priceToBeat ? -1 : 1
                    }
                    else {
                        // listing B beats listing A - listing B goes first because it is in internal fulfilment centre
                        return 1
                    }
                }
            }

            // if listingA has a lower price  - listingA goes first
            if (parseFloat(listingA.price) < parseFloat(listingB.price)) {
                return -1
            }
            // if listingB has a lower price  - listingB goes first
            if (parseFloat(listingA.price) > parseFloat(listingB.price)) {
                return 1
            }

            // if listingA is older  - listingA goes first
            if (listingA.ID < listingB.ID) {
                return -1
            } else { // if listingB is older - listingB goes first 
                return 1
            }
        })

        inventoryListingLookupByForeignVariantID[key] = sortedInvListingRecords.filter(invListing => 
            sortedInvListingRecords[0].virtual == invListing.virtual &&
            sortedInvListingRecords[0].price == invListing.price &&
            sortedInvListingRecords[0].inventory.warehouse?.ID == invListing.inventory.warehouse?.ID &&
            sortedInvListingRecords[0].inventory.warehouse?.accountID == invListing.inventory.warehouse?.accountID
        )        
    }


    const shopifyInventoryReport = []
    const errors = {
        'priceMissmatch': false,
        'quantityMissmatch': false,
        'selling@0': false,
        'priceBelowStockx': false
    }
    for (let _shopifyVariant of shopifyVariants){
        let selectedInventoryListings = inventoryListingLookupByForeignVariantID[`${_shopifyVariant.id}`] || []
        const shopifyListing = {
            price: selectedInventoryListings[0]?.price,
            quantity: selectedInventoryListings.reduce((sum, listing) => sum += parseFloat(listing.inventory.quantity), 0)
        }

        const lastUpdated = Math.floor((Math.abs(startCheckDate - new Date(_shopifyVariant.updated_at))/1000)/60)
        const sproduct = lookupShopifyProductByID[_shopifyVariant.product_id]
        //const stockxPrice = publicVariantsByID[]
        // skip record if shopify product not in the database (look at shopify products report for debugging)
        if (!sproduct) {
            console.log(`Missing Shopify Product ${_shopifyVariant.product_id}`)
            continue
        }

        const report = {
            minutesSinceLastUpdate : lastUpdated,
            shopify_variant_updatedAt:              moment(_shopifyVariant.updated_at).utc().format("YYYY-MM-DD HH:mm:ss"),
            shopify_shop:       sproduct.saleChannel,
            saleChannelAccountID:  selectedInventoryListings[0]?.saleChannel.accountID || '',
            shopifyQuantity: _shopifyVariant.inventory_quantity,
            dbQuantity:      shopifyListing.quantity || '',
            shopifyPrice:    _shopifyVariant.price,
            listingPrice:    shopifyListing.price || '',
            priceDifference:     _shopifyVariant.price - shopifyListing.price,
            url: `https://${sproduct.saleChannel}.myshopify.com/admin/products/${sproduct.id}/variants/${_shopifyVariant.id}`,
            product_variant: `${sproduct.title} ${_shopifyVariant.title}`, 
            payout:          selectedInventoryListings[0]?.payout || '',
            shopify_prod_id: _shopifyVariant.product_id,
            productID:       selectedInventoryListings[0]?.productID || '',
            shopify_variant_id: _shopifyVariant.id,
            variantID:       selectedInventoryListings[0]?.productVariantID || '',
            inventoryID:     selectedInventoryListings.map(l => l.inventory.ID).join(","),
            listingIDs:      selectedInventoryListings.map(l => l.ID).join(","),
            shopify_variant_inventory_item_id: _shopifyVariant.inventory_item_id,
            //stockxPrice:     stockxPrice,
            //inventoryUpdatedAt: selectedInventoryListings[0] ? moment(selectedInventoryListings[0].updatedAt).utc().format("YYYY-MM-DD HH:mm:ss") : '',
            //variantUpdatedAt:   selectedInventoryListings[0] ? moment(selectedInventoryListings[0].variant.updatedAt).utc().format("YYYY-MM-DD HH:mm:ss") : '',
            //directLoggerUrl: `https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%0Aresource.labels.service_name%3D%22production-api%22%0AjsonPayload.message%3D%22shopify-api%20-%20Get%20Variant%${_shopifyVariant.id}%22;timeRange=PT24H;cursorTimestamp=${moment(selectedInventory.variant.updatedAt).utc().toISOString()};resultsSearch=${_shopifyVariant.id}?project=wiredhub`
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errors))

        //Price mismatch - only if shopify variant has quantity > 0 and price difference > 5 and last update was more than 10 minutes ago
        if (selectedInventoryListings.length > 0 && (shopifyListing.price != _shopifyVariant.price) && (_shopifyVariant.inventory_quantity > 0) && (lastUpdated > 10) && (Math.abs(shopifyListing.price - _shopifyVariant.price) > 5)){
            errorsRecord['priceMissmatch'] = true
        }

        // quantity mismatch - don't count record for which we don't have listings (shopify products uploaded off-platform)
        if (selectedInventoryListings.length > 0 && (shopifyListing.quantity != _shopifyVariant.inventory_quantity) && (lastUpdated > 10)) {
            errorsRecord['quantityMissmatch'] = true
        }

        //selling at 0
        if (_shopifyVariant.price == 0 && _shopifyVariant.quantity > 0){
            errorsRecord['selling@0'] = true
        }

        //if (selectedInventory && selectedInventory.priceSourceName && selectedInventory.price < stockxPrice ) {
        //    const stockxPrice = (stockxVariant.lowestAsk || stockxVariant.lastSale)  * 1.03 + 13.5
        //    errorsRecord['priceBelowStockx'] = true
        //}

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            shopifyInventoryReport.push(report)
        }
    }

    if (shopifyInventoryReport.length> 0){
        let reportCsv = new objectsToCsv(shopifyInventoryReport)
        await reportCsv.toDisk(`${resultsDir}/shopifyInventoryReport.csv`)
    }
    console.log(`Shopify Inventory Report:`.padEnd(65," "), shopifyInventoryReport.length)
    for (var errorType in errors) {
        console.log(`>> ${errorType}`.padEnd(65," "), shopifyInventoryReport.filter(r => r[errorType]).length)
    }
}

async function ordersChecks() {
    await fetchDBData(['orders'])

    console.log("#############################")
    console.log("#####   ORDERS CHECKS   #####")
    console.log("#############################")
    // order status matches order line items statuses
    const report = []
    for (var order of dbOrders) {
        let siblingOrder;
        if (order.siblingOrderID != null) {
            siblingOrder = dbOrders.find(o => o.ID == order.siblingOrderID)
        }
        
        const record = {
            'id': order.ID,
            'shopify id': order.foreignID,
            'sibling id': siblingOrder ? siblingOrder.ID : '',
            'reference': order.reference1,
            'status': order.status.name,
            'sibling status': siblingOrder ? siblingOrder.status.name : '',
            'type': order.type.name,
            'quantity': order.quantity,
            'olis': order.orderLineItems.length,
            'statuses oli': null
        }
    
        const problems = new Set()

        // check quantity
        if (order.orderLineItems.length == 0) {
            problems.add('empty')
        }

        if (order.quantity != order.orderLineItems.filter(oli => (oli.status.name != "deleted" || (oli.status.name == "rejected" && oli.item.accountID == order.accountID))).length) {
            problems.add('quantityMissmatch')
        }

        if ((order.type.name == "transfer-in" | order.type.name == "transfer-out") && order.siblingOrderID == null) {
            problems.add('missingSiblingOrder')
        }

        if (order.siblingOrderID != null) {
            if (siblingOrder && (siblingOrder.statusID != order.statusID)) {
                problems.add('siblingOrderStatusMissmatch')
            }
        }

        // check status compare to order line items
        let orderLineItemStatuses = new Set()
        order.orderLineItems.map(orderLineItem => {
            orderLineItemStatuses.add(orderLineItem.status.name)
        })

        record['statuses oli'] = ([...orderLineItemStatuses]).join(",")
        let orderStatus;
        if (order.type.name == "inbound" ) {
            const hasCreated = orderLineItemStatuses.has('created')
            const hasDeleted = orderLineItemStatuses.has('deleted')
            const hasFulfilling = orderLineItemStatuses.has('fulfilling')
            const hasDelivered = orderLineItemStatuses.has('delivered')

            if (hasDeleted) orderStatus = 'deleted'

            if (hasCreated) orderStatus = 'created'

            if (hasCreated && hasFulfilling) orderStatus = 'partially-fulfilling'

            if (!hasCreated && hasFulfilling) orderStatus = 'fulfilling'

            if (hasFulfilling && hasDelivered) orderStatus = 'partially-delivered'

            if (!hasFulfilling && hasDelivered) orderStatus = 'delivered'
        }
        if (order.type.name == "outbound" ) {
            const isConsignorOrder = order.account.isConsignor
            const hasPending = orderLineItemStatuses.has('pending')
            const hasRefund = orderLineItemStatuses.has('refunded') || orderLineItemStatuses.has('refunded-restocked')
            const hasReject = orderLineItemStatuses.has('rejected')
            const hasConfirmed = orderLineItemStatuses.has('confirmed')
            const hasFulfilling = orderLineItemStatuses.has('fulfilling')
            const hasDispatch = orderLineItemStatuses.has('dispatched')
            const hasDelivered = orderLineItemStatuses.has('delivered')
        
            //pending status
            if (hasPending) orderStatus = 'pending'
            //
            if (hasReject && isConsignorOrder) orderStatus = 'partially-rejected'
        
            if (hasReject && !hasPending && !hasConfirmed && !hasDispatch && isConsignorOrder)  orderStatus = 'rejected'
        
            if (hasRefund ) orderStatus = 'partially-refunded'
        
            if (hasRefund && !hasPending && !hasConfirmed && !hasDispatch)  orderStatus = 'refunded'
        
            if (hasConfirmed) orderStatus = 'partially-confirmed'
        
            if (hasConfirmed && !hasPending) orderStatus = 'confirmed'

            if (hasFulfilling) orderStatus = 'fulfilling'
        
            if (hasDispatch) orderStatus = 'partially-dispatched'
        
            if (hasDispatch && !hasPending && !hasConfirmed && !hasFulfilling) orderStatus = 'dispatched'

            if (hasDispatch && hasDelivered) orderStatus = 'partially-delivered'

            if (!hasDispatch && hasDelivered) orderStatus = 'delivered'
        }
        // TODO: See if transfer status logic can be merged with inbound or outbound after fulfillment refactoring
        if (order.type.name == "transfer-in" || order.type.name == "transfer-out") {
            const hasCreated = orderLineItemStatuses.has('created')
            const hasFulfilling = orderLineItemStatuses.has('fulfilling')
            const hasDispatch = orderLineItemStatuses.has('dispatched')
            const hasDelivered = orderLineItemStatuses.has('delivered')

            if (hasCreated) orderStatus = 'created'

            if (hasCreated && hasFulfilling) orderStatus = 'partially-fulfilling'

            if (!hasCreated && hasFulfilling) orderStatus = 'fulfilling'

            if (!hasCreated && !hasFulfilling && hasDispatch) orderStatus = 'dispatched'

            if (hasFulfilling && hasDelivered) orderStatus = 'partially-delivered'

            if (!hasFulfilling && hasDelivered) orderStatus = 'delivered'
        } 

        if (orderStatus != order.status.name) {
            problems.add('wrongStatus')
        }

        if (problems.size > 0) {
            record['empty'] = problems.has('empty')
            record['quantityMissmatch'] = problems.has('quantityMissmatch')
            record['wrongStatus'] = problems.has('wrongStatus')
            record['missingSiblingOrder'] = problems.has('missingSiblingOrder')
            record['siblingOrderStatusMissmatch'] = problems.has('siblingOrderStatusMissmatch')

            report.push(record)
        }
    }


    console.log(`Orders`.padEnd(50," "), report.length)
    if (report.length > 0) {
        csv = new objectsToCsv(report)
        await csv.toDisk(`${resultsDir}/orders.csv`)
    }
}

async function shopifyOrdersChecks() {


    const shopifyOrdersReport = []
    shopifyOrders.map(sorder => {
        const sorderQty = sorder.line_items.reduce((qty, lineItem) => qty += lineItem.quantity, 0)
        const dbretailerOrder = dbAdminOrders.find(order => order.foreignID == sorder.id)

        const report = {
            'Shopify Order ID': sorder.id,
            'Shopify Order Quantity': orderQty,
            'Shopify Cancelled': sorder.cancelled_at != null ? 'YES' : '',
            'Shopify Fulfillment Status': sorder.fulfillment_status,
            'Shopify Financial Status': sorder.financial_status,
        }



        // shopify items.price tot == adminOrder.invoiceAmount
        if (dbAdminOrder.invoice.totalAmount != parseFloat(sorder.total_line_items_price)) {
            // don't consider shopify orders amount 0 - data inconsistency of some other app
            if (parseFloat(sorder.total_line_items_price) == 0) {
                return
            }
            const tags = []
            const delta = dbAdminOrder.invoice.totalAmount - parseFloat(sorder.total_line_items_price)

            for (var sLineItem of sorder.line_items) {
                const dbOrderLineItem = dbAdminOrder.orderLineItems.find(oli => oli.variant.foreignID == sLineItem.variant_id)
                if (dbOrderLineItem && dbOrderLineItem.price != sLineItem.price) {
                    tags.push("Item pulled at wrong price - need adjustment")
                }
            }

            const itemdeleted = sorder.line_items.find(item => item.product_exists == false)
            if (itemdeleted) {
                tags.push("Item deleted on shopify")
            }

            const refundedOrderLineItem = dbAdminOrder.orderLineItems.find(oli => oli.status.name == "refunded" && oli.item.accountID != 3)
            if (refundedOrderLineItem) {
                tags.push("consignor refund")
            }

            ShopifyTotalAmount_invoiceTotalAmountMissmatch.push({
                'Order ID Shopify': sorder.id,
                'Order ID': dbAdminOrder.ID,
                'Order Account ID': dbAdminOrder.accountID,
                'Order Number Shopify': sorder.order_number,
                'Order Total Amount': dbAdminOrder.invoice.totalAmount,
                'Order Amount Shopify': parseFloat(sorder.total_line_items_price),
                'Difference': delta.toFixed(2),
                'Order Quantity': dbAdminOrder.quantity,
                'Order Quantity Shopify': sorder.line_items.reduce((qty, lineItem) => qty += lineItem.quantity, 0),
                'Financial Status': sorder.financial_status,
                'Fulfillment Status': sorder.fulfillment_status,
                'Invoice ID': dbAdminOrder.invoice.ID,
                'Tag': tags.join(", ")
            })
        }

        // compare orderLineItems statuses
        const refundsLineItems = []
        sorder.refunds.map(refund => refund.refund_line_items.map(rli => refundsLineItems.push(rli)))

        for (var sli of sorder.line_items) {
            const refunded = refundsLineItems.find(rli => rli.line_item_id == sli.id)

            const olis = dbAdminOrder.orderLineItems.filter(oli => oli.variant.foreignID == sli.variant_id)
            for (var oli of olis) { // manage quantity > 1
                if (!oli && !sli.product_exists) { // skip products that don;t exists
                    continue
                }
    
                if (!oli) {
                    ShopifyLineItemsStatus_orderLineItemsStatusMissmatch.push({
                        "Order Number": sorder.order_number,
                        "refunded": refunded != null,
                        "Product Variant": `${sli.title} ${sli.variant_title}`,
                        "OLI status": "",
                        "Shopify Fulfillment Status": sli.fulfillment_status,
                        "OLI Fulfillment Status": "",
                        "Tags": "MISSING OLI"
                    })
                    continue
                }
    
                /**
                 * REFUNDED STATUS
                 */
                if (refunded && oli.status.name != "refunded") {
                    const tags = ["set status refunded"]
                    if (sli.fulfillment_status == null && oli.fulfillment) {
                        tags.push("Remove fulfillment")
                    }
    
                    if (sli.fulfillment_status == "fulfilled" && !oli.fulfillment) {
                        tags.push("Adding fulfillment")
                    }
    
                    if (sli.fulfillment_status == "restocked") {
                        tags.push("Not handleled atm")
                    }
    
                    ShopifyLineItemsStatus_orderLineItemsStatusMissmatch.push({
                        "Order Number": sorder.order_number,
                        "Product Variant": `${sli.title} ${sli.variant_title}`,
                        "refunded": refunded != null,
                        "OLI status": oli.status.name,
                        "Shopify Fulfillment Status": sli.fulfillment_status,
                        "OLI Fulfillment Status": oli.fulfillment ? oli.fulfillment.status.name : 'N/A',
                        "Tags": tags.join(", ")
                    })
                }
    
                /**
                 * FULFILLMENT STATUS
                 */
                
                if (!refunded && sli.fulfillment_status == "fulfilled" && (oli.fulfillment == null || oli.fulfillment.status.name == "created")) {
                    const tags = []
                    ShopifyLineItemsStatus_orderLineItemsStatusMissmatch.push({
                        "Order Number": sorder.order_number,
                        "Product Variant": `${sli.title} ${sli.variant_title}`,
                        "refunded": refunded != null,
                        "OLI status": oli.status.name,
                        "Shopify Fulfillment Status": sli.fulfillment_status,
                        "OLI Fulfillment Status": oli.fulfillment ? oli.fulfillment.status.name : 'N/A',
                        "Tags": tags.join(", ")
                    })
                }
            }
            
        }

    })

    if (ShopifyOrdersCancelledAndPaid.length > 0) {
        csv = new objectsToCsv(ShopifyOrdersCancelledAndPaid)
        await csv.toDisk(`${resultsDir}/ShopifyOrdersCancelledAndPaid.csv`)
    }
    console.log(`ShopifyLineItemsQuantity_orderLineItemsQtyMissmatch:`.padEnd(65," "), ShopifyLineItemsQuantity_orderLineItemsQtyMissmatch.length)
    if (ShopifyLineItemsQuantity_orderLineItemsQtyMissmatch.length > 0) {
        csv = new objectsToCsv(ShopifyLineItemsQuantity_orderLineItemsQtyMissmatch)
        await csv.toDisk(`${resultsDir}/ShopifyLineItemsQuantity_orderLineItemsQtyMissmatch.csv`)
    }
    
    console.log(`ShopifyOrderStatus_orderStatusMissmatch:`.padEnd(65," "), ShopifyOrderStatus_orderStatusMissmatch.length)
    if (ShopifyOrderStatus_orderStatusMissmatch.length > 0) {
        csv = new objectsToCsv(ShopifyOrderStatus_orderStatusMissmatch)
        await csv.toDisk(`${resultsDir}/ShopifyOrderStatus_orderStatusMissmatch.csv`)
    }

    console.log(`ShopifyTotalAmount_invoiceTotalAmountMissmatch:`.padEnd(65," "), ShopifyTotalAmount_invoiceTotalAmountMissmatch.length)
    if (ShopifyTotalAmount_invoiceTotalAmountMissmatch.length > 0) {
        csv = new objectsToCsv(ShopifyTotalAmount_invoiceTotalAmountMissmatch)
        await csv.toDisk(`${resultsDir}/ShopifyTotalAmount_invoiceTotalAmountMissmatch.csv`)
    }

    console.log(`ShopifyLineItemsStatus_orderLineItemsStatusMissmatch:`.padEnd(65," "), ShopifyLineItemsStatus_orderLineItemsStatusMissmatch.length)
    if (ShopifyLineItemsStatus_orderLineItemsStatusMissmatch.length > 0) {
        csv = new objectsToCsv(ShopifyLineItemsStatus_orderLineItemsStatusMissmatch)
        await csv.toDisk(`${resultsDir}/ShopifyLineItemsStatus_orderLineItemsStatusMissmatch.csv`)
    }
    
}

async function ordersInboundChecks() {

        ordersInQuantityMissmatch = []
        ordersInGeneralMissmatch = []
        ordersInOLIGeneralMissmatches = []
        for (var order of ordersIn) {
            // check orderin quantity matches the number of items in the order
            //leave out OLIs marked as deleted (removed from order in)
            order.orderLineItems = order.orderLineItems.filter(oli => oli.statusID != 3)
            if (order.orderLineItems.length != order.quantity) {
                ordersInQuantityMissmatch.push({
                    'Order ID': order.ID,
                    'Order Account ID': order.accountID,
                    'Order Qty': order.quantity,
                    'Order OLI Qty': order.orderLineItems.length,
                })
            }
            // Based on the status - check if all the other values are in check
            const record = {
                'Order ID': order.ID,
                'Account ID': order.accountID,
                'Account': order.account.name,
                'Order Status': order.status.name,
                tags: []
            }
    
            if (order.status.name == "partially-fulfilling") {
                const fulfillingOLI = order.orderLineItems.filter(oli => oli.status.name == "fulfilling")
                if (fulfillingOLI.length == 0) {
                    record.tags.push("Status partially-fulfilling but No OLI with status fulfilling")
                }
            }
    
            if (order.status.name == "fulfilling") {
                const notFulfillingOLI = order.orderLineItems.filter(oli => oli.status.name == "created")
                if (notFulfillingOLI.length > 0) {
                    record.tags.push("Status fulfilling but OLI with status createds")
                }
            }
    
            if (order.status.name == "partially-arrived") {
                const arrivedOLI = order.orderLineItems.filter(oli => oli.status.name == "confirmed")
                if (arrivedOLI.length == 0) {
                    record.tags.push("Status poartially-arrived but not OLI with status arrived")
                }
            }
    
            if (order.status.name == "arrived") {
                const notArrivedOLI = order.orderLineItems.filter(oli => oli.status.name != "confirmed" &&  oli.status.name != "deleted"
                )
                if (notArrivedOLI.length > 0) {
                    record.tags.push("Some OLI missing status confirmed")
                }
            }
    
    
            if (record.tags.length > 0) {
                record.tags = record.tags.join(", ")
                ordersInGeneralMissmatch.push(record)
            }
    
            // Based on the oli status - check if all the other values are in check
            for (var oli of order.orderLineItems) {
                const recordOLI = {
                    'Order ID': order.ID,
                    'Order Stattus': order.status.name,
                    'Account ID': order.accountID,
                    'Account': order.account.name,
                    'OrderLineItem': oli.ID,
                    'OrderLineItem Status': oli.status.name,
                    'Fulfillment ID': oli.fulfillmentID ? oli.fulfillmentID : '',
                    'Fulfillment Status': oli.fulfillment ? oli.fulfillment.status.name : '',
                    'Product': `${oli.product.title} ${oli.variant.name}`,
                    tags: []
                }
    
                if (oli.accountID != order.accountID) { // Shared fulfillment case -  exclude other account order OLIs.
                    continue
                }
                if(order.status.name == 'arrived' && (oli.status.name != 'confirmed' && oli.status.name != 'deleted') ){
                    recordOLI.tags.push("order arrived but oli not confirmed")
                }
    
    
    
                if (oli.status.name == "created") {
                    if (oli.fulfillmentID != null) {
                        recordOLI.tags.push("It shouldn't have fulfillment")
                    }
                }
    
                if (oli.status.name == "fulfilling") {
                    if (oli.fulfillmentID == null) {
                        recordOLI.tags.push("Missing fulfillment")
                        continue
                    }
    
                    if (!oli.fulfillment) {
                        recordOLI.tags.push(`Fulfillment is missing but showing fulfilling`)
                    }
    
                    if (oli.fulfillment && oli.fulfillment.destinationAddressID == null) {
                        recordOLI.tags.push("Missing fulfillment destination")
                    }
                }
    
                if (oli.status.name == "confirmed") {
                    if (oli.fulfillmentID == null) {
                        recordOLI.tags.push("Missing fulfillment")
                        continue
                    }
                    if (oli.fulfillment.destinationAddressID == null) {
                        recordOLI.tags.push("Missing fulfillment destination")
                    }
    
                    if (oli.fulfillment.status.name == 'delivered' && oli.fulfillment.completedAt == null) {
                        recordOLI.tags.push("Missing fulfillment completedAt")
                    }
                }
    
                if (recordOLI.tags.length > 0) {
                    recordOLI.tags = recordOLI.tags.join(", ")
                    ordersInOLIGeneralMissmatches.push(recordOLI)
                }
            }
        }
        console.log(`ordersInQuantityMissmatch:`.padEnd(65," "), ordersInQuantityMissmatch.length)
        if (ordersInQuantityMissmatch.length > 0) {
            csv = new objectsToCsv(ordersInQuantityMissmatch)
            await csv.toDisk(`${resultsDir}/ordersInQuantityMissmatch.csv`)
        }
        console.log(`ordersInGeneralMissmatch:`.padEnd(65," "), ordersInGeneralMissmatch.length)
        if (ordersInGeneralMissmatch.length > 0) {
            csv = new objectsToCsv(ordersInGeneralMissmatch)
            await csv.toDisk(`${resultsDir}/ordersInGeneralMissmatch.csv`)
        }
        console.log(`ordersInOLIGeneralMissmatches:`.padEnd(65," "), ordersInOLIGeneralMissmatches.length)
        if (ordersInOLIGeneralMissmatches.length > 0) {
            csv = new objectsToCsv(ordersInOLIGeneralMissmatches)
            await csv.toDisk(`${resultsDir}/ordersInOLIGeneralMissmatches.csv`)
        }
}

async function orderLineItemsReport() {   
    console.log('\n\n')
    console.log("#############################")
    console.log("#####  OLI CHECKS  ####")
    console.log("#############################")
    await fetchDBData(['orderLineItems'])

    const errors = {
        'orderLineItemMissingInventoryID': false,   //outbound order line item missing inventoryID - important for restocks
        'orderLineItemMissingItemID': false,   //order line item missing itemID
        'orderLineItemStatusMissmatch': false,   //order line item status has the timestamp fields set correclty
        'missingSiblingID':  false,
        'siblingNotFoundID':  false,
        'siblingStatusMissmatch': false,
        'missingFulfillment': false,
        'missingLocation': false, // fulfilling - outbound/transfer-out but item doesn't have location
        'missingDispatchedAt': false,
        'missingPrice': false,
        'missingDeliveredAt': false,
        'statusAndCanceledAtMissmatch': false,
        'fulfillmentIDAndCanceledAtMissmatch': false,
        'shouldNotHaveLocation': false,
        'oliMissingInParentOrder': false,
        'parentSiblingStatusMissmatch': false,
        'consignedItemWrongFigures': false,
        'productAccountIDMissmatch': false // missmatch between oli.accountID and oli.product.accountID
    }

    const olisReport = []

    const orderLineItemByID = {}
    for (var oli of dbOrderLineItems) {
        orderLineItemByID[oli.ID] = oli
    }

    const orderLineItemByitemIDParentIDkey = {}
    for (var oli of dbOrderLineItems) {
        const key = `${oli.itemID}_${oli.order.parentOrderID}`
        orderLineItemByitemIDParentIDkey[key] = oli
    }

    dbOrderLineItems.map((oli, idx) => {
        const report = {
            oliID: oli.ID,
            'oli accountID': oli.accountID,
            'oli status': oli.status.name,
            'oli siblingID': oli.siblingID,
            fulfillmentID: oli.fulfillmentID || "",
            'order ID': oli.orderID,
            'order yype': oli.orderType.name,
            'order parentOrderID': oli.order.parentOrderID,
            'item ID': oli.itemID,
            'item AccountID': oli.item.accountID,
            'Item WarehouseID': oli.item.warehouseID,
            'Item status': oli.item.statusID == 3 ? 'deleted' : oli.item.statusID,
            'Inventory Location': oli.inventory?.warehouseID || "",
            'product ID': oli.productID,
            'product accountID': oli.product.accountID,
            'product code': oli.product.code,
            'variant ID': oli.productVariantID,
            'variant name': oli.variant.name,
            'oli price': oli.price,
            'oli cost': oli.cost,
            'oli profit': oli.profit
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errors))

        // transfer order but missing siblingID
        if ((oli.orderType.name == "transfer-in" || oli.orderType.name == "transfer-out") && oli.siblingID == null) {
            errorsRecord['missingSiblingID'] = true
        }

        if (oli.item.accountID != oli.accountID && (oli.profit == 0 || oli.price == oli.cost) && (oli.orderTypeID != 1 && oli.orderTypeID != 2)) {
            errorsRecord['consignedItemWrongFigures'] = true
        }

        // sibling olis checks
        if (oli.siblingID != null) {
            const siblingOli = orderLineItemByID[oli.siblingID]

            if (siblingOli == null) {
                errorsRecord['siblingNotFoundID'] = true
            }

            // siblings have correct status
            if (siblingOli != null && oli.statusID != siblingOli.statusID) {
                errorsRecord['siblingStatusMissmatch'] = true
            }
        }

        // parent olis checks - order line item consigned 
        if (oli.order.parentOrderID != null) {
            const key = `${oli.itemID}_${oli.order.parentOrderID}`
            const parentOrderLineItem = orderLineItemByitemIDParentIDkey[key]
            if (!parentOrderLineItem) {
                errorsRecord['oliMissingInParentOrder'] = true
            } else {

                if (oli.status.name == "pending" && parentOrderLineItem.status.name != "pending") {
                    errorsRecord['parentSiblingStatusMissmatch'] = true
                }

                if (oli.status.name == "rejected" && parentOrderLineItem.status.name != "rejected") {
                    errorsRecord['parentSiblingStatusMissmatch'] = true
                }

                if (oli.status.name == "confirmed" && parentOrderLineItem.status.name != "confirmed") {
                    errorsRecord['parentSiblingStatusMissmatch'] = true
                }
            }
        }

        if (oli.inventoryID == null) {
            errorsRecord['orderLineItemMissingInventoryID'] = true
        }

        if (oli.itemID == null) {
            errorsRecord['orderLineItemMissingItemID'] = true
        }

        if (oli.status.name != "deleted" && oli.canceledAt != null) {
            errorsRecord['statusAndCanceledAtMissmatch'] = true
        }
        if (oli.fulfillmentID != null && oli.canceledAt != null) {
            errorsRecord['fulfillmentIDAndCanceledAtMissmatch'] = true
        }

        if (oli.orderTypeID == 4 && oli.price == null) {
            errorsRecord['missingPrice'] = true
        }

        if (oli.accountID != oli.product.accountID) {
            errorsRecord['productAccountIDMissmatch'] = true
        }

        // check state for status "fulfilling"
        if (oli.status.name == "fulfilling") {
            if (oli.fulfillmentID == null) {
                errorsRecord['missingFulfillment'] = true
            }

            if ((oli.orderType.name == "outbound" || oli.orderType.name == "transfer-out") && oli.item.warehouseID == null) {
                errorsRecord['missingLocation'] = true
            }
        }

        // check state for status "dispatched"
        if (oli.status.name == "dispatched") {
            if (oli.fulfillmentID == null) {
                errorsRecord['missingFulfillment'] = true
            }

            if (oli.dispatchedAt == null) {
                errorsRecord['missingDispatchedAt'] = true
            }

            if (oli.item.warehouseID != null) {
                errorsRecord['shouldNotHaveLocation'] = true
            }
        }

        if (oli.status.name == "delivered") {
            if (oli.fulfillmentID == null) {
                errorsRecord['missingFulfillment'] = true
            }

            if (oli.deliveredAt == null) {
                errorsRecord['missingDeliveredAt'] = true
            }
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            olisReport.push(report)
        }
    })

    if (olisReport.length> 0){
        let reportCsv = new objectsToCsv(olisReport)
        await reportCsv.toDisk(`${resultsDir}/orderLineItemsReport.csv`)
    }
    console.log(`Order Line Items Report:`.padEnd(65," "), olisReport.length)
    for (var errorType in errors) {
        console.log(`>> ${errorType}`.padEnd(65," "), olisReport.filter(r => r[errorType]).length)
    }

    /*

    //TODO
    const report = []
    const subOrdersList = dbOrders.filter(o => o.parentOrderID != null)
    for (var order of dbOrders) {
        const subOrders = subOrdersList.filter(o => o.parentOrderID == order.ID)
        for (var oli of order.orderLineItems) {
            const record = {
                'sibling id': null,
                'parent id': null,
                'sibling status': null,
                'parent status': null,
                'order id': order.ID,
                'order shopify id': order.foreignID,
                'order reference': order.reference1,
                'order status': order.status.name,
                'order type': order.type.name,
                'item id': oli.itemID,
                'item account id': oli.item.accountID,
                'item location': '',
                'fulfillment id': oli.fulfillmentID ? oli.fulfillmentID : null,
                'last update': oli.updatedAt
            }
        
            const problems = new Set()





            // consignee order - order line item consigned
            if (order.type.name == "outbound" && oli.item.accountID != order.accountID) {
                const consignorOrderLineItem = orderLineItems.find(i => (i.itemID == oli.itemID && i.order.parentOrderID == order.ID))
                if (!consignorOrderLineItem) {
                    problems.add('missingInConsignorOrder')
                }
            }



        }
    }
    */

}

async function ordersOutboundChecks() {
    
    /**
     * Compare AdminOrders with subOrders
     */
    const adminOrders = ordersOut.filter(order => !order.account.isConsignor)
    const subOrders = ordersOut.filter(order => order.account.isConsignor)

    adminOrderQuantity_adminOrderItemsANDsubOrdersItems = []
    subOrdersItems_adminOrderConsignorItemsMissmatch = []
    adminOrderItems_subOrdersItemsMissmatch = []
    adminOrderLineItem_subOrderLineItemMissmatch = []
    subOrderPayouts_MainOrderCostMissmatch = []
    for (var adminOrder of adminOrders) {
        if (adminOrder.foreignID == null) { // only shopify orders - TODO: extend to manual orders as well
            continue
        }

        const adminOrderItems = []
        const subOrderItems = []
        adminOrder.orderLineItems.map(oli => adminOrderItems.push(oli.item))
        subOrders.filter(order => order.parentOrderID == adminOrder.ID).map(order => order.orderLineItems.map(oli => subOrderItems.push(oli.item)))



        // AdminOrder.orderLineItem.status == subOrder.orderLineItem.status
        const subOrder_OrderLineItems = []
        subOrders.filter(order => order.parentOrderID == adminOrder.ID).map(order => order.orderLineItems.map(oli => subOrder_OrderLineItems.push(oli)))
        for (var adminOli of adminOrder.orderLineItems) {
            if (adminOli.item.accountID != adminOrder.accountID) { // apply only to consignor items
                const subOrderOli = subOrder_OrderLineItems.find(oli => oli.itemID == adminOli.itemID)
                if (!subOrderOli) {
                    console.log(adminOrder.ID)
                    continue
                }
                const record = {
                    'Shopify ID': adminOrder.foreignID,
                    'Order Number': adminOrder.reference1,
                    'Sub Order AccountID': subOrderOli.accountID,
                    'Sub Order ID': subOrderOli.orderID,
                    'Admin OLI Status': adminOli.status.name,
                    'SubOrder OLI Status': subOrderOli.status.name,

                }

                if (adminOli.status.name == "refunded" && subOrderOli.status.name != "refunded") {
                    adminOrderLineItem_subOrderLineItemMissmatch.push(record)
                }

                if (adminOli.status.name == "fulfilling" && subOrderOli.status.name != "dispatched") {
                    adminOrderLineItem_subOrderLineItemMissmatch.push(record)
                }

                if (adminOli.status.name == "dispatched" && subOrderOli.status.name != "dispatched") {
                    adminOrderLineItem_subOrderLineItemMissmatch.push(record)
                }
            }
        }

        // adminOrder.orderLineItems.cost == subOrders.invoice.totalAmount
        const adminOrderOutCost = adminOrder.orderLineItems.filter(oli => oli.item.accountID != adminOrder.accountID).reduce((costs, oli) => costs += oli.cost, 0)
        let subOrdersPayout = 0
        subOrders.filter(order => order.parentOrderID == adminOrder.ID).map(order => order.orderLineItems.map(orderLineItem => subOrdersPayout += orderLineItem.payout))
        if (adminOrderOutCost != subOrdersPayout) {
            subOrderPayouts_MainOrderCostMissmatch.push({
                'Shopify ID': adminOrder.foreignID,
                'Order ID': adminOrder.ID,
                'Shopify Order Number': adminOrder.reference1,
                'Main Order Out': adminOrderOutCost,
                'Sub Orders In': subOrdersPayout
            })
        }
    }
    console.log(`adminOrderQuantity_adminOrderItemsANDsubOrdersItems Missmatch:`.padEnd(65," "), adminOrderQuantity_adminOrderItemsANDsubOrdersItems.length)
    if (adminOrderQuantity_adminOrderItemsANDsubOrdersItems.length > 0) {
        csv = new objectsToCsv(adminOrderQuantity_adminOrderItemsANDsubOrdersItems)
        await csv.toDisk(`${resultsDir}/adminOrderQuantity_adminOrderItemsANDsubOrdersItemsMissmatch.csv`)
    }
    console.log(`subOrdersItems_adminOrderConsignorItemsMissmatch:`.padEnd(65," "), subOrdersItems_adminOrderConsignorItemsMissmatch.length)
    if (subOrdersItems_adminOrderConsignorItemsMissmatch.length > 0) {
        csv = new objectsToCsv(subOrdersItems_adminOrderConsignorItemsMissmatch)
        await csv.toDisk(`${resultsDir}/subOrdersItems_mainOrderConsignorItemsMissmatch.csv`)
    }
    console.log(`adminOrderItems_subOrdersItemsMissmatch:`.padEnd(65," "), adminOrderItems_subOrdersItemsMissmatch.length)
    if (adminOrderItems_subOrdersItemsMissmatch.length > 0) {
        csv = new objectsToCsv(adminOrderItems_subOrdersItemsMissmatch)
        await csv.toDisk(`${resultsDir}/adminOrderItems_subOrdersItemsMissmatch.csv`)
    }
    console.log(`adminOrderLineItem_subOrderLineItemMissmatch:`.padEnd(65," "), adminOrderLineItem_subOrderLineItemMissmatch.length)
    if (adminOrderLineItem_subOrderLineItemMissmatch.length > 0) {
        csv = new objectsToCsv(adminOrderLineItem_subOrderLineItemMissmatch)
        await csv.toDisk(`${resultsDir}/adminOrderLineItem_subOrderLineItemMissmatch.csv`)
    }
    console.log(`subOrderPayouts_MainOrderCostMissmatch:`.padEnd(65," "), subOrderPayouts_MainOrderCostMissmatch.length)
    if (subOrderPayouts_MainOrderCostMissmatch.length > 0) {
        csv = new objectsToCsv(subOrderPayouts_MainOrderCostMissmatch)
        await csv.toDisk(`${resultsDir}/subOrderPayouts_MainOrderCostMissmatch.csv`)
    }

    // based on the status - check if all other values are in check
    ordersOutGeneralMissmatches = []
    for (var order of ordersOut) {
        for (var oli of order.orderLineItems) {
            const record = {
                'Order Number': order.reference1,
                'Account ID': order.accountID,
                'Account': order.account.name,
                'OrderLineItem': oli.ID,
                'Product': `${oli.product.title} ${oli.variant.name}`,
                tags: []
            }
            if (oli.status.name == "pending") {

            }

            if (oli.status.name == "rejected") {
                if (oli.rejectedAt == null) {
                    record.tags.push("Missing rejectedAt")
                }
            }

            if (oli.status.name == "refunded") {
                if (oli.refundedAt == null) {
                    record.tags.push("Missing refundedAt")
                }
            }

            if (oli.status.name == "confirmed") {
                if (oli.acceptedAt == null) {
                    record.tags.push("Missing acceptedAt")
                }

                if (oli.fulfillmentID != null) {
                    record.tags.push("It should not have a fulfillment")
                }

                if (oli.item.warehouseID == null) {
                    record.tags.push("Missing warehouse")
                }

                if (oli.item.inventoryID != null) {
                    record.tags.push("Item sold but still in inventory")
                }

                if (oli.item.barcode == null) {
                    record.tags.push("Item should have a barcode")
                }
            }

            if (oli.status.name == "fulfilling") {
                if (oli.fulfillmentID == null) {
                    record.tags.push("Missing fulfillment")
                    continue
                }

                if (oli.fulfillment.status.name != "created") {
                    record.tags.push(`Fulfillment with status ${oli.fulfillment.status.name} instead of created`)
                }

                if (oli.fulfillment.originID == null) {
                    record.tags.push("Missing fulfillment origin")
                }

                if (oli.fulfillment.destinationAddressID == null) {
                    record.tags.push("Missing fulfillment destination")
                }
            }

            if (oli.status.name == "dispatched") {
                if (oli.fulfillmentID == null) {
                    record.tags.push("Missing fulfillment")
                    continue
                }

                if (oli.fulfillment.status.name != "transit" && oli.fulfillment.status.name != "delivered") {
                    record.tags.push(`Fulfillment with status ${oli.fulfillment.status.name} instead of transit/delivered`)
                }

                if (oli.fulfillment.originID == null) {
                    record.tags.push("Missing fulfillment origin")
                }

                if (oli.fulfillment.destinationAddressID == null) {
                    record.tags.push("Missing fulfillment destination")
                }

                if (oli.fulfillment.status.name == "delivered" && oli.fulfillment.completedAt == null) {
                    record.tags.push("Missing fulfillment destination")
                }
            }

            if (record.tags.length > 0) {
                record.tags = record.tags.join(", ")
                ordersOutGeneralMissmatches.push(record)
            }
        }
    }
    console.log(`ordersOutGeneralMissmatches:`.padEnd(65," "), ordersOutGeneralMissmatches.length)
    if (ordersOutGeneralMissmatches.length > 0) {
        csv = new objectsToCsv(ordersOutGeneralMissmatches)
        await csv.toDisk(`${resultsDir}/ordersOutGeneralMissmatches.csv`)
    }
}

async function accountsChecks () {
    console.log('\n\n')
    console.log("#############################")
    console.log("#######  Accounts  ######")
    console.log("#############################")

    const accountsReport = []
    const errorsAccounts = {
        'consignorMissingAdminUsersAccess': false,
        'consignorMissingConsignmentRecord': false,
        'hasNameDefault': false
    }

    await fetchDBData(['accounts'])
    const consignmentRecords = await db.consignment.findAll({where: {}})

    accounts.map(account => {
        const externalSaleChannels = account.saleChannels.filter(saleChannel => saleChannel.accountID != account.ID)
        const externalUsersAccess = account.users.filter(user => user.accountID != account.ID)
        const consignmentRecord = consignmentRecords.find(consignment => consignment.consignorAccountID == account.ID)

        const report = {
            'ID':                 account.ID,
            'name':             account.name,
            'External Sale Channels Accounts': ([... new Set(externalSaleChannels.map(sc => sc.accountID))]).join(","),
            'External Users Access': externalUsersAccess.length,
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errorsAccounts))

        // if account has external sale channel - it should have consignment record, it should have account_user of users from the external account
        if (externalSaleChannels.length > 0 && externalUsersAccess.length == 0) {
            errorsRecord['consignorMissingAdminUsersAccess'] = true
        }

        if (externalSaleChannels.length > 0 && !consignmentRecord) {
            errorsRecord['consignorMissingConsignmentRecord'] = true
        }

        const validUserForAccount = account.users.find(u => u.email)
        if (account.name.includes("default") && validUserForAccount.lastVisitAt && moment(validUserForAccount.lastVisitAt).isAfter(moment().subtract(1, 'months'))) {
            errorsRecord['hasNameDefault'] = true
        }


        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            accountsReport.push(report)
        }
    })

    console.log(`Accounts Report:`.padEnd(65," "), accountsReport.length)
    if (accountsReport.length > 0) {
        csv = new objectsToCsv(accountsReport)
        await csv.toDisk(`${resultsDir}/accountsReport.csv`)
    }
    for (var errorType in errorsAccounts) {
        console.log(`>> ${errorType}`.padEnd(65," "), accountsReport.filter(r => r[errorType]).length)
    }

    /*
     * ACCOUNTS - deprecated
     * 
    const adminUsers = accounts.find(account => account.ID == 3).users
    accounts_duplicates = []
    accounts_warehouseMissing = []
    accounts_userMissing = []
    accounts_adminUserMissing = []
    const duplicatesProcessed = []
    for (var account of accounts) {
        // check for duplicate
        const duplicate = accounts.filter(acc => (acc.ID != account.ID && acc.name == account.name))
        if (duplicate.length > 0 && !duplicatesProcessed.includes(account.ID)) {
            const account1Orders = await db.order.findAll({where: {accountID: account.ID}})
            const account2Orders = await db.order.findAll({where: {accountID: duplicate[0].ID}})
            const account1Inventory = await db.inventory.findAll({where: {accountID: account.ID}})
            const account2Inventory = await db.inventory.findAll({where: {accountID: duplicate[0].ID}})
            const adminUserAccount1 = account.users.find(user => user.accountID == account.ID)
            const adminUserAccount2 = duplicate[0].users.find(user => user.accountID == duplicate[0].ID)

            const tags = []

            if (account2Orders.length == 0 && account2Inventory.length == 0) {
                tags.push("delete/account2")
            }

            if (account1Orders.length == 0 && account1Inventory.length == 0) {
                tags.push("delete/account1")
            }

            if (duplicate[0].ID - account.ID > 1 && adminUserAccount1.password != adminUserAccount2.password) {
                tags.push("password/new")
            }

            accounts_duplicates.push({
                "Account #1 CreatedAt": moment(account.createdAt),
                "Account #2 CreatedAt": moment(duplicate[0].createdAt),
                "accountID_1": account.ID,
                "accountID_2": duplicate[0].ID,
                "Account #1 Orders": account1Orders.length,
                "Account #2 Orders": account2Orders.length,
                "Account #1 Inventory": account1Inventory.length,
                "Account #2 Inventory": account2Inventory.length,
                "Account #1 Disabled": adminUserAccount1.activatedAt == null ? 'YES' : '',
                "Account #2 Disabled": adminUserAccount2.activatedAt == null ? 'YES' : '',
                "Account #1 Email": adminUserAccount1.email,
                "Account #2 Email": adminUserAccount2.email,
                "adminUserID_1": adminUserAccount1.ID,
                "adminUserID_2": adminUserAccount2.ID,
                "adminUserPassword_1": adminUserAccount1.password,
                "adminUserPassword_2": adminUserAccount2.password,
                "tags": tags.join(",")
            })
            duplicatesProcessed.push(account.ID)
            duplicatesProcessed.push(duplicate[0].ID)
        }

        // check if warehouse, location
        if (account.warehouses.length == 0) {
            accounts_warehouseMissing.push({
                "Account ID": account.ID
            })
        }

        if (account.users.length == 0) {
            accounts_userMissing.push({
                "Account ID": account.ID
            })
        }

        // check if all edit users have access to the account
        const adminUsersIDsMissing = adminUsers.filter(u => !account.users.find(_user => _user.ID == u.ID)).map(u => u.ID)
        if (adminUsersIDsMissing.length > 0) {
            accounts_adminUserMissing.push({
                "Account ID": account.ID,
                "Users Having Access": account.users.length,
                "Admin Users available": adminUsers.length,
                "Admin Users missing IDs": adminUsersIDsMissing.map(u => u.ID).join(","),
            })
        }
    }
    console.log(`Accounts Duplicates:`.padEnd(65," "), accounts_duplicates.length)
    if (accounts_duplicates.length > 0) {
        csv = new objectsToCsv(accounts_duplicates)
        await csv.toDisk(`${resultsDir}/accounts_duplicates.csv`)
    }
    console.log(`Accounts Warehouse Missing:`.padEnd(65," "), accounts_warehouseMissing.length)
    if (accounts_warehouseMissing.length > 0) {
        csv = new objectsToCsv(accounts_warehouseMissing)
        await csv.toDisk(`${resultsDir}/accounts_warehouseMissing.csv`)
    }
    console.log(`Accounts Users Missing:`.padEnd(65," "), accounts_userMissing.length)
    if (accounts_userMissing.length > 0) {
        csv = new objectsToCsv(accounts_userMissing)
        await csv.toDisk(`${resultsDir}/accounts_userMissing.csv`)
    }
    console.log(`Accounts Admin User Missing:`.padEnd(65," "), accounts_adminUserMissing.length)
    if (accounts_adminUserMissing.length > 0) {
        csv = new objectsToCsv(accounts_adminUserMissing)
        await csv.toDisk(`${resultsDir}/accounts_adminUserMissing.csv`)
    }
     */

}

async function stripeAccountsChecks() {
    console.log('\n\n')
    console.log("#############################")
    console.log("######  Stripe Accounts  ####")
    console.log("#############################")

    const stripeAccountsReport = []
    const errorsStripeAccounts = {
        'missingAccountOnStripe': false,
    }

    const accountStripe = await db.account.findOne({where: {ID: 3}})
    const stripe = require('stripe')(accountStripe.stripeAPIKey);
    const accountsWithStripeID = await db.account.findAll({
        where: {stripeAccountID: {[Op.not]: null}, ID: {[Op.not]: [3]}},
        include: [
            {model: db.user, as: 'users', where: {email: {[Op.not]: null}}}
        ]
    })

    let stripeAccounts = []

    let response = await stripe.accounts.list({
        limit: 100,
    });
    stripeAccounts = stripeAccounts.concat(response.data)
    while (response.data.length != 0) {
        const latestStripeAccount = stripeAccounts[stripeAccounts.length - 1]
        response = await stripe.accounts.list({
            limit: 100,
            starting_after: latestStripeAccount.id
        });
        stripeAccounts = stripeAccounts.concat(response.data)
    }

    accountsWithStripeID.map(account => {
        const stripeAccount = stripeAccounts.find(stripeAccount => stripeAccount.id == account.stripeAccountID)

        const report = {
            'account.ID':                 account.ID,
            'account.ID':                 account.ID,
            'user.email':                 account.users[0]?.email,
            'user.fullName':              `${account.users[0]?.name} ${account.users[0]?.surname}`,
            'account.stripeAccountID':           account.stripeAccountID,
            'stripe.accountID':           stripeAccount?.id,
            'stripe URL':   `https://dashboard.stripe.com/connect/accounts/${account.stripeAccountID}/activity`
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errorsStripeAccounts))

        if (!stripeAccount) {
            errorsRecord['missingAccountOnStripe'] = true
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            stripeAccountsReport.push(report)
        }

    })

    console.log(`Stripe Accounts Report:`.padEnd(65," "), stripeAccountsReport.length)
    if (stripeAccountsReport.length > 0) {
        csv = new objectsToCsv(stripeAccountsReport)
        await csv.toDisk(`${resultsDir}/stripeAccountsReport.csv`)
    }
    for (var errorType in errorsStripeAccounts) {
        console.log(`>> ${errorType}`.padEnd(65," "), stripeAccountsReport.filter(r => r[errorType]).length)
    }
}

async function transactionsChecks() {
    console.log('\n\n')
    console.log("#############################")
    console.log("#######  Transactions  ######")
    console.log("#############################")

    const transactionsReport = []
    const errorsTransactions = {
        'wrongDestinationAccountID': false,
        'missingGatewayForStripeTx': false,
        'txWithoutStripePayoutID': false,
        'txStripeTxStatusMissmatch': false,
        '0amountShippingTx': false,
        'canceledTxNotCompleted': false,
        'canceledTxWithStripePayoutID': false,
        'processingTransactionsMissingGateway': false,
        'destinationBankAccountChanged': false,
        'missingOrderLineItemForPayoutTx': false,
    }

    const accountStripe = await db.account.findOne({where: {ID: 3}})
    const stripe = require('stripe')(accountStripe.stripeAPIKey);
    const dbTransactions = await db.transaction.findAll({
        where: {
            orderID: {[Op.not]: null},
        },
        include: [
            {model: db.account, as: 'fromAccount'},
            {model: db.account, as: 'toAccount'},
            {model: db.orderLineItem, as: 'orderLineItem', required: false},
        ]
    })

    const uniqueStripeIDs = [... new Set(dbTransactions.filter(tx => tx.toAccount?.stripeAccountID).map(tx => tx.toAccount.stripeAccountID))]
    let payouts = []
    idx = 0
    for (var stripeAccountID of uniqueStripeIDs) {
        if (idx % 100 == 0) {
            console.log(`Fetching payouts for stripe accounts ${idx+1}/${uniqueStripeIDs.length}`)
        }
        let accountPayouts = []
        let response;
        try {
            response = await stripe.payouts.list({
                limit: 100,
            }, {stripeAccount: stripeAccountID});
        } catch (e) {
            console.log(e)
            continue
        }
        accountPayouts = accountPayouts.concat(response.data)
        while (response.data.length != 0) {
            const latestPayout = accountPayouts[accountPayouts.length - 1]
            response = await stripe.payouts.list({
                limit: 100,
                starting_after: latestPayout.id
            }, {stripeAccount: stripeAccountID});
            accountPayouts = accountPayouts.concat(response.data)
        }
        payouts = payouts.concat(accountPayouts)
        idx += 1
    }

    const stripePayoutTxById = {}
    for (var payout of payouts) {
        stripePayoutTxById[payout.id] = payout
    }

    dbTransactions.map(tx => {
        const stripePayoutTx = stripePayoutTxById[tx.stripeID]
        const report = {
            'tx.ID':                 tx.ID,
            'tx.fromAccountID':        tx.fromAccountID,
            'tx.toAccountID':        tx.toAccountID,
            'tx.orderID':             tx.orderID,
            'tx.type':                tx.type,
            'tx.gateway':             tx.gateway,
            'tx.stripeID':      tx.stripeID,
            'stripeTx.id':      stripePayoutTx?.id,
            'tx.status':             tx.status,
            'stripeTx.status':      stripePayoutTx?.status,
            'tx.toAccount.defaultStripeDestinationID':        tx.toAccount?.defaultStripeDestinationID,
            'stripeTx.destination':      stripePayoutTx?.destination,
            'tx.type':                   tx.type,
            'tx.grossAmount':                 tx.grossAmount,
            'Payout Url':                stripePayoutTx ? `https://dashboard.stripe.com/${tx.toAccount?.stripeAccountID}/payouts/${stripePayoutTx?.id}` : '',
            'tx.createdAt':             moment(tx.createdAt),
            'oli.createdAt':            moment(tx.orderLineItem?.createdAt),
            'tx.completedAt':           moment(tx.completedAt),
            'stripeTx.arrivedAt':       stripePayoutTx?.arrival_date ? moment(stripePayoutTx?.arrival_date * 1000) : '',
            'oli.dispatchedAt':      moment(tx.orderLineItem?.dispatchedAt)
        }

        // deep clone object for the record
        const errorsRecord = JSON.parse(JSON.stringify(errorsTransactions))

        if (tx.type == 'shipping' && tx.fromAccountID == 3) {
            errorsRecord['wrongFromAccountID'] = true
        }

        if (tx.status == 'canceled' && !tx.completedAt) {
            errorsRecord['canceledTxNotCompleted'] = true
        }

        if (tx.status == 'canceled' && tx.canceledTxWithStripePayoutID) {
            errorsRecord['canceledTxWithStripePayoutID'] = true
        }

        if (tx.status == 'processing' && tx.gateway == null) {
            errorsRecord['processingTransactionsMissingGateway'] = true
        }

        if (tx.gateway == null && tx.stripeID != null) {
            errorsRecord['missingGatewayForStripeTx'] = true
        }

        if (tx.gateway == 'stripe' && tx.stripeID == null) {
            errorsRecord['txWithoutStripePayoutID'] = true
        }

        if (tx.gateway == "stripe" && tx.toAccount?.defaultStripeDestinationID != stripePayoutTx?.destination) {
            errorsRecord['destinationBankAccountChanged'] = true
        }

        if (stripePayoutTx && (stripePayoutTx.status != tx.status)) {
            // manage the status mapping between fliproom and stripe
            if (
                (tx.status == "processing" && stripePayoutTx.status == "pending") || 
                (tx.status == "reverted" && stripePayoutTx.status == "failed")
                ) {
            } 
            else {
                errorsRecord['txStripeTxStatusMissmatch'] = true
            }
        }
        
        //added tx.toAccountID to not include scenarios where the consignor account has been deleted
        if (tx.type == "payout" && !tx.orderLineItemID && tx.orderID && tx.toAccountID) {
            errorsRecord['missingOrderLineItemForPayoutTx'] = true
        }

        if (tx.type == "shipping" && tx.grossAmount == 0 && tx.orderID) {
            errorsRecord['0amountShippingTx'] = true
        }

        // if any error triggered - add record to report
        if (Object.values(errorsRecord).find(error => error) == true) {
            for (var errorName in errorsRecord) {
                report[errorName] = errorsRecord[errorName]
            }
            transactionsReport.push(report)
        }
    })

    console.log(`Transactions Report:`.padEnd(65," "), transactionsReport.length)
    if (transactionsReport.length > 0) {
        csv = new objectsToCsv(transactionsReport)
        await csv.toDisk(`${resultsDir}/transactionsReport.csv`)
    }
    for (var errorType in errorsTransactions) {
        console.log(`>> ${errorType}`.padEnd(65," "), transactionsReport.filter(r => r[errorType]).length)
    }
}

async function fetchDBData(resourcesList, updatedAtLimit = true) {
    // use this to limite the amount of record returned to avoid memory problem since now db is massive
    // run checks for records changed after this date
    const sinceDatetime = moment().subtract(90, 'days')

    if (resourcesList.includes('accounts') && !accounts) {
        process.stdout.write("Fetching Accounts")

        accounts = await db.account.findAll({
            where: {}, 
            include: [
                {model: db.warehouse, as: 'warehouses'},
                {model: db.user, as: 'users'},
                {model: db.saleChannel, as: 'saleChannels'},
            ]})
        accountIDs = accounts.map(account => account.ID)
        process.stdout.write(" - DONE\n")
    }

    if (resourcesList.includes('products') && !dbProducts) {
        process.stdout.write("Fetching Products")
        dbProducts = []
        const count = await db.product.count();
        const batchSize = 1000
        for (var start=0;start<count;start+=batchSize) {
            const _productsBatch = await db.product.findAll({
                where: {
                },
                limit: batchSize,
                offset: start,
                include: [
                    {model: db.productVariant, as :'variants', required: false},
                    {model: db.productImage, as :'images', required: false},
                    {model: db.account, as :'account', required: false},
                ],
                order: [['id', 'desc']]
            })

            if (([25000, 50000]).includes(start)) {
                console.log(`Fetching ${start}/${count} products`)
            }

            dbProducts = dbProducts.concat(_productsBatch);
        }

        dbVariants = []
        dbProducts.map(product => product.variants.map(variant => dbVariants.push(variant)))
        process.stdout.write(" - DONE\n")

        process.stdout.write("Fetching StockX Products")
        stockxProducts = await utils.getStockxProducts()
        stockxVariants = []
        stockxProducts.map(product => product.variants.map(variant => stockxVariants.push(variant)))
        process.stdout.write(" - DONE\n")
    }

    if (resourcesList.includes('productMatches') && !dbProductMatches) {
        process.stdout.write("Fetching dbProductMatches")
        let where = {}
        if (updatedAtLimit) {
            where['createdAt'] = {[Op.gte]: sinceDatetime}
        }

        dbProductMatches = productsMatches = await db.productMatchLookup.findAll({
            where: where,
            include: [
                {model: db.productVariant, as: 'variant', include: [
                    {model: db.product, as: 'product'}
                ]},
                {model: db.productVariant, as: 'externalVariant', include: [
                    {model: db.product, as: 'product'}
                ]},
            ]
        })
        process.stdout.write(" - DONE\n")
    }

    if (resourcesList.includes('shopify-products') && !shopifyProducts) {
        shopifyProducts = []
        const shopifySaleChannels = await db.saleChannel.findAll({
            where: {platform: 'shopify'}
        })
        for (var saleChannel of shopifySaleChannels) {
            console.log(`>>>> Fetching Shopify products for store ${saleChannel.shopifyStoreName}`)
            const saleChannelProducts = await utils.getShopifyProducts(saleChannel.accountID, true)
            shopifyProducts = shopifyProducts.concat(saleChannelProducts)
        }

        const shopifyProductsActiveDraft = shopifyProducts.filter(prod => (prod.status == 'active' || prod.status == "draft")) // remove archived products
        const shopifyActiveProducts = shopifyProducts.filter(_prod => _prod.status == 'active')
        shopifyVariants = []
        shopifyProducts.map(product => product.variants.map(variant => shopifyVariants.push(variant)))
        const shopifyVariantsActiveDraft = []
        shopifyProductsActiveDraft.map(product => product.variants.map(variant => shopifyVariantsActiveDraft.push(variant)))
    }

    if (resourcesList.includes('orders') && !dbOrders) {
        let where = {}
        if (updatedAtLimit) {
            where['updatedAt'] = {[Op.gte]: sinceDatetime}
        }

        dbOrders = await db.order.findAll({
            where: where,
            include: [
                {model: db.account,       as:'account'},
                {model: db.status, as: 'status'},
                {model: db.saleChannel, as: 'saleChannel'},
                {model: db.orderType, as: 'type'},
                {model: db.orderLineItem, as:'orderLineItems', include: [
                        {model: db.product, as: 'product'},
                        {model: db.productVariant, as: 'variant'},
                        {model: db.status, as: 'status'},
                        {model: db.item, as: 'item'},
                        {model: db.fulfillment, as: 'fulfillment', include: [
                                {model: db.status, as: 'status'},
                            ]},
                    ]}
            ]
        })
    }

    if (resourcesList.includes('orderLineItems') && !dbOrderLineItems) {
        process.stdout.write("Fetching orderLineItems")

        let where = {}
        if (updatedAtLimit) {
            where['updatedAt'] = {[Op.gte]: sinceDatetime}
        }

        dbOrderLineItems = await db.orderLineItem.findAll({
            where: where, 
            include: [
                {model: db.status, as: 'status'},
                {model: db.inventory, as: 'inventory'},
                {model: db.item, as: 'item', include: [
                    {model: db.account, as: 'account'}
                ]},
                {model: db.orderType, as: 'orderType'},
                {model: db.order, as: 'order'},
                {model: db.product, as: 'product', include: [
                    {model: db.account, as: 'account'}
                ]},
                {model: db.productVariant, as: 'variant'},
            ]}
        )
        process.stdout.write(" - DONE\n")
    }

    if (resourcesList.includes('shopify-orders') && !shopifyOrders) {
        shopifyOrders = []
        const shopifySaleChannels = await db.saleChannel.findAll({
            where: {platform: 'shopify'}
        })
        for (var saleChannel of shopifySaleChannels) {
            if (saleChannel.shopifyStoreName == "littlelacesuk") {
                continue
            }
            console.log(`>>>> Fetching Shopify orders for store ${saleChannel.shopifyStoreName}`)
            const saleChannelOrders = await utils.getShopifyOrders(saleChannel.accountID)
            shopifyOrders = shopifyOrders.concat(saleChannelOrders)
        }
    }

    if (resourcesList.includes('inventory') && !dbInventory) {
        process.stdout.write("Fetching Inventory")

        let where = {}
        if (updatedAtLimit) {
            where['updatedAt'] = {[Op.gte]: sinceDatetime}
        }

        dbInventory = await db.inventory.findAll({
            where: where,
            include: [
                {model: db.item, as: 'items', required: false},
                {model: db.inventoryListing, as: 'listings', required: false, include : [{model: db.saleChannel, as: 'saleChannel'}]},
                {model: db.warehouse, as: 'warehouse'},
                {model: db.productVariant, as: 'variant'},
                {model: db.product, as: 'product'},
                {model: db.account, as: 'account'},
            ]
        })
        physicalInventory = dbInventory.filter(inv => inv.virtual == 0)
        virtualInventory = dbInventory.filter(inv => inv.virtual == 1)
        process.stdout.write(" - DONE\n")
    }

    if (resourcesList.includes('listings') && !dbInventoryListings) {
        process.stdout.write("Fetching Inventory Listings")

        let where = {}
        if (updatedAtLimit) {
            where['updatedAt'] = {[Op.gte]: sinceDatetime}
        }

        dbInventoryListings = await db.inventoryListing.findAll({
            where: where,
            include: [
                {model: db.product, as: 'product'},
                {model: db.productVariant, as: 'variant', include: [
                    {model: db.productVariant, as: 'sourceProductVariant'}
                ]},
                {model: db.inventory, as: 'inventory', include: [
                    {model: db.warehouse, as: 'warehouse'},
                    {model: db.productVariant, as: 'variant'},
                    {model: db.product, as: 'product'},
                ]},
                {model: db.saleChannel, as: 'saleChannel'},
            ]
        })
        process.stdout.write(" - DONE\n")
    }

    if (resourcesList.includes('items') && !dbItems) {
        process.stdout.write("Fetching Items")

        let where = {}
        if (updatedAtLimit) {
            where['updatedAt'] = {[Op.gte]: sinceDatetime}
        }

        dbItems = await db.item.findAll({
            where: where,
            include: [
                {model: db.inventory, as: 'inventory', include: [
                    {model: db.warehouse, as: 'warehouse'},
                ]},
                {model: db.orderLineItem, as: 'orderLineItems', include: [{model: db.status, as: 'status' },{model: db.orderType, as: 'orderType'}]},
                {model: db.product, as: 'product'},
                {model: db.productVariant, as:'variant'},
                {model: db.order, as: 'order', include: [{model: db.status, as: 'status'}, {model: db.orderType, as: 'type'}]},
                {model: db.account, as: 'account'},
                {model: db.warehouse, as: 'warehouse'},
                {model: db.status, as: 'status' }
            ]
        })
        process.stdout.write(" - DONE\n")

    }

    if (resourcesList.includes('fulfillments') && !dbFulfillments) {
        process.stdout.write("Fetching Fulfillments")

        let where = {}
        if (updatedAtLimit) {
            where['updatedAt'] = {[Op.gte]: sinceDatetime}
        }

        dbFulfillments = await db.fulfillment.findAll({
            where: where,
            include: [
                {model: db.orderLineItem, as: 'orderLineItems'},
                {model: db.status, as: 'status' }
            ]
        })
        process.stdout.write(" - DONE\n")

    }
}

main()
