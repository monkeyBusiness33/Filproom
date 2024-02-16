module.exports = (sequelize, Sequelize) => {
  return sequelize.define('marketplaceListing', {
    ID: {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
    userID: {type: Sequelize.BIGINT, allowNull: false},
    productID: {type: Sequelize.BIGINT, allowNull: false},
    productVariantID: {type: Sequelize.BIGINT, allowNull: false},
    statusID: {type: Sequelize.BIGINT, allowNull: true},
    type: {type: Sequelize.STRING(300), allowNull: false},
    steal: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: 0},
    receipt: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: 0}, // WTB - asking for receipt || WTS - receipt is available
    condition: {type: Sequelize.STRING(300), allowNull: false, defaultValue: 'new'}, // condition of item
    purchasedFrom: {type: Sequelize.STRING(300), allowNull: true}, // condition of item
    price: {type: Sequelize.DECIMAL(10, 2), allowNull: false},
    quantityRequested: {type: Sequelize.BIGINT, allowNull: false},
    quantityClaimed: {type: Sequelize.BIGINT, allowNull: true, defaultValue: 0},
    notes: {type: Sequelize.STRING(1000), allowNull: true, defaultValue: ''},
    tags: {type: Sequelize.STRING(2000), allowNull: true, defaultValue: ''}
  })
}
