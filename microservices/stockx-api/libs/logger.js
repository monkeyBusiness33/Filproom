const winston = require('winston')

const logger = winston.createLogger({
    level: 'info',
    transports: [ //where to display the logs
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'combined.log' })
    ]
})

module.exports = logger
