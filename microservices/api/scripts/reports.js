
let envFileName = ""
if (process.argv.includes("production")) {
    console.log('PRODUCTION CONFIGURATION ENABLED')
    envFileName = "production"
} else if (process.argv.includes("staging")) {
    console.log('STAGING CONFIGURATION ENABLED')
    envFileName = "staging"
}
require('dotenv').config({ path: `./${envFileName}.env` })


let configs = require('../configs.js')
configs.sql.connection_name = null //this shouldn;t be set when running staging or production locally. otherwise doesn't allow connection

const axios = require('axios')
const path = require('path')
const objectsToCsv = require('objects-to-csv')
let converter = require('json-2-csv');
const moment = require('moment')
const fs = require('fs')

const db = require('../libs/db')
const service = require('../services/main')
const utils = require('../libs/utils')
const { Op } = require("sequelize");

const {Storage} = require('@google-cloud/storage');
const { mainModule } = require('process')
//const storage = new Storage({keyFilename: path.resolve(__dirname, '../' + configs.cloud.bucket_auths)});
//const GCBucket = storage.bucket(configs.cloud.bucket_name);
const XMLparser = require('fast-xml-parser')
const {orderLineItem, inventory, warehouse} = require("../services/main");
const {serveWithOptions} = require("swagger-ui-express");

const resultsDir = './scripts/reports'

// Fetched Data
let accounts;
let accountIDs;
let dbProducts;
let dbVariants;
let dbInventory;
let physicalInventory;
let virtualInventory;
let transactions;
let stockxProducts
let stockxVariants
let ordersOut;
let ordersIn;
let dbItems;

async function main() {
    if (fs.existsSync(resultsDir)){
        fs.rmdirSync(resultsDir, { recursive: true });
    }
    fs.mkdirSync(resultsDir);



    //await consignorsSalesMonth()
    
    //await generateCostReport()

    //await salesMonth()
    //await consignorsSales()

    //await dummyChecks()
    //await salesMonth()
    //await consignorsSales()
    //await editOrderReport() DEPRECATED
    //await createItemsMissingCostReport()


    // NEW REPORTS
    //
    // await consignorsAwaitingPayout()


    // await jobLineItems(11)
    // await jobLineItems(10)

    //Job Line Item Report
    //
    //await jobLineItemReport(5)
    //await jobLineItemReport(7)




    // Harrods exclude
    //await consignorReport(null,'16/10/2022',false,[44,15,28,79,52,45,17,49,108,243])
    //await consignorReport(null,'12/01/2024')
    //await consignorReport(null,'07/02/2023')
    //await manualOrderPayoutProblem()
     //await locationCheckNoListing(923, 2015, 'harrods_listing_checks') // Harrods
    // await locationCheckNoListing(1889, 2064, 'GLF_listing_checks') // Galleries Lafayette
    // await locationCheckNoListing(2063, 2065,'HN_listing_checks' ) // Harvey Nichols
    //await ordersByItem()
    //await analytics1()




    //EXTRAS
    //await harrodsPricingReport()
    //await report2022()
    //await accountsActivity()
    //await instagramReports()

    /**
     * External Reports
     */

    // await consignorEmails(true)
     await consignorReport(3)
    //
    // //await inventoryReportLocation(1)
    // await jobLineItemReport(36)
    // await  saleChannelAccountStatus(3)
    // await investorReport()
    // await exportVariants(3)
    //
    // //NEW
    // await productsReport(2830)
      //await inventoryReportLocation(1)
     // await inventoryReportLocation(2015) // harrods

    /**
     * Internal Reports
     *
     *  #### Financial History - how evolved over time (Monthly values for the last 2 years ) ####
     * 1. Average percentage of sales virtual inventory is responsible for
     * 2. Average percentage of sales consignment inventory is responsible for
     * 3. Value of uploaded stock by consignors
     *
     * ###Snapshot of the current state of the business###
     * 1. Virtual inventory managed
     * 2. Consignment inventory managed
     * 3. Number of users (consignors)
     *
     */

    // await orderStatusesAvailable()
    // await orderLineItemStatusesAvailable()

    let accountID = 3
    //await monthlySalesHistory(accountID)
    //await currentAccountSnapshot(accountID, 1)



    console.log('TASKS COMPLETED')
  }

async function orderStatusesAvailable() {
    let dbOrders = await db.order.findAll({
        include: [
            { model: db.status, as: 'status' }
        ]
    });

    // Create sets to hold the unique status strings
    let outboundStatuses = new Set();
    let inboundStatuses = new Set();

    for (let order of dbOrders) {
        // Construct a string with both ID and name of the status
        let statusString = `${order.status.ID}: "${order.status.name}"`;

        if (order.typeID === 3) {
            inboundStatuses.add(statusString);
        }
        if (order.typeID === 4) {
            outboundStatuses.add(statusString);
        }
    }

    console.log('inboundOrderStatuses: ', Array.from(inboundStatuses));
    console.log('outboundOrderStatuses: ', Array.from(outboundStatuses));
}

async function orderLineItemStatusesAvailable() {
    let dbOrderLineItems = await db.orderLineItem.findAll({
        include: [
            { model: db.status, as: 'status' }
        ]
    });

    // Create sets to hold the unique status strings
    let outboundStatuses = new Set();
    let inboundStatuses = new Set();

    for (let orderLineItem of dbOrderLineItems) {
        // Construct a string with both ID and name of the status
        let statusString = `${orderLineItem.status.ID}: "${orderLineItem.status.name}"`;

        if (orderLineItem.orderTypeID === 3) {
            inboundStatuses.add(statusString);
        }
        if (orderLineItem.orderTypeID === 4) {
            outboundStatuses.add(statusString);
        }
    }

    console.log('inboundOLIStatuses: ', Array.from(inboundStatuses));
    console.log('outboundOLIStatuses: ', Array.from(outboundStatuses));
}




/**
 *
 * 1. Average percentage of sales virtual inventory is responsible for
 * 2. Average percentage of sales consignment inventory is responsible for
 * 3. Value of uploaded stock by consignors
 *
 *
 * 1. Gather all the internal sales data
 *
 */
async function monthlySalesHistory(accountID){
    let reportContent = []
    const dbOrderLineItems = await db.orderLineItem.findAll({
      include: [
            {model: db.order, as: 'order', where: {typeID: 4, accountID: accountID}, include: [
                    {model: db.status, as: 'status', where: {
                            ID:[13,8,15,31,11,26,16,10,12,19]
                        }}
                    ]
            },
            {model: db.status, as: 'status', where: { ID:[13, 8,31,10,12]}},
            {model: db.item, as: 'item'},
            {model:db.inventory, as: 'inventory'}
      ]
    })

    console.log('dbOrderLineItems: ', dbOrderLineItems.length)

    let categorisedOrderLineItems = []
    //Categorise the orderLineItems
    //categories 'virtual', 'consignment', 'stock'
    for (let orderLineItem of dbOrderLineItems){
        if(orderLineItem.item.accountID != accountID){
            orderLineItem.category = 'consignment'
            categorisedOrderLineItems.push(orderLineItem)
        }
        else if (!orderLineItem.inventory){
            orderLineItem.category = 'virtual'
            categorisedOrderLineItems.push(orderLineItem)
        }
        else if (!orderLineItem.inventory.virtual){
            orderLineItem.category = 'stock'
            categorisedOrderLineItems.push(orderLineItem)
        }
    }

    /**
     * Add the orderLineItem to the report:
     *    - every row in the report is the totals for a month (using orderLineItem.createdAt) showing values attributed to each category:
     *    - month
     *    - total sales
     *    - total sales virtual
     *    - total sales consignment
     *    - total sales stock
     *    - total sales virtual % of total sales
     *    - total sales consignment % of total sales
     *    - total sales stock % of total sales
     *
     */
    for (let orderLineItem of categorisedOrderLineItems) {
        let orderDate = new Date(orderLineItem.order.createdAt);
        let monthYearKey = `${orderDate.getMonth() + 1}-${orderDate.getFullYear()}`;

        if (!reportContent[monthYearKey]) {
            reportContent[monthYearKey] = {
                month: monthYearKey,
                totalSales: 0,
                totalSalesVirtual: 0,
                totalSalesConsignment: 0,
                totalSalesStock: 0
            };
        }

        let price = parseFloat(orderLineItem.price) || 0;
        reportContent[monthYearKey].totalSales += price;

        switch (orderLineItem.category) {
            case 'virtual':
                reportContent[monthYearKey].totalSalesVirtual += price;
                break;
            case 'consignment':
                reportContent[monthYearKey].totalSalesConsignment += price;
                break;
            case 'stock':
                reportContent[monthYearKey].totalSalesStock += price;
                break;
        }
    }

// Calculate percentages
    // Calculate totals and round to two decimal points
    Object.keys(reportContent).forEach(monthYearKey => {
        let monthData = reportContent[monthYearKey];
        monthData.totalSales = parseFloat(monthData.totalSales.toFixed(2));
        monthData.totalSalesVirtual = parseFloat(monthData.totalSalesVirtual.toFixed(2));
        monthData.totalSalesConsignment = parseFloat(monthData.totalSalesConsignment.toFixed(2));
        monthData.totalSalesStock = parseFloat(monthData.totalSalesStock.toFixed(2));

        monthData.totalSalesVirtualPct = (monthData.totalSalesVirtual / monthData.totalSales * 100).toFixed(2) + '%';
        monthData.totalSalesConsignmentPct = (monthData.totalSalesConsignment / monthData.totalSales * 100).toFixed(2) + '%';
        monthData.totalSalesStockPct = (monthData.totalSalesStock / monthData.totalSales * 100).toFixed(2) + '%';
    });

// Convert the report content to an array for csv conversion
    reportContent = Object.values(reportContent);

    converter.json2csv(reportContent, (err, csv) => {
        if (err) {
            throw err;
        }
        // Write the CSV file
        fs.writeFileSync('scripts/reports/monthlySalesHistory.csv', csv);
    })

}

/**
 * Current Snapshot of an accounts state
 *
 * - Virtual inventory managed
 * - Value managed by sale channel
 * - Number of accounts managed
 */
async function currentAccountSnapshot(accountID, saleChannelID){
    let reportContent = []

    let account = await db.account.findOne({
        where: {ID: accountID},
        include: [
            {model: db.saleChannel, as: 'saleChannels'},
            ]
    })

    let saleChannel = account.saleChannels.find(saleChannel => saleChannel.ID === saleChannelID)



    let dbAccounts = await db.account.findAll({
        where: {ID: {[Op.ne]: accountID}},
        include: [
            {model: db.saleChannel, as: 'saleChannels', where: {ID: saleChannelID}},
            {model: db.user, as: 'users', required: true, where: {activatedAt: {[Op.ne]: null}, email: {[Op.not]: null}}},
            ]
    })


    //let dbInventory = await db.inventory.findAll({include: [{model: db.inventoryListing, as: 'listings', required:true, where: {saleChannelID: saleChannelID}}], where: {quantity: {[Op.gte]: 1}}})

    let dbInventoryListings = await db.inventoryListing.findAll({where: {saleChannelID: saleChannelID},
        include:
            [
                {model: db.inventory, as: 'inventory',
                    where: {quantity: {[Op.gte]: 1}}}
            ]
                })


    let totalAccounts = dbAccounts.length
    let totalInventoryValue = 0
    let totalInventoryValueVirtual = 0
    let totalInventoryValueConsignment = 0
    let totalInventoryValueStock = 0

    for (let inventoryListing of dbInventoryListings){
        totalInventoryValue += parseFloat(inventoryListing.price)
        if(inventoryListing.inventory.accountID != accountID){
            totalInventoryValueConsignment += parseFloat(inventoryListing.price)
        }
        else if (inventoryListing.inventory.virtual){
            totalInventoryValueVirtual += parseFloat(inventoryListing.price)
        }
        else if (!inventoryListing.inventory.virtual){
            totalInventoryValueStock += parseFloat(inventoryListing.price)
        }
    }

    reportContent.push({
        'Date': moment().format('DD/MM/YYYY'),
        'Sale Channel': saleChannel.title,
        'Sale Channel Accounts': totalAccounts,
        'Virtual Inventory Value': totalInventoryValueVirtual.toFixed(2),
        'Consignment Inventory Value': totalInventoryValueConsignment.toFixed(2),
        'Stock Inventory Value': totalInventoryValueStock.toFixed(2),
        'Total Inventory Value': totalInventoryValue.toFixed(2),
        'Percentage Virtual Inventory': (totalInventoryValueVirtual / totalInventoryValue * 100).toFixed(2) + '%',
        'Percentage Consignment Inventory': (totalInventoryValueConsignment / totalInventoryValue * 100).toFixed(2) + '%',
        'Percentage Stock Inventory': (totalInventoryValueStock / totalInventoryValue * 100).toFixed(2) + '%',
    })

    converter.json2csv(reportContent, (err, csv) => {
        if (err) {
            throw err;
        }
        // Write the CSV file
        fs.writeFileSync(`scripts/reports/currentAccountSnapshot_${accountID}_${saleChannel.title.trim()}.csv`, csv);
    })
}

