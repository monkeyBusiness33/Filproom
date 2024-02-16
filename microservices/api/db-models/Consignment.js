module.exports = (sequelize, Sequelize) => {
    return sequelize.define("consignment", {
        ID:                    {type: Sequelize.BIGINT,         primaryKey: true, autoIncrement: true},
        accountID:             {type: Sequelize.BIGINT,         allowNull: false},
        consignorAccountID:    {type: Sequelize.BIGINT,         allowNull: false},
        revolutCounterpartyID: {type: Sequelize.STRING(300),    allowNull: true},
        stripeAccountID:            {type: Sequelize.STRING(300), allowNull: true},
        stripeDefaultDestinationID: {type: Sequelize.STRING(300), allowNull: true}, //selected payment destimation for the stripeID account
    },
    {
        indexes: [
            
{
              unique: false,
              fields: ['consignorAccountID']
            }
        ]
    }
    );

};
