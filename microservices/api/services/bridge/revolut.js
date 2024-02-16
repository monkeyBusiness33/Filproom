const logger = require("../../libs/logger");
const service = require("../main");
const db = require("../../libs/db");
const {Op} = require("sequelize");
const configs = require("../../configs");
const utils = require('../../libs/utils')
const axios = require('axios')
const revolutAccessTokenMemory = {}
const moment = require('moment')
const jwt = require('jsonwebtoken')
const fs = require('fs')

const revolutTxStatusToFliproomStatusMapping = {
    "pending": "processing",
    "created": "processing",
    "completed": "paid",
    "failed": "reverted", 
    "reverted": "reverted",
    "declined": "reverted",
}

exports.generateFirstAccessToken = async (user, body) => {
    /**
     * 
     * This function is used to link a revolut api key to an account and generate the necessary access token
     * @param {object} user - The user object of the user making the request
     * @param {string} body.authCode - The auth code received from revolut redirect URI
     * @param {string} body.clientID - The clinetID provided by revolut when adding fliproom perfmissions through the revolut app
     * 
     * 
     * 1. Add a certificate in https://business.revolut.com/settings/api
     *      title:              Fliproom
     *      Oauth Redirect URI: https://fliproom.io
     *      X509 Public Key:    

    -----BEGIN CERTIFICATE-----
MIIDhDCCAmwCCQDvrCahi/N/PzANBgkqhkiG9w0BAQsFADCBgzELMAkGA1UEBhMC
VUsxDzANBgNVBAgMBkxvbmRvbjEPMA0GA1UEBwwGTG9uZG9uMRkwFwYDVQQKDBBX
aXJlZGh1YiBMaW1pdGVkMRQwEgYDVQQDDAtmbGlwcm9vbS5pbzEhMB8GCSqGSIb3
DQEJARYScy5yb3NhQHdpcmVkaHViLmlvMB4XDTIzMDYxOTA5MTQzM1oXDTI4MDYx
NzA5MTQzM1owgYMxCzAJBgNVBAYTAlVLMQ8wDQYDVQQIDAZMb25kb24xDzANBgNV
BAcMBkxvbmRvbjEZMBcGA1UECgwQV2lyZWRodWIgTGltaXRlZDEUMBIGA1UEAwwL
ZmxpcHJvb20uaW8xITAfBgkqhkiG9w0BCQEWEnMucm9zYUB3aXJlZGh1Yi5pbzCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAOjjNwZLS9kOF6q/bWR3/lEw
61SQq2p11rMozOoAkkIbScZbYNIZsOImEZLrUEArzpeQzdXfSj2K9XaErtpdTqrM
pM1bD6asArfGLP/JiT0V6viHCxxtuXHEXtVkyHH4ruuTDnEOMvJ8EcDPF8k0cVdt
GD+UvNC2RXipJyQCkdieWZsFdPAKgUa1zWdyq5D30XgDGXLAa3zYp48ILbdh9K9u
1d6prOZClTRV0nMHQvSS6x0sBdstNKiqxp6xjXju7Yv0zhXpSDfElkfassL/jVT6
PGXTKglYZ7W/qzh94MoilXPeq+LtNruAc6jKvQ0lVJfdUrKrSUbVLvkOyF+XW6EC
AwEAATANBgkqhkiG9w0BAQsFAAOCAQEAadNE7m8F1HmY9zEiNBN8wIrFK1CUMvOJ
tbHvHYwGjHoOeXvJhy6K5PKkWueCJQm8+ItVHOMo4hk1vzD45FqqMtdOdC6iKQ/i
fH66d/aJap0bTqORk4abMSHAjlS2o4CQ9N6y1UAQdt1Oxnf1NXbRnpto//TBBvey
3S4ZRQ+DOqHJWKyZQYreV6p5I44nqwhbqsuGUEnuzQGnSTM32+XzpUEkQCw2ZhH4
NRH1wDvNXArqG3A+KsS8xyAah5jpFuwoJXGwk9/JocJ8l6ySQwDb2S3GiK0vL+Bn
ltWZsKmRKTAD/9gBlhnNulB1gTNCd2FERJa2xp5QRqqZH0nruxB4ag==
-----END CERTIFICATE-----

     * 2. Click on "Enable access" and save the code param in the redirect URL
     * 3. Generate jwtToken calling this method by passing:
     *     - authCode: the code param in the redirect URL
     *     - clientID: the client_id in https://sandbox-business.revolut.com/settings/api
     * 
     * 
     * 
     * Useful links
     * - revolut sandbox: https://sandbox-business.revolut.com/
     * - encode jwt: https://developer.pingidentity.com/en/tools/jwt-encoder.html
     * - decode jwt: https://jwt.io/
     */
    logger.info("generateFirstAccessToken", {data: body})
    // generate jwtToken
    const privateKey = fs.readFileSync('./libs/privatecert_revolut.pem', 'utf8');
    const jwtToken = jwt.sign({
        "iss": "fliproom.io",
        "sub": body.clientID,
        "aud": "https://revolut.com",
        "exp": moment().add(5, 'years').unix() // in 5 years
    } , privateKey, { algorithm: 'RS256'});

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: body.authCode,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: jwtToken,
    });

    let resp;
    try {
        resp = await axios({
                method: 'post',
                url: `${configs.apis.revolut.url}/1.0/auth/token`, 
                headers: { 
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data: params.toString()
        })

        //Save jwt and refresh tokens in db
        await db.account.update({revolutJWT: jwtToken, revolutRefreshToken: resp.data.refresh_token}, {where: {ID: user.accountID}})
    } catch (e)  {
        throw {status: e.response.status, message: `${e.response.data.message} | ${e.response.data.code}`}
    }

    try {
        // get jwt token
        const jwtToken = await service.bridge.revolut.getAccessToken(user.accountID)
        resp2 = await axios({
            method: 'post',
            url: `${configs.apis.revolut.url}/2.0/webhooks`, 
            headers: { 
                'Content-Type': 'application/json', 
                'Accept': 'application/json', 
                'Authorization': `Bearer ${jwtToken}`
            },
            data : {
                "url": `${configs.microservices.api}/api/webhooks/revolut/events`
            }
        })
    } catch (e)  {
        throw {status: e.response.status, message: `${e.response.data.message} | ${e.response.data.code}`}
    }
}

