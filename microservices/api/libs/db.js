const cls = require('cls-hooked')
const namespace = cls.createNamespace('my-namespace')
const {Sequelize, Transaction} = require('sequelize')
Sequelize.useCLS(namespace)
const configs = require('../configs')
const useBcrypt = require('sequelize-bcrypt');

const dbModelsPath = '../db-models/'
const compositeModel = 'composite/'

const sequelize = new Sequelize(
  configs.sql.database,
  configs.sql.username,
  configs.sql.password,
  {
    host: configs.sql.host,
    dialect: 'mysql',
    dialectOptions: {
      connectTimeout: 600000,
      acquireTimeout: 600000
    },
    pool: {
      max: 50, //mysql suports 150 connections. This needs to be split across all the instances. So pool.max * num_instances < 150 https://dev.mysql.com/doc/refman/8.0/en/connection-interfaces.html
      min: 0,
      acquire: 10000,
      idle: 10000
    },
    define: {
      freezeTableName: true
    },
    logging: false,
    dialectOptions: {
      socketPath: configs.onCloud ? configs.sql.connection_name : null,
      connectTimeout: 1200000
    },
    // The retry config if Deadlock Happened
    retry: {
        match: [/Deadlock/i, /rollback/i],
        max: 3, // Maximum rety 3 times
        backoffBase: 100, // Initial backoff duration in ms. Default: 100,
        backoffExponent: 1.5, // Exponent to increase backoff each try. Default: 1.1
    },
    //isolationLevel: Transaction.ISOLATION_LEVELS.READ_UNCOMMITTED
  }
)

const db = {}

db.Sequelize = Sequelize
db.sequelize = sequelize

/* STANDARD MODELS */
db.account = require(dbModelsPath + 'Account.js')(sequelize, Sequelize)
db.analytics = require(dbModelsPath + 'Analytics.js')(sequelize, Sequelize)
db.address = require(dbModelsPath + 'Address.js')(sequelize, Sequelize)
db.fulfillment = require(dbModelsPath + 'Fulfillment.js')(sequelize, Sequelize)
db.inventory = require(dbModelsPath + 'Inventory.js')(sequelize, Sequelize)
db.inventoryListing = require(dbModelsPath + 'InventoryListing.js')(sequelize, Sequelize)
db.saleChannel = require(dbModelsPath + 'SaleChannel.js')(sequelize, Sequelize)
db.item = require(dbModelsPath + 'Item.js')(sequelize, Sequelize)
db.notification = require(dbModelsPath + 'Notification.js')(sequelize, Sequelize)
db.job = require(dbModelsPath + "Job.js")(sequelize, Sequelize);
db.jobLineItem = require(dbModelsPath + "JobLineItem.js")(sequelize, Sequelize);
db.order = require(dbModelsPath + 'Order.js')(sequelize, Sequelize)
db.orderLineItem = require(dbModelsPath + 'OrderLineItem.js')(sequelize, Sequelize)
db.orderType = require(dbModelsPath + 'OrderType.js')(sequelize, Sequelize)
db.permission = require(dbModelsPath + 'Permission.js')(sequelize, Sequelize)
db.product = require(dbModelsPath + 'Product.js')(sequelize, Sequelize)
db.productCategory = require(dbModelsPath + 'ProductCategory.js')(sequelize, Sequelize)
db.productImage = require(dbModelsPath + 'ProductImage.js')(sequelize, Sequelize)
db.productVariant = require(dbModelsPath + 'ProductVariant.js')(sequelize, Sequelize)
db.productMatchLookup = require(dbModelsPath + 'ProductMatchLookup.js')(sequelize, Sequelize)
db.resource = require(dbModelsPath + 'Resource.js')(sequelize, Sequelize)
db.role = require(dbModelsPath + 'Role.js')(sequelize, Sequelize)
db.status = require(dbModelsPath + 'Status.js')(sequelize, Sequelize)
db.type = require(dbModelsPath + "Type.js")(sequelize, Sequelize);
db.transaction = require(dbModelsPath + 'Transaction.js')(sequelize, Sequelize)
db.transactionRate = require(dbModelsPath + 'TransactionRate.js')(sequelize, Sequelize)
db.user = require(dbModelsPath + 'User.js')(sequelize, Sequelize)
db.warehouse = require(dbModelsPath + 'Warehouse.js')(sequelize, Sequelize)
db.webhookSubscription = require(dbModelsPath + 'WebhookSubscription.js')(sequelize, Sequelize)
db.marketplaceListing = require(dbModelsPath + 'MarketplaceListing.js')(sequelize, Sequelize)
db.marketplaceOffer = require(dbModelsPath + 'MarketplaceOffer.js')(sequelize, Sequelize)
db.courier = require(dbModelsPath + 'Courier.js')(sequelize, Sequelize)
db.consignment = require(dbModelsPath + 'Consignment.js')(sequelize, Sequelize)
db.reportsMetadata = require(dbModelsPath + 'ReportsMetadata.js')(sequelize, Sequelize)
db.event = require(dbModelsPath + 'Event.js')(sequelize, Sequelize)

