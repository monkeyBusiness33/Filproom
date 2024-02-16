const db = require('../libs/db')
const Op = require('sequelize').Op;
const logger=require('../libs/logger.js')
const service = require('./main')
const utils = require('../libs/utils')
const configs = require('../configs')
const axios = require('axios')
const moment = require("moment/moment");

exports.getAll = async (user, offset, limit, sort, params) => {
    let query = {
        where: [],
        offset: parseInt(offset) || 0,
        limit: parseInt(limit) || 50,
        distinct: true,
        order: [['ID', 'DESC']],
    }

    for (var paramKey in params) {
        if (['offset', 'limit'].includes(paramKey)) {
            continue
        }

        switch (paramKey) {
            case 'sort': 
                query = utils.addSorting(query, params['sort'])
                break;
                
            default:
                query = utils.addFilter(query, paramKey, params[paramKey])
                break;
        }
    }

    query.include = [
        { model: db.user, as: 'user', required: true, attributes: ['ID', 'email']},
    ]

    let results = await db.notification.findAndCountAll(query)

    return results
}

exports.saleOrderCreated = async (user, orderID) => {
    logger.info(`notification.saleOrderCreated`, {data: {orderID}})

    /**
     * Getting data needed to build the email and the notification
     */
    const serviceUser = await service.account.serviceUser(user.accountID);
    const order = await service.order.getOne(user, orderID);

    //get users to notify
    const query = await service.notification.getAll(serviceUser, 0, 9999, null, {accountID: order.accountID})
    const usersToNotifyByEmail = [... new Set(query.rows.filter(n => n.userID != user.ID && n.user.email))];
    const usersToNotifyByNotification = await db.user.findAll({where: {accountID: order.accountID, deviceID: {[Op.not]: null}}});

    /**
     * Calculate order total amount to be shown in the email
     */
    const orderTotalAmount = order.orderLineItems.filter(oli => !oli.canceledAt).reduce((tot, oli) => tot += parseFloat(oli.price), 0);

    /**
     * Construct email content and prepare the request to send it
     */
    const emailConfig = {
        accountLogoUrl: `https://storage.googleapis.com/production-wiredhub/resources/${serviceUser.account.logo}`,
        message: `Hello! <br><br>A new Order has just been created on the platform. Here the details:`,
        'orderURL':          `https://app.fliproom.io/orders/${order.ID}`,
        'sale-channel':      order.saleChannel.title,
        'order-number':      order.ID,
        'order-ref':         (order.reference1 || '').toUpperCase(),
        'account':           '',
        'user':              '',
        'user-email':        '',
        'quantity':          order.quantity,
        'weight':            order.weight,
        'volume':            order.volume,
        'price':             `${utils.currencySymbol(serviceUser.account.currency)} ${orderTotalAmount}`,
        details: order.orderLineItems.reduce((list, oli) => {
            const invRec = list.find(_ir => _ir.inventoryID == oli.inventoryID);
            if (invRec) {
                invRec.qty += 1;
            } else {
                list.push({
                    oliAccount: oli.item.account.name.toUpperCase(),
                    inventoryID: oli.inventoryID,
                    itemDescription: `${oli.product.title} ${oli.variant.name}`.toUpperCase(),
                    qty: 1,
                    unitPrice: `${utils.currencySymbol(serviceUser.account.currency)} ${oli.price}`
                });
            }
            return list;
        }, []),
    };
    const emailTemplate = utils.buildEmailMessage('order-created-email-template', emailConfig);
    const emailRequest = {
        to: usersToNotifyByEmail.map(notification => notification.user.email),
        subject: `[NEW ORDER] Order ID ${order.ID} | Reference ${(order.reference1 || '').toUpperCase()}`,
        body: emailTemplate,
        attachments: []
    };

    const pushNotificationData = {
        notificationType: 'sale-order/created',
        action: 'REDIRECT',
        panel: '/orders/',
        id: order.ID.toString(),
        title: 'New Sale! 🚀', 
        body: `New sale #${order.ID} for ${order.quantity} items totaling ${utils.currencySymbol(serviceUser.account.currency)} ${orderTotalAmount}`
    };

    /**
     * If we are in local environment, we don't send the email or the notification
     */
    if (configs.environment == 'local') {
        return {email: emailRequest, notification: pushNotificationData};
    }

    /**
     * Send the email to all the users that need to be notified
     */
    if (usersToNotifyByEmail.length > 0) {
        try {
            await service.bridge.sendGrid.sendEmail(emailRequest);
        } catch (e) {
            console.log(e.message)
            throw {status: 500, message: 'Error sending order notification email', errors: emailRequest};
        }
    }

    if (usersToNotifyByNotification.length > 0) {
        await service.gcloud.pushNotification(usersToNotifyByNotification.map(user => user.deviceID), pushNotificationData);
    }
}

