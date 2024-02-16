module.exports = (sequelize, Sequelize) => {
    return sequelize.define("productVariant", {
        ID:         {type: Sequelize.BIGINT,      allowNull: false, primaryKey: true, autoIncrement: true},
        productID:      {type: Sequelize.BIGINT,      allowNull: false},
        stockxId:       {type: Sequelize.STRING(200), allowNull: false},
        lowestAsk:      {type: Sequelize.INTEGER,      allowNull: true},
        highestBid:     {type: Sequelize.INTEGER,      allowNull: true},
        numberOfBids:   {type: Sequelize.INTEGER,      allowNull: true},
        numberOfAsks:   {type: Sequelize.INTEGER,      allowNull: true},
        lastSale:       {type: Sequelize.INTEGER,      allowNull: true},
        position:       {type: Sequelize.INTEGER,      allowNull: true},
        baseSize:       {type: Sequelize.STRING(200),  allowNull: true},
        baseType:       {type: Sequelize.STRING(200),  allowNull: true},
        extraSizes:     {type: Sequelize.STRING(500),  allowNull: true},
        extraTypes:     {type: Sequelize.STRING(500),  allowNull: true},
        gtin:           {type: Sequelize.STRING(500),  allowNull: true},
        ean13:          {type: Sequelize.STRING(500),  allowNull: true},
        usSize:         {type: Sequelize.STRING(100),  allowNull: true},
        ukSize:         {type: Sequelize.STRING(100),  allowNull: true},
        jpSize:         {type: Sequelize.STRING(100),  allowNull: true},
        euSize:         {type: Sequelize.STRING(100),  allowNull: true},
        usmSize:        {type: Sequelize.STRING(100),  allowNull: true},
        uswSize:        {type: Sequelize.STRING(100),  allowNull: true},
        hidden:         {type: Sequelize.BOOLEAN,      allowNull: false, defaultValue: 0}
    });
};
