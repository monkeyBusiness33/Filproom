module.exports = (sequelize, Sequelize) => {
    return sequelize.define("event", {
        ID:                    {type: Sequelize.BIGINT,         primaryKey: true, autoIncrement: true},
        accountID:             {type: Sequelize.BIGINT,         allowNull: false},
        userID:                {type: Sequelize.BIGINT,         allowNull: false},
        resource:                  {type: Sequelize.STRING(50),     allowNull: false},
        action:                {type: Sequelize.STRING(50),     allowNull: false},
        timestamp:             {type: Sequelize.DATE,           allowNull: false},
    });

};
