module.exports = (sequelize, Sequelize) => {
    return sequelize.define("webhookSubscription", {
        ID: {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
        eventName:       {type: Sequelize.STRING(100),  allowNull: false},
        accountID:       {type: Sequelize.BIGINT,        allowNull: false},
        endpoint:        {type: Sequelize.STRING(500),   allowNull: false},
        activatedAt:     {type: Sequelize.DATE,          allowNull: true}
    });

};