exports.saleOrderCanceled = async (user, orderID) => {
    logger.info(`notification.saleOrderCanceled`)

    /**
     * Getting data needed to build the email and the notification
     */
    const serviceUser = await service.account.serviceUser(user.accountID);
    const order = await service.order.getOne(user, orderID);

    //get users to notify
    const query = await service.notification.getAll(serviceUser, 0, 9999, null, {accountID: order.accountID})
    const usersToNotifyByEmail = [... new Set(query.rows.filter(n => n.userID != user.ID && n.user.email))];
    const usersToNotifyByNotification = await db.user.findAll({where: {accountID: order.accountID, deviceID: {[Op.not]: null}}});

    /**
     * Construct email content and prepare the request to send it
     */
    const emailConfig = {
        accountLogoUrl: `https://storage.googleapis.com/production-wiredhub/resources/${serviceUser.account.logo}`,
        message: `Hello! <br><br>An order line item has been rejected. Here the details:`,
        'orderURL':          `https://app.fliproom.io/orders/${order.ID}`,
        'order-number':      order.ID,
        'order-ref':         (order.reference1 || '').toUpperCase(),
    };
    const emailTemplate = utils.buildEmailMessage('order-rejected-email-template', emailConfig);
    const emailRequest = {
        to: usersToNotifyByEmail.map(notification => notification.user.email),
        subject: `[REJECTED] Order ID ${order.ID} | Reference ${(order.reference1 || '').toUpperCase()}`,
        body: emailTemplate,
        attachments: []
    };

    const pushNotificationData = {
        notificationType: 'sale-order/canceled',
        action: 'REDIRECT',
        panel: '/orders/',
        id: order.ID.toString(),
        title: 'Order Canceled!', 
        body: 'Oops! The order has been canceled. 🥲'
    };

    /**
     * If we are in local environment, we don't send the email or the notification
     */
    if (configs.environment == 'local') {
        return {email: emailRequest, notification: pushNotificationData};
    }

    /**
     * Send the email to all the users that need to be notified
     */
    if (usersToNotifyByEmail.length > 0) {
        try {
            await service.bridge.sendGrid.sendEmail(emailRequest);
        } catch (e) {
            console.log(e.message)
            throw {status: 500, message: 'Error sending order notification email', errors: emailRequest};
        }
    }


    if (usersToNotifyByNotification.length > 0) {
        await service.gcloud.pushNotification(usersToNotifyByNotification.map(user => user.deviceID), pushNotificationData);
    }
}

exports.saleOrderItemCanceled = async (user, orderLineItemID) => {
    logger.info(`notification.saleOrderItemCanceled`)

    /**
     * Getting data needed to build the email and the notification
     */
    const orderLineItem = await service.orderLineItem.getOne(user, orderLineItemID);
    // If item sold has been cancelled by the item owner, notify the order owner the item. If item cancelled by consignor owing the item, notify the order owner.
    let accountIDToNotify;
    if (user.accountID == orderLineItem.item.accountID) {
        accountIDToNotify = orderLineItem.order.accountID;
    } else {
        accountIDToNotify = user.accountID;
    }

    //get users to notify
    //const query = await service.notification.getAll(serviceUser, 0, 9999, null, {accountID: tx.toAccount.ID})
    const usersToNotifyByEmail = []//[... new Set(query.rows.filter(n => n.userID != user.ID && n.user.email))];
    const usersToNotifyByNotification = await db.user.findAll({where: {accountID: accountIDToNotify, deviceID: {[Op.not]: null}}});

    /**
     * Construct email content and prepare the request to send it
     */
    const emailRequest = {
    };

    const pushNotificationData = {
        notificationType: 'order-line-item/canceled',
        action: 'REDIRECT',
        panel: '/orders/',
        id: orderLineItem.order.ID.toString(),
        title: 'Order Item Cancelled',
        body: 'Your order item has been cancelled 🚫'
    };

    /**
     * If we are in local environment, we don't send the email or the notification
     */
    if (configs.environment == 'local') {
        return {email: emailRequest, notification: pushNotificationData};
    }

    /**
     * Send the email to all the users that need to be notified
     */
    if (usersToNotifyByEmail.length > 0) {
        try {
            await service.bridge.sendGrid.sendEmail(emailRequest);
        } catch (e) {
            console.log(e.message)
            throw {status: 500, message: 'Error sending order notification email', errors: emailRequest};
        }
    }


    if (usersToNotifyByNotification.length > 0) {
        await service.gcloud.pushNotification(usersToNotifyByNotification.map(user => user.deviceID), pushNotificationData);
    }
}