async function inventoryReportLocation(saleChannelID) {
    let reportContent = []
    console.log('saleChannelID: ', saleChannelID)
    const dbListings = await db.inventoryListing.findAll({
      where: {
        saleChannelID: saleChannelID,
      },
        include: [
            {model: db.inventory, as: 'inventory', include: [
                    {model: db.product, as: 'product'},
                    {model: db.productVariant, as: 'variant'},
                    {model: db.warehouse, as: 'warehouse'},
                    {model: db.account, as: 'account'}
                ]},
        ]
    })
    console.log(dbListings.length)

    for (let listing of dbListings){
        reportContent.push({
            productID: listing.inventory.productID,
            productTitle: listing.inventory.product.title,
            variantID: listing.inventory.variant.ID,
            variantName: listing.inventory.variant.name,
            warehouseID: listing.inventory.warehouseID,
            warehouseName: listing.inventory.warehouseID && listing.inventory.warehouse.name,
            accountID: listing.inventory.accountID,
            accountName: listing.inventory.account.name,
            quantity: listing.inventory.quantity,
            quantityIncoming: listing.inventory.quantityIncoming,
            quantityAtHand: listing.inventory.quantityAtHand,
            payout: listing.payout,
            cost: listing.inventory.cost,
            price: listing.price,
            notes: listing.inventory.notes,
            createdAt: listing.inventory.createdAt,
            updatedAt: listing.inventory.updatedAt,
        })
    }
    converter.json2csv(reportContent, (err, csv) => {
        if (err) {
            throw err;
        }
        // Write the CSV file
        fs.writeFileSync('scripts/reports/listingsLocation.csv', csv);
    });


}

async function productsReport(accountID) {
    const dbProducts = await db.product.findAll({
        where:{
            accountID: accountID
        },
        include: [
            {model: db.productVariant, as: 'variants'},
            {model: db.productCategory, as: 'category'}
        ]
    })

    const dbInventory = await db.inventory.findAll({
        where: {
            accountID: accountID,
            quantity: {[Op.gte]: 1}
        }
    })

    let reportContent = []

    // for each product in the account find the all the inventory records
    for (let product of dbProducts){
        const productInventory = dbInventory.filter(inventory => inventory.productID === product.ID)
        let totalUnits = 0
        let averageCost = 0
        let unitsWithCost = 0

        //for each inventory record calculate the total units and average cost
        for (let inventory of productInventory){
            inventory.cost ? unitsWithCost ++ : null
            totalUnits += inventory.quantity
            averageCost += inventory.cost ? parseFloat(inventory.cost) : 0
        }

        //calculate the average cost
        averageCost = averageCost / unitsWithCost

        //check if category is contains 'apparel' or 'accessories' or 'hoodie'
        const isApparel = product.category.name.toLowerCase().includes('apparel')
        const isAccessories = product.category.name.toLowerCase().includes('accessories')
        const isHoodie = product.category.name.toLowerCase().includes('hoodie')

        if(isApparel || isAccessories || isHoodie){
            //add the product to the report
            reportContent.push({
                ID: product.ID,
                title: product.title,
                code: product.code,
                category: product.category.name,
                totalUnits: totalUnits,
                averageCost: averageCost.toFixed(2),
                variants: product.variants.length,
                shopifyURL: `https://admin.shopify.com/store/reseller-2-reseller/products/${product.foreignID}`,
                createdAt: product.createdAt,
                updatedAt: product.updatedAt,

            })
        }
    }

    converter.json2csv(reportContent, (err, csv) => {
        if (err) {
            throw err;
        }
        // Write the CSV file
        fs.writeFileSync('scripts/reports/productsReport.csv', csv);
    });

}



    /**
 * CONSIGNOR NAME
 * CONSIGNOR EMAIL
 * CONSIGNOR NUMBER
 * DATE LAST UPLOAD OF STOCK
 * UNITS OF STOCK ON PLATFORM
 * COST PRICE VALUE OF STOCK ON PLATFORM
 * SALE PRICE VALUE OF STOCK ON PLATFORM
 * UNITS SOLD
 * VALUE STOCK SOLD
 * DATE OF LAST SALE
 */


async function exportVariants(accountID) {
    const batchSize = 250;
    let offset = 0;
    let reportContent = [];
    const serviceUser = await service.account.serviceUser(accountID);
    console.log(serviceUser.accountID);
    let totalCount = 0;

    while (offset < totalCount || totalCount === 0) {
        const variantsRes = await service.product.variantsGetAll(
            serviceUser,
            offset,
            batchSize,
            null,
            {accountID: accountID}
        );

        const variants = variantsRes.rows;
        const total = variantsRes.count;
        totalCount = total;

        console.log(`Exporting variants (offset: ${offset}, ${offset + variants.length}/${totalCount}):`, variants.length);

        if (variants.length === 0) {
            // No more variants to export, break out of the loop
            break;
        }

        for (let variant of variants) {
            reportContent.push({
                productID: variant.productID,
                productTitle: variant.product.title,
                category: variant.product.category.name,
                code: variant.product.code,
                createdAt: variant.product.createdAt,
                syncedProductID: variant.product.sourceProduct?.ID,
                syncedProduct: variant.product.sourceProduct?.title,
                productStatus: variant.product.status,
                variantID: variant.ID,
                variantTitle: variant.name,
                variantIndex: variant.index,
                GTIN: variant.gtin,
                syncedVariantID: variant.sourceProductVariant?.ID,
                syncedVariant: variant.sourceProductVariant?.name,
                marketPrice: variant.sourceProductVariant?.price,
                lastSync: variant.sourceProductVariant?.updatedAt,
                variantStatus: variant.status,
            });
        }

        offset += batchSize;
    }

    converter.json2csv(reportContent, (err, csv) => {
        if (err) {
            throw err;
        }
        // Write the CSV file
        fs.writeFileSync('scripts/reports/variantsExport.csv', csv);
    });
}



async function saleChannelAccountStatus(accountID) {
    // fetch all accounts that are consigning with the given account

    //fetch all accounts
    const accounts = await db.account.findAll({})
    //fetch all sale channels
    const saleChannels = await db.saleChannel.findAll({})

    const reportContent = [];
    const accountSalechannel = await db.account_saleChannel.findAll({
        // include: [
        //     {model: db.account, as: 'account', where: {ID: accountID}},
        //     {model: db.saleChannel, as: 'saleChannel', where: {ID: accountID}}
        // ]
    })


    for (let accountRelation  of accountSalechannel) {
        const account = accounts.find(account => account.ID === accountRelation.accountID)
        const saleChannel = saleChannels.find(saleChannel => saleChannel.ID === accountRelation.saleChannelID)
        reportContent.push({
            'saleChannel': saleChannel.name,
            'account': account.name,
            'accountStatus': accountRelation.status,
            'accountID': account.ID,
            'saleChannelID':saleChannel.ID,

        }
        )
    }

    //add the consignor to the report

    converter.json2csv(reportContent, (err, csv) => {
        if (err) {
            throw err;
        }
        // Write the CSV file
        fs.writeFileSync('scripts/reports/saleChannelAccountStatus.csv', csv);
    });
}


async function consignorReport(accountID) {


    let priceThreshold = 50000
    //get today's date in a readable format as a string using moment
    const today = moment().format('YYYY-MM-DD')


    // fetch all accounts that are consigning with the given account
    console.log('Fetching consignor accounts')


    //fetch consignor users
    const consignorUsers = await db.user.findAll({where: {activatedAt: {[Op.ne]: null}, email: {[Op.not]: null} , accountID: {[Op.ne]: 3}},include: [{model: db.account, as: 'account',required: true, include: [{model: db.saleChannel, as: 'saleChannels', where: {accountID: accountID}}]}]})

    //create a map of consignorUsers by accountID
    const consignorUsersByAccountID = {}
    for(let user of consignorUsers){
        consignorUsersByAccountID[user.accountID] = user
    }




    // fetch all items that are consigned with the given account
    const consignorItems = await db.item.findAll({
        where: {accountID:  {[Op.ne]: accountID}},
        include: [
            {model: db.orderLineItem, as: 'orderLineItems', required: false, where: {orderTypeID: 4, accountID: accountID}, include: [{model: db.order, as: 'order'},{ model: db.product, as: 'product'},{ model: db.productVariant, as: 'variant'},{ model: db.status, as: 'status'}]},
            //{model: db.inventory, as: 'inventory', include: [{model: db.inventoryListing, as: 'listings', where: {status: 'active'}, include: [{model: db.saleChannel, required: true,  as: 'saleChannel', where: {accountID: accountID}}], order: [['price', 'DESC']]}]}
            {model: db.inventory, as: 'inventory', include: [{model: db.inventoryListing, as: 'listings', where: {status: 'active'}, include: [{model: db.saleChannel, required: true,  as: 'saleChannel', where: {accountID: accountID}}], order: [['price', 'DESC']]}]}
        ]
    })

    //stocked inventory
    let totalUnitsStocked = 0
    let totalCostsForUnitsStocked = 0
    let totalSaleValueForUnitsStocked = 0
    //Sold inventory
    let totalUnitsSold = 0
    let totalCostUnitsSold = 0
    let totalValueUnitsSold = 0


    //loop through each consignor account
    for(let user of consignorUsers){
        const account = user.account
        consignorUsersByAccountID[account.ID]['name'] = account.name
        consignorUsersByAccountID[account.ID]['email'] = consignorUsersByAccountID[account.ID].email
        consignorUsersByAccountID[account.ID]['number'] = consignorUsersByAccountID[account.ID].phoneNumber
        consignorUsersByAccountID[account.ID]['lastVisitAt'] = consignorUsersByAccountID[account.ID].lastVisitAt
        consignorUsersByAccountID[account.ID]['activatedAt'] = consignorUsersByAccountID[account.ID].activatedAt
        consignorUsersByAccountID[account.ID]['tier'] = account.tier
        consignorUsersByAccountID[account.ID]['lastStockUploadDate'] = null
        consignorUsersByAccountID[account.ID]['totalUnitsStocked'] = 0
        consignorUsersByAccountID[account.ID]['totalCostsForUnitsStocked'] = 0
        consignorUsersByAccountID[account.ID]['totalSaleValueForUnitsStocked'] = 0
        consignorUsersByAccountID[account.ID]['totalUnitsSold'] = 0
        consignorUsersByAccountID[account.ID]['totalCostUnitsSold'] = 0
        consignorUsersByAccountID[account.ID]['totalValueUnitsSold'] = 0
        consignorUsersByAccountID[account.ID]['lastSaleDate'] = null

    }

    //compute the report for each consignor
    for (let item of consignorItems){
        if (consignorUsersByAccountID[item.accountID]){
            //unstocked items
            if (!item.inventoryID && item.orderLineItems && item.orderLineItems.length > 0 && item.orderLineItems[0].status.name !== 'deleted'){
                consignorUsersByAccountID[item.accountID]['totalUnitsSold'] = consignorUsersByAccountID[item.accountID]['totalUnitsSold'] + 1
                consignorUsersByAccountID[item.accountID]['totalValueUnitsSold'] = consignorUsersByAccountID[item.accountID]['totalValueUnitsSold'] + parseFloat(item.orderLineItems[0].price)
                consignorUsersByAccountID[item.accountID]['totalCostUnitsSold'] = consignorUsersByAccountID[item.accountID]['totalCostUnitsSold'] +  parseFloat(item.orderLineItems[0].cost)

                //if sale date is null or the sale date is before the current sale date
                if (!consignorUsersByAccountID[item.accountID]['lastSaleDate'] || consignorUsersByAccountID[item.accountID]['lastSaleDate'] < item.orderLineItems[0].order.createdAt){
                    consignorUsersByAccountID[item.accountID]['lastSaleDate'] = item.orderLineItems[0].order.createdAt
                }

                //contribute to general stats
                totalUnitsSold ++
                totalValueUnitsSold +=  parseFloat(item.orderLineItems[0].price)
                totalCostUnitsSold +=  parseFloat(item.orderLineItems[0].cost)
            }


            //if the item is stocked

            if (item.inventory && item.inventory.listings.length > 0 && item.inventory.listings[0].price < priceThreshold){
                consignorUsersByAccountID[item.accountID]['totalUnitsStocked'] = consignorUsersByAccountID[item.accountID]['totalUnitsStocked'] + 1
                consignorUsersByAccountID[item.accountID]['totalCostsForUnitsStocked'] = consignorUsersByAccountID[item.accountID]['totalCostsForUnitsStocked'] + parseFloat(item.inventory.listings[0].payout)
                consignorUsersByAccountID[item.accountID]['totalSaleValueForUnitsStocked'] =  consignorUsersByAccountID[item.accountID]['totalCostsForUnitsStocked']+ parseFloat(item.inventory.listings[0].price)
                //if the last stock upload date is null or the last stock upload date is before the current stock upload date
                if (!consignorUsersByAccountID[item.accountID]['lastStockUploadDate'] || consignorUsersByAccountID[item.accountID]['lastStockUploadDate'] < item.createdAt) {
                    consignorUsersByAccountID[item.accountID]['lastStockUploadDate'] = item.createdAt
                }

                //contribute to general stats
                totalUnitsStocked ++
                totalCostsForUnitsStocked +=  parseFloat(item.inventory.listings[0].payout)
                totalSaleValueForUnitsStocked +=  parseFloat(item.inventory.listings[0].price)
            }
        }



    }

    //create the report
    const report = []

    //loop through each consignor
    for (let user of consignorUsers){
            const account  = user.account
            //add the consignor to the report
            report.push({
                name: consignorUsersByAccountID[account.ID]['name'],
                email: consignorUsersByAccountID[account.ID]['email'],
                number: consignorUsersByAccountID[account.ID]['number'],
                lastVisitAt: consignorUsersByAccountID[account.ID]['lastVisitAt'] ? moment(consignorUsersByAccountID[account.ID]['lastVisitAt']).format('DD/MM/YYYY') : null,
                activatedAt: consignorUsersByAccountID[account.ID]['activatedAt'] ?moment(consignorUsersByAccountID[account.ID]['activatedAt']).format('DD/MM/YYYY') : null,
                tier: consignorUsersByAccountID[account.ID]['tier'],
                lastStockUploadDate: consignorUsersByAccountID[account.ID]['lastStockUploadDate'] ?moment(consignorUsersByAccountID[account.ID]['lastStockUploadDate']).format('DD/MM/YYYY') : null,
                totalUnitsStocked: consignorUsersByAccountID[account.ID]['totalUnitsStocked'],
                totalCostsForUnitsStocked: consignorUsersByAccountID[account.ID]['totalCostsForUnitsStocked'].toFixed(2),
                totalSaleValueForUnitsStocked: consignorUsersByAccountID[account.ID]['totalSaleValueForUnitsStocked'].toFixed(2),
                totalUnitsSold: consignorUsersByAccountID[account.ID]['totalUnitsSold'],
                totalCostUnitsSold: consignorUsersByAccountID[account.ID]['totalCostUnitsSold'].toFixed(2),
                totalValueUnitsSold: consignorUsersByAccountID[account.ID]['totalValueUnitsSold'].toFixed(2),
                lastSaleDate: consignorUsersByAccountID[account.ID]['lastSaleDate'] ? moment(consignorUsersByAccountID[account.ID]['lastSaleDate']).format('DD/MM/YYYY') : null,
            })
    }


    //convert the report to a csv
    let parsedCSV = new objectsToCsv(report)
    await parsedCSV.toDisk(`${resultsDir}/consignor-report-${today}.csv`)

    //Log the report overview
    console.log(`###### Consignor Report: stock holdings ${today} #######`.padEnd(65," ") )
    console.log(`Total Consignors:`.padEnd(65," "), consignorUsers.length)
    console.log(`Total Units Stocked:`.padEnd(65," "), totalUnitsStocked)
    console.log(`Total Cost For Units Stocked:`.padEnd(65," "), parseFloat(totalCostsForUnitsStocked).toFixed(2))
    console.log(`Total Sale Value For Units Stocked:`.padEnd(65," "), parseFloat(totalSaleValueForUnitsStocked).toFixed(2))
    console.log(`Total Units Sold:`.padEnd(65," "), totalUnitsSold)
    console.log(`Total Cost For Units Sold:`.padEnd(65," "), parseFloat(totalCostUnitsSold).toFixed(2))
    console.log(`Total Value For Units Sold:`.padEnd(65," "), parseFloat(totalValueUnitsSold).toFixed(2))
    // console.log(`Total Units:`.padEnd(65," "), totalUnitsStocked + totalUnitsSold)
    // console.log(`Total Cost:`.padEnd(65," "), (totalCostsForUnitsStocked + totalCostUnitsSold).toFixed(2))
    // console.log(`Total Value:`.padEnd(65," "), (totalSaleValueForUnitsStocked + totalValueUnitsSold).toFixed(2))
    // console.log(`Total Profit:`.padEnd(65," "), ((totalSaleValueForUnitsStocked + totalValueUnitsSold) - (totalCostsForUnitsStocked + totalCostUnitsSold)).toFixed(2))
    // console.log(`Total Profit %:`.padEnd(65," "), (((totalSaleValueForUnitsStocked + totalValueUnitsSold) - (totalCostsForUnitsStocked + totalCostUnitsSold)) / (totalCostsForUnitsStocked + totalCostUnitsSold) * 100).toFixed(2))
    // console.log(`Total Profit Per Unit:`.padEnd(65," "), (((totalSaleValueForUnitsStocked + totalValueUnitsSold) - (totalCostsForUnitsStocked + totalCostUnitsSold)) / (totalUnitsStocked + totalUnitsSold)).toFixed(2))
    // console.log(`Total Profit Per Unit Per Day:`.padEnd(65," "), ((((totalSaleValueForUnitsStocked + totalValueUnitsSold) - (totalCostsForUnitsStocked + totalCostUnitsSold)) / (totalUnitsStocked + totalUnitsSold)) / ((new Date().getTime() - new Date("2020-01-01").getTime()) / (1000 * 3600 * 24))).toFixed(2))
    // console.log(`Total Profit Per Unit Per Month:`.padEnd(65," "), ((((totalSaleValueForUnitsStocked + totalValueUnitsSold) - (totalCostsForUnitsStocked + totalCostUnitsSold)) / (totalUnitsStocked + totalUnitsSold)) / ((new Date().getTime() - new Date("2020-01-01").getTime()) / (1000 * 3600 * 24 * 30))).toFixed(2))
    // console.log(`Total Profit Per Unit Per Year:`.padEnd(65," "), ((((totalSaleValueForUnitsStocked + totalValueUnitsSold) - (totalCostsForUnitsStocked + totalCostUnitsSold)) / (totalUnitsStocked + totalUnitsSold)) / ((new Date().getTime() - new Date("2020-01-01").getTime()) / (1000 * 3600 * 24 * 365))).toFixed(2))



}

