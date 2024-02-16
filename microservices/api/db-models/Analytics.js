module.exports = (sequelize, Sequelize) => {
    return sequelize.define("analytics", {
        ID: {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
        accountID:       {type: Sequelize.BIGINT,       allowNull: false},
        volume : {type: Sequelize.DECIMAL(10,3),   allowNull: false},
        ordersIn: {type: Sequelize.INTEGER,   allowNull: false},
        ordersOut: {type: Sequelize.INTEGER,   allowNull: false},
        volumeIn: {type: Sequelize.DECIMAL(10,3),   allowNull: false},
        volumeOut: {type: Sequelize.DECIMAL(10,3),   allowNull: false},
        date: {type: Sequelize.DATEONLY, allowNull: false},
    });
};
