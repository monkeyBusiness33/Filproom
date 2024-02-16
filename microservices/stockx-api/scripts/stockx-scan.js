const fs = require('fs')
const axios = require('axios')
configs = require('../configs')


if (process.argv.includes("staging")) {
    configs.sql.host = "35.189.112.2"
    configs.sql.database = "stockx-api"
    configs.sql.username = "root"
    configs.sql.password = "root"
}
const db = require('../libs/db')



async function search(productTitle) {
    try {
        const resp = await axios.post('https://staging-stockx-api-6dwjvpqvqa-nw.a.run.app/api/stockx/search', {query: productTitle})
        console.log(resp.data.hits.length)
        // import to queue
        await Promise.all(resp.data.hits.map(hit => db.queuedImports.findOrCreate({defaults: {stockxId: hit.id}, where: {stockxId: hit.id}})))
        return true
    } catch (e) {
        console.log(e)
        return false
    }
}


async function run() {
    const scannedShopifyProducts = JSON.parse(fs.readFileSync('./scannedShopifyProducts.json', 'utf-8'))
    let stockProducts = shopifyProducts.map(product => product.title)
    stockProducts = stockProducts.filter(productName => !scannedShopifyProducts.includes(productName))
    console.log(`Products ${shopifyProducts.length} - Scanned ${scannedShopifyProducts.length} - Left ${stockProducts.length}`)
    
    let idx = scannedShopifyProducts.length
    for (var productTitle of stockProducts) {
        console.log(`Product ${idx}/${shopifyProducts.length}`)
        const scanned = search(productTitle)
        if (scanned) {
            scannedShopifyProducts.push(productTitle)
            fs.writeFileSync('./scannedShopifyProducts.json', JSON.stringify(scannedShopifyProducts, null, 4))
        }
        // add some delay here
        await new Promise(resolve => setTimeout(resolve, 2000));
        idx += 1
    }
}

getShopifyProducts = async (shopifyAPIUrl) => {
    let shopifyProducts = []
    let resp = await axios.get(shopifyAPIUrl + "products.json?limit=250")
    shopifyProducts = shopifyProducts.concat(resp.data.products)

    let match = resp.headers.link.match(/<[^;]+\/(\w+\.json[^;]+)>;\srel="next"/);
    let nextLink = match ? match[1] : false;

    let idx = shopifyProducts.length
    console.log(`Products Fetched (${idx})`)
    while (nextLink) {
        let resp = await axios.get(shopifyAPIUrl + nextLink)
        shopifyProducts = shopifyProducts.concat(resp.data.products)
        match = resp.headers.link.match(/<[^;]+\/(\w+\.json[^;]+)>;\srel="next"/);
        nextLink = match ? match[1] : false;
        idx += resp.data.products.length
        console.log(`Products Fetched (${idx})`)
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return shopifyProducts
}

run()
