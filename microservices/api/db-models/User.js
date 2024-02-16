module.exports = (sequelize, Sequelize) => {
    const user = sequelize.define(
        "user", 
        {
        ID: {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:          {type: Sequelize.BIGINT,       allowNull: false},
        name:               {type: Sequelize.STRING(200), allowNull: false},
        surname:            {type: Sequelize.STRING(200), allowNull: false},
        activatedAt:        {type: Sequelize.DATE,        allowNull: true, defaultValue: null},
        email:              {type: Sequelize.STRING(200), allowNull: true},
        password:           {type: Sequelize.STRING(200), allowNull: true},
        phoneCountryCode:   {type: Sequelize.STRING(200), allowNull: true},
        phoneNumber:        {type: Sequelize.STRING(200), allowNull: true},
        emailNotifications: {type: Sequelize.STRING(500), allowNull: true},
        apiKey:             {type: Sequelize.STRING(500), allowNull: true},
        lastVisitAt:        {type: Sequelize.DATE,        allowNull: true},
        deviceID:           {type: Sequelize.STRING(1000), allowNull: true},
    },
    {
        defaultScope: {
            attributes: {
                exclude: ['email', 'password', 'phoneCountryCode', 'phoneNumber', 'apiKey', 'emailNotifications']
            }
        }
    }
    );
    return user
};
