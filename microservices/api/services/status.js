const db = require('../libs/db')
const utils = require('../libs/utils')
const configs = require('../configs')
const service = require('./main')
const Op = require('sequelize').Op;
const logger=require('../libs/logger.js')
const axios = require('axios')

exports.getID = async (statusName) => {
    const status = await db.status.findOne({where: {name: statusName.trim().toLowerCase()}})
    return status.ID
}
