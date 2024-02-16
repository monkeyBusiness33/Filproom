const axios = require('axios')
const configs = require('../configs')
const db = require('../libs/db')
const faker = require('faker')
const moment = require('moment')
const https = require('https')
const axiosProxy = require('axios-https-proxy-fix')
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const zlib = require('zlib')
const {Op} = require('sequelize')
const service = require('../services/main')

exports.getProduct_v2 = async (stockxUrl) => {
    let resp
    try {
        resp = await axios({
            method: 'get',
            url: 'https://api.scrapfly.io/scrape',
            params: {
                key: 'ac093ae635384dcf895be0f411b478d3',
                url: `https://stockx.com/${stockxUrl}`,
                asp: Math.random() > 0.25, //~20k products every 3 days. 200000 + 800000/25 = 15%00
                //proxy_pool: 'public_residential_pool',
                country: 'gb',
                render_js: true,
                rendering_wait: 5000
            }
        })
    } catch (e) {
        if (e.response) {
            throw {status: e.response.status, data: {
                code: e.response.statusText, 
                message: e.response.data.result.error.message,
                requestHeaders: e.response.data.config.headers,
                responseBrowserData: e.response.data.result.browser_data,
                responseCookiesData: e.response.data.result.cookies,
            }}
        } else {
            throw {status: 500, data: {
                code: 'error missing respose', 
                message: e
            }}
        }
    }

    //const fs = require('fs')
    //fs.writeFileSync('dump.txt', resp.data.result.content)
    //console.log(resp.data.result.browser_data)
    //console.log("xhr_call")
    //console.log(resp.data.result.browser_data.xhr_call)
    //console.log("cookies")
    //resp.data.result.cookies.map(cookie => console.log(cookie.name, cookie.value))   

    if (!resp.data.result.success) {
        throw {status: resp.data.result.status_code, data: {
            code: resp.data.result.error.code, 
            message: resp.data.result.error.message,
            requestHeaders: resp.data.config.headers,
            responseBrowserData: resp.data.result.browser_data,
            responseCookiesData: resp.data.result.cookies,
        }}
    }

    try {
        const cheerio = require('cheerio');
        const $ = cheerio.load(resp.data.result.content);

        let queriesJSONObject;
        if ($('script[data-name="query"]').html() !== null) {
            let scriptContent = $('script[data-name="query"]').html().trim();
            //clean into string that can be JSON parsed
            scriptContent = scriptContent.substring(scriptContent.indexOf("{"))
            scriptContent = scriptContent.slice(0, scriptContent.length -1)
            queriesJSONObject = JSON.parse(scriptContent).queries
        } else if ($('script[id="__NEXT_DATA__"]').html() !== null) {
            let scriptContent = $('script[id="__NEXT_DATA__"]').html().trim();
            queriesJSONObject = JSON.parse(scriptContent).props.pageProps.req.appContext.states.query.value.queries
        } else {            
            //const fs = require('fs')
            //fs.writeFileSync('dump.txt', resp.data.result.content)
            throw {status: 422, data: {
                code: `element <script[data-name="query"]> or <script[id="__NEXT_DATA__"]> not found`,
                message: `element <script[data-name="query"]> or <script[id="__NEXT_DATA__"]> not found`
            }}
        }

        const getProductQuery = queriesJSONObject.find(query => query.queryKey[0] == "GetProduct")
        return service.stockx.validateProductObject(getProductQuery.state.data.product)
    } catch (e) {
        throw {status: 500, data: {
            code: e,
            message: e
        }}
    }
}

