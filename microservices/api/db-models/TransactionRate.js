module.exports = (sequelize, Sequelize) => {
    return sequelize.define("transactionRate", {
        ID:                  {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        saleChannelID:       {type: Sequelize.BIGINT,        allowNull: true},
        minPrice:            {type: Sequelize.DECIMAL(10,2), allowNull: false},
        maxPrice:            {type: Sequelize.DECIMAL(10,2), allowNull: false},
        value:               {type: Sequelize.DECIMAL(10,2), allowNull: false},
        type: {type: Sequelize.STRING(200), allowNull: false},
    });
};
