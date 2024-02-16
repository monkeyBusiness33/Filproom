const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
const db = require("../libs/db");
const configs = require("../configs")

router.get("/:ID", async (req, response, next) => {
    try {
        const orderObj = await service.inventory.getByID(req.user, req.params.ID)
        req.user.can('inventory.view', orderObj)
        req.locals.body = orderObj
        return next()
    } catch(e) {
        return next(e)
    }
})

router.get("/", async (req, response, next) => {
    try {
        const ordersListObj = await service.inventory.getAll(req.user, req.query.offset, req.query.limit, req.query)
        req.user.can('inventory.view', ordersListObj.rows)
        req.locals.body = ordersListObj
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/", async (req, response, next) => {
    /**
     * {
     *      accountID: number
     *      productID: 
     *      productVariantID: 
     *      quantity:    number
     *      virtual:     boolean (optional - default: false)
     *      cost:        number (optional)
     *      notes:       string (optional)
     *      setAsDelivered: boolean // skip inbound process
     *      reference1:  string (optional)
     *      warehouseID: number (required if virtual: false)
     *      listings: [
     *          {
     *              saleChannelID
                    productID
                    productVariantID
                    status
                    payout
                    priceSourceName
                    priceSourceMargin
                    price
     *          }
     *      ]
     * }
     */
    try {
        logger.info(`Create Inventory`, {data: req.body})
        await db.sequelize.transaction(async tx => {
            req.user.can('inventory.create', req.body)

            // create inventory and items
            const _inventoryRecord = {
                accountID: req.body.accountID,
                productID: req.body.productID, 
                productVariantID: req.body.productVariantID, 
                virtual: req.body.virtual, 
                quantity: req.body.quantity, 
                cost: req.body.cost,
                notes: req.body.notes,
                status: req.body.status,
            }
            let warehouse;
            if (!req.body.virtual) {
                warehouse = await service.warehouse.getByID(req.user, req.body.warehouseID)
                _inventoryRecord.warehouseID = req.body.warehouseID
            }
            let inventoryRecord = await service.inventory.create(req.user, _inventoryRecord)

            // if not virtual - create inbound order
            if (!req.body.virtual) {
                const _inboundOrder = {
                    accountID: req.body.accountID,
                    reference1: req.body.reference1,
                    type: 'inbound',
                    consigneeID: warehouse.addressID,
                    fulfillment: {
                        setAsDelivered: req.body.setAsDelivered
                    },
                    details: inventoryRecord.items.map(item => {return {itemID: item.ID, cost: inventoryRecord.cost, notes: inventoryRecord.notes}})
                }
                const inboundOrder = await service.order.create(req.user, _inboundOrder)     
            }

            // create listings
            const _newListings = []
            req.body.listings.map(listing => _newListings.push({
                saleChannelID:       listing.saleChannelID,
                accountID:           inventoryRecord.accountID,
                inventoryID:         inventoryRecord.ID,
                productID:           listing.productID,
                productVariantID:    listing.productVariantID,
                status:              listing.status,
                payout:              listing.payout,
                priceSourceName:     listing.priceSourceName,
                priceSourceMargin:   listing.priceSourceMargin,
                isActiveListing:     listing.isActiveListing || false,
                price:               listing.price

            }))
            await service.inventoryListing.create(req.user, _newListings)

            //fetch completed inventory object
            inventoryRecord = await service.inventory.getByID(req.user, inventoryRecord.ID)
            await service.inventory.createEgress(req.user, [inventoryRecord.ID])
            req.locals.body = inventoryRecord
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/download", async (req, response, next) => {
    try {
        /**
         * {
         *  fieldSeparator ?
         *  decimalSeparator ?
         *  table: string
         *  columns: string
         *  query: {
         *  },
         * }
         */

        if (!req.body.table) throw {status: 400, message: "Missing table parameter"}
        if (!req.body.columns) throw {status: 400, message: "Missing columns list"}
        if (!Array.isArray(req.body.columns)) throw {status: 400, message: "columns is not a list"}

        req.body.destinationEmail = req.user.email
        const serviceUser = await service.account.serviceUser(req.user.accountID)
        await service.gcloud.addTask(
            'api-jobs', 
            'POST',
            `${configs.microservices.api}/api/workflows/downloadTable`,
            {
                authorization: `Bearer ${serviceUser.apiKey}`
            }, 
            null, 
            req.body
        )
        req.locals.body = "ok"
        return next()
    } catch (e) {
        return next(e)
    }
})

router.put("/:ID", async (req, response, next) => {
    /**
     * cost: number
     * notes:
     * adjustQuantity; number
     * listings: [
     *      ID: number,
     *      payout: number
     *      priceSouceName
     *      priceSourceMargin
     *      status
     *      price
     * ]
     * 
     */
    try {
        await db.sequelize.transaction(async tx => {
            //Update inventory info and quantity
            const updatedInventory = await service.inventory.update(req.user, req.params.ID, req.body)
            req.user.can('inventory.update', updatedInventory)

            // update listings
            if (req.body.listings) {
                // update
                await Promise.all(req.body.listings.map(listing => service.inventoryListing.update(req.user, listing.ID, listing)))
            }

            await service.inventory.updateEgress(req.user, [req.params.ID])

            req.locals.body = await service.inventory.getByID(req.user, req.params.ID)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:inventoryID/unstock", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.body.inventoryID = req.params.inventoryID
            const inventoryObject = await db.inventory.findOne({where: {ID: req.params.inventoryID}, include:[ {model: db.warehouse, as: 'warehouse'}]})
            req.user.can('inventory.update', inventoryObject)
            await service.inventory.unstock(req.user, [req.body])
            req.locals.body = inventoryObject
            await service.inventory.updateEgress(req.user, [req.params.inventoryID])
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:inventoryID/listings", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.body.inventoryID = req.params.inventoryID
            req.user.can('inventory.update', req.body)
            const newInventoryListings = (await service.inventoryListing.create(req.user, req.body)).map(response => response[0])
            req.locals.body = newInventoryListings

            await service.inventory.createEgress(req.user, [req.params.inventoryID], {filteredListingIDs: newInventoryListings.map(listing => listing.ID)})
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:inventoryID/listings/:listingID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const _inventoryListing = await service.inventoryListing.getByID(req.user, req.params.listingID)
            req.user.can('listing.update', _inventoryListing)
            const inventoryListing = await service.inventoryListing.update(req.user, req.params.listingID, req.body)
            req.locals.body = inventoryListing
            await service.inventory.updateEgress(req.user, [inventoryListing.inventoryID])
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

module.exports = router;