exports.getNewReleases_v2 = async (releaseDate, opts={pageIdx: 1}) => {
    let resp
    try {
        resp = await axios({
            method: 'get',
            url: 'https://api.scrapfly.io/scrape',
            params: {
                key: 'ac093ae635384dcf895be0f411b478d3',
                url: `https://stockx.com/api/browse?&sort=release_date&order=ASC&page=${opts.pageIdx}&releaseTime=gte-${releaseDate.valueOf()/1000}&currency=GBP&propsToRetrieve[][]=urlKey`,
                asp: true,
                proxy_pool: 'public_residential_pool',
                country: 'gb',
                render_js: true,
                rendering_wait: 5000
            }
        })
    } catch (e) {
        if (e.response) {
            throw {status: e.response.status, data: {
                code: e.response.statusText, 
                message: e.response.data.result.error.message,
                requestHeaders: e.response.data.config.headers,
                responseBrowserData: e.response.data.result.browser_data,
                responseCookiesData: e.response.data.result.cookies,
            }}
        }
        else if(!e.response.data.result){
            throw {status: 500, data: {
                    code: 'Error missing some response data result',
                    message: e
                }}
        }
        else {
            throw {status: 500, data: {
                code: 'error missing response',
                message: e
            }}
        }
    }

    if (!resp.data.result.success) {
        throw {status: resp.data.result.status_code, data: {
            code: resp.data.result.error.code, 
            message: resp.data.result.error.message,
            requestHeaders: resp.data.config.headers,
            responseBrowserData: resp.data.result.browser_data,
            responseCookiesData: resp.data.result.cookies,
        }}
    }
 
    try {
        const jsonObject = JSON.parse(resp.data.result.content)
        return jsonObject.Products
    } catch (e) {
        throw {status: 500, data: {
            code: 'impossible parsing JSON',
            message: e
        }}
    }
}

exports.validateProductObject = (stockxProductObject) => {
    /**

     *      urlKey: string
     *      productCategory: string
     *      sizeDescriptor: string
     *      variants: [{
     *          id: string
     *          hidden: boolean
     *          market: {
     *              bidAskData: {
     *                  lowestAsk: number
     *                  highestBid: number
     *              }
     *          }
     *          sizeChart: {
     *              baseSize: string
     *              baseType: string
     *              displayOptions: [{
     *                  size: string
     *                  type: string
     *              }]
     *          }
     *      }]
     */


    // TODO - validate object structure

    return stockxProductObject
}