exports.getAccessToken = async (accountID) => {
    /**
     * this function is used to get access token for revolut api.
     * if access token is available in memory and not expired, use it
     * if access token is not available in memory or expired, refresh it
     * 
     * @param {string} accountID - The ID of the account that has a revolut account linked
     * 
     * @returns {string} access_token
     */
    logger.info("revolut.getAccessToken", {data: {accountID}})

    //deprecate fetch from memory since might be a problem - verify if 4012 problem with millie still happens
    //// check if access token available in memory. if in memory and not expired, use it
    //let accountAccessToken = revolutAccessTokenMemory[accountID]
    //if (accountAccessToken && accountAccessToken.expires_at > moment()) {
    //    logger.info("getAccessToken from memory", {data: accountAccessToken})
    //    return accountAccessToken.access_token
    //}

    // if expired or doesn't exist in memory, refresh access token
    const account = await db.account.findOne({where: {ID: accountID}, attributes: ['revolutJWT', 'revolutRefreshToken']})

    if (!account.revolutJWT || !account.revolutRefreshToken) {
        logger.warn("revolut account not linked", {data: {accountID}})
        return
    }

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.revolutRefreshToken,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: account.revolutJWT,
    });
    let resp;
    try {
        resp = await axios({
                method: 'post',
                url: `${configs.apis.revolut.url}/1.0/auth/token`, 
                headers: { 
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data: params.toString()
        })

        //save new access token in memory 
        revolutAccessTokenMemory[accountID] = {
            access_token: resp.data.access_token,
            expires_at: moment().add(resp.data.expires_in, 'seconds')
        }
        return resp.data.access_token
    } catch (e)  {
        console.log(e.response)
        throw {status: e.response.status, message: `${e.response.data.error} | ${e.response.data.error_description}`}
    }
}

