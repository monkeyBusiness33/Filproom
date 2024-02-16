module.exports = (sequelize, Sequelize) => {
  return sequelize.define("productCategory", {
    ID:              {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
    accountID:       {type: Sequelize.BIGINT,       allowNull: true},
    name:            {type: Sequelize.STRING(200), allowNull: false}
  });
};
