const db = require('../libs/db')
const Op = require('sequelize').Op;
const service = require('./main')
const utils = require('../libs/utils');
const configs = require('../configs')
const axios = require('axios');
const moment = require('moment')
const logger = require('../libs/logger');
const {v1: uuidv1} = require("uuid");

exports.getById = async (user, txId) => {
    const query = {
        where: {
            ID: txId
        },
        include: [
            { model: db.user, as: 'user', as: 'processedByUser'},
            { model: db.order, as: 'order', include: [
                { model: db.address, as: 'consignee', required: false },
                { model: db.address, as: 'consignor', required: false },
                {model: db.status, as: 'status'},
                {model: db.saleChannel, as: 'saleChannel'}
            ]},
            { model: db.account, as: 'fromAccount'},
            { model: db.account, as: 'toAccount'},
            { model: db.orderLineItem, as: 'orderLineItem', include: [
                {model: db.product, as: 'product'},
                {model: db.productVariant, as: 'variant'},
            ]},
            { model: db.fulfillment, as: 'fulfillment'},
            { model: db.transaction, as: 'parentTx'},
            { model: db.transaction, as: 'childTxs'}
        ]
    }

    return db.transaction.findOne(query)
}

exports.getAll = async (user, offset, limit, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [
            ['ID', 'desc'] //from the oldest to most recent
        ],
    }

    query.include = [
        { model: db.order, as: 'order', required: true, include: [
            {model: db.orderType, as: 'type'},
            {model: db.saleChannel, as: 'saleChannel'},
        ]},
        { model: db.account, as: 'fromAccount'},
        { model: db.account, as: 'toAccount'},
        { model: db.orderLineItem, as: 'orderLineItem', include: [
            {model: db.product, as: 'product'},
            {model: db.status, as: 'status'},
        ]},
        { model: db.fulfillment, as: 'fulfillment'},
    ]

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }
        switch (paramKey) {
            case 'sort': 
                query = utils.addSorting(query, params['sort'])
                break;
            case 'search':
                query.where.push({[Op.or]: [
                    {'$transaction.ID$':    {[Op.substring]: params.search}},
                    {'$transaction.type$':    {[Op.substring]: params.search}},
                    {'$transaction.status$':    {[Op.substring]: params.search}},
                    {'$transaction.grossAmount$':    {[Op.substring]: params.search}},
                    {'$transaction.orderID$':    {[Op.substring]: params.search}},
                    {'$transaction.gateway$':    {[Op.substring]: params.search}},
                    {'$transaction.reference$':    {[Op.substring]: params.search}},
                ]})
                break;
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    let results = await db.transaction.findAndCountAll(query)
    return results
}

exports.create = async (user, body) => {
    /**
     * body is a list of transactions: transaction[]
     * 
     * Transaction {
     *  grossAmount:        number,
     *  currency:      string,
     *  type:          string,
     *  orderID:       number
     *  orderLineItemID: number | optional - order line item linked to the transaction (for payouts transactions)
     *  fulfillmentID  number  | optional - fulfillment linked to the transaction (for shipping transactions)
     *  fromAccountID: number | optional
     *  toAccountID:   number | optional
     *  status:        string | optional [processing, canceled, paid] (default unpaid)
     *  reference:     string | optional
     *  paymentMethod: string | optional [cash, card]
     *  gateway:       string | optional [stripe, paypal, fliproom, hyperwallet]
     * }
     * 
     */

    logger.info(`Generating Transactions`, {data: body})
    
    const queries = []
    body.forEach((tx, i) => {
        if (tx.accountID == undefined) throw {status: 500, message: `accountID is required for transaction idx ${i}`}
        if (tx.grossAmount == undefined) throw {status: 500, message: `grossAmount is required for transaction idx ${i}`}
        if (!tx.currency) throw {status: 500, message: `Currency is required for transaction idx ${i}`}

        const _body = {
            accountID:      tx.accountID,
            grossAmount:   (tx.grossAmount || tx.amount) || 0, // need the "|| 0" at the end to avoid null/undefined values as grossAmount if 0 and tx.amount undefined, JS will otherwise choose undefined
            feesAmount:    tx.feesAmount || 0,
            currency:      tx.currency.trim().toLowerCase(),
            type:          tx.type,
            orderID:       tx.orderID,
            orderLineItemID: tx.orderLineItemID,
            fulfillmentID: tx.fulfillmentID,
            fromAccountID: tx.fromAccountID,
            toAccountID:   tx.toAccountID,
            reference:     tx.reference,
            paymentMethod: tx.paymentMethod,
            gateway:       tx.gateway,
        }

        _body.netAmount = _body.grossAmount - _body.feesAmount

        // if the transaciton has been already processed - set user processing it, status and completedAt
        if (tx.status == "paid") {
            _body.status = "paid"
            _body.processedByUserID = user.ID
            _body.completedAt = moment()
        }

        if (tx.status == "canceled") {
            _body.status = "canceled"
            _body.processedByUserID = user.ID
            _body.completedAt = moment()
        }

        if (tx.status == "processing") {
            _body.status = "processing"
            _body.processedByUserID = user.ID
        }

        queries.push(_body)
    })


    return db.transaction.bulkCreate(queries)
}

