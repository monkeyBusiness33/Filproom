module.exports = (sequelize, Sequelize) => {
    return sequelize.define("configurations", {
        ID:                    {type: Sequelize.BIGINT,         allowNull: false, primaryKey: true, autoIncrement: true},
        cookie:                {type: Sequelize.STRING(10000),  allowNull: false},
        graphqlVersion:        {type: Sequelize.STRING(1000),   allowNull: false},
        apiUrl:                {type: Sequelize.STRING(1000),   allowNull: true},
        userAgent:             {type: Sequelize.STRING(200),    allowNull: false},
        requests:              {type: Sequelize.INTEGER,        defaultValue: 0},
        errors:                {type: Sequelize.INTEGER,        defaultValue: 0},
        consecutiveErrors:     {type: Sequelize.INTEGER,        defaultValue: 0},
    });
};
