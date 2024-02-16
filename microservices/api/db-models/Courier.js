module.exports = (sequelize, Sequelize) => {
    return sequelize.define("courier", {
        ID: {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:             {type: Sequelize.BIGINT,      allowNull: true},
        code:                  {type: Sequelize.STRING(200), allowNull: true},
        name:                  {type: Sequelize.STRING(200), allowNull: true},
        foreignID:             {type: Sequelize.STRING(200), allowNull: true},
        nationalServices:      {type: Sequelize.STRING(200), allowNull: true},
        internationalServices: {type: Sequelize.STRING(200), allowNull: true},
        fixedShippingRate:     {type: Sequelize.STRING(200), allowNull: true},
        courierBillingAccount: {type: Sequelize.STRING(200), allowNull: true},
    });

};
