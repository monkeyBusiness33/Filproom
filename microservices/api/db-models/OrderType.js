module.exports = (sequelize, Sequelize) => {
  return sequelize.define("orderType", {
    ID: {type: Sequelize.INTEGER,      allowNull: false, primaryKey: true, autoIncrement: true},
    name: {type: Sequelize.STRING(200), allowNull: false},
  });
};