module.exports = (sequelize, Sequelize) => {
  return sequelize.define("role", {
    ID:                   {type: Sequelize.BIGINT,       allowNull: false, primaryKey: true, autoIncrement: true},
    name:                 {type: Sequelize.STRING(200),  allowNull: false},
    type:                  {type: Sequelize.STRING(200),  allowNull: false},
    accountID:       {type: Sequelize.BIGINT,       allowNull: true},
    notes:                {type: Sequelize.STRING(200),  allowNull: false}
  });
};
