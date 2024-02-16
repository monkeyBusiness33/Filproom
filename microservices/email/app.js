const express = require('express')
const bodyParser = require('body-parser');
const cors = require('cors')
const app = express()
const sgMail = require('@sendgrid/mail')

sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const port = process.env.PORT || 9001
const emailSender = "no-reply@wiredhub.io"

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 }))
app.use(cors())

app.post('/', function (req, res) {
    // Determine the receivers. If in staging mode, use predefined emails.
    const receivers = process.argv.includes("staging") ?
        ['s.rosa@wiredhub.io', 'r.sauchelli@wiredhub.io'] :
        req.body.receivers;

    // Extract email details from request body.
    const subject = req.body.subject;
    const cc = req.body.cc;
    const body = req.body.message;
    const attachments = req.body.attachments || [];

    // Check if the email should be sent using a SendGrid template.
    const useTemplate = req.body.useTemplate; // Boolean to determine the mode of email.
    const templateId = req.body.templateId; // Template ID for SendGrid, required if using a template.
    const templateData = req.body.templateData; // Data for populating the template.




    // Create email messages for each receiver.
    let msgs = receivers.map((email) => {
        // Basic message setup.
        let msg = {
            to: email,
            from: emailSender, // Sender's email address.
            cc: cc || [], // CC recipients, if any.
            subject: subject,
            attachments: attachments // Attachments, if any.
        };

        // Conditional structure based on whether to use a template or not.
        if (useTemplate) {
            // Using SendGrid template.
            msg.templateId = templateId;
            msg.dynamic_template_data = templateData; // Data passed to the template for dynamic content.
        } else {
            // Standard email without using a template.
            msg.text = ' '; // Fallback text content.
            msg.html = body; // HTML content of the email.
        }

        return msg;
    });


    // Send the email messages using SendGrid.
    Promise.all(msgs.map(msg => sgMail.send(msg)))
        .then((results) => {
            // If all emails are sent successfully, send a 200 response.
            res.status(200).json("ok");
        })
        .catch((e) => {
            // Log and send any errors encountered during the send process.
            console.log(e.message);
            res.status(500).send(e.message);
        });
});


app.listen(port, () => console.log('App listening on port ' + port))

module.exports = app; // for testing
