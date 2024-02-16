const winston = require('winston')
const httpContext = require('express-http-context');

// Imports the Google Cloud client library for Winston
const {LoggingWinston} = require('@google-cloud/logging-winston');

// Ignore log messages if they have { private: true }
const addSessionId = winston.format((info, opts) => {
  info.sessionid = httpContext.get('sessionId');
  return info;
});

const transports = [ ]

// add console logger if not on the cloud
if (!process.argv.includes('cloud')){
  transports.push(new winston.transports.Console({
    format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({ format: 'YYYY/MM/DD HH:mm:ss' }),
        winston.format.printf(info => {
          return `[${info.timestamp}] ${info.level} ${info.message} ${info.data ? '\n' + JSON.stringify(info.data, null, 4) : (info.stack || '')}`
        })
    ),
  }))
}

// Add Google Stackdriver Logging if staging or production
if (process.argv.includes('staging') || process.argv.includes('production')) {
  transports.push( new LoggingWinston())
}


const logger = winston.createLogger({
    format: winston.format.combine(
      addSessionId()
    ),
    level: (!process.argv.includes('staging') && !process.argv.includes('production')) ? 'silly' : 'info',
    transports: transports,
  });

module.exports = logger