async function instagramReports() {
    // most supply this week
    const report = {
        week: '',
        highestSupply: [],
        bestSteals: [],
        uniqueListings: []

    }
    const weekStartDate = moment().startOf('isoWeek').subtract(1, 'weeks');
    report.week = `${weekStartDate.format("Do MMM")} - ${weekStartDate.add(7, 'days').format("Do MMM")}`

    const inventory = await db.inventory.findAll({
        where: {
            createdAt: {[Op.gte]: weekStartDate},
            accountID: {[Op.not]: 3},
            warehouseID: {[Op.not]: 923},
            virtual: 0
        },
        attributes: [
            [db.sequelize.fn("SUM", db.sequelize.col("quantity")), "product_quantity"]
        ],
        group: "productID",
        include: [
            {model: db.product, as: 'product'}
        ],
        order: [[db.sequelize.col("product_quantity"), "DESC"]]
    })
    inventory.slice(0, 5).map((inventory, idx) => {
        report.highestSupply.push({
            position: idx,
            product: inventory.product.title,
        })
    })


    // steals available
    let steals = await db.marketplaceListing.findAll({
        where: {
            steal: 1
        },
        include: [
            {model: db.product, as: 'product'},
            {model: db.productVariant, as: 'variant'},
        ]
    })
    // do it outside query because I dont kknow how to do it inside porcodio
    steals = steals.map(steal => {
        steal.dataValues.difference = steal.variant.price - steal.price
        steal.dataValues.discount = ((steal.dataValues.difference / steal.variant.price) * 100).toFixed(2)
        return steal
    })
    steals = steals.sort((a, b) => a.difference > b.difference ? -1 : 1)
    steals.slice(0, 5).map((steal, idx) => {
        report.bestSteals.push({
            position: idx,
            product: steal.product.title,
            discount: `${steal.dataValues.discount} %`,
            priceDifference: steal.dataValues.difference.toFixed(2),
        })
    })

    // promote unique products being listed
    const inventoryListings = await db.inventoryListing.findAll({
        where: {
        },
        attributes: [
            [db.sequelize.fn("AVG", db.sequelize.col("payout")), "product_payout"],
        ],
        group: "inventoryListing.productID",
        include: [
            {model: db.product, as: 'product'},
            {model: db.inventory, as: 'inventory', where: {quantity: {[Op.gte]: 1}, virtual: 0, warehouseID: {[Op.not]: null}}},
        ],
        order: [[db.sequelize.col("product_payout"), "DESC"]]
    })
    inventoryListings.slice(0, 5).map((listing, idx) => {
        report.uniqueListings.push({
            position: idx,
            product: listing.product.title,
            value: parseFloat(listing.dataValues.product_payout).toFixed(2)
        })
    })

    console.log(report)

    for (var reportName of ['highestSupply', 'bestSteals', 'uniqueListings']) {
        const csvReport = []
        for (var record of report[reportName]) {
            csvReport.push(record)
        }
        const csvFile = new objectsToCsv(csvReport)
        await csvFile.toDisk(`${resultsDir}/${reportName}_${report.week}.csv`)

    }
}

async function accountsActivity() {
// currently in stock
    // 0 stock, 0 sales
    // 0 stock, but sales
    // stock, sales 

    const consignorAccounts = await db.account.findAll({
        where: {isConsignor: 1},
        include: [
            {model: db.user, as: 'users', where: {email: {[Op.not]: null}, accountID: {[Op.not]: 3}}}
        ]
    })
    const inventory = await db.inventory.findAll({
        where: {
            quantity: {[Op.gte]: 1},
            accountID: consignorAccounts.map(acc => acc.ID)
        }
    })
    const sales = await db.orderLineItem.findAll({
        where: {
            orderTypeID: 4,
            accountID: consignorAccounts.map(acc => acc.ID)
        }
    })

    const csvReport = []
    for (var account of consignorAccounts) {
        const inv = inventory.filter(inv => inv.accountID == account.ID)
        const soldItems = sales.filter(oli => oli.accountID == account.ID)
        const record = {
            'accountID': account.ID,
            'name': account.users[0].name,
            'email': account.users[0].email,
            'stock': inv.length,
            'soldItems': soldItems.length
        }

        csvReport.push(record)
    }

    csv = new objectsToCsv(csvReport)
    await csv.toDisk(`${resultsDir}/accountsActivity.csv`)
}

