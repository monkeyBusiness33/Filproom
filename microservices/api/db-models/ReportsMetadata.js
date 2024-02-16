module.exports = (sequelize, Sequelize) => {
    return sequelize.define("reportsMetadata", {
        ID: {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:             {type: Sequelize.BIGINT,      allowNull: true},
        type:                  {type: Sequelize.STRING(200), allowNull: true},
        filename:              {type: Sequelize.STRING(200), allowNull: true},
        viewedAt:              {type: Sequelize.DATE,        allowNull: true},
    });

};
