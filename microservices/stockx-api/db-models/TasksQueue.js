module.exports = (sequelize, Sequelize) => {
  return sequelize.define("tasksQueue", {
    ID:           {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
    stockxId:       {type: Sequelize.STRING(200), allowNull: false},
    errorMessage:   {type: Sequelize.STRING(1000), allowNull: true},
    action:         {type: Sequelize.STRING(200),  allowNull: true},
    completedAt:    {type: Sequelize.DATE,         allowNull: true},
    retryAttempts:  {type: Sequelize.INTEGER,      allowNull: false, defaultValue : 0}
  });
};