async function report2022() {

    /***
     * 
     * STOCK
     * 
     */
    console.log("\nStock 1 - Number of Items inbounded at HQ per month")
    const accountInboundedItems = await db.orderLineItem.findAll({
        where: {
            orderTypeID: 3,
            accountID: 3,
            deliveredAt: {[Op.not]: null},
        },
        include: [
            {model: db.order, as: 'order'}
        ]
    })
    let groupedByMonth = {}
    Array.from({length: 12}, (_, i) => {
        groupedByMonth[i] = []
    })

    accountInboundedItems.map(oli => {
        const monthIdx = oli.deliveredAt.getMonth()
        groupedByMonth[monthIdx].push(oli)
    })

    for (var monthIdx in groupedByMonth) {
        const monthOlis = groupedByMonth[monthIdx]
        const fullMonthName = moment(Number(monthIdx) + 1, 'M').format('MMMM');
        const value = monthOlis.length
        console.log(`${fullMonthName} - Inbounded Items ${value}`)
    }

    console.log("\nStock 2 - Consignment Stock Percentage per Location")
    const warehouses = await db.warehouse.findAll({where: {accountID: 3}})
    const itemsAtAccountLocations = await db.item.findAll({
        where: {
            warehouseID: warehouses.map(wh => wh.ID),
        },
    })

    const warehousesResult = {}
    for (var warehouse of warehouses) {
        const itemsAtLocation = itemsAtAccountLocations.filter(item => item.warehouseID == warehouse.ID)
        warehousesResult[warehouse.ID] = {
            'warehouse': warehouse.name,
            'owned': (itemsAtLocation.filter(item => item.accountID == 3).length / itemsAtLocation.length).toFixed(2),
            'consigned': (itemsAtLocation.filter(item => item.accountID != 3).length / itemsAtLocation.length).toFixed(2)
        }
    }
    console.log(warehousesResult)


    console.log("\nStock 3- Inventory Turnover")
    const items = await db.item.findAll({
        where: {
            accountID: 3,
        },
        include: [
            {model: db.orderLineItem, as: 'orderLineItems'}
        ]
    })
    groupedByMonth = {}
    Array.from({length: 12}, (_, i) => {
        groupedByMonth[i] = []
    })
    items.map(item => {
        const soldOli = item.orderLineItems.find(oli => oli.orderTypeID ==  4)
        if (soldOli) {
            const monthIdx = soldOli.createdAt.getMonth()
            groupedByMonth[monthIdx].push(item)
        }
    })

    for (var monthIdx in groupedByMonth) {
        if (monthIdx < 7) continue // start from august
        const fullMonthName = moment(Number(monthIdx) + 1, 'M').format('MMMM');
        const itemsSold = groupedByMonth[monthIdx]

        const values = itemsSold.map(item => {
            const inboundOli = item.orderLineItems.find(oli => oli.orderTypeID == 3)
            const outboundOli = item.orderLineItems.find(oli => oli.orderTypeID == 4)
            const deltaTime = outboundOli.createdAt - inboundOli.createdAt
            return deltaTime
        })
        const value = (values.reduce((tot, deltaTime) => tot += deltaTime, 0) / values.length) / 1000 / 60 / 60 / 24
        console.log(`${fullMonthName} - Time to Sell ${value} days`)
    }
    /**
     * ORDERS
     */
    console.log("\nOrders 1 - Average Consignor Fulfillment time")
    const outboundOrderLineItemsDeliveredConsignors = await db.orderLineItem.findAll({
        where: {
            orderTypeID: 4,
            accountID: {[Op.not]: 3},
            deliveredAt: {[Op.not]: null},
        },
        include: [
            {model: db.order, as: 'order'}
        ]
    })
    groupedByMonth = {}
    Array.from({length: 12}, (_, i) => {
        groupedByMonth[i] = []
    })
    outboundOrderLineItemsDeliveredConsignors.map(oli => {
        const monthIdx = oli.createdAt.getMonth()
        groupedByMonth[monthIdx].push(oli)
    })
    for (var monthIdx in groupedByMonth) {
        const monthOlis = groupedByMonth[monthIdx]
        const fullMonthName = moment(Number(monthIdx) + 1, 'M').format('MMMM');
        const value = (monthOlis.reduce((tot, oli) => tot += (oli.deliveredAt - oli.createdAt), 0) / monthOlis.length) / 1000 / 60 / 60 / 24
        console.log(`${fullMonthName} - Fulfillment Time ${value} days`)
    }
    
    console.log("\nOrders 2 - Average edit LDN Fulfillment time")
    const outboundOrderLineItemsDispatched = await db.orderLineItem.findAll({
        where: {
            orderTypeID: 4,
            accountID: 3,
            dispatchedAt: {[Op.not]: null},
            '$order.foreignID$': {[Op.not]: null}
        },
        include: [
            {model: db.order, as: 'order'}
        ]
    })
    groupedByMonth = {}
    Array.from({length: 12}, (_, i) => {
        groupedByMonth[i] = []
    })

    outboundOrderLineItemsDispatched.map(oli => {
        const monthIdx = oli.createdAt.getMonth()
        groupedByMonth[monthIdx].push(oli)
    })
    for (var monthIdx in groupedByMonth) {
        const monthOlis = groupedByMonth[monthIdx]
        const fullMonthName = moment(Number(monthIdx) + 1, 'M').format('MMMM');
        const averageFulfillmentTime = (monthOlis.reduce((tot, oli) => tot += (oli.dispatchedAt - oli.createdAt), 0) / monthOlis.length) / 1000 / 60 / 60 / 24
        console.log(`${fullMonthName} - Average Fulfillment Time ${averageFulfillmentTime} days`)
    }


    console.log("\nOrders 3 - Percentage of online sales cancelled")
    const outboundOrders = await db.order.findAll({
        where: {
            typeID: 4,
            accountID: 3,
            foreignID: {[Op.not]: null},
        }
    })
    groupedByMonth = {}
    Array.from({length: 12}, (_, i) => {
        groupedByMonth[i] = []
    })
    outboundOrders.map(oli => {
        const monthIdx = oli.createdAt.getMonth()
        groupedByMonth[monthIdx].push(oli)
    })
    for (var monthIdx in groupedByMonth) {
        const monthOrders = groupedByMonth[monthIdx]
        const fullMonthName = moment(Number(monthIdx) + 1, 'M').format('MMMM');
        const cancelledOrders = monthOrders.filter(order => order.statusID == 3)
        const value = ((cancelledOrders.length / monthOrders.length) * 100).toFixed(2)
        console.log(`${fullMonthName} - Orders Cancelled ${value} %`)
    }

    console.log("\nOrders 4 - Consignors Items sold (include canceled)")
    const outboundOrderLineItemIncludeCanceled = await db.orderLineItem.findAll({
        where: {
            orderTypeID: 4,
            accountID: 3,
            '$order.foreignID$': {[Op.not]: null}
        },
        include: [
            {model: db.order, as: 'order'},
            {model: db.item, as: 'item'},
            {model: db.inventory, as: 'inventory'}
        ]
    })
    groupedByMonth = {}
    Array.from({length: 12}, (_, i) => {
        groupedByMonth[i] = []
    })
    outboundOrderLineItemIncludeCanceled.map(oli => {
        const monthIdx = oli.createdAt.getMonth()
        groupedByMonth[monthIdx].push(oli)
    })
    for (var monthIdx in groupedByMonth) {
        const monthOlis = groupedByMonth[monthIdx]
        const fullMonthName = moment(Number(monthIdx) + 1, 'M').format('MMMM');
        //TODO - determien if item is sourcing
        const stockOlis = monthOlis.filter(oli => oli.item.accountID == 3)
        const value1 = ((stockOlis.length / monthOlis.length) * 100).toFixed(2)

        const consignorOlis = monthOlis.filter(oli => oli.item.accountID != 3)
        const value2 = ((consignorOlis.length / monthOlis.length) * 100).toFixed(2)
        //const sourcedOlis = monthOlis.filter(oli => oli.item.accountID == 3)
        //const value3 = ((sourcedOlis.length / monthOlis.length) * 100).toFixed(2)
        console.log(`${fullMonthName} - Stock Items ${value1} % | Consignors Items ${value2} %`)
    }

    console.log("\nOrders 5 - Consignors Items sold (exclude canceled)")
    const outboundOrderLineItemsExcludeCanceled = await db.orderLineItem.findAll({
        where: {
            orderTypeID: 4,
            accountID: 3,
            '$order.foreignID$': {[Op.not]: null},
            canceledAt: null
        },
        include: [
            {model: db.order, as: 'order'},
            {model: db.item, as: 'item'},
            {model: db.inventory, as: 'inventory'}
        ]
    })
    groupedByMonth = {}
    Array.from({length: 12}, (_, i) => {
        groupedByMonth[i] = []
    })
    outboundOrderLineItemsExcludeCanceled.map(oli => {
        const monthIdx = oli.createdAt.getMonth()
        groupedByMonth[monthIdx].push(oli)
    })
    for (var monthIdx in groupedByMonth) {
        const monthOlis = groupedByMonth[monthIdx]
        const fullMonthName = moment(Number(monthIdx) + 1, 'M').format('MMMM');
        //TODO - determien if item is sourcing
        const stockOlis = monthOlis.filter(oli => oli.item.accountID == 3)
        const value1 = ((stockOlis.length / monthOlis.length) * 100).toFixed(2)

        const consignorOlis = monthOlis.filter(oli => oli.item.accountID != 3)
        const value2 = ((consignorOlis.length / monthOlis.length) * 100).toFixed(2)
        //const sourcedOlis = monthOlis.filter(oli => oli.item.accountID == 3)
        //const value3 = ((sourcedOlis.length / monthOlis.length) * 100).toFixed(2)
        console.log(`${fullMonthName} - Stock Items ${value1} % | Consignors Items ${value2} %`)
    }


    console.log("\nConsignors 1 - Percentage of Consignors items rejected/cancelled")
    const outboundOrderLineItemsConsignorCancelled = await db.orderLineItem.findAll({
        where: {
            orderTypeID: 4,
            accountID: {[Op.not]: 3},
            '$order.foreignID$': {[Op.not]: null}
        },
        include: [
            {model: db.order, as: 'order'},
        ]
    })
    groupedByMonth = {}
    Array.from({length: 12}, (_, i) => {
        groupedByMonth[i] = []
    })
    outboundOrderLineItemsConsignorCancelled.map(oli => {
        const monthIdx = oli.createdAt.getMonth()
        groupedByMonth[monthIdx].push(oli)
    })
    for (var monthIdx in groupedByMonth) {
        const monthOlis = groupedByMonth[monthIdx]
        const fullMonthName = moment(Number(monthIdx) + 1, 'M').format('MMMM');
        const cancelledOlis = monthOlis.filter(oli => oli.canceledAt != null)
        const value1 = ((cancelledOlis.length / monthOlis.length) * 100).toFixed(2)
        console.log(`${fullMonthName} - Items Cancelled ${value1} %`)
    }

    console.log("\nConsignors 2 - Time required for consignors to Accept or reject")
    const outboundOrderLineItemsConsignor = await db.orderLineItem.findAll({
        where: {
            orderTypeID: 4,
            accountID: {[Op.not]: 3},
        },
    })
    groupedByMonth = {}
    Array.from({length: 12}, (_, i) => {
        groupedByMonth[i] = []
    })
    outboundOrderLineItemsConsignorCancelled.map(oli => {
        const monthIdx = oli.createdAt.getMonth()
        groupedByMonth[monthIdx].push(oli)
    })
    for (var monthIdx in groupedByMonth) {
        const monthOlis = groupedByMonth[monthIdx]
        const fullMonthName = moment(Number(monthIdx) + 1, 'M').format('MMMM');
        const cancelledOlis = monthOlis.filter(oli => oli.canceledAt != null)
        const acceptedOlis = monthOlis.filter(oli => oli.acceptedAt != null)
        const averageCancelledTime = ((cancelledOlis.reduce((tot, oli) => tot += (oli.canceledAt - oli.createdAt), 0) / cancelledOlis.length) / 1000 / 60 / 60 / 24).toFixed(2)
        const averageAcceptedTime = ((acceptedOlis.reduce((tot, oli) => tot += (oli.acceptedAt - oli.createdAt), 0) / acceptedOlis.length) / 1000 / 60 / 60 / 24).toFixed(2)

        const value1 = cancelledOlis.length / monthOlis.length
        console.log(`${fullMonthName} - Items Cancelled ${averageAcceptedTime} days | Items Cancelled ${averageCancelledTime} days`)
    }

    console.log("\nConsignors 3 - Percentage of Consignors best selling online")
    const dbInventory = await db.inventory.findAll({
        where: {
            '$status.name$': 'active',
            '$variant.foreignID$': {[Op.not]: null},
            virtual: 0,
            'quantity': {[Op.gte]: 1}
        },
        include: [
            {model: db.status, as: 'status'},
            {model: db.productVariant, as: 'variant'},
        ]
    })
    const inventoryLookupByForeignVariantID = {}
    dbInventory.map(_inv => {
        const key = `${_inv.variant.foreignID}`
        if (key in inventoryLookupByForeignVariantID) {
            inventoryLookupByForeignVariantID[key].push(_inv)
        } else {
            inventoryLookupByForeignVariantID[key] = [_inv]
        }
    })

    const results = []
    // select inventory for each variant
    for (var key in inventoryLookupByForeignVariantID) {
        const invRecords = inventoryLookupByForeignVariantID[key]
        const sortedInvRecords = invRecords.sort((a, b) => {
            if (parseFloat(a.price) > parseFloat(b.price)) return 1
            if (parseFloat(a.price) < parseFloat(b.price)) return -1
    
            // if same price, sort by updatedAt:asc
            if (a.updatedAt > b.updatedAt) return 1
            if (a.updatedAt < b.updatedAt) return -1
        })

        const firstRecordWithQtyIdx = sortedInvRecords.findIndex(_inv => _inv.quantity > 0)
        if (firstRecordWithQtyIdx != -1) {
            results.push(sortedInvRecords[firstRecordWithQtyIdx].accountID == 3 ? 0 : 1)
        }
    }
    const value = (results.reduce((tot, binary) => tot += binary, 0) / results.length) * 100
    console.log(`Listings best Selling Consignor Item ${value} %`)
}

async function reducedPayoutProblemReport() {
    const salesOrders = await db.order.findAll({
        where: {
            accountID: 3,
            consignorID: 10836,
            createdAt: {[Op.gte]: moment('12-05-2022 00:00', 'MM-DD-YYYY hh:mm')},
            typeID: 4,
        },
        include: [
            {model: db.orderLineItem, as: 'orderLineItems', include: [
                {model: db.inventory, as: 'inventory'},
                {model: db.item, as: 'item', include: [
                    {model: db.account, as: 'account'}
                ]}
            ]}
        ]
    })
    console.log(salesOrders.length)

    const report = []
    const sortedTransactionRates = await db.transactionRate.findAll({where: {}, order: [['minPrice', 'asc']]})
    for (var saleOrder of salesOrders) {
        for (var oli of saleOrder.orderLineItems) {
            if (Math.abs(oli.price - oli.inventory.price) > 10 && oli.item.accountID != 3) {
                let payoutSale;
                let payoutCorrected; 
                for (var key of ['current', 'corrected']) {
                    const price = key == 'current' ? parseFloat(oli.price) : parseFloat(oli.inventory.price)
                    // Find applicable fees
                    const feeRecord = sortedTransactionRates.find(transactionRate => parseFloat(price) <= transactionRate.maxPrice)
                    const feeApplicableAmount = price * (feeRecord.value / 100)
                    if (key == 'current') {
                        payoutSale = price - feeApplicableAmount
                    } else {
                        payoutCorrected = price - feeApplicableAmount
                    }
                }

                report.push({
                    'Order ID': saleOrder.ID,
                    'Order Reference': saleOrder.reference1,
                    'Order Date': moment(saleOrder.createdAt).format('DD/MM HH:mm'),
                    'Consignor ID': oli.item.accountID,
                    'Consignor Name': oli.item.account.name,
                    'Sold At': oli.price,
                    'Listed At': oli.inventory.price,
                    'Current Payout': payoutSale.toFixed(2),
                    'Corrected Payout': payoutCorrected.toFixed(2),
                    'Payout Difference': (payoutSale - payoutCorrected).toFixed(2),
                    'Status': oli.canceledAt ? 'canceled' : ''
                })
            }
        }
    }
    csv = new objectsToCsv(report)
    await csv.toDisk(`${resultsDir}/reducedPayoutProblemReport.csv`)
}

