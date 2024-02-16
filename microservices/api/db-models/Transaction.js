module.exports = (sequelize, Sequelize) => {
    return sequelize.define("transaction", {
        ID:                   {type: Sequelize.BIGINT,       allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:           {type: Sequelize.BIGINT,       allowNull: true }, //TODO: set allowNull to false once run msync script
        grossAmount:          {type: Sequelize.DECIMAL(10,2),  allowNull: true},
        feesAmount:          {type: Sequelize.DECIMAL(10,2),  allowNull: true},
        netAmount:          {type: Sequelize.DECIMAL(10,2),  allowNull: true},
        currency:           {type: Sequelize.STRING(200),  allowNull: false},
        status:       {type: Sequelize.STRING(200),  allowNull: false, defaultValue: 'unpaid'},
        type:       {type: Sequelize.STRING(200),  allowNull: false},
        completedAt :              {type: Sequelize.DATE,         allowNull: true},
        revertedAt :              {type: Sequelize.DATE,         allowNull: true},
        processingAt:           {type: Sequelize.DATE,         allowNull: true},
        fromAccountID:          {type: Sequelize.BIGINT,       allowNull: true },
        toAccountID:            {type: Sequelize.BIGINT,       allowNull: true },
        orderID:                {type: Sequelize.BIGINT,       allowNull: true },
        processedByUserID:      {type: Sequelize.BIGINT,       allowNull: true },
        reference:              {type: Sequelize.STRING(200),  allowNull: true},
        paymentMethod:          {type: Sequelize.STRING(200),  allowNull: true},
        gateway:                {type: Sequelize.STRING(200),  allowNull: true},
        orderLineItemID:        {type: Sequelize.BIGINT,       allowNull: true },
        fulfillmentID:          {type: Sequelize.BIGINT,       allowNull: true },
        stripeID:               {type: Sequelize.STRING(200),       allowNull: true },
        revolutTransactionID:   {type: Sequelize.STRING(200),       allowNull: true },
        paidInTransactionID:      {type: Sequelize.BIGINT,       allowNull: true },
    });
};
