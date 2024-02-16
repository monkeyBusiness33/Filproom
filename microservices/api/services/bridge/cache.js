const db = require('../../libs/db.js')
const logger=require('../../libs/logger.js')
const service = require('../main.js')
const utils = require('../../libs/utils.js')
const Op = require('sequelize').Op
const moment = require('moment')
const configs = require('../../configs.js')

const Redis = require('ioredis');
let client = configs.environment != "local" ? new Redis(configs.apis.redis.instanceUrl) : null
const localCache = {}

exports.set = async (keyString, value) => {
        if (configs.environment == "local") {
                localCache[keyString] = value
                return
        } 
        const response = await client.set(keyString, value);
        if (response != "OK") logger.warn("Cache set failed")
}

exports.get = async (keyString) => {
        if (configs.environment == "local") {
                return localCache[keyString]
        } 
        const response = await client.get(keyString);
        return response
}

exports.delete = async (keyString) => {
        if (configs.environment == "local") {
                delete localCache[keyString]
                return 
        } 
        const response = await client.del(keyString);
        if (response != 1) logger.warn("Cache delete failed")
}