async function analytics1() {
    /**
     * get all orders for the period at harrods
     * group by products sold
     * number of products sold
     * for each product variant breakdown
     * 
     * man/woman/kid
     * sold, stock left (locations), lowest price
     * 
     * 
     * 
     */
    const period = '1M'
    let startPeriod = moment()

    switch (period) {
        case '1M':
            startPeriod = startPeriod.subtract(1, 'months')
    }
    
    const orders = await db.order.findAll({
        where: {
            typeID: 4,
            consignorID: 10837,
            accountID: 3
        }, 
        include: [
            {model: db.orderLineItem, as: 'orderLineItems', include: [
                { model: db.item, as: 'item', include: [
                    { model: db.account, as: 'account'}
                ]},
                { model: db.product, required: true, as: 'product' },
                { model: db.productVariant, required: true, as: 'variant' },
            ]},
        ]})
    const shopifyOrders = await db.order.findAll({
        where: {
            typeID: 4,
            consignorID: {[Op.not]: 10837},
            accountID: 3
        }, 
        include: [
            {model: db.orderLineItem, as: 'orderLineItems', include: [
                { model: db.item, as: 'item', include: [
                    { model: db.account, as: 'account'}
                ]},
                { model: db.product, required: true, as: 'product' },
                { model: db.productVariant, required: true, as: 'variant' },
            ]},
        ]})
    const orderLineItems = []
    //exclude items below 100
    orders.map(order => order.orderLineItems.filter(oli => parseFloat(oli.price) > 100).map(oli => orderLineItems.push(oli)))

    const shopifyOrderLineItems = []
    shopifyOrders.map(order => order.orderLineItems.filter(oli => parseFloat(oli.price) > 100).map(oli => shopifyOrderLineItems.push(oli)))


    let productIDs = []
    orderLineItems.map(oli => productIDs.push(oli.productID))

    productIDs = [...new Set(productIDs)]
    const products = await db.product.findAll({
        where: {ID: productIDs},
        include: [
            {model: db.productVariant, as: 'variants'}
        ]
    })

    let variants = []
    products.map(product => {
        const productQuantitySold = orderLineItems.filter(oli => oli.productID == product.ID)
        const productShopifyQtySold = shopifyOrderLineItems.filter(oli => oli.productID == product.ID) 

        product.variants.map(variant => {
            const oli = orderLineItems.filter(oli => oli.productVariantID == variant.ID)
            const oliShopify = shopifyOrderLineItems.filter(oli => oli.productVariantID == variant.ID)

            const data = {
                variantID: variant.ID,
                variant: variant.name,
                productID: product.ID,
                product: product.code + product.title,
                productQuantitySold: productQuantitySold.length,
                productShopifyQtySold: productShopifyQtySold.length,
                quantitySold: oli.length,
                quantityShopifySold: oliShopify.length,
                lastSalePrice: 0,
                avgSalePrice: 0,
                avgCostPrice: 0,
            }

            if (oli.length == 0) {
                variants.push(data)
                return
            }
            // most recent sale is idx 0
            const sortedOlis = oli.sort((a, b) => b.ID - a.ID);
            
            const avgSalePrice = (oli.reduce((tot, oli)=> tot += parseFloat(oli.price), 0) / oli.length)
            const avgCostPrice = (oli.reduce((tot, oli)=> tot += parseFloat(oli.cost), 0) / oli.length)
            data['lastSalePrice'] = sortedOlis[0].price
            data['avgSalePrice'] = avgSalePrice
            data['avgCostPrice'] = avgCostPrice

            variants.push(data)
        })
    })

    const inventoryRecords = await db.inventory.findAll({where: {
        quantity: {[Op.gte]: 1},
        virtual: 0,
        productVariantID: variants.map(v => v.variantID)
    }})

    // calculate stock left for each variant and locations (harrods, edit and others) & lowest price
    variants = variants.map(variantRecord => {
        const _inventoryRecords = inventoryRecords.filter(inv => inv.productVariantID == variantRecord.variantID)
        variantRecord.quantityStock = _inventoryRecords.reduce((qty, inv) => qty += inv.quantity, 0) 
        const lowestAsk = Math.min(..._inventoryRecords.map(inv => inv.price)) || null
        const harrodsStock  =_inventoryRecords.filter(record => record.warehouseID == 923).reduce((qty, inv) => qty += inv.quantity, 0)
        const editStock = _inventoryRecords.filter(record => record.warehouseID == 6).reduce((qty, inv) => qty += inv.quantity, 0)
        variantRecord.harrodsStock = harrodsStock
        variantRecord.editStock = editStock
        variantRecord.lowestAsk = lowestAsk
        return variantRecord
    })


    // build report
    csv = new objectsToCsv(variants.map(record => {
        return {
            'Product': record.product,
            'Variant': record.variant,
            'Product Quantity Sold @ Harrods': record.productQuantitySold,
            'Product Quantity Sold @ Shopify': record.productShopifyQtySold,
            'Quantity Sold @ Harrods': record.quantitySold,
            'Quantity Sold @ Shopify': record.quantityShopifySold,
            'Stock @ Harrods': record.harrodsStock,
            'Stock @ Edit': record.editStock,
            'Bread Index': record.quantitySold / (1 + record.harrodsStock + record.editStock),
            'Average Margin': (record.avgSalePrice - record.avgCostPrice).toFixed(2),
            'Current Lowest Ask': record.lowestAsk,
            'Last Sale Price': record.lastSalePrice,
            'Average Sale Price': record.avgSalePrice.toFixed(2),
            'Stock @ Consignors': record.quantityStock - record.harrodsStock - record.editStock,
            //'Bread Index Margin': (record.quantitySold / (1 + record.harrodsStock + record.editStock)),
        }
    }))
    await csv.toDisk(`${resultsDir}/dean_report.csv`)
}


async function consignorsSales() {
    const startDate = moment('01/10/2021', "DD-MM-YYYY")
    const endDate = moment('01/01/2022', "DD-MM-YYYY")

    const orders = await db.orderOut.findAll({
        where: {
            '$clientBranch.isConsignor$': 1,
            createdAt: {[Op.between]: [startDate.format(), endDate.format()]},
            statusID: {[Op.not]: 9}
        },
        include: [
            {model: db.clientBranch, as: 'clientBranch'},
            {model: db.invoice, as: 'invoice'},
        ],
        order: [['createdAt', 'asc']]
    })

    const report = []
    orders.map(order => {
        report.push({
            ID: order.ID,
            'Date': moment(order.createdAt).format("DD-MM-YYYY"),
            'Shopify Order': order.externalRef,
            'Consignor': order.clientBranch.name,
            'Total Amount': order.invoice.totalAmount,
            'Fee @ 3%': (order.invoice.totalAmount * 0.03).toFixed(2)
        })
    })

    csv = new objectsToCsv(report)
    await csv.toDisk(`${resultsDir}/invoice_Oct_Dec.csv`)
}
async function jobLineItemReport(jobID) {
   const jobLineItems = await db.jobLineItem.findAll({
       where: {jobID: jobID}, include: [
           {model: db.item, as: 'item', include: [{model: db.account, as: 'account'},{model: db.warehouse, as: 'warehouse'}, {model: db.order, as: 'order', include: [
                        {model: db.status, as: 'status'},
                        {model: db.orderType, as: 'type'},
                   ]}]},
           {model: db.product, as: 'product', include: [{model: db.productCategory, as: 'category'}]},
           {model: db.productVariant, as: 'variant'},
           {model: db.status, as: 'status'},
           {model: db.warehouse, as: 'warehouse'},
           {model: db.inventory, as: 'inventory', include: [{model: db.warehouse, as: 'warehouse'},
                   {model: db.inventoryListing, as: 'listings'}
               ]},
       ]
   })

    const report = []
    jobLineItems.map(jli => {
        const listing = jli.inventory ? jli.inventory.listings.find(li=> li.saleChannelID == 1) : null
        report.push({
            'JLI ID': jli.ID,
            'Account ID': jli.item.account.ID,
            'Account Name': jli.item.account.name,
            'Item Barcode':  jli.item.barcode ,
            'Item Location': jli.item.warehouse ? jli.item.warehouse.name : '',
            'Item Order ID': jli.item.orderID ,
            'Item Order Type': jli.item.order ? jli.item.order.type.name : '',
            'Item Order Status': jli.item.order ? jli.item.order.status.name : '',
            'JLI Notes': jli.notes,
            'Product ID': jli.product.ID,
            'Product': jli.product.name,
            'Product Code': jli.product.code,
            'Product Category': jli.product.category.name,
            'Variant ID': jli.variant.ID,
            'Variant': jli.variant.name,
            'JLI Status': jli.status.name,
            'JLI Notes': jli.status.notes,
            'JLI Warehouse': jli.warehouse ? jli.warehouse.name : '',
            'Confirmed at': jli.confirmedAt ? moment(jli.confirmedAt).format("DD-MM-YYYY h:mm a"): '',
            'Completed at':jli.completedAt ? moment(jli.completedAt).format("DD-MM-YYYY h:mm a"): '',
            'Action': jli.action,
            'Action ResolvedAt': jli.actionResolvedAt ? moment(jli.actionResolvedAt).format("DD-MM-YYYY h:mm a"): '',
            'Action CreatedAt': jli.actionCreatedAt ? moment(jli.actionCreatedAt).format("DD-MM-YYYY h:mm a"): '',
            'Deleted At': jli.deletedAt ?  moment(jli.deletedAt).format("DD-MM-YYYY h:mm a") : '',
            'Inventory ID': jli.inventoryID,
            'Inventory Price': jli.inventory && listing ? listing.price : '',
            'Inventory Cost': jli.inventory ? jli.inventory.cost: '',
            'Inventory Location': jli.inventory && jli.inventory.warehouse ? jli.inventory.warehouse.name: '',
            //'Inventory status': jli.inventory ? jli.inventory.status.name: '',
            // 'Date': moment(order.createdAt).format("DD-MM-YYYY h:mm a"),
            // 'Shopify Order': order.externalRef,
            // 'Consignor': order.clientBranch.name,
            // 'Total Amount': order.invoice.totalAmount,
            // 'Fee @ 3%': (order.invoice.totalAmount * 0.03).toFixed(2)
        })
    })

    let csv = new objectsToCsv(report)
    await csv.toDisk(`${resultsDir}/stocktakejob_${jobID}.csv`)
    console.log('DONE')
}




// SCRIPT to check missing inventory costs over periods of time

async function createItemsMissingCostReport(){
    console.log(`Creating report of items to be checked for missing costs`)

    //add consignor and edit account to check for costs

    const accounts = await db.account.findAll({where: {folderID: 3}})
    const editAccount =  await db.account.findOne({where: {ID:3}})
    accounts.push(editAccount)

    const accountIDs = accounts.map(account => account.ID)

    console.log('accountsSelected => ', accountIDs)

    let reportContent = []

    const inventoryItems = await db.inventory.findAll({where: {accountID: accountIDs}, include: [{model: db.item, as: 'items'}]})

    const itemCostMismatches = []

    inventoryItems.map(inventoryItem => {
        inventoryItem.items.map(item => {
            reportContent.push({
                itemID: item.ID,
                itemCost: item.cost,
                itemPrice: item.price,
                itemNotes: item.notes,
                inventoryID: inventoryItem.ID,
                inventoryCost: inventoryItem.cost,
                inventoryPrice: inventoryItem.price,
                inventoryNotes: inventoryItem.notes,
                accountID : inventoryItem.accountID
            })
            item.cost != inventoryItem.cost && inventoryItem.quantity != 0 && !item.orderOutID? itemCostMismatches.push(item.ID) : null
        })
    })

    console.log('Item costs that are not matching with inventory = ', itemCostMismatches.length)
    console.log(itemCostMismatches)

    const date = moment(new Date()).format('DD-MM-YYYY')


    let csv = new objectsToCsv(reportContent)
    await csv.toDisk(`${resultsDir}/itemsMissingCostsCheck_${date}.csv`)
}



async function consignorEmails(passwords=false){
   const users = await db.user.findAll({where: {activatedAt: {[Op.ne]: null}, accountID: {[Op.ne]: 3}},include: [{model: db.account, as: 'account',required: true, include: [{model: db.saleChannel, as: 'saleChannels', where: {accountID: 3}}]}]})

    const report = []
    users.map(user=> {
        if(user.email){
            let obj = {
                accountID: user.accountID ,name: user.name,surname: user.surname,email: user.email, number: user.phoneNumber
            }
            if(passwords){
                obj.password = user.password
            }

            report.push(obj)
        }
    })
    console.log(report.length)

    let path = `${resultsDir}/editConsignorEmails.csv`
    console.log(path)
    let parsedCsv = new objectsToCsv(report)
    await parsedCsv.toDisk(path)

}

// Rport on stock currently being held
async function generateCostReport() {

    let accountIDs = []
    accountIDs.push(3)

    const inventory = await db.inventory.findAll({where: {accountID: accountIDs, virtual: false, quantity: {[Op.gt]: 0}},
        include: [{model: db.productVariant, as: 'variant', required: true}, {
            model: db.product,
            as: 'product',
            include: [{
                model: db.productCategory, as: 'category'
            }]
        },]
    })
    const reportContent =[]
    inventory.map(inventoryItem => {
        reportContent.push({
            ID: inventoryItem.ID,
            dateArrived: inventoryItem.createdAt,
            sku: inventoryItem.product.code,
            productTitle: inventoryItem.product.title,
            variantName: inventoryItem.variant.name,
            category: inventoryItem.product.category ? inventoryItem.product.category.name : 'N/A',
            unitCost : inventoryItem.cost ? inventoryItem.cost : 0,
            unitPrice : inventoryItem.price,
            quantity: inventoryItem.quantity,
            totalCost:  inventoryItem.cost ? inventoryItem.cost * inventoryItem.quantity : 0,
            totalPrice: inventoryItem.price * inventoryItem.quantity,
            notes: inventoryItem.notes
        })
    })
    converter.json2csv(reportContent, (err, csv) => {
        if (err) {
            throw err;
        }
        // print CSV string
        fs.writeFileSync('scripts/reports/inventoryReport.csv', csv);
    })
}


