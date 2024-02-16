const server = require('../app.js');
const axios = require('axios')
const request = require('request');
const expect  = require('chai').expect;
const moment = require('moment')

describe("Stockx", function() {
    beforeEach(function() {
    });
    
    it.only('Fetch stockx Product', async () => {
        const stockxId = "puma-rs-xl-lamelo-ball-lafrance-foreverrare" //"air-jordan-11-retro-cool-grey-2021-gs" //"nike-air-force-1-low-afro-punk-khaki"
        const resp = await axios.get(`http://localhost:11000/api/stockx/products/${stockxId}`)
        expect(resp.status).to.equal(200)
        console.log(resp.data)
        //console.log(moment.utc(resp.data.traits.find(trait => trait.name == "Release Date").value, 'YYYY-MM-DD'))
        return Promise.resolve()
    }).timeout(600000);

    it('Fetch stockx new releases', async () => {
        const resp = await axios.get(`http://localhost:11000/api/stockx/new-releases`)
        expect(resp.status).to.equal(200)
        expect(resp.data).to.be.an("array")
        console.log(resp.data)
        return Promise.resolve()
    }).timeout(600000);
})

describe("Worker", function() {
    beforeEach(function() {
    });

    it('Parse New Releases', async () => {
        const resp = await axios.get(`http://localhost:11000/api/worker/parse-new-releases`)
        expect(resp.status).to.equal(200)
    }).timeout(180000);

    it('Process Queue', async () => {
        const resp = await axios.get(`http://localhost:11000/api/worker/queue/process`)
        expect(resp.status).to.equal(200)
    }).timeout(180000);

    it('Import New Product on Request', async () => {
        const resp = await axios.post(`http://localhost:11000/api/worker/queue/tasks`, {
            url: 'https://stockx.com/adidas-yeezy-boost-350-turtle-dove-2022',
            process: true
        })

        expect(resp.status).to.equal(200)
        expect(resp.data).to.be.equal("ok")
    }).timeout(60000)

    it('Update Product on Request', async () => {
        const resp = await axios.post(`http://localhost:11000/api/worker/queue/tasks`, {
            stockxId: 'air-jordan-1-retro-low-og-unc-to-chicago-womens',
            type:     'update',
            process:  true
        })

        expect(resp.status).to.equal(200)
        expect(resp.data).to.be.equal("ok")
    }).timeout(60000)

    it('Generate Queue Report', async () => {
        const resp = await axios.get(`http://localhost:11000/api/worker/queue/report`)
        expect(resp.status).to.equal(200)
    }).timeout(120000);
})

describe("API", function() {
    beforeEach(function() {
    });

    it('Search Products', async () => {

        const params = {
            offset: 0,
            limit: 1,
            sort: null,
            search: '1df15ac7-494c-410e-85c3-4f44a22e8c6b'
        }
        const resp = await axios.get('http://localhost:11000/api/products', {params: params})
        expect(resp.status).to.equal(200)
        expect(resp.data.count).to.be.an("number")
        expect(resp.data.rows).to.be.an("array")
        expect(resp.data.rows[0].variants.length).to.equal(22)
    });

    it('Search Variants', async () => {

        const params = {
            offset: 0,
            limit: 1,
            sort: null,
            search: '1df15ac7-494c-410e-85c3-4f44a22e8c6b'
        }
        const resp = await axios.get('http://localhost:11000/api/products/variants', {params: params})
        expect(resp.status).to.equal(200)
        expect(resp.data.count).to.be.an("number")
        expect(resp.data.rows).to.be.an("array")
        expect(resp.data.rows[0].variants.length).to.equal(22)
    });
})