/* COMPOSITE MODELS */
db.account_user = require(dbModelsPath + compositeModel + 'account_user.js')(sequelize, Sequelize)
db.account_warehouse = require(dbModelsPath + compositeModel + 'account_warehouse.js')(sequelize, Sequelize)
db.account_saleChannel = require(dbModelsPath + compositeModel + 'account_saleChannel.js')(sequelize, Sequelize)
db.user_role = require(dbModelsPath + compositeModel + 'user_role.js')(sequelize, Sequelize)


useBcrypt(db.user, {
  field: 'password', // secret field to hash, default: 'password'
  rounds: 12, // used to generate bcrypt salt, default: 12
  compare: 'authenticate', // method used to compare secrets, default: 'authenticate'
});

/* RELATIONS */
/**
 * LEGEND
 * belongsToMany - puts fks (both source and target) on the through model.
 *      sourceKey  - defines the column to link ON the source model
 *      foreignKey - defines the column of the SOURCE MODEL ON the JOIN TABLE
 *      otherKey   - defines the column of the TARGET MODEL ON the JOIN TABLE
 *      targetKey  - defines the column to link ON the target model
 *
 * belongsTo - puts fks on the source model
 *      sourceKey  - defines the column to link ON the source model
 *      targetKey  - defines the column to link ON the target model
 *
 *
 * hasMany - puts fks on the target model
 *
 *
 * hasOne - puts fks on the target model
 */

db.item.belongsTo(db.order,               {as: 'order',          sourceKey: 'orderID',           targetKey: 'ID', foreignKey: 'orderID'})
db.item.hasMany(db.orderLineItem,         {as: 'orderLineItems', sourceKey: 'ID',                targetKey: 'itemID'})
db.item.hasMany(db.jobLineItem,         {as: 'jobLineItems', sourceKey: 'ID',                targetKey: 'itemID'})
db.item.belongsTo(db.status,              {as: 'status',         sourceKey: 'statusID',          targetKey: 'ID'})
db.item.belongsTo(db.product,             {as: 'product',  sourceKey: 'productID',         targetKey: 'ID'})
db.item.belongsTo(db.inventory,           {as: 'inventory',  sourceKey: 'inventoryID',         targetKey: 'ID'})
db.item.belongsTo(db.account,             {as: 'account',  sourceKey: 'accountID',         targetKey: 'ID'})
db.item.belongsTo(db.productVariant,      {as: 'variant',   sourceKey: 'productVariantID',    targetKey: 'ID', foreignKey: 'productVariantID'})
db.item.belongsTo(db.warehouse,           {as: 'warehouse', sourceKey: 'warehouseID',         targetKey: 'ID'})
db.item.belongsToMany(db.order,           {as: 'orders',     through: {model: 'orderLineItem', unique: false}, sourceKey: 'ID', foreignKey: 'itemID', otherKey: 'orderID', targetKey: 'ID'})
db.item.belongsToMany(db.job,             {as: 'jobs',     through: {model: 'jobLineItem', unique: false}, sourceKey: 'ID', foreignKey: 'itemID', otherKey: 'jobID', targetKey: 'ID'})

