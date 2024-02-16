
module.exports = (sequelize, Sequelize) => {
    const itemModel = sequelize.define("item", {
        ID:                   {type: Sequelize.BIGINT,       allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:            {type: Sequelize.BIGINT,       allowNull: false},
        productID :           {type: Sequelize.BIGINT,       allowNull: false},
        productVariantID :    {type: Sequelize.BIGINT,       allowNull: false},
        orderID :             {type: Sequelize.BIGINT,       allowNull: true}, 
        inventoryID :         {type: Sequelize.BIGINT,           allowNull: true},
        barcode :             {type: Sequelize.STRING(200),      allowNull: true},
        warehouseID :         {type: Sequelize.BIGINT,           allowNull: true},
        volume:               {type: Sequelize.DECIMAL(10,3),      allowNull: false},
        weight:               {type: Sequelize.DECIMAL(10,3),      allowNull: false},
        deletedAt :           {type: Sequelize.DATE,             allowNull: true},
        statusID :    {type: Sequelize.BIGINT},
    });

    return itemModel
};
