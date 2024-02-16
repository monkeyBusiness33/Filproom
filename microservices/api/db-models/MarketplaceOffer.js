module.exports = (sequelize, Sequelize) => {
    return sequelize.define('marketplaceListingOffer', {
      ID: {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
      userID: {type: Sequelize.BIGINT, allowNull: false},
      marketplaceListingID: {type: Sequelize.BIGINT, allowNull: true},
      statusID: {type: Sequelize.BIGINT, allowNull: true},
      price: {type: Sequelize.DECIMAL(10, 2), allowNull: false},
      quantity: {type: Sequelize.BIGINT, allowNull: false},
      notes: {type: Sequelize.STRING(1000), allowNull: true, defaultValue: ''},
      cometChatGroup: {type: Sequelize.STRING(2000), allowNull: true},
    })
  }