db.inventory.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})
db.inventory.belongsTo(db.product, {as: 'product', sourceKey: 'productID', targetKey: 'ID'})
db.inventory.belongsTo(db.productVariant, {as: 'variant', sourceKey: 'productVariantID', targetKey: 'ID', foreignKey: 'productVariantID'})
db.inventory.hasMany(db.item, {as: 'items', sourceKey: 'ID', targetKey: 'inventoryID'})
db.inventory.belongsTo(db.warehouse, {as: 'warehouse', sourceKey: 'warehouseID', targetKey: 'ID'}), 
db.inventory.hasMany(db.inventoryListing, {as: 'listings', sourceKey: 'ID', targetKey: 'inventoryID'})
db.inventory.belongsToMany(db.saleChannel, {through: 'inventoryListing', as: 'saleChannels',     foreignKey: 'inventoryID', otherKey: 'saleChannelID'})


db.product.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})
db.product.belongsTo(db.productCategory, {as: 'category', sourceKey: 'categoryID', targetKey: 'ID'})
db.product.hasMany(db.productImage, {as: 'images', sourceKey: 'ID', targetKey: 'productID'})
db.product.hasMany(db.productVariant, {as: 'variants', sourceKey: 'ID', targetKey: 'productID'})
db.product.belongsTo(db.product, {as: 'sourceProduct', sourceKey: 'sourceProductID',targetKey: 'ID'})
db.product.hasMany(db.productMatchLookup, {as: 'matches', sourceKey: 'ID', targetKey: 'productID'})

db.productImage.belongsTo(db.product, {as: 'product', sourceKey: 'productID', targetKey: 'ID'})

db.productMatchLookup.belongsTo(db.productVariant, {as: 'variant', sourceKey: 'productVariantID', foreignKey: 'productVariantID', targetKey: 'ID'})
db.productMatchLookup.belongsTo(db.productVariant, {as: 'externalVariant', sourceKey: 'externalProductVariantID', targetKey: 'ID', foreignKey: 'externalProductVariantID'})
db.productMatchLookup.belongsTo(db.product, {as: 'externalProduct', sourceKey: 'externalProductID', targetKey: 'ID', foreignKey: 'externalProductID'})
db.productMatchLookup.belongsTo(db.product, {as: 'product', sourceKey: 'productID', foreignKey: 'productID', targetKey: 'ID'})

db.productVariant.belongsTo(db.product, {as: 'product', sourceKey: 'productID', targetKey: 'ID'})
db.productVariant.hasMany(db.inventory, {as: 'inventory', sourceKey: 'ID', targetKey: 'productVariantID'})
db.productVariant.belongsTo(db.productVariant, {as: 'sourceProductVariant', sourceKey: 'sourceProductVariantID', targetKey: 'ID'})
db.productVariant.hasMany(db.inventoryListing, {as: 'listings', sourceKey: 'ID', targetKey: 'productVariantID'})

db.saleChannel.belongsToMany(db.account, {through: 'account_saleChannel', as: 'accounts',     foreignKey: 'saleChannelID', otherKey: 'accountID'})
db.saleChannel.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})
db.saleChannel.hasMany(db.transactionRate, {as: 'fees', sourceKey: 'ID', targetKey: 'saleChannelID'})

db.inventoryListing.belongsTo(db.saleChannel, {as: 'saleChannel', sourceKey: 'saleChannelID', targetKey: 'ID'})
db.inventoryListing.belongsTo(db.product, {as: 'product', sourceKey: 'productID', targetKey: 'ID'})
db.inventoryListing.belongsTo(db.productVariant, {as: 'variant', sourceKey: 'productVariantID', targetKey: 'ID', foreignKey: 'productVariantID'})
db.inventoryListing.belongsTo(db.inventory, {as: 'inventory', sourceKey: 'inventoryID', targetKey: 'ID'})
db.inventoryListing.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})

db.productCategory.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})

