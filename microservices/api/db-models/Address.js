module.exports = (sequelize, Sequelize) => {
    return sequelize.define("consignee", {
        ID: {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        accountID:        {type: Sequelize.BIGINT,      allowNull: false},
        name:             {type: Sequelize.STRING(200), allowNull: true},
        surname:          {type: Sequelize.STRING(200), allowNull: true},
        fullName:         {type: Sequelize.STRING(200), allowNull: true},
        address:          {type: Sequelize.STRING(200), allowNull: true},
        addressExtra:     {type: Sequelize.STRING(200), allowNull: true},
        postcode:         {type: Sequelize.STRING(200), allowNull: true},
        city:             {type: Sequelize.STRING(200), allowNull: true},
        county:           {type: Sequelize.STRING(200), allowNull: true},
        countyCode:       {type: Sequelize.STRING(200), allowNull: true},
        country:          {type: Sequelize.STRING(200), allowNull: true},
        countryCode:      {type: Sequelize.STRING(200), allowNull: true},
        email:            {type: Sequelize.STRING(200), allowNull: true},
        phone:            {type: Sequelize.STRING(200), allowNull: true}, //DEPRECATED - to Remove
        phoneCountryCode: {type: Sequelize.STRING(200), allowNull: true},
        phoneNumber:      {type: Sequelize.STRING(200), allowNull: true},
        validated:        {type: Sequelize.BOOLEAN,     allowNull: true, defaultValue: false},
    });

};
