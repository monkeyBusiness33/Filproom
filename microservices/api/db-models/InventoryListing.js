module.exports = (sequelize, Sequelize) => {
    return sequelize.define("inventoryListing", {
        ID:                  {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:           {type: Sequelize.BIGINT,           allowNull: false},
        saleChannelID :      {type: Sequelize.BIGINT,           allowNull: false},
        inventoryID :        {type: Sequelize.BIGINT,           allowNull: false},
        productID :          {type: Sequelize.BIGINT,           allowNull: false},
        productVariantID :   {type: Sequelize.BIGINT,           allowNull: false},
        status:              {type: Sequelize.STRING(50),       allowNull: false},
        payout:              {type: Sequelize.DECIMAL(10,2),    allowNull: false},
        priceSourceName:     {type: Sequelize.STRING(50),       allowNull: true},
        priceSourceMargin:   {type: Sequelize.DECIMAL(10,2),    allowNull: true},
        price:               {type: Sequelize.DECIMAL(10,2),    allowNull: false},
        isActiveListing: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: 0},
        lacedID:             {type: Sequelize.BIGINT,           allowNull: true},
    });
};
