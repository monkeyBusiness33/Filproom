module.exports = (sequelize, Sequelize) => {
    return sequelize.define("inventory", {
        ID:                 {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:          {type: Sequelize.BIGINT,           allowNull: false},
        productID :         {type: Sequelize.BIGINT,           allowNull: false},
        productVariantID :  {type: Sequelize.BIGINT,           allowNull: false},
        virtual:            {type: Sequelize.BOOLEAN,          allowNull: true, defaultValue: false},
        cost:               {type: Sequelize.DECIMAL(10,2),      allowNull: true},
        quantity:           {type: Sequelize.INTEGER,          allowNull: false},
        quantityAtHand:           {type: Sequelize.INTEGER,          allowNull: false, defaultValue: 0},
        quantityIncoming:           {type: Sequelize.INTEGER,          allowNull: false, defaultValue: 0},
        notes:              {type: Sequelize.STRING(500),      allowNull: true},
        warehouseID :       {type: Sequelize.BIGINT,           allowNull: true},
    });
};
