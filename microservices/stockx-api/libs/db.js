const Sequelize = require('sequelize')
const configs = require('../configs')

const dbModelsPath = "../db-models/"
const compositeModel = "composite/"

const sequelize = new Sequelize(configs.sql.database, configs.sql.username, configs.sql.password, {
    host: configs.sql.host,
    dialect: 'mysql',
    define: {
        freezeTableName: true
    },
    logging: false,
    dialectOptions: { 
        socketPath: configs.sql.connection_name,
      }
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

/* STANDARD MODELS */

db.product = require(dbModelsPath + "Product.js")(sequelize, Sequelize);
db.productHistory = require(dbModelsPath + "ProductHistory.js")(sequelize, Sequelize);
db.productVariant = require(dbModelsPath + "ProductVariant.js")(sequelize, Sequelize);
db.productVariantHistory = require(dbModelsPath + "ProductVariantHistory.js")(sequelize, Sequelize);
db.tasksQueue = require(dbModelsPath + "TasksQueue.js")(sequelize, Sequelize);
db.configurations = require(dbModelsPath + "Configurations.js")(sequelize, Sequelize);

/* RELATIONS */
db.product.hasMany(db.productVariant, {as: 'variants',     sourceKey: 'ID', targetKey: 'productID'})
db.product.hasMany(db.productHistory, {as: 'history',     sourceKey: 'ID', targetKey: 'productID'})
db.productVariant.belongsTo(db.product, {as: 'product',     sourceKey: 'productID', targetKey: 'ID'})


module.exports = db