exports.saleOrderPendingReminder = async (serviceUser, orderID, type='12h') => {
    logger.info(`notification.saleOrderPendingReminder`)

    /**
     * Getting data needed to build the email and the notification
     */
    const order = await service.order.getOne(serviceUser, orderID);

    //get users to notify
    const query = await service.notification.getAll(serviceUser, 0, 9999, null, {eventName: 'sale-order/pending-reminder', accountID: order.accountID})
    const usersToNotifyByEmail = []//[... new Set(query.rows.filter(n => n.userID != user.ID && n.user.email))];
    const usersToNotifyByNotification = await db.user.findAll({where: {accountID: order.accountID, deviceID: {[Op.not]: null}}});

    const emailRequest = {
    };

    const pushNotificationData = {
        action: 'REDIRECT',
        panel: '/orders/',
        id: order.ID.toString(),
        title: 'Sale Pending! 🕕',
    }

    switch (type) {
        case '12h':
            pushNotificationData.notificationType = 'sale-order/pending-reminder-12h';
            pushNotificationData.body = '12 hours passed, please accept your order soon! ';
            break;
        case '24h':
            pushNotificationData.notificationType = 'sale-order/pending-reminder-24h';
            pushNotificationData.body = '24 hours passed, please accept your order soon! ';
            break;
    }

    /**
     * If we are in local environment, we don't send the email or the notification
     */
    if (configs.environment == 'local') {
        return {email: emailRequest, notification: pushNotificationData};
    }

    if (usersToNotifyByEmail.length > 0) {
        try {
            await service.bridge.sendGrid.sendEmail(emailRequest);
        } catch (e) {
            console.log(e.message)
            throw {status: 500, message: 'Error sending order notification email', errors: emailRequest};
        }
    }


    if (usersToNotifyByNotification.length > 0) {
        await service.gcloud.pushNotification(usersToNotifyByNotification.map(user => user.deviceID), pushNotificationData);
    }
}

exports.fulfillmentPendingReminder = async (serviceUser, orderID, type='24h') => {
    logger.info(`notification.fulfillmentPendingReminder`)

    /**
     * Getting data needed to build the email and the notification
     */
    const order = await service.order.getOne(serviceUser, orderID);

    //get users to notify
    const query = await service.notification.getAll(serviceUser, 0, 9999, null, {eventName: 'sale-order/fulfill-reminder', accountID: order.accountID})
    const usersToNotifyByEmail = []//[... new Set(query.rows.filter(n => n.userID != user.ID && n.user.email))];
    const usersToNotifyByNotification = await db.user.findAll({where: {accountID: order.accountID, deviceID: {[Op.not]: null}}});

    const emailRequest = {
    };

    const pushNotificationData = {
        action: 'REDIRECT',
        panel: '/orders/',
        id: order.ID.toString(),
        title: 'Fulfill your order! 🕕',
    }

    switch (type) {
        case '24h':
            pushNotificationData.notificationType = 'sale-order/fulfill-reminder-24h';
            pushNotificationData.body = '24 hours passed, fulfill order to finish sale';
            break;
        case '48h':
            pushNotificationData.notificationType = 'sale-order/fulfill-reminder-48h';
            pushNotificationData.body = '48 hours passed, fulfill order to finish sale';
            break;
        case '72h':
            pushNotificationData.notificationType = 'sale-order/fulfill-reminder-72h';
            pushNotificationData.body = '72 hours passed, fulfill order to finish sale';
            break;
    }

    /**
     * If we are in local environment, we don't send the email or the notification
     */
    if (configs.environment == 'local') {
        return {email: emailRequest, notification: pushNotificationData};
    }

    if (usersToNotifyByEmail.length > 0) {
        try {
            await service.bridge.sendGrid.sendEmail(emailRequest);
        } catch (e) {
            console.log(e.message)
            throw {status: 500, message: 'Error sending order notification email', errors: emailRequest};
        }
    }


    if (usersToNotifyByNotification.length > 0) {
        await service.gcloud.pushNotification(usersToNotifyByNotification.map(user => user.deviceID), pushNotificationData);
    }
}

