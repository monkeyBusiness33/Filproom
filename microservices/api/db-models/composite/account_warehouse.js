module.exports = (sequelize, Sequelize) => {
    return sequelize.define("account_warehouse", {
        ID:            {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
        warehouseID:   {type: Sequelize.BIGINT, allowNull: false},
        accountID:     {type: Sequelize.BIGINT, allowNull: false},
    });

};