exports.update = async (user, txId, updates) => {
    logger.info(`Update Transaction`, {data: {Id: txId, updates: updates}})
    const tx = await service.transaction.getById(user, txId)

    if (updates.status == "paid") {
        // avoid to overwrite processedByUserID if status moved from processing => paid
        updates.processedByUserID = tx.processedByUserID == null ? user.ID : tx.processedByUserID
        updates.completedAt = moment()
        updates.processingAt = tx.processingAt ? tx.processingAt : moment()
    }

    if (updates.status == "processing") {
        updates.processedByUserID = user.ID
        updates.processingAt = moment()
    }

    if (updates.status == "reverted") {
        updates.processedByUserID = null
        updates.revertedAt = moment()
        updates.completedAt = null
        updates.processingAt = null
    }

    await db.transaction.update(updates, {where: {ID: txId}})
    return service.transaction.getById(user, txId)
}

exports.payManual = async (user, txId, cancellationFeeTxIds = []) => {
    logger.info(`tx.payManual`, {data: {Id: txId}});
    const tx = await service.transaction.getById(user, txId)

    const updates = {
        status: "paid",
        processedByUserID: user.ID,
        gateway: 'manual'
    }

    await Promise.all(cancellationFeeTxIds.map(ctxId => service.transaction.update(user, ctxId, Object.assign({}, updates, {paidInTransactionID: txId}))))

    await service.gcloud.publishEvent(user, 'payout/triggered', tx);

    return service.transaction.update(user, txId, updates)
}

exports.payWithStripe = async (user, txId, cancellationFeeTxIds = []) => {
    logger.info(`Pay Transaction with Stripe`, {data: {Id: txId, cancellationFeeTxIds: cancellationFeeTxIds}})
    const payoutTx = await service.transaction.getById(user, txId)

    const fromAccountAPIKey = (await db.account.findOne({where: {ID: payoutTx.fromAccountID}, attributes: ['stripeAPIKey']})).stripeAPIKey
    const stripeClient = require('stripe')(fromAccountAPIKey);

    //compute amount
    const cancellationFees = await db.transaction.findAll({where: {ID: cancellationFeeTxIds}})
    const totalAmount = parseFloat(payoutTx.grossAmount) - cancellationFees.reduce((acc, curr) => acc += parseFloat(curr.grossAmount), 0)
    const stripeAmount = Number((totalAmount * 100).toPrecision(15))

    const consignmentRecord = await db.consignment.findOne({where: {accountID: payoutTx.fromAccountID, consignorAccountID: payoutTx.toAccountID}})

    let stripeTransfer;
    logger.info(`Generating stripe transfer`)
    try {
        //generate stripe transfer from source account to destination
        stripeTransfer = await stripeClient.transfers.create({
            amount: stripeAmount,
            currency: 'gbp',
            destination: consignmentRecord.stripeAccountID,
            description: `${payoutTx.reference}`,
            transfer_group: `${payoutTx.reference}`,
        });
    } catch (e) {
        throw {status: 500, message: `Impossible to generate stripe transfer | ${e}`}
    }

    logger.info(`Generating stripe payout`)
    let updates = {}
    try {
        const payout = await stripeClient.payouts.create({
            amount:      stripeAmount,
            currency:    'gbp',
            method:      'standard',
            destination: consignmentRecord.stripeDefaultDestinationID,
            statement_descriptor: `${payoutTx.reference}`.slice(0, 22),
            description: `${payoutTx.reference}`,
        },{stripeAccount: consignmentRecord.stripeAccountID});

        updates.status = "processing"
        updates.stripeID = payout.id
        updates.gateway = "stripe"
    } catch (e) {
        // revert transfer if payout fails
        await stripeClient.transfers.createReversal(
            stripeTransfer.id,
            {amount: stripeAmount}
        );

        throw {status: 500, message: `Impossible to generate stripe payout | ${e}`}
    }
    
    await service.gcloud.publishEvent(user, "payout/triggered", payoutTx);

    await Promise.all(cancellationFeeTxIds.map(ctxId => service.transaction.update(user, ctxId, Object.assign({}, updates, {paidInTransactionID: txId}))))
    return service.transaction.update(user, txId, updates)
}

