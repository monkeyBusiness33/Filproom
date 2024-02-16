const logger = require("../../libs/logger");
const service = require("../main");
const db = require("../../libs/db");
const configs = require("../../configs");
const utils = require('../../libs/utils')

exports.account = {
    create: async (user, adminAccountID, stripeAuthID) => {
        const account = await db.account.findOne({where: {ID: user.accountID}})
        if (adminAccountID != 3 && !account.isConsignor) {
            throw {status: 400, message: "This functionality is not available yet"}
        }

        if (configs.environment != "prod") {
            return {
                id: "acct_1KZ2UQQYMyEkvfv2",
                external_accounts: {
                    data: [{
                        id: "ba_1KZ2VAQYMyEkvfv2dfL0cykv",
                    }]
                }
            }
        }

        const stripe = require('stripe')((await db.account.findOne({where: {ID: adminAccountID}})).stripeAPIKey)
    
        let connected_account_id
        try {
            const resp = await stripe.oauth.token({
                grant_type: 'authorization_code',
                code: stripeAuthID,
            })
            connected_account_id = resp.stripe_user_id;
        } catch (e) {
            throw {status: 500, message: "Error connecting to Stripe"}
        }
    
        let stripeAcc;
        try {
            stripeAcc = await stripe.accounts.retrieve(
                connected_account_id
            );
        } catch (e) {
            console.log(e)
            throw {status: 500, message: "Error retrieving Stripe account"}
        }
    
        return stripeAcc
    }
}

exports.subscription = {
    addUsage: async (subscriptionId, quantity, timestamp) => {
        console.log("addUsage", subscriptionId, quantity, timestamp)
        const stripe = require('stripe')(configs.apis.stripeUAE.apiKey);
        const subscription = await stripe.subscriptions.retrieve(
            subscriptionId
        );
        const subscriptionItemMetered = subscription.items.data.find(item => item.plan.usage_type == "metered")
        const timestampSeconds = Math.floor(new Date(timestamp).getTime() / 1000) // convert iso date to seconds from 1970

        await stripe.subscriptionItems.createUsageRecord(
            subscriptionItemMetered.id,
          {
            quantity: quantity,
            timestamp: timestampSeconds,
          }
        );

    }
}

exports.connectAccount = {

    /**
     * Generates a Stripe Express account for the user if one doesnt exist and returns the URL to redirect the user to complete the Stripe account setup
     *
     * @param {*} user
     * @param {*} data
     * @returns URL to redirect the user to complete the Stripe account setup
     */
    setup: async (user, data) => {
        /**
         * Setting up an instance of the Stripe object
         */
        const stripe = require('stripe')(configs.apis.stripeUK.apiKey);

        /**
         * Get account details from DB for the input account ID
         */
        const account = await db.account.findOne({where: {ID: user.accountID}})

        /**
         * Creating an Express Stripe account for the user if one isnt already created and store the account ID
         */
        const stripeConnectAccountID = account.stripeConnectAccountID ? account.stripeConnectAccountID : (await stripe.accounts.create({
            type: 'express',
            settings: {
                payouts: {
                    schedule: { interval: 'daily' }
                }
            }
        })).id;

        /**
         * Add the account ID for the generated account to the DB if it doesn't exist
         */
        if (!account.stripeConnectAccountID) await service.account.update(user, user.accountID, { stripeConnectAccountID });

        /**
         * Creating an Account Link for the user to complete the Stripe account setup
         */
        const accountLink = await stripe.accountLinks.create({
            account: stripeConnectAccountID,
            refresh_url: `https://${configs.environment == "prod" ? 'app' : 'staging'}.fliproom.io/`, //page you want the user to be redirected to if they decide to go back to the Stripe account setup page
            return_url: `https://${configs.environment == "prod" ? 'app' : 'staging'}.fliproom.io/`, //page you want the user to be redirected to after completing the Stripe account setup
            type: 'account_onboarding',
        });

        return accountLink.url;
    },
    charge: async (connectedAccountID, amount, reference) => {
        /**
         * BNOT IMPLEMENTED YETR
         */
        const stripe = require('stripe')(configs.apis.stripeUK.apiKey);
        const account = await db.account.findOne({where: {ID: connectedAccountID}})
        console.log(account.stripeConnectAccountID)
        try {
            const paymentIntent = await stripe.transfers.create(
                {
                  amount: amount,
                  currency: 'gbp',
                  destination: 'acct_1MYe1sEhuZvDyolo',
                  description: reference,
                },
                {
                  stripeAccount: account.stripeConnectAccountID,
                }
                
            );
            console.log(paymentIntent)
        } catch (e) {
            console.log(e)
            logger.error(`Error while trying to charge connected account | ${e}`)
        }
    }

}