exports.getAccounts = async (user, accountID) => {
    /**
     * This function is used to return the list of bank accounts for a given revolut account
     * 
     * 
     * @returns {BankAccount[]} a list of bank accounts available for the revolut account
     * BankAccount : {
     *    id: string,
     *    name: string,
     *    currency: string,
     *    balance: number,
     *    state: string,
     * }
     * 
     */
    logger.info("revolut.getAccounts")

    // check if user can access
    if (!await service.user.isAuthorized(user.ID, accountID)) throw {status: 403, message: "user cannot access this account"}

    // get jwt token
    const jwtToken = await service.bridge.revolut.getAccessToken(accountID)

    if (!jwtToken) return

    let resp;
    try {
        resp = await axios({
            method: 'get',
            url: `${configs.apis.revolut.url}/1.0/accounts`, 
            headers: {
                'Authorization': `Bearer ${jwtToken}`
            },
        })
        return resp.data
    } catch (e)  {
        throw {status: e.response.status, message: `${e.response.data.message} | ${e.response.data.code}`}
    }
}

exports.createCounterparty = async (user, body) => {
    /**
     * This function is used to create a counterparty for a given revolut account.
     * Currently limited to UK bank accounts only
     * 
     * @param {object} user               - the user making the request
     * @param {string} body.companyName   - the name of the account if it is a business account
     * @param {string} body.sortCode      - the sort code of the bank account
     * @param {string} body.accountNumber - the account number of the bank account
     * @param {Address}body.address       - the address of registered with the bank account
     * @param {Address}body.address.street_line1    
     * @param {Address}body.address.postcode    
     * @param {Address}body.address.city    
     * @param {Address}body.address.country    
     * 
     * 
     * 
     * @returns {Counterparty} the details of the created counterparty
     * Counterparty : {
     *   id: '28e1f3d2-ba1d-4041-b3bc-e602579d056a',
     *   name: 'Revolut Ltd',
     *   state: 'created',
     *   created_at: '2023-06-30T16:13:27.982536Z',
     *   updated_at: '2023-06-30T16:13:27.982536Z',
     *   accounts: [
     *     {
     *       account_no: '12345678',
     *       sort_code: '123456',
     *       id: 'dfee9633-e796-4e53-a23d-1741bd143624',
     *       type: 'external',
     *       name: 'Revolut Ltd',
     *       bank_country: 'GB',
     *       currency: 'GBP',
     *       recipient_charges: 'no'
     *     }
     *   ]
     * }
     */
    logger.info("revolut.createCounterparty", {data: body})

    // get jwt token
    const jwtToken = await service.bridge.revolut.getAccessToken(user.accountID)

    let resp;
    try {
        const createCounterpartyBody = {
            bank_country: "GB",
            currency: "GBP",
            sort_code: body.sortCode,
            account_no: body.accountNumber,    
            company_name: body.companyName || null,
            individual_name: body.individualName || null,
            address: {
                "street_line1": body.address.street_line1,
                "street_line2": body.address.street_line2,
                "postcode": body.address.postcode,
                "city": body.address.city,
                "country": body.address.country  
              }    
        }
        resp = await axios({
            method: 'post',
            url: `${configs.apis.revolut.url}/1.0/counterparty`, 
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            data: createCounterpartyBody
        })
        return resp.data
    } catch (e)  {
        throw {status: e.response.status, message: `${e.response.data.message} | ${e.response.data.code}`}
    }
}