async function inventoryStockAnomaly() {

    let clientBranchIDs = []

    //clientBranchIDs = consignorClientBranches.map(clientBranch => clientBranch.ID)
    clientBranchIDs.push(39)

    console.log(clientBranchIDs)


    const inventory = await db.inventory.findAll({where: {clientBranchID: clientBranchIDs, virtual: false, quantity: {[Op.gt]: 0}},
        include: [{model: db.productVariant, as: 'variant', required: true}, {
            model: db.product,
            as: 'product',
            include: [{
                model: db.productCategory, as: 'category'
            }]
        },]
    })
    console.log(inventory.length)
    const reportContent =[]
    inventory.map(inventoryItem => {
        if (!inventoryItem.notes){

            reportContent.push({
                ID: inventoryItem.ID,
                dateArrived: inventoryItem.createdAt,
                sku: inventoryItem.product.code,
                productTitle: inventoryItem.product.title,
                variantName: inventoryItem.variant.name,
                category: inventoryItem.product.category ? inventoryItem.product.category.name : 'N/A',
                unitCost : inventoryItem.cost ? inventoryItem.cost : 0,
                unitPrice : inventoryItem.price,
                quantity: inventoryItem.quantity,
                totalCost:  inventoryItem.cost ? inventoryItem.cost * inventoryItem.quantity : 0,
                totalPrice: inventoryItem.price * inventoryItem.quantity,
                notes: inventoryItem.notes
            })
        }
    })
    converter.json2csv(reportContent, (err, csv) => {
        if (err) {
            throw err;
        }
        // print CSV string
        fs.writeFileSync('scripts/stockAnomalyReport.csv', csv);
    })
}


async function salesMonth() {
    const items = await db.item.findAll({
        include: [
            {model: db.inventory, as: "inventory", 
            include: [
                {model: db.clientBranch, as:'clientBranch'}
            ],
            where: {
                clientBranchID: {
                    [Op.gte]: 39
                }
            }
        }],
        order: [
            ['createdAt', 'asc']
        ]
    })

    const salesOrders = await db.orderOut.findAll({
        where: {
            clientBranchID: {
                [Op.gte]: 39
            }
        },
        include: [
            {model: db.invoice, as:'invoice'},
            {model: db.item, as: 'items', include: [
                {model: db.inventory, as: "inventory"}
            ]}
        ],
        order: [
            ['createdAt', 'asc']
        ]
    })
    
    const report = []
    for (var weekIdx = 1; weekIdx <= 52; weekIdx ++) {
        const periodStartDate = moment().day("Monday").week(weekIdx);
        const periodEndDate = moment().day("Sunday").week(weekIdx + 1);
        console.log(periodStartDate, periodEndDate)

        let periodOrders = salesOrders.filter(order => order.createdAt >= periodStartDate && order.createdAt <= periodEndDate)
        periodOrders = periodOrders.filter(order => order.statusID != 9 && order.statusID != 10)
        const editOrders = periodOrders.filter(order => order.clientBranchID == 39)
        const consignorsOrders = periodOrders.filter(order => order.clientBranchID != 39)

        const editStockSoldItems = []
        const editSourcingSoldItems = []
        const consignorSoldItems = []

        let totalEditStock = 0
        let totalEditSourcing = 0
        editOrders.map((order) => order.items.map(item => {
            if (item.inventory.virtual) {
                totalEditSourcing += item.price
                editSourcingSoldItems.push(item)
            } else {
                totalEditStock += item.price
                editStockSoldItems.push(item)
            }
        }))
        let totalConsignors = 0
        consignorsOrders.map(order => order.items.map(item => {
            totalConsignors += item.price
            consignorSoldItems.push(item)
        }))
        const total = totalEditStock + totalEditSourcing + totalConsignors

        const periodItems = items.filter(item => item.createdAt >= periodStartDate && item.createdAt <= periodEndDate)
        const consignorMonthlyItems = periodItems.filter(item => item.inventory.clientBranch.isConsignor)
        const editMonthlyItems = periodItems.filter(item => !item.inventory.clientBranch.isConsignor)

        /**
         * consignor inv records created in the month
         * - get qty and tot price
         * edit inv records created in the month
         * - get qty and price
         * - get virtual inv and price 
         */

        report.push({
            period: `${periodStartDate.format('MMM')} Week ${periodStartDate.week() - moment(periodStartDate).startOf('month').week() + 1}`,
            sales: total.toFixed(2),
            editStockSales: totalEditStock.toFixed(2),
            editSourcingSales: totalEditSourcing.toFixed(2),
            consignorsSales: totalConsignors.toFixed(2),
            editStockItemsSold: editStockSoldItems.length, 
            editSourcingItemsSold: editSourcingSoldItems.length,
            consignorItemsSold: consignorSoldItems.length,
            orders: editOrders.length + consignorsOrders.length,
            editOrders: editOrders.length,
            consignorsOrders: consignorsOrders.length,
            consignorsStockValue: consignorMonthlyItems.reduce((tot, item) => tot += (item.cost || item.price), 0).toFixed(2),
            consignorsStockItems: consignorMonthlyItems.length,
            editStockValue: editMonthlyItems.reduce((tot, item) => tot += (item.cost || item.price), 0).toFixed(2),
            editStockItems: editMonthlyItems.length,
            //editSourcingVariants: ,
        })
    }

    let parsedCSV = new objectsToCsv(report)
    await parsedCSV.toDisk(`${resultsDir}/salesAnalytics.csv`)
}

// check consignor statistics

async function consignorReportOld(fromDateString = null ,toDateString = null, filterConsignors = false, excludedAccounts = []){
    let consignorUsers = await db.user.findAll({ where: { apiKey: {[Op.eq]: null}},  include : [
    //let consignorUsers = await db.user.findAll({where: {accountID: 15}, include : [
            {model: db.account, as :'account', required: true, where: {isConsignor: true}}
        ],
        order: [
            ['ID', 'asc']
        ]})
    console.log(consignorUsers.length)
    const accountIDs = consignorUsers.map(user => user.accountID )
    let toDate = toDateString ? moment(toDateString,'DD/MM/YYYY').toDate() : new Date()
    let fromDate = fromDateString ? moment(fromDateString,'DD/MM/YYYY').toDate() : consignorUsers[0].activatedAt
    console.log('Generating Report  ', moment(fromDate, 'YYYY-MM-DD').format('DD/MM/YYYY'), '- ', moment(toDate, 'YYYY-MM-DD').format('DD/MM/YYYY'))

    const reportContent = []

    //Report summary data
    let consignors_tot = 0
    let variantsUploaded_tot = 0
    let productsUploaded_tot= 0
    let totalValueUploaded_tot = 0 //done
    let itemsUploaded_tot = 0
    let variantsStocked_tot = 0
    let productsStocked_tot= 0
    let totalValueStocked_tot = 0
    let itemsStocked_tot = 0
    let productsSold_tot= 0
    let variantsSold_tot= 0
    let totalValueSold_tot = 0
    let itemsSold_tot = 0

    console.log('HERE 1')

    let dbItems = await db.item.findAll({
        where: {accountID: accountIDs}, include: [
            {model: db.inventory, as: 'inventory'},
            {model: db.orderLineItem, as: 'orderLineItems', include: [{model: db.status, as: 'status' },{model: db.orderType, as: 'orderType'}, {model: db.order, as: 'order', include: [{model: db.status, as: 'status'}, {model: db.orderType, as: 'type'}]},]},
            {model: db.product, as: 'product'},
            {model: db.productVariant, as:'variant'},

            {model: db.account, as: 'account'},
            {model: db.warehouse, as: 'warehouse'},
        ]
    })

    console.log('HERE 2')

    let completedUsers = 0
    for (let user of consignorUsers){
        console.log('complete user ')
        let joinedDate = moment(user.activatedAt, 'YYYY-MM-DD').format('DD/MM/YYYY')
        if (excludedAccounts.indexOf(user.accountID) != -1 || joinedDate > toDate){
            continue
        }

        consignors_tot ++

        // stocked
        let variantsStocked = new Set()
        let productsStocked= new Set()
        let totalValueStocked = 0
        let itemsStocked = 0

        //sold
        let productsSold= new Set()
        let variantsSold= new Set()
        let totalValueSold = 0
        let itemsSold = 0

        //uploaded
        let variantsUploaded = new Set()
        let productsUploaded= new Set()
        let totalValueUploaded = 0 //done
        let itemsUploaded = 0




        const consignorItems = dbItems.filter(item => item.accountID == user.accountID)

        for (let item of consignorItems){
            const inboundOli = item.orderLineItems.find(oli => oli.orderTypeID == 3 && oli.accountID == user.accountID)
            if(!inboundOli) {
               // console.log('This should not happen : item ID -> ', item.ID )
            }
            else {
                const outboundOli = item.orderLineItems.find(oli => oli.orderTypeID == 4 && oli.accountID == user.accountID)
                // sold

                if (outboundOli && outboundOli.createdAt <= toDate && outboundOli.createdAt >= fromDate){
                    const wasRejected = outboundOli.status.name == 'rejected'
                    const isPending = outboundOli.status.name == 'pending'
                    if (!wasRejected &&  !isPending){
                        // means that this is a valid sold item
                        totalValueSold += parseFloat(outboundOli.price)
                        productsSold.add(item.productID)
                        variantsSold.add(item.productVariantID)
                        itemsSold ++

                    }


                }
                // stocked
                else if (inboundOli.createdAt <= toDate && inboundOli.createdAt >= fromDate){
                    totalValueStocked += parseFloat(inboundOli.price)
                    productsStocked.add(item.productID)
                    variantsStocked.add(item.productVariantID)
                    itemsStocked ++



                }
                if (inboundOli.createdAt <= toDate && inboundOli.createdAt >= fromDate){
                    // uploaded
                    totalValueUploaded += parseFloat(inboundOli.price)
                    productsUploaded.add(item.productID)
                    variantsUploaded.add(item.productVariantID)
                    itemsUploaded ++

                }

            }
        }
        if (user.activatedAt && user.activatedAt <= toDate ){
            reportContent.push({
                userID: user.ID,
                name: user.name,
                surname: user.surname,
                email: user.email,
                phoneNumber: user.phoneNumber,
                accountID: user.accountID,
                dateJoined: joinedDate ? joinedDate: '',
                variantsUploaded: variantsStocked.size,
                productsUploaded: productsUploaded.size,
                itemsUploaded: itemsUploaded,
                variantsStocked: variantsStocked.size,
                productsStocked: productsStocked.size,
                itemsStocked: itemsStocked,
                variantsSold: variantsSold.size,
                productsSold: productsSold.size,
                itemsSold: itemsSold,
                totalValueUploaded: totalValueUploaded.toFixed(2),
                totalValueStocked: totalValueStocked.toFixed(2),
                totalValueSold: totalValueSold.toFixed(2)
            })

            variantsUploaded_tot += variantsStocked.size
            productsUploaded_tot += productsUploaded.size
            if (totalValueUploaded_tot > 0)  totalValueUploaded_tot += totalValueUploaded
            itemsUploaded_tot += itemsUploaded
            variantsStocked_tot +=  variantsStocked.size
            productsStocked_tot += productsStocked.size
            if (totalValueStocked > 0) totalValueStocked_tot += totalValueStocked
            itemsStocked_tot  += itemsStocked
            productsSold_tot += productsSold.size
            variantsSold_tot += variantsSold.size
            totalValueSold_tot += totalValueSold
            itemsSold_tot += itemsSold

        }

    }
    console.log(`Consignors active on the platform:`.padEnd(65," "), consignors_tot )
    console.log(`Total variants uploaded:`.padEnd(65," "), variantsUploaded_tot )
    console.log(`Total products uploaded:`.padEnd(65," "), productsUploaded_tot)
    console.log(`Total value uploaded:`.padEnd(65," "), totalValueUploaded_tot.toFixed(2) )
    console.log(`Total items uploaded:`.padEnd(65," "), itemsUploaded_tot )
    console.log(`Total variants stocked:`.padEnd(65," "), variantsStocked_tot )
    console.log(`Total products stocked:`.padEnd(65," "), productsStocked_tot)
    console.log(`Total value stocked:`.padEnd(65," "), totalValueStocked_tot.toFixed(2)  )
    console.log(`Total items stocked:`.padEnd(65," "), itemsStocked_tot )
    console.log(`Total products sold:`.padEnd(65," "), productsSold_tot)
    console.log(`Total variants sold:`.padEnd(65," "), variantsSold_tot)
    console.log(`Total value sold:`.padEnd(65," "), totalValueSold_tot.toFixed(2) )
    console.log(`Total items sold:`.padEnd(65," "), itemsSold_tot)


    let parsedCsv = new objectsToCsv(reportContent)
    const readableFromDate = moment(fromDate, 'YYYY-MM-DD').format('DD-MM-YYYY')
    const readableToDate = moment(toDate, 'YYYY-MM-DD').format('DD-MM-YYYY')
    let titleDetails = `${readableFromDate}_to_${readableToDate}`
    await parsedCsv.toDisk(`${resultsDir}/consignorReport_${titleDetails}.csv`)

}

//Edit report to show sales by item and whether they were consigned, sourced or stocked
async function editOrderReport(){





    // const orders = await db.orderOut.findAll({where: {statusID: [11,12]}, include:
    //         [   { model: db.item, as: 'items', required: true,
    //                  include: [{model: db.inventory, as: 'inventory', required: false},
    //                      {model: db.productVariant, as: 'variant'},
    //                      {model: db.product, as: 'product'}
    //                  ]},
    //             {model: db.invoice, as: 'invoice'},
    //             {model: db.account, as: 'account'}]
    // }, )
    let reportContent = []
    orders.map(order => {
        order.items.map(item => {
            !item.inventory ? console.log(item.ID): null
            if(item.inventory){
                reportContent.push(
                    {
                        itemID: item.ID,
                        product: item.product.title,
                        variant: item.variant.name,
                        productCode: item.product.code,
                        productID: item.product.ID,
                        variantID: item.variant.ID,
                        itemCost: item.cost ? item.cost  :null,
                        itemPrice: item.price,
                        itemProfit: item.price && item.cost ? (((item.price - item.cost) / item.price ) * 100).toFixed(2)   :null,
                        itemPayout: (item.price && item.feeAmount &&  order.account.isConsignor )? ((item.price - item.feeAmount).toFixed(2))  :null,
                        itemServiceFee: item.feeAmount &&  order.account.isConsignor ? (item.feeAmount).toFixed(2) :null,
                        shopifyOrderRef: order.externalRef,
                        orderID: order.ID,
                        source: item.inventory.virtual? 'true': null,
                        consignment: order.account.isConsignor ? 'true': null,
                        consignorAccount:  order.account.isConsignor ? order.account.name : 'N/A',
                        consignorAccountID: order.account.isConsignor ? order.account.ID : 'N/A',
                        dateSold: moment(order.createdAt).format("DD-MM-YYYY "),
                    }
                )
            }


        })
    })

    csv = new objectsToCsv(reportContent)
    await csv.toDisk(`${resultsDir}/ordersByItem.csv`)

}


