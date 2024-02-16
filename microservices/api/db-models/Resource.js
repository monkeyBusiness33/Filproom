module.exports = (sequelize, Sequelize) => {
  return sequelize.define("resource", {
    ID:          {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
    name:        {type: Sequelize.STRING(200), allowNull: false},
    notes:        {type: Sequelize.STRING(200), allowNull: true}
  });
};