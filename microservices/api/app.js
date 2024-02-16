let envFileName = ""
if (process.argv.includes("production")) {
    envFileName = "production"
} else if (process.argv.includes("staging")) {
    envFileName = "staging"
}
require('dotenv').config({ path: `./${envFileName}.env` })
const configs = require('./configs')
//don't set unx_socket connection if not in the cloud
if (process.argv.includes("cloud")) {
    configs.onCloud = true
}
const { v4: uuidv4 } = require('uuid');
const logger = require('./libs/logger')
const express = require('express')
const bodyParser = require('body-parser');
const cors = require('cors')
const jwt = require('jsonwebtoken');
const compression = require('compression');
const fs = require('fs')
const httpContext = require('express-http-context');

const Rollbar = require('rollbar');
const rollbar = new Rollbar({
    accessToken: '8a60b5a7065d45a49738a0e4e2b10dfc',
    environment: 'api-'+configs.environment,
});

const utils = require('./libs/utils.js') // this has to go after the use of staging environment. Otherwise start:staging is not working
const service = require('./services/main')

const { getPublicMarketplaceListing } = require('./api-routes/public');


const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const apidModels = require('./docs/models')
const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.1',
        components: {
            schemas: apidModels.schemas,
            parameters: apidModels.parameters,
            responses: apidModels.responses
        },
        info: {
            title: 'Wiredhub API',
            description: 'Wiredhub API documentation',
            servers: ['http://localhost:9000']
        }
    },
    // Where to look for endpoints
    apis: ["api-routes/*.js"]
}
const swaggerDocs = swaggerJsDoc(swaggerOptions)

const app = express()
app.use(bodyParser.json({limit: "50mb"}));
app.use(bodyParser.urlencoded({limit: "50mb", extended: true, parameterLimit:50000}));
app.use(compression());
app.use(cors())
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs))

// Use any third party middleware that does not need access to the context here, e.g. 
// app.use(some3rdParty.middleware);
app.use(httpContext.middleware);
// all code from here on has access to the same context for each request

/**
 * Logger Middleware
 */
app.use(async (req, res, next) => {
    const startHrTime = process.hrtime();
    // check if requests coming from frontend (it has already a sessionid). If sessionid is undefined: assign one on the fly
    httpContext.set('sessionId', req.headers.sessionid ? req.headers.sessionid : uuidv4())

    req.locals = {} // allow to pass data between middlewares
    const oldWrite = res.write
    const oldEnd = res.end
    const chunks = []

    res.on("data", (...restArgs) => {
        console.log("called")
        chunks.push(Buffer.from(restArgs[0]));
        oldWrite.apply(res, restArgs);
    });

    res.on("finish", () => {
        const elapsedHrTime = process.hrtime(startHrTime);
        const elapsedTimeInMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6;
        const data = {
            requestHeaders: req.headers,
            requestPayload: req.method == "GET" ? req.query : req.body,
            requestUser: req.headers.token_decoded,
            responseTime: {
                value: elapsedTimeInMs,
                unit: 'milliseconds'
            },
            //responsePayload: req.locals.body,
            responseCode: res.statusCode,
            responseMessage: res.statusMessage,
        };

        if (res.statusCode == 500) {
            logger.error(`${req.method} ${res.statusCode} ${req.baseUrl + req.url}`, {telemetry: data})
        } else {
            logger.info(`${req.method} ${res.statusCode} ${req.baseUrl + req.url}`, {telemetry: data})
        }
    });

    next() //pass request to next middleware
    return
})

// This one should stay before the jwt token in order for other apps to be able to access it and return the html template
app.get('/marketplace/listing/:ID', getPublicMarketplaceListing);

/**
 * Auth Middleware
 */
