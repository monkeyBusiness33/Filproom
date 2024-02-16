const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
const os = require("os");
const fs = require('fs');
const multer = require("multer");
const configs = require("../configs");
const upload = multer({dest: os.tmpdir()});
const db = require('../libs/db')

router.get("/", async (req, response, next) => {
    try
    {
        if( req.query.catalogue == 'laced'){
            req.locals.body = await service.bridge.laced.search.getAll(req.query)
        }
        else {
            req.locals.body = await service.product.getAll(req.user, req.query.offset, req.query.limit, req.query.sort, req.query)
            req.user.can('product.view', req.locals.body.rows)
        }
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/:ID", async (req, response, next) => {
    try {
        req.locals.body = await service.product.getById(req.user, req.params.ID)
        if (!req.locals.body) throw {status: 404, message: "Product not found"}
        req.user.can('product.view', req.locals.body)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/variants/all", async (req, response, next) => {
    try {
        req.locals.body = await service.product.variantsGetAll(req.user, req.query.offset, req.query.limit, req.query.sort, req.query)
        req.user.can('product.view', req.locals.body.rows.map(v => v.product))
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/laced/:lacedID", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.laced.search.getById(req.params.lacedID)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/variant/:ID", async (req, response, next) => {
    try {
        req.locals.body = await service.product.getVariantById(req.params.ID)
        if (!req.locals.body) throw {status: 404, message: "Variant not found"}
        req.user.can('product.view', req.locals.body.product)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/variants/:ID/match", async (req, response, next) => {
    try {
        req.locals.body = await service.product.getVariantMatch(
            req.user,
            req.params.ID
        )
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/", async (req, response, next) => {
    const newProduct = req.body
    try {
        await db.sequelize.transaction(async tx => {
            req.user.can('product.create', newProduct)
            req.locals.body = await service.product.create(req.user, newProduct)
            await service.product.createEgress(req.user, req.locals.body.ID)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/search", async (req, response, next) => {
    try {
        req.locals.body = await service.product.search(req.user, req.body.search, req.body)
        req.user.can('product.view', req.locals.body.rows)
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post('/:ID/variants', async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const user = req.user
            const product = await db.product.findOne({where: {ID: req.params.ID}})
            req.user.can('product.update', product)
            const newVariants = await service.product.addVariants(
                user,
                req.params.ID,
                req.body.variants
            )
            req.locals.body = await service.product.createVariantsEgress(user, newVariants.map(variant => variant.ID))
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post('/:ID/images', async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const user = req.user
            const product = await db.product.findOne({where: {ID: req.params.ID}})
            req.user.can('product.update', product)
            req.locals.body = await service.product.addImages(
                user,
                req.params.ID,
                req.body.images
            )
            await service.product.createImagesEgress(user, req.locals.body.map(img => img.ID))
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post('/import', async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            // check if user can import (create) product into its own account
            req.user.can('product.create', req.user)
            const [product, hasBeenCreated] = await service.product.import(req.user, req.body.productID)
            if (hasBeenCreated) {
                await service.product.createEgress(req.user, product.ID)
            }
            req.locals.body = product
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.post("/:productID/variants/:variantID/match", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const product = await db.product.findOne({where: {ID: req.params.productID}})
            req.user.can('product.update', product)
            req.locals.body = await service.product.createVariantMatch(
                req.user,
                req.params.variantID,
                req.body.externalProductVariantID
            )
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.put("/:ID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const product = await db.product.findOne({where: {ID: req.params.ID}})
            req.user.can('product.update', product)
            req.locals.body = await service.product.update(req.user, req.params.ID, req.body)
            // Update product on synced platforms
            await service.product.updateEgress(req.user, req.locals.body.ID)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.put('/:ID/variants', async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const user = req.user
            const product = await db.product.findOne({where: {ID: req.params.ID}})
            req.user.can('product.update', product)
            const variants = await service.product.updateVariants(
                user,
                req.params.ID,
                req.body.variants
            )
            req.locals.body = await service.product.updateVariantsEgress(user, variants.map(variant => variant.ID))
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.put('/:ID/images', async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const user = req.user
            const product = await db.product.findOne({where: {ID: req.params.ID}})
            req.user.can('product.update', product)
            req.locals.body = await service.product.updateImages(
                req.user,
                req.params.ID,
                req.body.images
            )
            await service.product.updateImagesEgress(user, req.locals.body.map(image => image.ID))
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.delete('/:ID/variants', async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const user = req.user
            const product = await db.product.findOne({where: {ID: req.params.ID}})
            req.user.can('product.update', product)
            const productVariantIDs = req.query.variantIDs.split(",")
            const variantsToDelete = await Promise.all(productVariantIDs.map(variantID => service.product.getVariantById(variantID)))
            req.locals.body = await service.product.deleteVariants(
                user,
                req.params.ID,
                productVariantIDs
            )

            await service.product.deleteVariantsEgress(user, variantsToDelete)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.delete('/:ID/images', async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            const user = req.user
            const product = await db.product.findOne({where: {ID: req.params.ID}})
            req.user.can('product.update', product)
            const productImagesIDs = req.query.imageIDs.split(",")
            const imagesToDelete = await Promise.all(productImagesIDs.map(imageID => service.product.getImageById(user, imageID)))

            req.locals.body = await service.product.deleteImages(
                user,
                req.params.ID,
                productImagesIDs
            )

            await service.product.deleteImagesEgress(user, imagesToDelete)
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

//deprecated - use POST /v2/:productID/variants/:variantID/match to ccreate and to retrieve is available in the product itself
// this is still here because is convenient during the cypress tests since it automatically matches the products. will need to be removed one day
router.post('/variants/:variantID/match', async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.product.matchVariant(
                req.user,
                req.params.variantID,
                req.body.externalAccountID,
                req.body.externalProductVariantID
            )
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

module.exports = router;