/**
 * NEW REPORTS
 */

/*
    STRIPE SYNC PAYOUT STATUS
 */


async function locationCheckNoListing(warehouseID, saleChannelID, reportName= 'locationNoListing'){
    const inventory =  await db.inventory.findAll({where: {warehouseID: warehouseID},include: [{model: db.inventoryListing, as: 'listings'},{model: db.warehouse, as: 'warehouse'}, {model: db.productVariant, as: 'variant'}, {model: db.product, as: 'product'}, {model: db.account, as: 'account'} ]})
    const reportContent = []
    for (let inv of inventory){
        const foundListing = inv.listings.find(listing => listing.saleChannelID == saleChannelID)
        if(!foundListing){
            reportContent.push({
                account: inv.account.name,
                accountID: inv.accountID,
                warehouse: inv.warehouse.name,
                product: inv.product.title,
                productCode: inv.product.code,
                variant: inv.variant.name,
            })
        }
    }
    const parsedCSV = new objectsToCsv(reportContent)
    await parsedCSV.toDisk(`${resultsDir}/${reportName}.csv`)
}

async function consignorsAwaitingPayout(){
    await syncPayoutStatuses()
    let orders = await db.order.findAll({
        where: {typeID: 4},
        include: [{
            model: db.invoice,
            as: 'invoice',
            include: [{model: db.transaction, as: 'transactions'}]
        }, {model: db.account, as: 'account', where: {isConsignor: true}}, {model: db.orderLineItem, as: 'orderLineItems', include: [{model: db.item ,as: 'item', include: [{model: db.warehouse, as: 'warehouse'
        }]}, {model:db.status, as:'status'}]}]
    })
    const reportContent = []
    orders = orders.map(order=> {

        if (!order.invoice.completedAt && order.account.isConsignor == 1 && order.statusID == 8 && order.invoice.transactions.length == 0  ) {
            reportContent.push({
                consignorOrderID: order.ID,
                adminOrderID: order.invoice.payerOrderID,
                invoiceID:  order.invoice.ID,
                shopifyRef: order.reference1,
                consignor: order.account.name,
                orderDate: moment(order.createdAt).format("DD-MM-YYYY"),
                hasStripe: order.account.stripeAccountID
            })
        }
    })

    csv = new objectsToCsv(reportContent)
    await csv.toDisk(`${resultsDir}/missingPayments.csv`)
    console.log(orders.length)
}

async function manualOrderPayoutProblem() {
    // get manual orders
    const reportContent = []
    const manualOrders = await db.order.findAll({
        where: {tags: {[Op.substring]: 'manual'}},
        include: [{
            model: db.orderLineItem,
            as: 'orderLineItems',
            include: [
                {model: db.inventory, as: 'inventory'},
                {model: db.product, as: 'product'},
                {model: db.productVariant, as: 'variant'},
                {model: db.order, as: 'order'},
                {model: db.item, as: 'item', include: [{model: db.account, as: 'account'}, {model: db.orderLineItem, as: 'orderLineItems'}]}]
        }, {model: db.account, as: 'account'}, {model: db.invoice, as: 'invoice', include:[{model:db.status, as: 'status'}]}]
    })

    const adminOrders = manualOrders.filter(order => order.accountID == 3)
    const consignorOrders =  manualOrders.filter(order => order.accountID != 3 )


    console.log('Found manual orders', adminOrders.length)

    for (let order of adminOrders) {
        for (let orderLineItem of order.orderLineItems) {
            //filter out edit items
            if (orderLineItem.item.accountID != 3) {

                // calculate transaction rates with invenotry figures
                const inventory = orderLineItem.inventory
                //get transaction rates
                const transactionRates = await service.account.getAllRates(3)

                const feeRecord = transactionRates.find(transactionRate => parseFloat(inventory.price) <= transactionRate.maxPrice)
                let feeApplicableAmount = 0
                if (feeRecord.type == 'percentage') {
                    feeApplicableAmount = inventory.price * (feeRecord.value / 100)
                }
                const payout = inventory.price - feeApplicableAmount

                //find invoice status
                // const correspOli = orderLineItem.item.orderLineItems.find(oli => {
                //     console.log(oli.orderTypeID, '====', oli.accountID != 3)
                //     //oli.orderTypeID == 4 && oli.orderID != order.ID
                // })
                const correspOli = orderLineItem.item.orderLineItems.find(oli => oli.orderTypeID == 4 && oli.accountID != 3)
                const counterOrder = consignorOrders.find(_order => _order.ID == correspOli.orderID)

                reportContent.push({
                    orderID: order.ID,
                    //orderAccountID: order.accountID,
                    //address: order.consignor.fullName,
                    orderReference: order.reference1,
                    account: orderLineItem.item.account.name,
                    accountID: orderLineItem.item.account.ID,
                    productName: orderLineItem.product.title,
                    productCode: orderLineItem.product.code,
                    productVariant: orderLineItem.variant.name,
                    incorrectPayout: orderLineItem.cost,
                    consignorSetPayout: payout.toFixed(2),
                    differenece: inventory.price == 999 || inventory.price == 999.99 && orderLineItem.cost < inventory.price ? '' :  (orderLineItem.cost-  payout.toFixed(2)).toFixed(2) ,
                    payoutWasNotSetWarning: (inventory.price == 999 || inventory.price == 999.99) && orderLineItem.cost < inventory.price   ? 'TRUE' : '',
                    invoiceStatus: counterOrder ? counterOrder.invoice.status.name : 'NO COUNTER ORDER FOUND',
                    createdAt: moment(order.createdAt).format("YYYY-MM-DD HH:mm:ss")
                })
            }
        }
    }
    let parsedCsv = new objectsToCsv(reportContent)
    await parsedCsv.toDisk(`${resultsDir}/manualOrderItemPayouts.csv`)
}

async function harrodsPricingReport(){
    const reportContent = []
    const inventory = await db.inventory.findAll({where: {warehouseID: 923 }, include:[{model: db.account, as: 'account', where: {isConsignor: true}},{model: db.product, as: 'product'},
            {model: db.productVariant, as: 'variant'},{model: db.warehouse, as: 'warehouse'}]})

    await fetchDBData(['accounts','inventory', 'products'])
    //get transaction rates
    const transactionRates = await service.account.getAllRates(3)
    for (let inv of inventory){
        if (inv.variant.stockxId){
            //find stock x prod var
            const foundStockXVariant = stockxVariants.find(variant => variant.stockxId == inv.variant.stockxId)
            if (foundStockXVariant.lowestAsk){
            const feeRecord = transactionRates.find(transactionRate => parseFloat(inv.price) <= transactionRate.maxPrice)
            let feeApplicableAmount = 0
            if (feeRecord.type == 'percentage') {
                feeApplicableAmount = inv.price * (feeRecord.value / 100)
            }
            const payout = inv.price - feeApplicableAmount

            reportContent.push({
                accountID: inv.accountID,
                accountName: inv.account.name,
                productCode: inv.product.code,
                productTitle: inv.product.title,
                variant: inv.variant.name,
                notes: inv.notes,
                payout: payout,
                lowestAsk: foundStockXVariant.lowestAsk
            })
            }
        }

    }
    const reportcsv = new objectsToCsv(reportContent)
    await reportcsv.toDisk(`${resultsDir}/harrodsConsignorPricingComparison.csv`)

}

async function itemLocationCheck(warehouseID, filename){
    const reportContent = []
    const items = await db.item.findAll({where: {warehouseID: warehouseID }, include:[{model: db.account, as: 'account'},{model: db.product, as: 'product'},
            {model: db.productVariant, as: 'variant'},{model: db.warehouse, as: 'warehouse'}]})
    const scannedBarcodes = new Set()
    let barcodesToCheck = new Set()

    if (fs.existsSync(`./scripts/imports/${filename}.csv`)) {
        const records = await csv().fromFile(`./scripts/imports/${filename}.csv`);
        records.map(record => {
            scannedBarcodes.add(record.sku)
        })
        console.log('Barcodes scanned: ', scannedBarcodes.size)
        console.log('Items supposed to be at location: ', items.length)
        barcodesToCheck = scannedBarcodes
        items.map((item) => {
            if (!scannedBarcodes.has(item.barcode) ){
                reportContent.push({
                    itemID: item.ID,
                    accountID: item.accountID,
                    accountName: item.account.name,
                    productCode: item.product.code,
                    productTitle: item.product.title,
                    variant: item.variant.name,
                    inventoryID: item.inventoryID,
                    warehouse: item.warehouse.name,
                    barcode: item.barcode,
                    anomaly: 'item missing'
                })
            }
            else{
                barcodesToCheck.delete(item.barcode)
            }
        })
        console.log('Items missing at location: ', reportContent.length)
        console.log('Items scanned but not at location on system: ', scannedBarcodes.size - barcodesToCheck.size )
        const parsedCSV = new objectsToCsv(reportContent)
        await parsedCSV.toDisk(`${resultsDir}/stockTakeReport_${warehouseID}.csv`)
    }
    else {
        console.log('no file found')
    }


    // //get transaction rates
    // for (let inv of inventory){
    //     if (inv.variant.stockxId){
    //         //find stock x prod var
    //         const foundStockXVariant = stockxVariants.find(variant => variant.stockxId == inv.variant.stockxId)
    //         if (foundStockXVariant.lowestAsk){
    //             const feeRecord = transactionRates.find(transactionRate => parseFloat(inv.price) <= transactionRate.maxPrice)
    //             let feeApplicableAmount = 0
    //             if (feeRecord.type == 'percentage') {
    //                 feeApplicableAmount = inv.price * (feeRecord.value / 100)
    //             }
    //             const payout = inv.price - feeApplicableAmount
    //
    //             reportContent.push({
    //                 accountID: inv.accountID,
    //                 accountName: inv.account.name,
    //                 productCode: inv.product.code,
    //                 productTitle: inv.product.title,
    //                 variant: inv.variant.name,
    //                 notes: inv.notes,
    //                 payout: payout,
    //                 lowestAsk: foundStockXVariant.lowestAsk
    //             })
    //         }
    //     }
    //
    // }
    // csv = new objectsToCsv(reportContent)
    // await csv.toDisk(`${resultsDir}/harrodsConsignorPricingComparison.csv`)

}

async function jobLineItems(jobID) {
    const reportContent = []
    const user = await service.account.serviceUser(3)
    const job = await service.job.getOne(user,jobID)
    const jobLineItems = await service.jobLineItem.getAll(user,0,9999,{'jobID': job.ID})
        jobLineItems.rows.map(jli => {

            reportContent.push(
                {
                    itemID: jli.item.ID,
                    barcode: jli.item.barcode,
                    location: jli.item.warehouse? jli.item.warehouse.name : "" ,
                    status: jli.status? jli.status.name : "" ,
                    action: jli.action ,
                    actionResolvedAt:  jli.actionResolvedAt? new Date(jli.actionResolvedAt) : "" ,
                    deletedAt: jli.item.deletedAt? new Date(jli.item.deletedAt) : "" ,
                    product: jli.product.title,
                    variant: jli.variant.name,
                    productCode: jli.product.code,
                    productID: jli.product.ID,
                    variantID: jli.variant.ID,
                    itemCost: jli.cost ? jli.cost  :null,
                    itemPrice: jli.price,
                    itemProfit: jli.price && jli.cost ? (((jli.price - jli.cost) / jli.price ) * 100).toFixed(2)   :null,
                    itemPayout: jli.item.account.isConsignor ? jli.cost :null,
                    jobID: job.ID,
                    consignment: jli.item.account.isConsignor ? 'true': null,
                    consignorAccount:  jli.item.account.isConsignor ? jli.item.account.name : '',
                    consignorAccountID: jli.item.account.isConsignor ? jli.item.account.ID : '',
                }
            )
        })
    console.log(`${resultsDir}/jobLineItems_job#${job.ID}.csv`)

    let parsedCsv = new objectsToCsv(reportContent)
    await parsedCsv.toDisk(`${resultsDir}/jobLineItems_job#${job.ID}.csv`)
    console.log('job info report generated')
}

