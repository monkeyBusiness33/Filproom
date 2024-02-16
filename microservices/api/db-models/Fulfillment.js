module.exports = (sequelize, Sequelize) => {
  return sequelize.define("fulfillment", {
    ID:                                {type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true},
    foreignID:                         {type: Sequelize.STRING(200),  allowNull: true},
    reference1:                        {type: Sequelize.STRING(200),  allowNull: true},
    originAddressID:                   {type: Sequelize.BIGINT,       allowNull: true},
    destinationAddressID:              {type: Sequelize.BIGINT,       allowNull: true},
    inboundOrderID:                    {type: Sequelize.BIGINT,       allowNull: true},
    outboundOrderID:                   {type: Sequelize.BIGINT,       allowNull: true},
    trackingNumber:                    {type: Sequelize.STRING(200),  allowNull: true},
    statusID:                          {type: Sequelize.BIGINT,       allowNull: false},
    completedAt:                       {type: Sequelize.DATE,         allowNull: true},
    canceledAt:                        {type: Sequelize.DATE,         allowNull: true},
    shippingID:                        {type: Sequelize.STRING(200),  allowNull: true},
    shippingLabelFilename:             {type: Sequelize.STRING(200),  allowNull: true},
    shippingLabelID:                   {type: Sequelize.STRING(200),  allowNull: true},
    courierID:                         {type: Sequelize.BIGINT,       allowNull: true},
    courierServiceCode:                {type: Sequelize.STRING(200),  allowNull: true},
    createdByUserID:                   {type: Sequelize.BIGINT,       allowNull: true},
  });
};