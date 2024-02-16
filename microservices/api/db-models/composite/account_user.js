module.exports = (sequelize, Sequelize) => {
    return sequelize.define("account_user", {
        ID:          {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
        userID:      {type: Sequelize.BIGINT, allowNull: false},
        accountID:   {type: Sequelize.BIGINT, allowNull: false},
    });

};