exports.getCounterparty = async (user, counterpartyId) => {
    /**
     * This function is used to return the details of a counterparty for a given revolut account
     * 
     * @param {object} user           - the user making the request
     * @param {string} counterpartyId - the id of the counterparty
     * @returns {Counterparty} the counterparty details
     * 
     * Counterparty : {
     *   id: string,
     *   name: string,
     *   state: string,
     *   created_at: string,
     *   updated_at: string,
     *   accounts: [
     *    {
     *      "account_no": "12345678",
     *      "sort_code": "540105",
     *      "id": "5c9e171c-7e23-4d6a-b768-aaaaaba535f3",
     *      "type": "external",
     *      "name": "John Smith Co.",
     *      "bank_country": "GB",
     *      "currency": "GBP",
     *      "recipient_charges": "no"
     *    }
     *   ]
     *}
     * 
     */
    logger.info("revolut.getCounterparty", {data: {counterpartyId}})

    if (!counterpartyId) throw {status: 400, message: "invalid counterpartyId passed"}


    // get jwt token
    const jwtToken = await service.bridge.revolut.getAccessToken(user.accountID)

    let resp;
    try {
        resp = await axios({
            method: 'get',
            url: `${configs.apis.revolut.url}/1.0/counterparty/${counterpartyId}`, 
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
        })
        return resp.data
    } catch (e)  {
        throw {status: e.response.status, message: `${e.response.data.message} | ${e.response.data.code}`}
    }
}

exports.deleteCounterparty = async (user, counterpartyId) => {
    /**
     * This function is used to delete a counterparty for a given revolut account.
     * Currently limited to UK bank accounts only
     * 
     * @param {object} user               - the user making the request
     * @param {string} counterpartyId     - the id of the counterparty to remove
     * 
     * @returns {string} ok
     */
    logger.info("revolut.deleteCounterparty", {data: counterpartyId})

    if (!counterpartyId) throw {status: 400, message: "counterpartyId is required"}

    // get jwt token
    const jwtToken = await service.bridge.revolut.getAccessToken(user.accountID)

    let resp;
    try {
        resp = await axios({
            method: 'delete',
            url: `${configs.apis.revolut.url}/1.0/counterparty/${counterpartyId}`, 
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
        })
        return "ok"
    } catch (e)  {
        throw {status: e.response.status, message: `${e.response.data.message} | ${e.response.data.code}`}
    }
}

exports.pay = async (user, body) => {
    /**
     * This function is used to pay a counterparty from a revolut account. Revolut requires the origin bank account id from which the money are withdrawn 
     * and the destination counterparty id and bank account id to which the money are sent to. So, before doing the payment, we need to 
     * 1. retrieve the revolut.bank_account_id from originAccountID
     * 2. retrieve the revolut.counterparty_id and revolut.bank_account_id from destinationAccountID
     *
     * 
     * @param {Object}   user                       The user making the request
     * @param {string}   body.requestID             arbitrary unique string used to ensure that a payment is not processed multiple times
     * @param {string}   body.originAccountID       origin bank account id
     * @param {string}   body.destinationAccountID  destination bank account id
     * @param {number}   body.amount                The amount to pay
     * @param {number}   body.currency              The currency to pay in
     * @param {string}   body.reference             A reference to use to describe the bank transaction
     *
     * @returns {Payment} the payment details
     * {
     *      id: string,
     *      status: string,
     * }
     */
    logger.info("revolut.pay", {data: body})
    if (!body.originAccountID) throw {status: 400, message: "originAccountID is required"}
    if (!body.destinationAccountID) throw {status: 400, message: "destinationAccountID is required"}
    if (!body.amount) throw {status: 400, message: "amount is required"}
    if (!body.currency) throw {status: 400, message: "currency is required"}

    //Get revolut bank account of the originAccountID 
    const originBankAccounts = await service.bridge.revolut.getAccounts(user, body.originAccountID)
    // try to use the bank account of the currency of the transaction is avaialble. Otherwise, select the first available
    let selectedOriginBankAccount;
    if (body.originAccountID == 3 && configs.environment == "prod") { // you need to check by env too otherwise breaks on tests during dev
        selectedOriginBankAccount = originBankAccounts.find(ba => ba.id == "11ff7118-f9bd-4d09-9d4d-932414fd35f7")
    } else {
        selectedOriginBankAccount = originBankAccounts.find(ba => ba.currency.toLowerCase() === body.currency.toLowerCase()) || originBankAccounts[0]
    }

    //Get revolut counterparty_id and account_id of the destinationAccountID
    const consignmentRecord = await db.consignment.findOne({where: {accountID: body.originAccountID, consignorAccountID: body.destinationAccountID}, attributes: ['revolutCounterpartyId'], raw: true})
    const destinationCounterparty = await service.bridge.revolut.getCounterparty(user, consignmentRecord.revolutCounterpartyId)
    const selectedDestinationBankAccount = destinationCounterparty.accounts.find(ba => ba.currency.toLowerCase() === body.currency.toLowerCase()) || destinationCounterparty.accounts[0]
    
    const jwtToken = await service.bridge.revolut.getAccessToken(body.originAccountID)

    let resp;
    try {
        const revolutRequestBody = {
            "request_id": body.requestID,
            "account_id": selectedOriginBankAccount.id,
            "receiver": {
                "counterparty_id": destinationCounterparty.id,
                "account_id": selectedDestinationBankAccount.id
            },
            "amount": body.amount,
            "currency": body.currency.toUpperCase(),
            "reference": body.reference
        }
        resp = await axios({
            method: 'post',
            url: `${configs.apis.revolut.url}/1.0/pay`, 
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            data: revolutRequestBody
        })
        const revolutTxRep = resp.data

        return {
            id: revolutTxRep.id,
            status: revolutTxStatusToFliproomStatusMapping[revolutTxRep.state],
        }
    } catch (e)  {
        throw {status: e.response.status, message: `Some error while processing this payment with revolut. Please try again later`, errors: e.response.data.message}
    }
}

