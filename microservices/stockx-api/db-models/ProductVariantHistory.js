module.exports = (sequelize, Sequelize) => {
    return sequelize.define("productVariantHistory", {
        ID:         {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        productVariantStockxId:   {type: Sequelize.STRING(200), allowNull: true},
        lowestAsk:                {type: Sequelize.INTEGER, allowNull: true},
        highestBid:               {type: Sequelize.INTEGER, allowNull: true},
        numberOfAsks:             {type: Sequelize.INTEGER, allowNull: true},
        numberOfBids:             {type: Sequelize.INTEGER, allowNull: true},
        lastSale:                 {type: Sequelize.INTEGER, allowNull: true},
        date:                     {type: Sequelize.DATEONLY, allowNull: true}
    });
};
