const jwt = require('jsonwebtoken')

const db = require('../libs/db')
const Op = require('sequelize').Op;
const service = require('./main')
const utils = require('../libs/utils')
const axios = require('axios')
const configs = require('../configs')
const logger = require('../libs/logger')
const moment = require('moment');
const {default: base64url} = require('base64url');

exports.signUp = async (newAccountRequest) => {
    /**
     * Called on Signup
     *
     */

    if (newAccountRequest.jwt) {
        const response = await axios.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
        const publicKeys = response.data
        const key = Object.keys(publicKeys)[0];

        try {
            const tokenDecoded = await jwt.verify(newAccountRequest.jwt, publicKeys[key], {algorithms: ['RS256']})
            newAccountRequest.email = tokenDecoded.email
            newAccountRequest.name = tokenDecoded.name ? tokenDecoded.name.split(" ")[0] : ''
            newAccountRequest.surname = tokenDecoded.name ? tokenDecoded.name.split(" ")[1] : ''
        } catch (err) {
            logger.error(err)
            throw {status: 500, message: 'Invalid Firebase token'}
        }
    }

    const existingUser = await db.user.findOne({
        where: {
            email: newAccountRequest.email
        }
    });

    if (existingUser) {
        throw {status: 409, message: 'Email already in use'}
    }

    const account = await service.account.create(newAccountRequest);

    return account
}

exports.signIn = async (body) => {
    /**
     * Called on signIn
     *
     * body.jwt OR  body.email && body.password
     *
     */
    let userCredentials = {
        activatedAt: {[Op.not]: null}, email: body.email,
    }

    if (body.jwt) {
        const tokenHeader = JSON.parse(base64url.decode(body.jwt.split('.')[0]))
        const response = await axios.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
        const publicKeys = response.data

        try {
            const tokenDecoded = await jwt.verify(body.jwt, publicKeys[tokenHeader.kid], {algorithms: ['RS256']})
            userCredentials.email = tokenDecoded.email
        } catch (err) {
            throw {status: 401, message: "Invalid google token"};
        }
    }

    const user = await db.user.findOne({
        attributes: ['ID', 'password', 'apiKey'], where: userCredentials,
    })

    if (!user) {
        throw {status: 404, message: "Wrong email/password or account doesn't exists"};
    }

    if (body.email) {
        const isPasswordValid = await user.authenticate(body.password);
        if (!isPasswordValid) {
            throw {status: 404, message: "Wrong email/password or account doesn't exists"};
        }
    }

    await db.user.update({
        deviceID: body.deviceID
    }, {
        where: {
            ID: user.ID
        }
    })

    user.dataValues.deviceID = body.deviceID

    return Promise.resolve({valid: true, "jwt": user.apiKey})
}

exports.signInWithGuestToken = async (body) => {
    logger.info('signInWithGuestToken', body)
    const {accessToken, resource} = body

    if (!accessToken || !resource) {
        throw {status: 400, message: "Missing required fields"};
    }

    let user;
    const jwtOpts = {
        permissions: []
    }
    if (resource == 'order') {
        // fetch the order associated with the access token
        const order = await db.order.findOne({where: {accessToken}});
        if (!order.linkFirstOpenedAt) {
            await db.order.update({linkFirstOpenedAt: moment()}, {where: {ID: order.ID}});
        }

        if (!order) {
            throw {status: 404, message: `Order not found for accessToken: ${accessToken}`};
        }

        // fetch the "guest" user associated with the order
        user = await db.user.findOne({
            where: {
                accountID: order.accountID
            }, include: [{model: db.role, as: 'roles', where: {type: 'guest'}, required: true}]
        });

        if (!user) {
            throw {status: 404, message: "Guest user not found for order"};
        }

        // consignee already added - guest user can only edit it
        if (order.consigneeID) {
            jwtOpts.permissions = [{name: 'address.update', rule: `ID:${order.consigneeID}`}, {
                name: 'order.view',
                rule: `ID:${order.ID}`
            }, {name: 'order.update', rule: `ID:${order.ID}`},]
        } else {
            // consignee not added - guest user can add it
            jwtOpts.permissions = [{name: 'address.create', rule: '*'}, {
                name: 'address.update',
                rule: '*'
            }, {name: 'order.view', rule: `ID:${order.ID}`}, {name: 'order.update', rule: `ID:${order.ID}`}]
            jwtOpts.expiresIn = '6h'
        }
    }

    return service.auth.signToken(user, jwtOpts)
}

exports.signToken = (user, opts = {permissions: [], expiresIn: null}) => {
    const jwtOptions = {}

    if (opts.expiresIn) {
        jwtOptions.expiresIn = opts.expiresIn
    }
    return jwt.sign({
        user: {
            ID: user.ID, //updatedAt: user.updatedAt,
            accountID: user.accountID, //deprecated - to remove
            //deviceID: user.deviceID,
            permissions: opts.permissions
        },
    }, configs.jwt.secret, jwtOptions);
}

exports.forgotPassword = async (email) => {
    /**
     * This function is used to send an email to the user with a link to reset his password
     */
    const user = await db.user.findOne({where: {email: email}, attributes: ['ID', 'name', 'email', 'apiKey']})

    //don't let malicious users if the email exists
    if (!user) {
        return
    }

    const targetUrl = {
        'local': `http://localhost:9000`,
        'staging': `https://staging-api-6dwjvpqvqa-nw.a.run.app`,
        'prod': `https://production-api-6dwjvpqvqa-nw.a.run.app`
    }

    const emailTemplateString = utils.buildEmailMessage('forgot-password-template', {
        nameCapitalized: user.name.charAt(0).toUpperCase() + user.name.slice(1),
        targetUrl: `${targetUrl[configs.environment]}/auth/reset-password?jwt=${user.apiKey}&t=${moment().unix()}`
    })

    const data = {
        to: [user.email], subject: `Fliproom - Your forgot password request`, body: emailTemplateString
    }

    await service.bridge.sendGrid.sendEmail(data);
}

exports.resetPassword = async (jwtString) => {
    /**
     * This function is used to reset the password of a user and redirect the user to the login page
     */
    const user = await db.user.findOne({where: {apiKey: jwtString}, attributes: ['ID', 'email']})


    const domains = {
        'local': 'http://localhost:8100', 'staging': 'https://staging.fliproom.io', 'prod': 'https://app.fliproom.io',
    }

    //don't let malicious users if the email exists
    if (!user) {
        return `${domains[configs.environment]}/signin`
    }

    const newPassword = `${Math.random().toString(36).slice(-8)}`
    await db.user.update({password: newPassword}, {where: {ID: user.ID}, individualHooks: true}) //individualHooks: true so that it hash the password


    const targetUrl = `${domains[configs.environment]}/signin/?email=${user.email}&password=${newPassword}&t=${moment().unix()}`

    return targetUrl

}
