const db = require('../libs/db')
const utils = require('../libs/utils')
const configs = require('../configs')
const service = require('./main')
const Op = require('sequelize').Op;
const logger=require('../libs/logger.js')
const axios = require('axios')

/**
 * UTILS
 */

exports.getID = async (typeName) => {
    const type = await db.type.findOne({where: {name: typeName.trim().toLowerCase()}})
    return type.ID
}