exports.payWithStripe_v2 = async (user, txId, opts = {fees: 0}) => {
    logger.info(`tx.payWithStripe_v2`, {data: {...opts, Id: txId}});
    const tx = await service.transaction.getById(user, txId)
    if (opts.fees == null) throw {status: 500, message: `fees is undefined. It should be a number if you want to apply fees`}
    
    const payableAmount = parseFloat(tx.grossAmount) - opts.fees;
    const updates = {
        status: "paid",
        gateway: 'stripe',
        feesAmount: opts.fees,
        netAmount: payableAmount,
    }

    await service.bridge.stripe.transfer.create(payableAmount, tx.currency, tx.toAccountID, tx.reference);

    await service.gcloud.publishEvent(user, "payout/triggered", tx);

    return service.transaction.update(user, txId, updates);
}

exports.payWithRevolut = async (user, txId, cancellationFeeTxIds = []) => {
    logger.info(`Pay Transaction with Revolut`, {data: {Id: txId, cancellationFeeTxIds: cancellationFeeTxIds}})
    const payoutTx = await service.transaction.getById(user, txId)

    //compute amount
    const cancellationFees = await db.transaction.findAll({where: {ID: cancellationFeeTxIds}})
    const totalAmount = parseFloat(payoutTx.grossAmount) - cancellationFees.reduce((acc, curr) => acc += parseFloat(curr.grossAmount), 0)

    let updates = {}
    try {
        logger.info(`Generating revolut transfer`)
        const body = {
            //revolut throws error if duplicated requestID. This can happen during testing when we clean the DB and reuse tx.ID but we need tx.ID on prod for ideopotency
            requestID: configs.environment == "prod" ? payoutTx.ID : uuidv1(), 
            originAccountID: payoutTx.fromAccountID,
            destinationAccountID: payoutTx.toAccountID,
            amount: totalAmount,
            currency:    'gbp',
            reference: payoutTx.reference,
        }
        const revolutTx = await service.bridge.revolut.pay(user, body)

        updates.status = revolutTx.status // the reovlut status to fliproom status mapping is done inside the bridge
        updates.revolutTransactionID = revolutTx.id
        updates.gateway = "revolut"
    } catch (e) {
        throw e
    }
    
    await Promise.all(cancellationFeeTxIds.map(ctxId => service.transaction.update(user, ctxId, Object.assign({}, updates, {paidInTransactionID: txId}))))
    await service.gcloud.publishEvent(user, "payout/triggered", payoutTx);

    return service.transaction.update(user, txId, updates)
}

exports.cancel = async (user, txId) => {
    logger.info(`Cancel Transaction`, {data: {Id: txId}})

    await db.transaction.update({
        status: "canceled",
        processedByUserID: user.ID,
        completedAt: moment()
    }, {
        where: {
            ID: txId
        }
    })
}

