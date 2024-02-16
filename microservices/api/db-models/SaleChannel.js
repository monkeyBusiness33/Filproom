module.exports = (sequelize, Sequelize) => {
    return sequelize.define("saleChannel", {
        ID:                    {type: Sequelize.BIGINT,         primaryKey: true, autoIncrement: true},
        accountID:             {type: Sequelize.BIGINT,         allowNull: false},
        title:                 {type: Sequelize.STRING(300),    allowNull: false},
        description:           {type: Sequelize.STRING(5000),    allowNull: true},
        isDefault:             {type: Sequelize.BOOLEAN,        allowNull: false, defaultValue: 1},
        platform:              {type: Sequelize.STRING(200),    allowNull: true},
        email:                 {type: Sequelize.STRING(200),    allowNull: true},
        password:              {type: Sequelize.STRING(200),    allowNull: true},
        shopifyStoreName:      {type: Sequelize.STRING(200),    allowNull: true},
        shopifyAPIAuth:        {type: Sequelize.STRING(200),    allowNull: true},
        allowVirtualInventory: {type: Sequelize.BOOLEAN,    allowNull: false, defaultValue: 0},
        markup:                {type: Sequelize.DECIMAL(10,2),      allowNull: false, defaultValue: 0},
        taxRate:               {type: Sequelize.DECIMAL(10,2),      allowNull: false, defaultValue: 0},
        syncProgress:          {type: Sequelize.INTEGER,         allowNull: false, defaultValue: 0},
        policyUrl:                {type: Sequelize.STRING(200),         allowNull: true},
        sameDayDeliveryInternalPriorityMargin: {type: Sequelize.DECIMAL(10,2), allowNull: true},
        sameDayDelivery: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: 0},
    }, 
    {
        defaultScope: {
            attributes: {
                exclude: ['email', 'password', 'shopifyAPIAuth']
            }
        }
    });
};
