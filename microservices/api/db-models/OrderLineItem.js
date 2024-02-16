
module.exports = (sequelize, Sequelize) => {
    return sequelize.define("orderLineItem", {
        ID:                       {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:                {type: Sequelize.BIGINT,             allowNull: false},
        itemID :                  {type: Sequelize.BIGINT,             allowNull: false},
        productID :               {type: Sequelize.BIGINT,             allowNull: false},
        siblingID:                {type: Sequelize.BIGINT,             allowNull: true, description: 'It is a reference to link inbound and outbound order line items belonging to different accounts'},
        productVariantID :        {type: Sequelize.BIGINT,             allowNull: false},
        orderID :                 {type: Sequelize.BIGINT,             allowNull: false},
        orderTypeID:               {type: Sequelize.INTEGER,           allowNull: true},
        fulfillmentID :           {type: Sequelize.BIGINT,             allowNull: true},
        statusID :                 {type: Sequelize.BIGINT,            allowNull: false},
        fees:               {type: Sequelize.DECIMAL(18,2),               allowNull: true},
        payout:             {type: Sequelize.DECIMAL(10,2),               allowNull: true},
        cost :              {type: Sequelize.DECIMAL(18,2),               allowNull: true},
        price :             {type: Sequelize.DECIMAL(18,2),               allowNull: true},
        profit :            {type: Sequelize.DECIMAL(18,2),               allowNull: true},
        notes :             {type: Sequelize.STRING(500),                 allowNull: true},
        canceledAt:         {type: Sequelize.DATE,                        allowNull: true},
        canceledReason:     {type: Sequelize.STRING(500),                 allowNull: false, defaultValue: ''},
        restocked:          {type: Sequelize.BOOLEAN,                     allowNull: true},
        dispatchedAt:       {type: Sequelize.DATE,                        allowNull: true},
        deliveredAt:        {type: Sequelize.DATE,                        allowNull: true},
        replacePending:     {type: Sequelize.BOOLEAN,                     allowNull: true},
        refundedAt: {type: Sequelize.DATE,             allowNull: true},
        rejectedAt: {type: Sequelize.DATE,             allowNull: true},
        acceptedAt: {type: Sequelize.DATE,             allowNull: true}
    });

};
