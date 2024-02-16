module.exports = (sequelize, Sequelize) => {
    return sequelize.define("notification", {
        ID:               {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        eventName:        {type: Sequelize.STRING(200), allowNull: false},
        accountID:        {type: Sequelize.BIGINT,      allowNull: false},
        userID:           {type: Sequelize.BIGINT,      allowNull: false},
    });

};