db.order.belongsTo(db.orderType, {as: 'type', sourceKey: 'typeID', targetKey: 'ID'})
db.order.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})
db.order.belongsTo(db.account, {as: 'personalShopper', sourceKey: 'personalShopperAccountID', foreignKey: 'personalShopperAccountID', targetKey: 'ID'})
db.order.belongsTo(db.address, {as: 'billingAddress', sourceKey: 'billingAddressID', foreignKey: 'billingAddressID', targetKey: 'ID'})
db.order.belongsTo(db.user, {as: 'user', sourceKey: 'userID', targetKey: 'ID'})
db.order.belongsTo(db.status, {as: 'status', sourceKey: 'statusID', targetKey: 'ID'})
db.order.belongsTo(db.saleChannel, {as: 'saleChannel', sourceKey: 'saleChannelID', targetKey: 'ID'})
db.order.belongsTo(db.address, {as: 'consignor', sourceKey: 'consigneeID', targetKey: 'ID'})
db.order.belongsTo(db.address, {as: 'consignee', sourceKey: 'consigneeID', targetKey: 'ID'})
db.order.hasMany(db.orderLineItem, {as: 'orderLineItems', sourceKey: 'ID', targetKey: 'orderID'})
db.order.belongsToMany(db.item, {as: 'items', through: { model: 'orderLineItem', unique: false }, sourceKey: 'ID', foreignKey: 'orderID', otherKey: 'itemID', targetKey: 'ID'})
db.order.belongsToMany(db.fulfillment, {as: 'fulfillments', through: { model: 'orderLineItem', unique: false }, sourceKey: 'ID', foreignKey: 'orderID', otherKey: 'fulfillmentID', targetKey: 'ID'})
db.order.hasMany(db.transaction, {as: 'transactions', sourceKey: 'ID', targetKey: 'orderID'})

db.orderLineItem.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})
db.orderLineItem.belongsTo(db.order, {as: 'order', sourceKey: 'orderID', targetKey: 'ID', foreignKey: 'orderID'})
db.orderLineItem.belongsTo(db.item, {as: 'item', sourceKey: 'itemID', targetKey: 'ID'})
db.orderLineItem.belongsTo(db.status, {as: 'status', sourceKey: 'statusID', targetKey: 'ID'})
db.orderLineItem.belongsTo(db.product, {as: 'product', sourceKey: 'productID', targetKey: 'ID'})
db.orderLineItem.belongsTo(db.productVariant, {as: 'variant', sourceKey: 'productVariantID', targetKey: 'ID', foreignKey: 'productVariantID'})
db.orderLineItem.belongsTo(db.inventory, {as: 'inventory', sourceKey: 'inventoryID', targetKey: 'ID'})
db.orderLineItem.belongsTo(db.fulfillment, {as: 'fulfillment', sourceKey: 'fulfillmentID', targetKey: 'ID'})
db.orderLineItem.belongsTo(db.orderType, {as: 'orderType', sourceKey: 'orderTypeID', targetKey: 'ID', foreignKey: 'orderTypeID'})
db.orderLineItem.hasOne(db.transaction, {as: 'transaction', sourceKey: 'ID', targetKey: 'orderLineItemID', foreignKey: 'orderLineItemID'})

db.fulfillment.belongsTo(db.order, {as: 'inboundOrder', sourceKey: 'inboundOrderID', targetKey: 'ID'})
db.fulfillment.belongsTo(db.order, {as: 'outboundOrder', sourceKey: 'outboundOrderID', targetKey: 'ID'})
db.fulfillment.belongsTo(db.address, {as: 'destination', sourceKey: 'destinationAddressID', targetKey: 'ID', foreignKey: 'destinationAddressID'})
db.fulfillment.belongsTo(db.address, {as: 'origin', sourceKey: 'originAddressID', targetKey: 'ID', foreignKey: 'originAddressID'})
db.fulfillment.hasMany(db.orderLineItem, {as: 'orderLineItems', sourceKey: 'ID', targetKey: 'fulfillmentID', foreignKey: 'fulfillmentID'})
db.fulfillment.belongsTo(db.status, {as: 'status', sourceKey: 'statusID', targetKey: 'ID'})
db.fulfillment.belongsToMany(db.item, {as: 'items', through: { model: 'orderLineItem', unique: false }, sourceKey: 'ID', foreignKey: 'fulfillmentID', otherKey: 'itemID', targetKey: 'ID'})
db.fulfillment.belongsTo(db.courier, {as: 'courier', sourceKey: 'courierID', targetKey: 'ID'})
db.fulfillment.belongsTo(db.user, {as: 'createdByUser', sourceKey: 'createdByUserID', targetKey: 'ID', foreignKey: 'createdByUserID'})
db.fulfillment.hasMany(db.transaction, {as: 'transactions', sourceKey: 'ID', targetKey: 'fulfillmentID'})

