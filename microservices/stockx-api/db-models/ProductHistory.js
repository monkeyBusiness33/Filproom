module.exports = (sequelize, Sequelize) => {
    return sequelize.define("productHistory", {
        ID:              {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        productID:              {type: Sequelize.BIGINT,      allowNull: false},
        price:               {type: Sequelize.FLOAT(10,2),  allowNull: true},
        salesLast72Hours:  {type: Sequelize.INTEGER,  allowNull: true},
        salesLast72HoursChangePercentage:  {type: Sequelize.FLOAT(10,2),  allowNull: true},
        lastSalePrice:       {type: Sequelize.FLOAT(10,2),  allowNull: true},
        lastSaleChangePercentage:  {type: Sequelize.FLOAT(10,2),  allowNull: true},
        volatilityScore:     {type: Sequelize.FLOAT(10,2),  allowNull: true},
        volatilityScoreChangePercentage:     {type: Sequelize.FLOAT(10,2),  allowNull: true},
        updatedBucketNumber:  {type: Sequelize.INTEGER,  allowNull: true},
        retailPrice:         {type: Sequelize.DECIMAL(10,2), allowNull: true},
    });
};