async function ordersByItem() {
    // get manual orders
    const reportContent = []
    const orders = await db.order.findAll({
        where: {typeID: 4},
        include: [{
            model: db.orderLineItem,
            as: 'orderLineItems',
            include: [
                {model: db.inventory, as: 'inventory'},
                {model: db.product, as: 'product'},
                {model: db.productVariant, as: 'variant'},
                {model: db.order, as: 'order'},
                {model: db.item, as: 'item', include: [{model: db.account, as: 'account'}, {model: db.orderLineItem, as: 'orderLineItems', include:[{model:db.order, as: 'order'}]}]}]
        }, {model: db.account, as: 'account'}, {model: db.invoice, as: 'invoice', include:[{model:db.status, as: 'status'}]}]
    })

    const adminOrders = orders.filter(order => order.accountID == 3)



    adminOrders.map(order => {
        order.orderLineItems.map(oli => {
            const sourcingOrder = !!(oli.item.orderLineItems.find(_oli => _oli.orderTypeID == 3 && _oli.order.tags.includes('sourcing')))
            reportContent.push(
                {
                    itemID: oli.item.ID,
                    product: oli.product.title,
                    variant: oli.variant.name,
                    productCode: oli.product.code,
                    productID: oli.product.ID,
                    variantID: oli.variant.ID,
                    itemCost: oli.cost ? oli.cost  :null,
                    itemPrice: oli.price,
                    itemProfit: oli.price && oli.cost ? (((oli.price - oli.cost) / oli.price ) * 100).toFixed(2)   :null,
                    itemPayout: oli.item.account.isConsignor ? oli.cost :null,
                    itemServiceFee: oli.item.account.isConsignor ? (oli.price -oli.cost).toFixed(2) :null,
                    itemDeletedAt: oli.item.deletedAt ? moment( oli.item.deletedAt).format("YYYY/MM/DD")  :null,
                    canceledAt: oli.canceledAt ? moment(oli.canceledAt).format("YYYY/MM/DD"):null,
                    reference: order.reference1,
                    orderID: order.ID,
                    source: sourcingOrder ? 'true': '',
                    manual: order.tags && order.tags.includes('manual') ? 'true' : '',
                    consignment: oli.item.account.isConsignor ? 'true': null,
                    consignorAccount:  oli.item.account.isConsignor ? oli.item.account.name : '',
                    consignorAccountID: oli.item.account.isConsignor ? oli.item.account.ID : '',
                    dateSold: moment(order.createdAt).format("YYYY/MM/DD"),
                }
            )


        })
    })

    let parsedCSV = new objectsToCsv(reportContent)
    await parsedCSV.toDisk(`${resultsDir}/ordersByItem.csv`)
    console.log('Orders by item report generated')
}

/**
 * EXTRAS
 */

/*
    Harrods Data Trends

    Reports:
        - Account Leaderboard
        - Product Trends (*)
        - Product Variant Trends (*)
        - Keyword trends (unstable) (*)

    Notes:
        - Manual Order Tracking started at the start of July
        - look at stock gaps
        - Harrods warehouse ID is 923
        - Harrods warehouse Address is 10837
 */

async function harrodsTrendsReport(){
    //Harrods Vars
    const warehouseID =  923
    const warehouseAddressID = 10837

    //Report contents
    const accountReportContent = []
    const productReportContent = []
    const productVariantReportContent = []
    const keyProduct = []
    //Fetch data: orders, products, inventory
    let orders = await db.order.findAll({
        where: {tags: {[Op.substring]: 'manual'}, typeID: 4},
        include: [{
            model: db.orderLineItem,
            as: 'orderLineItems',
            include: [
                {model: db.inventory, as: 'inventory'},
                {model: db.product, as: 'product'},
                {model: db.productVariant, as: 'variant'},
                {model: db.order, as: 'order'},
                {model: db.item, as: 'item', include: [{model: db.account, as: 'account'}, {model: db.orderLineItem, as: 'orderLineItems'}]}]
        }, {model: db.account, as: 'account'}, {model: db.invoice, as: 'invoice', include:[{model:db.status, as: 'status'}]}]
    })

    const inventory = await db.inventory.findAll({
        where: {warehouseID: warehouseID},
        include: [{model: db.product, as: 'product'}, {model: db.productVariant, as: 'variant'}, {model: db.account, as: 'account'}]
    })

    const products = await db.product.findAll({
        where: {accountID: 3},
        include: [{model: db.productVariant, as: 'variant'}]
    })
}

// fetching data
async function fetchDBData() {
    console.log('Fetching DB Data')
    accounts = await db.account.findAll({
        where: {[Op.or]: [
                {ID: 3}
            ]}, include: [
            {model: db.warehouse, as: 'warehouses'},
            {model: db.user, as: 'users'}
        ]})
    accountIDs = accounts.map(account => account.ID)
    console.log('Fetched accounts')

    dbProducts = await db.product.findAll({
        where: {
            accountID: 3,
            foreignID: {[Op.not]: null}
        },
        include: [
            {model: db.productVariant, as :'variants', required: false},
            {model: db.productImage, as :'images', required: false},
        ]
    })
    console.log('Fetched products')

    dbVariants = []
    dbProducts.map(product => product.variants.map(variant => dbVariants.push(variant)))

    ordersIn = await db.order.findAll({
        where: {
            accountID: accountIDs,
            typeID: 3
        },
        include: [
            {model: db.account,       as:'account'},
            {model: db.status, as: 'status'},
            {model: db.invoice, as: 'invoice', include: [{model: db.transaction, as: 'transactions'}]},
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
    console.log('Fetched orders')
    dbInventory = await db.inventory.findAll({
        where: {
            accountID: accountIDs
        },
        include: [
            {model: db.item, as: 'items', required: false},
            {model: db.status, as: 'status'},
            {model: db.productVariant, as: 'variant'},
            {model: db.product, as: 'product'},
        ]
    })

    dbItems = await db.item.findAll({
        where: {accountID: accountIDs}, include: [
            {model: db.inventory, as: 'inventory'},
            {model: db.orderLineItem, as: 'orderLineItems', include: [{model: db.status, as: 'status' },{model: db.orderType, as: 'orderType'}]},
            {model: db.product, as: 'product'},
            {model: db.productVariant, as:'variant'},
            {model: db.order, as: 'order', include: [{model: db.status, as: 'status'}, {model: db.orderType, as: 'type'}]},
            {model: db.account, as: 'account'},
            {model: db.warehouse, as: 'warehouse'},
        ]
    })
    console.log('Fetched items')
    physicalInventory = dbInventory.filter(inv => inv.virtual == 0)
    virtualInventory = dbInventory.filter(inv => inv.virtual == 1)

    ordersOut = await db.order.findAll({
        where: {
            accountID: accountIDs,
            typeID: 4
        },
        include: [
            {model: db.account,       as:'account'},
            {model: db.address,     as: 'consignor'},
            {model: db.invoice,       as:'invoice', include: [
                    {model: db.status, as: 'status'}
                ]},
            {model: db.status, as: 'status'},
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
    console.log('Fetched orders')

    dbAdminOrders = ordersOut.filter(order => !order.account.isConsignor)

    transactions = await db.transaction.findAll({where: {}})
    console.log('Fetched transactions')

    //fetch stock x products but only ones from the platform
    let syncedProductStockxIDs = []
    dbProducts.map(product => {
        if (product.stockxId) {
            syncedProductStockxIDs.push(product.stockxId )
        }
    })
    stockxProducts = []
    stockxVariants = []
    console.log(`Fetching ${syncedProductStockxIDs.length} stockX products`)
    //batch fetches
    const batchSize = 100
    const batches = Math.ceil(syncedProductStockxIDs.length / batchSize)
    for (let i = 0; i < batches ; i++){
        const stockXIdsToFetch = syncedProductStockxIDs.slice(batchSize * i , batchSize * i + (batchSize))
        console.log(`Fetching Batch ${i+1}/${batches} (size:${stockXIdsToFetch.length})`)
        try{
            const reqParams = {
                offset: 0,
                limit: batchSize,
                sort: null,
                stockxIds: stockXIdsToFetch.join(',')
            }
            //console.log(reqParams)
            const resp = await axios.get('https://production-stockx-api-6dwjvpqvqa-nw.a.run.app/api/products', {params: reqParams})
            stockxProducts = stockxProducts.concat(resp.data.rows)
        }
        catch (e) {
            console.log(e)
            continue
        }


    }

    stockxProducts.map(product => product.variants.map(variant => stockxVariants.push(variant)))
    console.log('Fetched all DB data')
}

async function editConsignorListings() {
    let total = 0
    const editListings = await db.inventoryListing.findAll({include:[{model: db.inventory, as: 'inventory', required: true, where: {quantity: {[Op.gt]: 0}}}], where: {saleChannelID: 1, accountID: {[Op.ne]: 3}}})
    for(let listing of editListings){
        if (parseFloat(listing.price) < 20000){
            total += (parseFloat(listing.price) * listing.inventory.quantity)
        }

    }
    console.log(total)

}


async function investorReport() {

    let priceThreshold = 1000000
    //get today's date in a readable format as a string using moment
    const today = moment().format('YYYY-MM-DD')

    //get the number of accounts that are consignors
    const consignorCount = await db.account.count({where: {isConsignor: 1}})

    //const editListings = await db.inventoryListing.findAll({include:[{model: db.inventory, as: 'inventory', required: true, where: {quantity: {[Op.gt]: 0}} },{model:db.saleChannel , as: 'saleChannel', required:true, where: {accountID: 3}}]})
    const inventory = await db.inventory.findAll({
        where: {quantity: {[Op.gt]: 0}},
        include: [{model: db.account, as: 'account'}, {
            model: db.inventoryListing,
            as: 'listings',
            // where: {price: {[Op.lt]: priceThreshold}},
            include: [{
                model: db.product,
                as: 'product',
                include: {model: db.productCategory, as: 'category'}
            }, {model: db.productVariant, as: 'variant'}, {
                model: db.saleChannel,
                as: 'saleChannel',
                required: true,
                where: {ID: 1}
            }]
        }]
    })

    const report = []
    let consignorValue = 0
    let consignorIDs = new Set()
    let physicalStockValue = 0
    let overThresholdStockValue = 0
    let virtualStockValue = 0
    let totalValue = 0
    for(let inventoryRecord of inventory){
        if(inventoryRecord.listings.length > 0){
            //iterate through inventoryRecord.listings and find the listing with the lowest price and status 'active' that has a price below the threshold
            let lowestListing = inventoryRecord.listings.reduce(function(prev, curr) {
                return prev.price < curr.price ? prev : curr;
            });

            if (lowestListing.price > priceThreshold) console.log(lowestListing.price)
            if (lowestListing){
                //FUNNEL data into report

                let selectedStockType = null // 'physical'| 'virtual' | 'consignor'
                const inventoryRecordTotalValue = parseFloat(lowestListing.price) * (inventoryRecord.virtual ? 1: inventoryRecord.quantity)

                //consignor value
                if (inventoryRecord.accountID != 3){
                    selectedStockType = 'consignor'
                    consignorIDs.add(inventoryRecord.accountID)
                    consignorValue += inventoryRecordTotalValue
                }

                //physical stock value
                else if (inventoryRecord.accountID == 3 && inventoryRecord.virtual == false){
                    selectedStockType = 'physical'
                    physicalStockValue += inventoryRecordTotalValue
                }

                //virtual stock value
                else if (inventoryRecord.accountID == 3 && inventoryRecord.virtual == true ){
                    selectedStockType = 'virtual'
                    //Don't multiply by quantity because it is a virtual inventory
                    virtualStockValue += inventoryRecordTotalValue
                }

                //over threshold value
                if (lowestListing.price > priceThreshold){
                    overThresholdStockValue += inventoryRecordTotalValue
                }

                //total value
                totalValue += inventoryRecordTotalValue
                report.push({
                    'Account ID': inventoryRecord.account.ID,
                    'Product': lowestListing.product.title,
                    'Variant': lowestListing.variant.name,
                    'Price': lowestListing.price,
                    'Cost': inventoryRecord.cost,
                    'Quantity': inventoryRecord.quantity,
                    'Total Value': inventoryRecordTotalValue,
                    'Over Threshold': lowestListing.price > priceThreshold ? 'Yes' : 'No',
                    'Stock Type': selectedStockType,
                    'Category': lowestListing.product.category.name,
                })
            }
        }
    }

    //Log the report overview
    console.log(`###### The Edit London: stock holdings ${today} #######`.padEnd(65," ") )
    console.log(`Total Inventory Records:`.padEnd(65," "),inventory.length)
    console.log(`Number Of Consignors With Uploads:`.padEnd(65," "),consignorIDs.size)
    console.log(`Number Of Consignors:`.padEnd(65," "),consignorCount)
    console.log(`Total Consignor Value:`.padEnd(65," "),consignorValue.toFixed(2) )
    console.log(`Total Virtual Stock Value:`.padEnd(65," "),virtualStockValue.toFixed(2))
    console.log(`Total Physical Stock Value:`.padEnd(65," "),physicalStockValue.toFixed(2)  )
    console.log(`Total Combined Stock Value:`.padEnd(65," "),totalValue.toFixed(2)  )
    console.log(`Total Over Threshold Stock Value:`.padEnd(65," "),overThresholdStockValue.toFixed(2)  )

    //convert the report to a csv
    let parsedCSV = new objectsToCsv(report)
    await parsedCSV.toDisk(`${resultsDir}/investor-report-${today}.csv`)
}


async function investorReportCheck() {
    let total = 0
    let priceThreshold = 100000
    const listings = await db.inventoryListing.findAll({include:[{model: db.inventory, as: 'inventory'}], where: {saleChannelID: 1}})
    listings.map(listing => {
        if (parseFloat(listing.price) < priceThreshold && listing.inventory.quantity > 0 && listing.status == 'active' ){
            total += (parseFloat(listing.price) * (listing.virtual ? 1 :listing.inventory.quantity))
        }
    })

    console.log('Estimated total value for all inventory ', total)

}

main()
