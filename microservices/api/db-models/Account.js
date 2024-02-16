module.exports = (sequelize, Sequelize) => {
    return sequelize.define(
        "account", 
        {
        ID:                    {type: Sequelize.BIGINT,         primaryKey: true, autoIncrement: true},
        foreignID:             {type: Sequelize.STRING(200),    allowNull: true},
        name:                  {type: Sequelize.STRING(300),    allowNull: false},
        logo:                  {type: Sequelize.STRING(50),     allowNull: true},
        currency:              {type: Sequelize.STRING(50),     allowNull: true, defaultValue: 'GBP'},
        roleID:                {type: Sequelize.BIGINT,         allowNull: true},
        vatNumber:             {type: Sequelize.STRING(200),    allowNull: true},
        taxRate:               {type: Sequelize.DECIMAL(10,2),  allowNull: true},
        billingAddressID:      {type: Sequelize.BIGINT,         allowNull: true},


        //revolut
        revolutJWT:                   {type: Sequelize.STRING(1000), allowNull: true},
        revolutRefreshToken:          {type: Sequelize.STRING(500), allowNull: true},

        //stripe
        stripeConnectAccountID:                           {type: Sequelize.STRING(500), allowNull: true},
        stripeConnectAccountSetupCompleted:               {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: 0},

        //Stripe on boarding source and return link
        defaultStripeDestinationID: {type: Sequelize.STRING(500), allowNull: true}, //deprecated - to remove - replaced by consignment.stripeDefaultDestinationID
        stripeAccountID:            {type: Sequelize.STRING(500), allowNull: true}, //deprecated - to remove - replaced by consignment.stripeAccountID
        stripeAPIKey:               {type: Sequelize.STRING(500), allowNull: true},

        //tier
        tier:                     {type: Sequelize.STRING(200), allowNull: true, defaultValue: 'bronze'},
        //Size Charts - comma separated regions (eu, uk, us, )
        sizeChartConfigs:           {type: Sequelize.STRING(200), allowNull: true , defaultValue: 'uk,eu,us'},
        // deprecated
        isConsignor:           {type: Sequelize.BOOLEAN,        allowNull: false, defaultValue: 0},
    },
    {
        defaultScope: {
            attributes: {
                exclude: ['revolutJWT', 'revolutRefreshToken', 'stripeAPIKey']
            }
        }
    }
    );

};
