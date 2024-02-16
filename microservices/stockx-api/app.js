const express = require('express')
const bodyParser = require('body-parser');
const cors = require('cors')
const configs = require('./configs')
const logger = require('./libs/logger')
const compression = require('compression');
const Rollbar = require('rollbar');

if (process.argv.includes('staging')){
    logger.info('USING STAGING SERVER')
    configs.environment = 'staging'
    configs.sql.host =  '35.189.112.2'
    configs.sql.password = 'root'
}
const rollbar = new Rollbar({
    accessToken: '8a60b5a7065d45a49738a0e4e2b10dfc',
    environment: 'stockx-api-'+configs.environment,
});


const app = express()

app.use(bodyParser.json({limit: "50mb"}));
app.use(bodyParser.urlencoded({limit: "50mb", extended: true, parameterLimit:50000}));
app.use(compression());
app.use(cors())

// Once JWT Check & Valid. Re-direct HTTP request to right endpoint
app.use('/api/stockx', require('./api-routes/stockx'))
app.use('/api/products', require('./api-routes/products'))
app.use('/api/worker', require('./api-routes/worker'))

/**
 * ERROR MIDDLWARE
 */
app.use((err, req, res, next) => {
    // skip rollbar notifications for errors: fobidden and too many requests.
    rollbar.error(`${err.data?.code ?? 'Unknown Code'} - ${err.data?.message ?? 'Unknown Message'}`, {err, req});
    logger.error(err.message)
    logger.error(err.stack)
    res.status(err.status ? err.status : 500).send(err.data ? err.data.message : "Server Error")
});

app.listen(configs.port, () => logger.info('Service server started. Listening on port ' + configs.port))

module.exports = app; // for testing