app.use(async (req, res, next) => {
    //If URL has /api/user/auth doesn't need authentication
    if (req.url.includes("/auth/") || 
        req.url.includes("/api/webhooks/") || 
        req.url.includes("/api/bridge/ingress/stock-x/") || 
        req.url.includes("/api/bridge/egress/shopify/variant/sync") || 
        req.url.includes("/sanity-check") || 
        req.url.includes("/status") || 
        req.url.includes("/api/workflows/runScheduler") ||
        req.url.includes("/api/workflows/dataCheck") ||
        req.url.includes("/api/workflows/cloneProductionIntoStaging") ||
        req.url.includes("/api/analytics/kpis")
        ) {
        next()
        return
    }
    
    // Get JWT Token in HTTP request header and Verify token
    let jwtString = req.headers['authorization'] ? req.headers['authorization'].split(" ")[1] : ''
    let tokenDecoded;
    try {
        tokenDecoded = await jwt.verify(jwtString, configs.jwt.secret)
    } catch (err) {
        res.status(401).send({"error": `${err.message} - ${req.headers['authorization']}`});
        return
    }

    req.headers.token_decoded = tokenDecoded
    let _user;
    try {
        _user = await service.user.getSetSession(tokenDecoded.user.ID)

        //if some token has been compromised and you want everyone to relogin. update this timestamp
        //be careful. Always set this date to the past. Otherwise you will lock out all users
        if (tokenDecoded.iat * 1000 < new Date("2023-01-25").getTime()) {
            throw {status: 401, message: 'Token expired. Sign-in again'}
        }
    
        // user disabled - loggin out
        if (_user.activatedAt == null) {
            throw {status: 401, message: 'Your account has been deactivated'}
        }
    
        // if valid jwt but user doesn't have it (meaning user refreshed the token and so the token used in the request is not valid anymore)
        //don't apply to guest user since guest user apiKey is not set and keeps changing
        if (!_user.roles.find(role => role.name == "guest") && _user.apiKey != jwtString) {
            throw {status: 401, message: 'Token deactivated. Sign-in again'}
        }
    } catch (e) {
        return next(e)
    }

    req.user = {
        ...JSON.parse(JSON.stringify(_user)),
        can: (resourceDotAction, resourceObjects) => {
            /**
             * how do we pass resource name: inventory,order etc...
             * 1. instead of action 'view', we pass 'inventory.view'
             *      -what scenario does this break?
             * 2. some metadata from the resourceObject ?
             *      - is it available on sequelize?
             * 3. ACL 
             *      - every time a new resource is created we need to add a record ?
             *      - we need a table for each resource? how can you do it on one single table?
             * */

            if (!resourceObjects) throw {status: 500, message: `missing data`}

            //prepare data
            const [resource, action] = resourceDotAction.split(".")
            resourceObjects = Array.isArray(resourceObjects) ? resourceObjects : [resourceObjects]
            //filter out public products
            resourceObjects = resourceObjects.filter(resourceObject => resourceObject.public != true)

            const isGuestUser = !!req.user.roles.find(r => r.type == "guest")

            resourceObjects.map(resourceObject => {
                const accountRole = req.user.roles.find(r => r.accountID == resourceObject.accountID)
                if (configs.environment == "local") console.log(`action: ${resourceDotAction} - resource.accountID ${resourceObject.accountID} | user.accountID: ${req.user.accountID} (userID: ${req.user.ID}) roleID: ${accountRole?.ID} resourceID: ${resourceObject.ID}`)
                if (!accountRole) throw {status: 403, message: `You don't have the role to access this account resources`}

                let permission = accountRole.permissions.find(p => p.resource.name == `${resource}.${action}`)

                if (isGuestUser) permission = tokenDecoded.user.permissions.find(p => p.name == `${resource}.${action}`)
                if (!permission) throw {status: 403, message: `You don't have the permission to ${action} ${resource} of this account`}

                if (permission.rule == "*") return

                //handle scenariosn where permission.rule is != than * . es inventory.view:accountID:1. TODO: change code into something more smart down the road
                const conditions = permission.rule.split("OR")
                const checks = []
                const mapper = {
                    "own": req.user.accountID,
                }
                for (const condition of conditions) {
                    let clonedObj = JSON.parse(JSON.stringify(resourceObject))
                    let [attribute, value] = condition.split(":")
                    value = value.trim() // need to trim value otherwise doesn't match the mapper
                    const attributesList = attribute.split(".")
                    for (let idx = 0; idx < attributesList.length; idx++) {
                        const _attribute = attributesList[idx].trim() // need to trim attribute otherwise doesn't match the object attributes
                        if ((attributesList.length - 1) == idx) {
                            const objValue = clonedObj[_attribute]
                            value = (value in mapper) ? mapper[value] : value
                            checks.push(objValue == value)
                        } else {
                            clonedObj = clonedObj[_attribute]
                        }
                    }
                }

                const countTrueStatements = checks.filter(c => c == true).length
                //if there is a or condition and 0 checks passed - 401. If there is no or condition and so treat as AND, and not all checks passed - 401
                //ATTENTION: currently rule doesn't support AND and OR in the same statement 
                if ((permission.rule.includes("OR") && countTrueStatements == 0) && (countTrueStatements != checks.length) ) {
                    throw {status: 403, message: `You don't have the rule to ${action} ${resource} of this account`}
                }
            })
        }
    }
   
    return  next() //pass request to next middleware
})

