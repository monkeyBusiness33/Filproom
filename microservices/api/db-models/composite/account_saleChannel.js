module.exports = (sequelize, Sequelize) => {
    return sequelize.define("account_saleChannel", {
        ID:              {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
        saleChannelID:   {type: Sequelize.BIGINT, allowNull: false},
        accountID:       {type: Sequelize.BIGINT, allowNull: false},
        tier:            {type: Sequelize.STRING(200), allowNull: true},
        status:            {type: Sequelize.STRING(200), defaultValue: 'active'}
    });
};
