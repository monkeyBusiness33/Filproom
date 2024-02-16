const expect  = require('chai').expect;
const axios = require('axios');

const server = require('../app.js');

describe("Test Emails", function() {
    before(function() {
    });

    it.only('forgot-password', function(done) {
        const data = {
            receivers: ['s.rosa@wiredhub.io'],
            subject: `Fliproom - Your forgot password request`,
            message: `
            <p>Hello account name</p>
            <p>A request has been received to change password for your Fliproom account.</p>
            <div style="text-align: center;">
                <p>password</p>
            </div>
            <p>If you did not initiate this request, please change your password immediately or contact us at support@fliproom.io</p>
            <p>Thank you for using our services</p>
            <p>The Fliproom Team</p>
            `,
            attachments: []            
        }

        axios.post('http://localhost:9001/', data)
        .then(response => {
            expect(response.status).to.equal(200)
            done();
        })
        .catch((e) => {
            console.log(e.message)
            done();
        })
    });

    it('Test 1', function(done) {
        const orderID = 1
        const nameCapitalized = "Stefano"
        const surnameCapitalized = "Rosa"
        const userGeneratingTheOrder = "test@gmail.com"
        const data = {
            receivers: ['stefano.bane@gmail.com'],//, 's.rosa@wiredhub.io', 'stefano.rosa.social@gmail.com'],
            subject: `[REQUESTED] New Delivery #${orderID}`,
            message: `
            <div id="wrapper" style="text-align: center;">
            <div id="text" style="font-size: 1.5em; margin-bottom: 2em;">
                <p id="full-name">${nameCapitalized} ${surnameCapitalized}</p>
                <p id="email-address"><b>${userGeneratingTheOrder}</b></p>
                
                <p id="message">
                    Just Requested a New Delivery
                </p>
            </div>
            
            <a href="https://tramouk.wiredhub.io/ordersout/details/${orderID}" target="_blank" style="background-color: orange; padding: 1em 3em; border-radius: 0.25em; color: white; text-decoration: none; letter-spacing: 0.05em; font-family: monospace;">View Order</a>
            </div>
            `,
            attachments: []            
        }

        axios.post('http://localhost:9001/', data)
        .then(response => {
            expect(response.status).to.equal(200)
            done();
        })
        .catch((e) => {
            console.log(e.message)
            done();
        })
    });

    

    after(function() {
    })
})