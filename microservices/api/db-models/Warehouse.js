module.exports = (sequelize, Sequelize) => {
  return sequelize.define("warehouse", {
    ID:                             {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
    foreignID:                      {type: Sequelize.STRING(200), allowNull: true},
    accountID:                      {type: Sequelize.BIGINT,       allowNull: true}, //TODO: set to false
    addressID:                      {type: Sequelize.BIGINT,       allowNull: true}, //TODO: set to false
    name:                           {type: Sequelize.STRING(200), allowNull: false}, 
    fulfillmentCentre:              {type: Sequelize.BOOLEAN,          allowNull: true}, // TODO: set to false
  });
};