/*
exports.getProduct = async (stockxId) => {
    const auth = await service.system.getAuthorization()
    if (!auth) {
        throw {status: 500, data: {
            code:    'no authorizations available',
            message: 'no authorizations available',
        }}
    }
    //const stockxId = auth.cookie.split(";").find(record => record.includes("stockx_device_id")).split("=")[1]
    const dbProduct = await db.product.findOne({where: {stockxId: stockxId}})
        
    let resp
    try {
        resp = await axios({
            method: 'post',
            url: 'https://api.scrapfly.io/scrape',
            params: {
                key: 'ac093ae635384dcf895be0f411b478d3',
                url: stockx['getProductEndpoint'],
                //asp: true, //~20k products every 3 days. 200000 + 800000/25 = 15%00
                //proxy_pool: 'public_residential_pool',
                'headers[cookie]':       `${auth.cookie}`,
                'headers[content-type]':                 'application/json',
                'headers[accept-encoding]':              'gzip, deflate, br',
                'headers[accept-language]':              'en-US',
                'headers[apollographql-client-name]':    'Iron',
                'headers[apollographql-client-version]': stockx['apollographql-client-version'],
                'headers[app-platform]':                 'Iron',
                'headers[app-version]':                  stockx['app-version'],
                'headers[selected-country]': 'GB',
                'headers[origin]': 'https://stockx.com',
                'headers[referer]': dbProduct ? `https://stockx.com/${dbProduct.url}` : '',
                'headers[x-operation-name]':    'GetProduct',
                'headers[x-stockx-device-id]':  uuid4(),
            },
            data: {
                operationName: "GetProduct",
                variables: {
                    countryCode: "GB", //define the market from which get the data from: GB, US, IT
                    currencyCode: "GBP", // define the currency on which get the data
                    id: stockxId,
                    marketName: null,
                },
                query: `query GetProduct($id: String!, $currencyCode: CurrencyCode, $countryCode: String!, $marketName: String) {
                        product(id: $id) {
                            id
                            brand
                            description
                            title
                            media {
                                imageUrl
                            }
                            market {
                                salesInformation {
                                    lastSale
                                }
                            }
                            urlKey
                            productCategory
                            sizeDescriptor
                            styleId
                            variants {
                                id
                                hidden
                                market(currencyCode: $currencyCode) {
                                    bidAskData(country: $countryCode, market: $marketName){
                                        lowestAsk
                                        highestBid
                                        numberOfAsks
                                        numberOfBids
                                    }
                                    salesInformation {
                                        lastSale
                                    }
                                }
                                sizeChart {
                                    baseSize
                                    baseType
                                    displayOptions {
                                        size
                                        type
                                    }
                                }
                                traits {
                                    size
                                }
                                gtins {
                                    type
                                    identifier
                                }
                            }
                        }
                    }`,
            }
        })
    } catch (e) {
        await service.system.updateAuthorization(auth.ID, 'failed')
        if (e.response) {
            throw {status: e.response.status, data: {
                code: e.response.statusText, 
                message: e.response.data.result.error.message,
                requestHeaders: e.response.data.config.headers,
                responseBrowserData: e.response.data.result.browser_data,
                responseCookiesData: e.response.data.result.cookies,
            }}
        } else {
            throw {status: 500, data: {
                code: 'error missing respose', 
                message: e
            }}
        }
    }

    // if call su scrapfly successfull but fails the parsing
    if (!resp.data.result.success) {
        await service.system.updateAuthorization(auth.ID, 'failed')
        throw {status: resp.data.result.error.http_code, data: {
            code: resp.data.result.error.code, 
            message: resp.data.result.error.message,
            requestHeaders: resp.data.config.headers,
            responseBrowserData: resp.data.result.browser_data,
            responseCookiesData: resp.data.result.cookies[0],
        }}
    }

    await service.system.updateAuthorization(auth.ID, 'success')
    const productData = JSON.parse(resp.data.result.content).data.product
    return productData
}

exports.newReleases = async (releaseDate) => {
    //const auth = await exports.getAuthorization()

    try {
        const resp = await axios({
            method: 'get',
            url: 'https://api.scrapfly.io/scrape',
            params: {
                key: 'ac093ae635384dcf895be0f411b478d3',
                url: `https://stockx.com/api/browse?sort=release_date&order=ASC&releaseTime=gte-${releaseDate.valueOf()/1000}`,
                asp: true,
                proxy_pool: 'public_residential_pool',
                //'headers[cookie]':       `${auth.cookie}`,
                'headers[content-type]':                 'application/json',
                'headers[accept-encoding]':              'gzip, deflate, br',
                'headers[accept-language]':              'en-US',
                'headers[apollographql-client-name]':    'Iron',
                'headers[apollographql-client-version]': stockx['apollographql-client-version'],
                'headers[app-platform]':                 'Iron',
                'headers[app-version]':                  stockx['app-version'],
                'headers[origin]': 'https://stockx.com',
                'headers[referer]': 'https://stockx.com/new-releases',
            }
        })

        if (!resp.data.result.success) {
            throw new Error(`${resp.data.result.error.message} - ${resp.data.result.content.slice(0, 300)}`)
        }
        //await exports.updateAuthorization(auth.ID, "success")
        return JSON.parse(resp.data.result.content).Products
    } catch (e) {
        //await exports.updateAuthorization(auth.ID, "error")
        throw e
    }
}

exports.refreshAuth = async () => {
    //Service to fetch cookies and Algolia API key, store values in database for serverless service to find

    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Safari/537.36'
    const maxRetries = 5 // number of times to retry in case of timeout
    const browser = await puppeteer.launch({
        headless: configs.environment == "prod", // run in headless only on prod - allow to debug locally
        args:[
            '--no-sandbox', 
            '--disable-dev-shm-usage',
            `--proxy-server=proxy.packetstream.io:31112`]
    });
    const page = await browser.newPage();
    await page.authenticate({
        username: configs.proxy.username,
        password: configs.proxy.password
    })

    await page.setUserAgent(userAgent)
    //Randomize viewport size
    await page.setViewport({
        width: 1920 + Math.floor(Math.random() * 100),
        height: 900,
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: false,
        isMobile: false,
    });


    const data = {}
    const cdpSession = await page.target().createCDPSession()
    await cdpSession.send('Network.enable')
    cdpSession.on('Network.requestWillBeSentExtraInfo', request => {
        if (request.headers[':method'] == "POST" && request.headers[':authority'] == "stockx.com"){
            data.cookie =  request.headers.cookie
            data.apiUrl = request.headers[':path']
            //console.log(request.headers)
            data.graphqlVersion = request.headers['apollographql-client-version']
        }
    })

    // handle page timeout due to proxy
    console.log("Waiting page loading")
    for (var i = 0; i < maxRetries; i++) {
        try {
            await page.goto('https://stockx.com/nike-dunk-low-emb-nba-75th-anniversary', {timeout: 120000})
            break
        } catch (e) {
            console.log(e)
        }
    }
    console.log("Page Loaded")
    if (process.env.ENVIRONMENT == null) {
        await page.screenshot({path: './tests/00_landingPageLoaded.png'});
    }

    console.log("Checking for Captcha")
    const test = await page.evaluate(() => document.querySelector('*').outerHTML);
    if (test.includes('Press & Hold')) {
        console.log("[ATTENTION] Captcha Found")
        return
        //TODO: handle captcha
        try {
            const captchaElement = await page.$x("//p[text()='Press & Hold']")
            await captchaElement.click('p', {delay: 30000})
        } catch (e) {
            console.log("[ATTENTION] Didn't find captcha")
        }
    }

    try {
        console.log("Selecting UK Region..")
        await sleep(2000)
        await page.select('select#region-select', 'GB')
        await sleep(2000)
    } catch (e) {
        console.log("[ATTENTION] Impossible Selecting Region")
    }

    try {
        console.log("Closing First modal (cookies or language)..")
        await page.click('button[aria-label="Close"]')
        await sleep(1000)
    } catch (e) {
        console.log("[ATTENTION] Impossible Closing the modal")
    }
    if (process.env.ENVIRONMENT == null) {
        await page.screenshot({path: './tests/01_modalClosed.png'});
    }

    try {
        console.log("Closing Second modal (cookies or language)..")
        await page.click('button[aria-label="Close"]')
        await sleep(1000)
    } catch (e) {
        console.log("[ATTENTION] Impossible Closing the modal")
    }
    if (process.env.ENVIRONMENT == null) {
        await page.screenshot({path: './tests/02_modalClosed.png'});
    }

    try {
        await sleep(2000)
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
        });
        await sleep(2000) // wait scroll to complete
        if (process.env.ENVIRONMENT == null) {
            await page.screenshot({path: './tests/03_pageScrolled.png'});
        }

        console.log("Clicking on product..")
        await page.click('div[data-index="1"].slick-slide')
        await sleep(5000)
    } catch (e) {
        console.log("[ATTENTION] Impossible Selecting Product to fetch cookies")
        console.log(e)
        return
    }

    if (process.env.ENVIRONMENT == null) {
        await page.screenshot({path: './tests/04_productSelected.png'});
    }

    console.log("Closing Browser..")
    await browser.close()

    if (!data.cookie || !data.graphqlVersion) {
        const message = `[ATTENTION] Missing: ${!data.cookie ? 'cookie' : ''} ${!data.graphqlVersion ? 'graphqlVersion' : ''}`
        throw new Error(message)
    }
    console.log("Updating Config..")

    return db.configurations.create({
        cookie: data.cookie, 
        apiUrl: data.apiUrl,
        userAgent: userAgent, 
        graphqlVersion: data.graphqlVersion
    })

}
*/
