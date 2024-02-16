
module.exports = (sequelize, Sequelize) => {
    return sequelize.define("jobLineItem", {
        ID:                       {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:                {type: Sequelize.BIGINT,             allowNull: false},
        itemID :                  {type: Sequelize.BIGINT,             allowNull: false},
        productID :               {type: Sequelize.BIGINT,             allowNull: false},
        productVariantID :        {type: Sequelize.BIGINT,             allowNull: false},
        jobID :                    {type: Sequelize.BIGINT,             allowNull: false},
        jobTypeID:                 {type: Sequelize.BIGINT,           allowNull: true},
        statusID :                 {type: Sequelize.BIGINT,            allowNull: false},
        notes :                    {type: Sequelize.STRING(500),                 allowNull: true},
        warehouseID:                {type: Sequelize.BIGINT,            allowNull: false},
        confirmedAt:                 {type: Sequelize.DATE,                        allowNull: true},
        completedAt:                 {type: Sequelize.DATE,                        allowNull: true},
        action :                   {type: Sequelize.STRING(500),                 allowNull: true},
        actionResolvedAt:         {type: Sequelize.DATE,                        allowNull: true},
        actionCreatedAt:         {type: Sequelize.DATE,                        allowNull: true},
        //TODO: maybe rename deleted to removed
        deletedAt:                 {type: Sequelize.DATE,                        allowNull: true},
        //TODO: not sure if needed
        //canceledReason:     {type: Sequelize.STRING(500),                 allowNull: false, defaultValue: ''},
    });

};
