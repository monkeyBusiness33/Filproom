const db = require('../libs/db')
const service = require('../services/main')
const { createHtmlForMarketplacePublicPage } = require('../libs/utils')
const path = require('path')

exports.getPublicMarketplaceListing = async (req, response) => {
  try {
    let marketPlace = {}
    await db.sequelize.transaction(async tx => {
        marketPlace = await service.marketplaceListing.getOneForPublic(
          req.params.ID
        )
    })
    await createHtmlForMarketplacePublicPage(marketPlace)
    response.sendFile('assets/marketplace-listing.html', {
      root: path.resolve(__dirname, '..')
    })
  } catch (e) {
    return response.send('Bad Request')
  }
}