exports.inventoryUploadReminder = async (account, type='24h') => {
    logger.info(`notification.inventoryUploadReminder`)

    /**
     * Getting data needed to build the email and the notification
     */
    const serviceUser = await service.account.serviceUser(account.ID);

    //get users to notify
    const query = await service.notification.getAll(serviceUser, 0, 9999, null, {eventName: 'inventory/upload-reminder', accountID: account.ID})
    const usersToNotifyByEmail = []//[... new Set(query.rows.filter(n => n.userID != user.ID && n.user.email))];
    const usersToNotifyByNotification = await db.user.findAll({where: {accountID: account.ID, deviceID: {[Op.not]: null}}});

    const emailRequest = {
    };

    const pushNotificationData =  {
        action: 'REDIRECT',
        panel: '/inventory/',
        title: 'Upload some inventory! 🕕',
    }

    switch (type) {
        case '24h':
            pushNotificationData.notificationType = 'inventory/upload-reminder-24h';
            pushNotificationData.body = '24 hours passed, upload inventory to start earning 💸';
            break;
        case '72h':
            pushNotificationData.notificationType = 'inventory/upload-reminder-72h';
            pushNotificationData.body = '72 hours passed, upload inventory to start earning 💸';
            break;
        case '1w':
            pushNotificationData.notificationType = 'inventory/upload-reminder-1w';
            pushNotificationData.body = '1 week passed, upload inventory to start earning 💸';
            break;
    }

    /**
     * If we are in local environment, we don't send the email or the notification
     */
    if (configs.environment == 'local') {
        return {email: emailRequest, notification: pushNotificationData};
    }

    if (usersToNotifyByEmail.length > 0) {
        try {
            await service.bridge.sendGrid.sendEmail(emailRequest);
        } catch (e) {
            console.log(e.message)
            throw {status: 500, message: 'Error sending order notification email', errors: emailRequest};
        }
    }


    if (usersToNotifyByNotification.length > 0) {
        await service.gcloud.pushNotification(usersToNotifyByNotification.map(user => user.deviceID), pushNotificationData);
    }
}

