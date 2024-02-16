module.exports = (sequelize, Sequelize) => {
  return sequelize.define("productVariant", {
    ID:                     {type: Sequelize.BIGINT,       allowNull: false, primaryKey: true, autoIncrement: true},
    productID:              {type: Sequelize.BIGINT,       allowNull: false},
    foreignID:              {type: Sequelize.STRING(200),  allowNull: true},
    sourceProductVariantID: {type: Sequelize.BIGINT,allowNull: true},
    name:                   {type: Sequelize.STRING(200),  allowNull: false},
    usSize:                 {type: Sequelize.STRING(100),  allowNull: true},
    ukSize:                 {type: Sequelize.STRING(100),  allowNull: true},
    jpSize:                 {type: Sequelize.STRING(100),  allowNull: true},
    euSize:                 {type: Sequelize.STRING(100),  allowNull: true},
    usmSize:                {type: Sequelize.STRING(100),  allowNull: true},
    uswSize:                {type: Sequelize.STRING(100),  allowNull: true},
    cost:                   {type: Sequelize.DECIMAL(16,2),  allowNull: true},
    price:                  {type: Sequelize.DECIMAL(16,2),  allowNull: true},
    weight:                 {type: Sequelize.DECIMAL(10,3),  allowNull: true},
    volume:                 {type: Sequelize.DECIMAL(10,3),  allowNull: true},
    position:               {type: Sequelize.INTEGER,      allowNull: true},
    stockxId:               {type: Sequelize.STRING(100),  allowNull: true},
    status:                 {type: Sequelize.STRING(100),  allowNull: false, defaultValue: 'active'},
    untracked:              {type: Sequelize.BOOLEAN,     allowNull: false, defaultValue: 0},
    gtin:                   {type: Sequelize.STRING(500),  allowNull: true},
    lacedID:          {type: Sequelize.BIGINT,      allowNull: true},
    lacedName:            {type: Sequelize.STRING(200), allowNull: true},
  });
};