db.jobLineItem.belongsTo(db.account,           {as: 'account',       sourceKey: 'accountID',         targetKey: 'ID'})
db.jobLineItem.belongsTo(db.item,              {as: 'item',          sourceKey: 'itemID',         targetKey: 'ID'})
db.jobLineItem.belongsTo(db.status,            {as: 'status',        sourceKey: 'statusID', targetKey: 'ID'})
db.jobLineItem.belongsTo(db.product,           {as: 'product',       sourceKey: 'productID',         targetKey: 'ID'})
db.jobLineItem.belongsTo(db.productVariant,    {as: 'variant',       sourceKey: 'productVariantID',    targetKey: 'ID', foreignKey: 'productVariantID'})
db.jobLineItem.belongsTo(db.inventory,         {as: 'inventory',     sourceKey: 'inventoryID',         targetKey: 'ID'})
db.jobLineItem.belongsTo(db.type,         {as: 'jobType',     sourceKey: 'jobTypeID',      targetKey: 'ID'})
db.jobLineItem.belongsTo(db.warehouse,    {as: 'warehouse', sourceKey: 'warehouseID', targetKey: 'ID'})
db.jobLineItem.belongsTo(db.job,             {as: 'job',         sourceKey: 'jobID',         targetKey: 'ID', foreignKey: 'jobID'})

db.address.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})
db.address.hasMany(db.warehouse, {as: 'warehouses', sourceKey: 'ID', targetKey: 'addressID', foreignKey: 'addressID'})


db.job.belongsTo(db.type, {as: 'type',      sourceKey: 'typeID',      targetKey: 'ID'})
db.job.belongsTo(db.account,   {as: 'account',   sourceKey: 'accountID',   targetKey: 'ID'})
db.job.belongsTo(db.user,      {as: 'user',      sourceKey: 'userID',      targetKey: 'ID'})
db.job.belongsTo(db.status,    {as: 'status',    sourceKey: 'statusID',    targetKey: 'ID'})
db.job.belongsTo(db.warehouse, {as: 'warehouse', sourceKey: 'warehouseID', targetKey: 'ID'})
db.job.hasMany(db.jobLineItem, {as: 'jobLineItems', sourceKey: 'ID', targetKey: 'jobID'})
db.job.belongsToMany(db.item,  {as: 'items',     through: {model: 'jobLineItem', unique: false}, sourceKey: 'ID', foreignKey: 'jobID', otherKey: 'itemID', targetKey: 'ID'})

db.warehouse.belongsToMany(db.account, {through: 'account_warehouse', as: 'accounts', foreignKey: 'warehouseID', otherKey: 'accountID'})
db.warehouse.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})
db.warehouse.belongsTo(db.address, {as: 'address', sourceKey: 'addressID', targetKey: 'ID', foreignKey: 'addressID'})

db.notification.belongsTo(db.user, {as: 'user', sourceKey: 'userID', targetKey: 'ID'})
db.notification.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})

db.user.belongsToMany(db.account, {through: 'account_user', as: 'accounts'})
db.user.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})
db.user.hasMany(db.notification, {as: 'notifications', sourceKey: 'ID', targetKey: 'userID'})
db.user.belongsToMany(db.role, {through: 'user_role', as: 'roles', sourceKey: 'ID', foreignKey: 'userID', otherKey: 'roleID', targetKey: 'ID'})

db.account.belongsToMany(db.user, {through: 'account_user', as: 'users'})
db.account.hasMany(db.item, {as: 'items', sourceKey: 'ID', targetKey: 'accountID'})
db.account.belongsToMany(db.warehouse, {through: 'account_warehouse', as: 'warehouses', foreignKey: 'accountID', otherKey: 'warehouseID'})
db.account.belongsTo(db.address, {as: 'billingAddress', sourceKey: 'billingAddressID', foreignKey: 'billingAddressID', targetKey: 'ID'})
db.account.belongsTo(db.role, {as: 'role', sourceKey: 'roleID', foreignKey: 'roleID', targetKey: 'ID'})
db.account.belongsToMany(db.saleChannel, {through: 'account_saleChannel', as: 'saleChannels', foreignKey: 'accountID', otherKey: 'saleChannelID'})