exports.paymentTriggered = async (user, txID) => {
    logger.info(`notification.paymentTriggered`)
    /**
     * Getting data needed to build the email and the notification
     */
    const serviceUser = await service.account.serviceUser(user.accountID);
    const tx = await service.transaction.getById(serviceUser, txID);
    const order = tx.order;

    //get users to notify
    const query = await service.notification.getAll(serviceUser, 0, 9999, null, {accountID: tx.toAccount.ID})
    //TODO: remove hardcoded emails
    const usersToNotifyByNotification = await db.user.findAll({where: {accountID: tx.toAccount.ID, deviceID: {[Op.not]: null}}});

    // Email recipients
    const usersToNotifyByEmail = ['georgina@theeditldn.com','samantha@theeditldn.com', 'r.sauchelli@wiredhub.io', 's.rosa@wiredhub.io']//[... new Set(query.rows.filter(n => n.userID != user.ID && n.user.email))];
    //if order has aconsignee and consignee.email is not null, add it to the list of users to  email
    if (order.consignee && order.consignee.email) {
        usersToNotifyByEmail.push(order.consignee.email);
    }

    // download customer invoice
    const orderInvoice =  await service.order.downloadCustomerInvoice(serviceUser, order.ID)

    const pushNotificationData = {
        notificationType: 'payment/triggered',
        action: 'REDIRECT',
        panel: '/orders/',
        id: tx.orderID.toString(),
        title: 'Payment Confirmed!',
        body: `Payment of ${utils.currencySymbol(tx.currency)} ${tx.netAmount} for order #${tx.orderID} has started. It will soon be confirmed`
    };

    //get personal shopper name and make it title case
    let personalShopper = order.consignor.name + ' ' + order.consignor.surname;
    personalShopper = personalShopper.toLowerCase().split(' ').map((s) => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');
    //Generate email content
    const emailRequest = {
        to: usersToNotifyByEmail,
        subject: `The Edit Ldn Payment Confirmation - Invoice ${order.ID}`,
        attachments: [
            {
                content: orderInvoice.invoiceBase64.replace(/^data:image\/png;base64,/, ""),
                filename: `invoice-${order.ID}.png`,
                type: "application/png",
                disposition: "attachment",
            }
        ],
        template: {
            id: "sale-invoice-v2",
            data: {
                "orderID": order.ID,
                "invoiceID": order.ID,
                "supportEmail": "personalshopping@theeditldn.com",
                "personalShopper": personalShopper,
                "createdAt": moment(order.createdAt).format('D/M/yyyy'),
                "subject": `The Edit Ldn Payment Confirmation - Invoice ${order.ID}`,
                "orderLink": utils.getStripeRedirectRootURL()+ `share/order/${order.ID}?accessToken=${order.accessToken}`,
            }
        }
    }

    /**
     * If we are in local environment, we don't send the email or the notification
     */
    if (configs.environment == 'local') {
        return {email: emailRequest, notification: pushNotificationData};
    }

    /**
     * Send the email to all the users that need to be notified
     */
    if (usersToNotifyByEmail.length > 0) {
        await service.bridge.sendGrid.sendEmail(emailRequest)
    }


    if (usersToNotifyByNotification.length > 0) {
        await service.gcloud.pushNotification(usersToNotifyByNotification.map(user => user.deviceID), pushNotificationData);
    }
}

exports.paymentCaptured = async (user, txID) => {

    /**
     * Triggered when the funds arrive on the Fliproom stripe account (may not be available to payout)
     *
     * Getting data needed to build the email and the notification
     * !! currently only called for personal shopping orders
     */
    const serviceUser = await service.account.serviceUser(user.accountID);
    const tx = await service.transaction.getById(serviceUser, txID);

    //get users to notify
    const query = await service.notification.getAll(serviceUser, 0, 9999, null, {accountID: tx.toAccount.ID})
    const usersToNotifyByEmail = []//[... new Set(query.rows.filter(n => n.userID != user.ID && n.user.email))];
    const usersToNotifyByNotification = await db.user.findAll({where: {accountID: tx.toAccount.ID, deviceID: {[Op.not]: null}}});

    /**
     * Construct email content and prepare the request to send it
     */
    const emailRequest = {
    };

    const pushNotificationData = {
        notificationType: 'payment/captured',
        action: 'REDIRECT',
        panel: '/orders/',
        id: tx.orderID.toString(),
        title: 'Payment Captured!',
        body: `Payment of ${utils.currencySymbol(tx.currency)} ${tx.netAmount} for order #${tx.orderID} captured. It will soon be available 💸`
    };

    /**
     * If we are in local environment, we don't send the email or the notification
     */
    if (configs.environment == 'local') {
        return {email: emailRequest, notification: pushNotificationData};
    }

    /**
     * Send the email to all the users that need to be notified
     */
    if (usersToNotifyByEmail.length > 0) {
        try {
            await service.bridge.sendGrid.sendEmail(emailRequest);
        } catch (e) {
            console.log(e.message)
            throw {status: 500, message: 'Error sending order notification email', errors: emailRequest};
        }
    }


    if (usersToNotifyByNotification.length > 0) {
        await service.gcloud.pushNotification(usersToNotifyByNotification.map(user => user.deviceID), pushNotificationData);
    }
}

exports.payoutTriggered = async (user, txID) => {
    logger.info(`notification.payoutTriggered`)

    /**
     * Getting data needed to build the email and the notification
     */
    const serviceUser = await service.account.serviceUser(user.accountID);
    const tx = await service.transaction.getById(serviceUser, txID);

    //get users to notify
    const query = await service.notification.getAll(serviceUser, 0, 9999, null, {accountID: tx.toAccount.ID})
    const usersToNotifyByEmail = []//[... new Set(query.rows.filter(n => n.userID != user.ID && n.user.email))];
    const usersToNotifyByNotification = await db.user.findAll({where: {accountID: tx.toAccount.ID, deviceID: {[Op.not]: null}}});

    /**
     * Construct email content and prepare the request to send it
     */
    const emailRequest = {
    };

    const pushNotificationData = {
        notificationType: 'payout/triggered',
        action: 'REDIRECT',
        panel: '/orders/',
        id: tx.orderID.toString(),
        title: 'Payment Received 💸',
        body: `Payment of ${utils.currencySymbol(tx.currency)} ${tx.netAmount} for order #${tx.orderID} has been transferred to your account`
    };

    /**
     * If we are in local environment, we don't send the email or the notification
     */
    if (configs.environment == 'local') {
        return {email: emailRequest, notification: pushNotificationData};
    }

    /**
     * Send the email to all the users that need to be notified
     */
    if (usersToNotifyByEmail.length > 0) {
        try {
            await service.bridge.sendGrid.sendEmail(emailRequest);
        } catch (e) {
            console.log(e.message)
            throw {status: 500, message: 'Error sending order notification email', errors: emailRequest};
        }
    }


    if (usersToNotifyByNotification.length > 0) {
        await service.gcloud.pushNotification(usersToNotifyByNotification.map(user => user.deviceID), pushNotificationData);
    }
}