exports.topup = async (user, body) => {
    //This function is available only for testing purposes
    logger.info("revolut.topup", {data: body})

    if (configs.env == "prod") throw {status: 400, message: "This function is available only for testing purposes"}

    const originBankAccounts = await service.bridge.revolut.getAccounts(user, user.accountID)
    const selectedOriginBankAccount = originBankAccounts.find(ba => ba.currency.toLowerCase() ==='gbp') || originBankAccounts[0]
    const jwtToken = await service.bridge.revolut.getAccessToken(user.accountID)

    let resp;
    try {
        const revolutRequestBody = {
            "account_id": selectedOriginBankAccount.id,
            "amount": body.amount,
            "currency": "GBP",
            "reference": "Test Top-up",
            "state": "completed"
        }
        resp = await axios({
            method: 'post',
            url: `${configs.apis.revolut.url}/1.0/sandbox/topup`, 
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            data: revolutRequestBody
        })

        return "ok"
    } catch (e)  {
        throw {status: e.response.status, message: `Impossible to topup sandbox revolut. ${e.response.data.message} | ${e.response.data.code}`}
    }

}

exports.webhook = {
    transactionUpdated: async (serviceUser, updatedEvent) => {
        logger.info("revolut.webhook.transactionUpdated", {data: updatedEvent})

        //pending => completed
        //pending => reverted
        //completed => reverted
        const tx = await db.transaction.findOne({
            where: {revolutTransactionID: updatedEvent.id},
            include: [
                { model: db.transaction, as: 'childTxs'}
            ]
        })

        const newTxStatus = revolutTxStatusToFliproomStatusMapping[updatedEvent.new_state]

        if (newTxStatus === "paid") {
            await Promise.all(tx.childTxs.map(childTx => service.transaction.update(serviceUser, childTx.ID, {status: "paid"})))
            return service.transaction.update(serviceUser, tx.ID, {status: "paid"})
        } else if (newTxStatus === "reverted") {
            await Promise.all(tx.childTxs.map(childTx => service.transaction.update(serviceUser, childTx.ID, {status: "reverted"})))
            return service.transaction.update(serviceUser, tx.ID, {status: "reverted"})
        }
    }
}