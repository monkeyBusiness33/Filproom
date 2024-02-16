const db = require('../libs/db')
const Op = require('sequelize').Op;
const logger=require('../libs/logger.js')
const service = require('./main')
const axios = require('axios')



exports.rechargeManageTag = async (account, body, action) => {
    logger.info('Recharge Manage Tag', {data: body})
    const rechargeCustomerID = body.subscription.customer_id || null; // obtain the customer.id from the customer/created webhook payload
    const rechargeApiToken = "sk_1x1_6bfc8b2428bb7d327d384b6f4653abc1491f94995c3bc1ce44b533023bcc33f5"
    //get service user of the account with shopName matching
    const serviceUser = await service.account.serviceUser(account.ID)
    // get shopify client and session
    const {shopify, shopifySession} = await service.bridge.shopify.client( account.ID)


    if (rechargeCustomerID) {
        // Get Recharge customer object
        let resp = await axios.get('https://api.rechargeapps.com/customers/' + rechargeCustomerID, {headers: {"X-ReCharge-Access-Token": rechargeApiToken}})
        const rcCustomer = resp.data

        //const shopifySaleChannel = await service.account.getShopifySaleChannel(account.ID)

        // Get shopify Customer Object
        logger.info('Getting Shopify Customer Object')
        const shopifyCustomer = await shopify.rest.Customer.find({session: shopifySession, id: rcCustomer.customer.shopify_customer_id});

        // Parse shopify customer tags (as list)
        const tags = shopifyCustomer.customer.tags.split(",").map(item => item.trim())
        console.log(tags)

        const tagName = 'StoreMember'
        // if tag in the list and action is "remove"
        if(tags.indexOf(tagName) > -1 && action == "remove") {
            const index = tags.indexOf(tagName);
            if(index > -1) {
              tags.splice(index, 1);
            }
            console.log('StoreMember Tag Removed');
            const customer = new shopify.rest.Customer({session: shopifySession});
            customer.id = rcCustomer.customer.shopify_customer_id;
            customer.tags = tags.join()
            await customer.save({update: true});
        // if tag not in the list and action is "add"
        } else if (tags.indexOf(tagName) == -1 && action == "add") {
            tags.push(tagName);
            console.log('StoreMember Tag Added');
            const customer = new shopify.rest.Customer({session: shopifySession});
            customer.id = rcCustomer.customer.shopify_customer_id;
            customer.tags = tags.join()
            await customer.save({update: true});
        } else {
            // do nothing - return
            return
        }
    }

}
