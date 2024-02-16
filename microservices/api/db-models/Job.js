module.exports = (sequelize, Sequelize) => {
  return sequelize.define("job", {
    ID:                      {type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true},
    accountID:               {type: Sequelize.BIGINT,       allowNull: false},
    userID:                  {type: Sequelize.BIGINT,       allowNull: true},
    typeID:                  {type: Sequelize.BIGINT,      allowNull: true},
    //reference1:              {type: Sequelize.STRING(200),  allowNull: true},
    statusID:                {type: Sequelize.BIGINT,       allowNull: true, defaultValue: 1},
    startedAt:             {type: Sequelize.DATE,         allowNull: true},
    completedAt:             {type: Sequelize.DATE,         allowNull: true},
    warehouseID:             {type: Sequelize.BIGINT,       allowNull: true},
    quantity:                {type: Sequelize.INTEGER,      allowNull: false, defaultValue: 0},
    notes:              {type: Sequelize.STRING(500),      allowNull: true},
    //tags:                    {type: Sequelize.STRING(1000),  allowNull: false, defaultValue: ''},
  });
};