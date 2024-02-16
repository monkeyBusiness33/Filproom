const express = require('express');
const router = express.Router();
const logger=require('../libs/logger.js')
const service = require('../services/main')
const db = require("../libs/db");



router.get("/", async (req, response, next) => {
    try {
        const accounts = await service.account.getAll(req.user.ID, req.query.offset, req.query.limit, req.query.sort, req.query)
        response.status(200).json(accounts)
    } catch(e) {
        next(e)
    }
    return
})

router.get("/:accountID", async (req, response, next) => {
    try {
        const account = await service.account.getOne(req.user, req.params.accountID)
        response.status(200).json(account)
    } catch(e) {
        next(e)
    }
    return
})

router.get("/:accountID/users", async (req, response, next) => {
    try {
        req.query.accountID = req.params.accountID
        const users = await service.user.getAll(req.user, req.query.offset, req.query.limit, req.query)
        response.status(200).json(users)
    } catch (e) {
        next(e)
    }
    return
})

router.get("/:accountID/analytics/:analyticsName", async (req, response, next) => {
    try {
        const data = await service.account.analytics(req.user, req.params.accountID, req.params.analyticsName, req.query)
        response.status(200).json(data)
    } catch (e) {
        next(e)
    }
    return
})

router.get("/:accountID/reports", async (req, response, next) => {
    try {
        const data = await service.account.getReportsMetadata(req.user, req.params.accountID, req.query)
        response.status(200).json(data)
    } catch (e) {
        next(e)
    }
    return
})

router.get("/:accountID/reports/:reportID", async (req, response, next) => {
    try {
        const data = await service.account.getReport(req.user, req.params.accountID, req.params.reportID)
        response.status(200).json(data)
    } catch (e) {
        next(e)
    }
    return
})

router.post("/:accountID/reports/:reportName", async (req, response, next) => {
    try {
        const data = await service.account.createReport(req.user, req.params.accountID, req.params.reportName, req.body)
        response.status(200).json(data)
    } catch (e) {
        next(e)
    }
    return
})

router.put("/:ID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.account.update(req.user, req.params.ID, req.body)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.delete("/:ID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.account.delete(req.user, req.params.ID)
        })
        return next()
    } catch (e) {
        return next(e)
    }
})

router.get("/:accountID/item-barcodes", async (req, response, next) => {
    try {
        const pdfBuffer = await service.account.generateItemBarcodes(req.user, req.params.accountID, req.query.quantity)
        response.writeHead(200, {
            'Content-Length': Buffer.byteLength(pdfBuffer),
            'Content-Type': 'application/pdf',
            'Content-disposition': `attachment; filename=barcodes.pdf`
        }).end(pdfBuffer);
    } catch(e) {
        next(e)
    }
    return
})

/**
 * Consignment
 */
router.get("/:accountID/consignor/:consignorAccountID", async (req, response, next) => {
    try {
        req.locals.body = await service.account.getConsignorInfo(req.user, req.params.accountID, req.params.consignorAccountID)
        return next()
    } catch(e) {
        return next(e)
    }
    return
})

router.get("/:accountID/consignor/:consignorAccountID/bank-details/:counterpartyId", async (req, response, next) => {
    try {
        req.locals.body = await service.account.getConsignorBankDetails(req.user, req.params.counterpartyId)
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/:accountID/consignor/:consignorAccountID/bank-details", async (req, response, next) => {
    try {
        req.body.accountID = req.params.accountID
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.account.addConsignorBankDetails(req.user, req.body)
        })
        return next()
    } catch(e) {
        return next(e)
    }
})

router.put("/:accountID/consignor/:consignorAccountID/sale-channels/:saleChannelID", async (req, response, next) => {
    try {
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.account.updateConsignorSaleChannelStatus(req.user, req.params.consignorAccountID, req.params.saleChannelID, req.body.status)
        })
        return next()
    } catch(e) {
        return next(e)
    }
    return
})

router.delete("/:accountID/consignor/:consignorAccountID/bank-details", async (req, response, next) => {
    try {
        req.body.accountID = req.params.accountID
        await db.sequelize.transaction(async tx => {
            req.locals.body = await service.account.deleteConsignorBankDetails(req.user, {
                accountID: req.params.accountID,
                gateway: req.query.gateway
            })
        })
        return next()
    } catch(e) {
        return next(e)
    }
    return
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

/**
 * REVOLUT
 */
router.get("/:accountID/revolut/balance", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.revolut.getAccounts(req.user, req.params.accountID)
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/:accountID/revolut/setup", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.revolut.generateFirstAccessToken(req.user, req.body)
        return next()
    } catch(e) {
        return next(e)
    }
})

router.post("/:accountID/revolut/topup", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.revolut.topup(req.user, req.body)
        return next()
    } catch(e) {
        return next(e)
    }
})


/**
 * STRIPE
 */

router.get("/:accountID/stripe/balance", async (req, response, next) => {
    try {
        req.locals.body = await service.account.getStripeBalance(req.user, req.params.accountID)
        return next()
    } catch(e) {
        next(e)
    }
    return
})

router.get("/:accountID/stripe/account", async (req, response, next) => {
    try {
        req.locals.body = await service.account.getStripeAccount(req.user, req.params.accountID)
        return next()
    } catch(e) {
        next(e)
    }
    return
})

router.get("/:accountID/stripe/links/:linkName", async (req, response, next) => {
    /**
     * Build Stripe Links given account ID
     */
    try {
        req.locals.body = await service.account.getStripeLinks(req.params.accountID, req.params.linkName, req.query)
        return next()
    } catch(e) {
        next(e)
    }
    return
})

router.post("/:accountID/stripe/connect-account-setup", async (req, response, next) => {
    try {
        req.locals.body = await service.bridge.stripe.connectAccount.setup(req.user, req.body)
        return next()
    } catch(e) {
        return next(e)
    }
})

module.exports = router;
