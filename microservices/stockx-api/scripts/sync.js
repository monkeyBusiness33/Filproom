const configs = require('../configs.js')
const axios = require('axios')
const path = require('path')
const puppeteer = require('puppeteer-extra')
const faker = require('faker')
const axiosProxy = require('axios-https-proxy-fix')
const moment = require('moment')
const https = require('https')
const fs = require('fs')
const objectsToCsv = require('objects-to-csv')
let csvToJson = require('convert-csv-to-json');
const url = require('url');
const resultsDir = './scripts/reports'

let apiUrl;
if (process.argv.includes("production")) {
    configs.sql.host = "34.105.152.183"
    configs.sql.database = "stockx-api"
    configs.sql.username = "root"
    configs.sql.password = "root"
    apiUrl = "https://production-stockx-api-6dwjvpqvqa-nw.a.run.app"
} else if (process.argv.includes("staging")) {
    configs.sql.host = "35.189.112.2"
    configs.sql.database = "stockx-api"
    configs.sql.username = "root"
    configs.sql.password = "root"
} else {
    console.log("Syncing Local DB")
    //throw new Error("Please select staging or production")
    apiUrl = "http://localhost:11000"
}


const { Op } = require("sequelize");
const db = require('../libs/db')
const service = require('../services/main')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function run() {
    //await db.sequelize.sync({alter: true})

    //add products missing processAt
    const productsMissingProcessAt = await db.product.findAll({where: {processAt: null}})
    console.log(`Products Missing ProcessAt ${productsMissingProcessAt.length}`)
    await db.product.update({processAt: moment(), queuedAt: null}, {where: {ID: productsMissingProcessAt.map(p => p.ID)}})

    try {
        const product = await service.stockx.getProduct_v2('air-jordan-4-retro-military-black')
        console.log(product.market)
    } catch (e) {
        console.log(e)
    }

    return
    console.log('Add new columns - if any')
    const columnsToAdd = [
        {table: 'product', name: 'processAt', type: db.Sequelize.DATE, allowNull: true},
        {table: 'product', name: 'volatilityScoreChangePercentage', type: db.Sequelize.FLOAT(10,2), allowNull: true},
        {table: 'product', name: 'lastSalePrice', type: db.Sequelize.FLOAT(10,2), allowNull: true},
        {table: 'product', name: 'salesLast72HoursChangePercentage', type: db.Sequelize.FLOAT(10,2), allowNull: true},
        {table: 'productHistory', name: 'updatedBucketNumber', type: db.Sequelize.INTEGER, allowNull: true},
        {table: 'productHistory', name: 'volatilityScoreChangePercentage', type: db.Sequelize.FLOAT(10,2), allowNull: true},
        {table: 'productHistory', name: 'lastSalePrice', type: db.Sequelize.FLOAT(10,2), allowNull: true},
        {table: 'productHistory', name: 'salesLast72HoursChangePercentage', type: db.Sequelize.FLOAT(10,2), allowNull: true},
        {table: 'productHistory', name: 'updatedBucketNumber', type: db.Sequelize.INTEGER, allowNull: true},
    ]
    for (column of columnsToAdd) {
        try {
            await db.sequelize.queryInterface.addColumn(column.table, column.name, {type: column.type, allowNull: column.allowNull})
        } catch (e) {
            console.log(`>> Impossible to add column ${column.name}`)
        }
    }

}

async function runTask() {
    const resp = await axios.post(`${apiUrl}/api/worker/queue/tasks`, {
        process: true,
        stockxId: 'air-jordan-1-retro-low-og-unc-to-chicago-womens',
        type: 'update'
    }) 
}

async function publishCreateEvent(stockxId) {
    configs.environment =  'prod'
    await service.worker.publish('product/create', {stockxId: stockxId})
}

async function productSearch() {
    const alternateProducts = await service.products.getAll(0,999, null, {url: 'jordan-x-a-ma-maniere-cargo-pants-black'})
    let prodID = alternateProducts.rows[0].ID


    return db.product.findOne(query)

}

async function importMissingProducts() {
    configs.environment =  'prod'
    const productsUrls = [
        'https://stockx.com/wellipets-frog-loafers-by-jw-anderson-yellow',
        //'https://stockx.com/new-balance-2002r-protection-pack-light-arctic-grey-purple',
        //'https://stockx.com/adidas-samba-vegan-white-gum',
        //'https://stockx.com/nike-dunk-low-bone-beige-w',
        //'https://stockx.com/nike-dunk-low-gorge-green',
        //'https://stockx.com/nike-air-force-1-low-07-magma-orange-w',
        //'https://stockx.com/nike-dunk-low-next-nature-home-simpson-gs',
        //'https://stockx.com/nike-dunk-low-disrupt-2-panda-w',
        //'https://stockx.com/air-jordan-1-mid-se-orange-suede-gs',
        //'https://stockx.com/nike-dunk-low-se-85-neptune-green',
        //'https://stockx.com/nike-dunk-low-industrial-blue-sashiko',
        //'https://stockx.com/air-jordan-1-elevate-low-se-lucky-green-w',
        //'https://stockx.com/nike-air-force-1-low-lv8-white-light-madder-root-gs',
        //'https://stockx.com/new-balance-550-white-summer-fog',
        //'https://stockx.com/new-balance-550-white-blue-groove',
        //'https://stockx.com/new-balance-550-white-pink-cream-w',
        //'https://stockx.com/nike-dunk-low-retro-miami-hurricanes',
        //'https://stockx.com/nike-dunk-low-reverse-panda'
    ]
    
    for (var productUrl of productsUrls) {
        console.log(productUrl)
        // const resp = await axios.post(`${apiUrl}/api/stockx/search`, {
        //     url: productUrl
        // })
        const resp = await service.stockx.search({
                url: productUrl
            })
        //console.log(resp)

        console.log(`>> stockx Id ${resp[0].stockxId}`)
        // try {
        //     await axios.post(`${apiUrl}/api/worker/products/${productObject.id}/import`, {})
        // } catch (e) {
        //     console.log(e.response)
        // }
        console.log(`>> imported`)
    }


}

run()
