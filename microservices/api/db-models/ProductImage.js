module.exports = (sequelize, Sequelize) => {
  return sequelize.define("productImage", {
    ID:         {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
    foreignID:  {type: Sequelize.STRING(200),  allowNull: true},
    productID:  {type: Sequelize.BIGINT,       allowNull: false},
    filename:   {type: Sequelize.STRING(200),  allowNull: true},
    src:        {type: Sequelize.STRING(1000), allowNull: true},
    position:   {type: Sequelize.INTEGER,      allowNull: true}
  });
};