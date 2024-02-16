const configs = require('../configs')
const db = require('../libs/db')
const {Op} = require('sequelize')
const axios = require('axios')

exports.publish = async (eventName, dbProduct) => {
    if (eventName == 'product/update' && configs.environment == "prod") {
        await axios.post('https://production-api-6dwjvpqvqa-nw.a.run.app/api/webhooks/stockx/product/updated', dbProduct)
        console.log('Stock X Product Update Task Published')
    }

    if (eventName == 'product/create' && configs.environment == "prod") {
        await axios.post('https://production-api-6dwjvpqvqa-nw.a.run.app/api/webhooks/stockx/product/created', dbProduct)
        console.log('Stock X Product Create Task Published')
    }
}