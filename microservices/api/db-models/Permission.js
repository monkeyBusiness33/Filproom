module.exports = (sequelize, Sequelize) => {
  return sequelize.define("permission", {
    ID:               {type: Sequelize.BIGINT,  allowNull: false, primaryKey: true, autoIncrement: true},
    roleID:           {type: Sequelize.BIGINT,  allowNull: false},
    resourceID:       {type: Sequelize.BIGINT,  allowNull: false},
    rule:             {type: Sequelize.STRING(200),  allowNull: true, defaultValue: '*'},
  });
};
