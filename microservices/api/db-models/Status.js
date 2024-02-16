module.exports = (sequelize, Sequelize) => {
    return sequelize.define("status", {
        ID: {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
        name: {type: Sequelize.STRING(200), allowNull: false},
        description: {type: Sequelize.STRING(500)}
    });
};