exports.order = {
    getCheckoutSession: async (user,sessionID) => {
        /**
         * Setting up an instance of the Stripe object
         */
        const stripe = require('stripe')(configs.apis.stripeUK.apiKey);
        const session = await stripe.checkout.sessions.retrieve(sessionID);
        return session;
    },
    createCheckout: async (user, orderID) => {
        /**
         * Setting up an instance of the Stripe object
         */
        const stripe = require('stripe')(configs.apis.stripeUK.apiKey);

        const order = await service.order.getOne(user, orderID);

        if (!order) {
            throw {status: 404, message: `Order not found with id ${orderID}`}
        }

        const line_items = order.orderLineItems.map(oli => {
            const line_item = {
                price_data: {
                    currency: 'gbp',
                    unit_amount_decimal: oli.price * 100,
                    product_data: {
                        name: oli.product.title,
                    },
                    tax_behavior: 'inclusive'
                },
                quantity: 1,
            }
            // add product image if exists
            if (oli.product.imageReference) {
                line_item.price_data.product_data.images = [oli.product.imageReference]
            }
            return line_item;
        })

        const shippingTx = order.transactions.find(tx => tx.type == "shipping" && tx.status == "unpaid");

        if (shippingTx) {
            line_items.push({
                price_data: {
                    currency: 'gbp',
                    unit_amount_decimal: shippingTx.grossAmount * 100,
                    product_data: {
                        name: 'Shipping Cost',
                    },
                    tax_behavior: 'inclusive'
                },
                quantity: 1,
            });
        }

        if (!line_items.length) {
            throw {status: 400, message: `No line items found for order with ID: ${orderID}`}
        }

        const params = {
            line_items,
            return_url: utils.getStripeRedirectRootURL()+ `share/order/${order.ID}?sessionID={CHECKOUT_SESSION_ID}&accessToken=${order.accessToken}`, //page you want the user to be redirected to after completing the Stripe account setup
            ui_mode: 'embedded',
            mode: 'payment',
            payment_intent_data: {
                transfer_group: order.ID
            }
        }

        params.payment_intent_data.statement_descriptor = `order #${order.ID} - ${order.account.name}`.slice(0, 21)

        const session = await stripe.checkout.sessions.create(params);
        return session;
    },
}

exports.transfer = {
    create: async (amount, currency, accountID, description) => {
        logger.info("stripe.transfer.create", {data: {amount, currency, accountID, description}})
        const account = await db.account.findOne({where: {ID: accountID}});
        if (!account.stripeConnectAccountID) throw {status: 400, message: `Stripe Connect account not found for account with id ${accountID}`}

        if (configs.environment != "prod") return;

        const stripe = require('stripe')(configs.apis.stripeUK.apiKey);

        try {
            await stripe.transfers.create({
                amount: Number((amount * 100).toPrecision(15)),
                currency,
                destination: account.stripeConnectAccountID,
                description
            });
        } catch (e) {
            throw {status: 500, message: `Impossible to generate stripe transfer | ${e}`}
        }
    }
}

