module.exports = (sequelize, Sequelize) => {
    return sequelize.define("user_role", {
        ID:          {type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true},
        userID:      {type: Sequelize.BIGINT, allowNull: false},
        roleID:   {type: Sequelize.BIGINT, allowNull: false},
    });

};