// Rate -limiter middleware
app.use('/auth', utils.rateLimiterAuth)
app.use('/api', utils.rateLimiterAPI);

try {
    // Once JWT Check & Valid. Re-direct HTTP request to right endpoint
    app.use('/api/account',                   require('./api-routes/account'))
    app.use('/api/analytics',                 require('./api-routes/analytics'))
    app.use('/auth',                          require('./api-routes/auth'))
    app.use('/api/address',                 require('./api-routes/address'))
    app.use('/api/fulfillment',               require('./api-routes/fulfillment'))
    app.use('/api/sale-channels',             require('./api-routes/saleChannel'))
    app.use('/api/inventory-listings',        require('./api-routes/inventoryListing'))
    app.use('/api/inventory',                 require('./api-routes/inventory'))
    app.use('/api/item',                      require('./api-routes/item'))
    app.use('/api/order',                     require('./api-routes/order'))
    app.use('/api/transactions',              require('./api-routes/transaction'))
    app.use('/api/order-line-item',           require('./api-routes/order-line-item'))
    app.use('/api/job',                       require('./api-routes/job'))
    app.use('/api/job-line-item',             require('./api-routes/job-line-item'))
    app.use('/api/product-categories',        require('./api-routes/product-categories'))
    app.use('/api/product',                   require('./api-routes/product'))
    app.use('/api/user',                      require('./api-routes/user'))
    app.use('/api/warehouse',                 require('./api-routes/warehouse'))
    app.use('/api/webhooks',                  require('./api-routes/webhooks'))
    app.use('/api/workflows',                 require('./api-routes/workflows'))
    app.use('/api/bridge',                    require('./api-routes/bridge'))
    app.use('/api/events',                    require('./api-routes/events'))
} catch (e) {
    console.log(e)
}

// CHECK ROUTE
app.get('/sanity-check', async (req, res) => {
    res.status(200).json("ok")
})

app.get('/mobile-consignor-latest-version', async (req, res) => {
    res.status(200).json("1.5.7")
})

app.get('/status', async (req, res) => {
    res.status(200).json(JSON.parse(fs.readFileSync('./assets/system.json')))
})


/**
 * RESPONSE MIDDLWARE
 */
 app.use(async (req, res, next) => {
    if (req.route) {
        res.status(200).json(req.locals.body)
    } else {
        res.status(404).send("No Matching Route Found!")
    }
});

/**
 * ERROR MIDDLWARE
 */
app.use((err, req, res, next) => {
    err.status = err.status || 500
    if (err.status >= 500) {
        // this is to make sure data sent to rollbar is in one of the expected formats
        if (!(err instanceof Error) || (typeof(err) != 'string')) {
            rollbar.error(new Error(err.message || 'Unknown error'), req);
        } else {
            rollbar.error(err, req);
        }
        logger.error(err.message, {stack: err.stack, sql: err.sql, original: err.original, fullError: err, errors: err.errors})
    } else {
        //rollbar.warn(err, req);
        logger.warn(err.message, {stack: err.stack, sql: err.sql, original: err.original, fullError: err, errors: err.errors})
    }
    //return error with statusCode 500 as default or allow to override across the application with when returning next(e)
    // by setting e.status = errorCode
    res.status(err.status).json({error: err.message})
});


app.listen(configs.port, () => {
    console.log('Service server started. Listening on port ' + configs.port)
})

module.exports = app; // for testing