exports.webhook = {
    payoutUpdated: async (serviceUser, payoutUpdatedEvent) => {
        logger.info("Stripe webhook payout/updated", {data: payoutUpdatedEvent})
        const payoutTx = await db.transaction.findOne({
            where: {stripeID: payoutUpdatedEvent.id},
            include: [
                { model: db.transaction, as: 'childTxs'}
            ]
        })

        if (!payoutTx) {
            throw {status: 404, message: `Stripe transaction not found with id ${payoutUpdatedEvent.id}`}
        }
        
        await Promise.all(payoutTx.childTxs.map(childTx => service.transaction.update(serviceUser, childTx.ID, {status: "paid"})))
        return service.transaction.update(serviceUser, payoutTx.ID, {status: "paid"})
    },

    payoutFailed: async (serviceUser, payoutFailedEvent) => {
        logger.info("Stripe webhook payout/failed", {data: payoutFailedEvent})
        const payoutTx = await db.transaction.findOne({
            where: {stripeID: payoutFailedEvent.id},
            include: [
                { model: db.transaction, as: 'childTxs'}
            ]
        })

        if (!payoutTx) {
            throw {status: 404, message: `Stripe transaction not found with id ${payoutFailedEvent.id}`}
        }

        await Promise.all(payoutTx.childTxs.map(childTx => service.transaction.update(serviceUser, childTx.ID, {status: "reverted"})))
        return service.transaction.update(serviceUser, payoutTx.ID, {status: "reverted"})
    },

    paymentIntentCreated: async (user, paymentIntentObject) => {
        /**
         * This webhook gets triggered when the customer completes the checkout flow by clicking on "pay"
         */
        logger.info("stripe.paymentIntentCreated", {data: paymentIntentObject})

        //Fetching the order object from the DB for the given orderID
        const orderID = paymentIntentObject.transfer_group;
        const serviceUser = await service.account.serviceUser((await db.order.findOne({where: {ID: orderID}})).accountID);
        const order = await service.order.getOne(serviceUser, orderID);

        if (!order) {
            throw {status: 404, message: `Order not found with id ${orderID}`}
        }

        const saleTx = order.transactions.find(tx => tx.type == "sale" && tx.status == "unpaid");
        const shippingTx = order.transactions.find(tx => tx.type == "shipping" && tx.status == "unpaid");

        if (!saleTx) {
            throw {status: 404, message: `Sale tx not found for order ID ${orderID}`}
        }

        if (saleTx && saleTx.status != "unpaid") {
            throw {status: 403, message: `Sale tx for order ID ${orderID} has status ${saleTx.status} and cannot be updated`}
        }

        //Setting order sale tx and shipping tx as ‘processing’ 
        await service.transaction.update(serviceUser, saleTx.ID, {status: "processing"});
        if (shippingTx) {
            await service.transaction.update(serviceUser, shippingTx.ID, {status: "processing"});
        }

        await service.gcloud.publishEvent(user, 'payment/triggered', saleTx);

        return service.order.getOne(serviceUser, orderID);

    },
    
    chargeSucceeded: async (user, chargeObject) => {
        /**
         * This webhook gets triggered when funds are captured from the customer's card and the funds are added to the Stripe account balance 
         * but the funds are not available yet to be paid out
         */
        logger.info("stripe.chargeSucceeded", {data: chargeObject})

        //Fetching the order object from the DB for the given orderID
        const orderID = chargeObject.transfer_group;
        const o = await db.order.findOne({where: {ID: orderID}})
        if (!o) {
            throw {status: 404, message: `Order not found with id ${orderID}`}
        }
         
        const serviceUser = await service.account.serviceUser(o.accountID)
        const order = await service.order.getOne(serviceUser, orderID);


        //save stripe balance transaction - for reconciliation later on
        const saleTx = order.transactions.find(tx => tx.type == "sale");
        const shippingTx = order.transactions.find(tx => tx.type == "shipping");
        const payoutPSTx = order.transactions.find(tx => tx.type == "payout" && tx.toAccountID == order.personalShopperAccountID);

        await service.transaction.update(serviceUser, saleTx.ID, {stripeID: chargeObject.balance_transaction})
        if (shippingTx) {
            await service.transaction.update(serviceUser, shippingTx.ID, {stripeID: chargeObject.balance_transaction})
        }
        if (payoutPSTx) {
            await service.transaction.update(serviceUser, payoutPSTx.ID, {stripeID: chargeObject.balance_transaction})
        }

        await service.gcloud.publishEvent(user, 'payment/captured', saleTx);

        return service.order.getOne(serviceUser, orderID);
    },

    accountUpdated: async (serviceUser, accountUpdatedEvent) => {
        /**
         * Gets triggered when user completes the Stripe account setup flow regardless if the account is activated or not
         * Gets triggered for every account type (Standard, Express, Custom)
         */
        logger.info("Stripe webhook account/updated", {data: accountUpdatedEvent})

        /**
         * Checking if the Stripe account setup is complete
         * - If not, throw an error (Stripe suggests to generate a new link here and make user redo the onboarding link flow)
         */
        if (!accountUpdatedEvent.details_submitted) {
            throw {status: 400, message: `Stripe account setup incomplete for account with id ${accountUpdatedEvent.id}`}
        }

        /**
         * If it reaches here, it means account is fully onboarded successfully with all info setup
         * - Update the DB to reflect this
         */
        return service.account.update(serviceUser, serviceUser.accountID, {stripeConnectAccountSetupCompleted: true});
    },

    //NOT IMPLEMENTED
    externalAccountUpdated: async (serviceUser, externalAccountUpdatedEvent) => {
        logger.info("Stripe webhook external-account/updated", {data: externalAccountUpdatedEvent})
    },
}

