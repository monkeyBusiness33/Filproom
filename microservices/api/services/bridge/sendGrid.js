const sgMail = require('@sendgrid/mail')
const configs = require('../../configs')
const logger = require('../../libs/logger')
sgMail.setApiKey(configs.apis.sendGrid.apiKey)

exports.emailTemplates = {
    'sale-invoice-v2': 'd-ce740bfefdac41ceb53028c30843e4dc'
}

exports.sendEmail = async (emailObj) => {
    /**
     * 
     * @param {string[]} emailObj.to - Array of emails to be sent.
     * @param {string[]} emailObj.cc - (optional) Array of emails to be in cc
     * @param {string}   emailObj.subject - String containing the subject of the email.
     * @param {string} emailObj.body - String containing the body of the email in html
     * @param {Object[]} emailObj.attachments - Array of attachments to dd to email to be sent.
     * @param {Object} emailObj.template - (optional) Object containing the template id and data to be used for the email.
     * @param {Object} emailObj.template.id - template id to be used for the email.
     * @param {Object} emailObj.template.data - template data to be used for the email.
     */
    logger.info(`sendGrid.sendEmail`)
    const emailRequestsObjsToSend = []

    let {to, cc, subject, body, attachments, template} = emailObj

    if (!subject) throw {status: 400, message: 'No subject provided.'}
    if (!to) throw {status: 400, message: 'No receivers provided.'}
    if (!template && !body) throw {status: 400, message: 'Either body or template.id must be provided.'}
    if (template && !(template.id in exports.emailTemplates)) throw {status: 400, message: `${template.id} not available as template`}

    if (typeof to === 'string') to = [to]

    if (configs.environment != 'prod') {
        to = ['r.sauchelli@wiredhub.io', 's.rosa@wiredhub.io']
    }

    to = [...new Set(to.filter(email => email))]

    to.forEach((email, i) => {
        const emailReq = {
            to: email,
            from: "no-reply@wiredhub.io",
            cc: cc || [], // CC recipients, if any.
            subject: configs.environment != 'prod' ? `[${configs.environment}] ${subject}` : subject, // Subject of the email. If different than prod - add env name : staging|local in the subject
            attachments: attachments || [] // Attachments, if any.
        }

        // Using SendGrid template.
        if (template?.id) {
            emailReq.templateId = exports.emailTemplates[template.id];
            emailReq.dynamic_template_data = template.data; // Data passed to the template for dynamic content.
        } else {
            emailReq.text = 'This email content cannot be rendered'; // Fallback text content.
            emailReq.html = body; // HTML content of the email.
        }

        emailRequestsObjsToSend.push(emailReq)
    })

    await Promise.all(emailRequestsObjsToSend.map(emailReqObj => sgMail.send(emailReqObj).then(() => {}).catch((e) => {
        logger.warn(`sendGrid.sendEmail error while sending email- ${e.response || e}`)
    })))
}