db.role.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID'})
db.role.hasMany(db.permission, {as: 'permissions', sourceKey: 'ID', targetKey: 'roleID'})
db.role.belongsToMany(db.user, {through: 'user_role', as: 'users', sourceKey: 'ID', foreignKey: 'roleID', otherKey: 'userID', targetKey: 'ID'})

db.permission.belongsTo(db.resource, {as: 'resource', sourceKey: 'resourceID', targetKey: 'ID'})//TRANSACTIONS -  PAYMENT SERVICE

db.transaction.belongsTo(db.account, {as: 'fromAccount',   sourceKey: 'fromAccountID',   foreignKey: 'fromAccountID',    targetKey: 'ID'})
db.transaction.belongsTo(db.account, {as: 'toAccount',     sourceKey: 'toAccountID',     foreignKey: 'toAccountID',      targetKey: 'ID'})
db.transaction.belongsTo(db.order, {as: 'order',         sourceKey: 'orderID',         foreignKey: 'orderID',          targetKey: 'ID'})
db.transaction.belongsTo(db.orderLineItem, {as: 'orderLineItem', sourceKey: 'orderLineItemID', foreignKey: 'orderLineItemID',  targetKey: 'ID'})
db.transaction.belongsTo(db.fulfillment, {as: 'fulfillment',   sourceKey: 'fulfillmentID',   foreignKey: 'fulfillmentID',    targetKey: 'ID'})
db.transaction.belongsTo(db.user, {as: 'processedByUser',   sourceKey: 'processedByUserID',   foreignKey: 'processedByUserID',    targetKey: 'ID'})
db.transaction.hasMany(db.transaction, {as: 'childTxs',   sourceKey: 'ID',   foreignKey: 'paidInTransactionID',    targetKey: 'paidInTransactionID'})
db.transaction.belongsTo(db.transaction, {as: 'parentTx',   sourceKey: 'paidInTransactionID',   foreignKey: 'paidInTransactionID',    targetKey: 'ID'})


db.courier.belongsTo(db.account, {as: 'account', sourceKey: 'accountID', targetKey: 'ID', foreignKey: 'accountID'})

db.marketplaceListing.belongsTo(db.user, { as: 'user', foreignKey: 'userID' })
db.marketplaceListing.belongsTo(db.product, {as: 'product', sourceKey: 'productID', targetKey: 'ID'})
db.marketplaceListing.belongsTo(db.productVariant, {as: 'variant', sourceKey: 'productVariantID', targetKey: 'ID', foreignKey: 'productVariantID'})
db.marketplaceListing.belongsTo(db.status, {as: 'status', sourceKey: 'statusID', targetKey: 'ID'})
db.marketplaceListing.hasMany(db.marketplaceOffer, {as: 'marketplaceOffers', sourceKey: 'ID', targetKey: 'marketplaceListingID'})

db.marketplaceOffer.belongsTo(db.user, { as: 'user', foreignKey: 'userID' })
db.marketplaceOffer.belongsTo(db.status, {as: 'status', sourceKey: 'statusID', targetKey: 'ID'})
db.marketplaceOffer.belongsTo(db.marketplaceListing, {as: 'marketplaceListing', sourceKey: 'marketplaceListingID', targetKey: 'ID'})


db.consignment.belongsTo(db.account, {as: 'account',   sourceKey: 'accountID',              foreignKey: 'accountID',    targetKey: 'ID'})
db.consignment.belongsTo(db.account, {as: 'consignor', sourceKey: 'consignorAccountID',     foreignKey: 'consignorAccountID',    targetKey: 'ID'})
db.consignment.belongsToMany(db.saleChannel, {through: {model: 'account_saleChannel', unique: false}, as: 'saleChannels', sourceKey: 'consignorAccountID', foreignKey: 'accountID', otherKey: 'saleChannelID', targetKey: 'ID', constraints: false})

db.event.belongsTo(db.account, {as: 'account',   sourceKey: 'accountID',              foreignKey: 'accountID',    targetKey: 'ID'})
db.event.belongsTo(db.user, {as: 'user',   sourceKey: 'userID',              foreignKey: 'userID',    targetKey: 'ID'})

module.exports = db

