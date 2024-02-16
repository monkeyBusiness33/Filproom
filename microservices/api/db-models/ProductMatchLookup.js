module.exports = (sequelize, Sequelize) => {
    return sequelize.define("productMatchLookup", {
        ID:                                 {type: Sequelize.BIGINT,         primaryKey: true, autoIncrement: true},
        productID:                          {type: Sequelize.BIGINT,         allowNull: true},
        productVariantID:                   {type: Sequelize.BIGINT,         allowNull: false},
        accountID:                          {type: Sequelize.BIGINT,         allowNull: true},
        externalProductID:                  {type: Sequelize.BIGINT,         allowNull: true},
        externalProductVariantID:           {type: Sequelize.BIGINT,         allowNull: false},
        externalAccountID:                  {type: Sequelize.BIGINT,         allowNull: false},

    });

};
