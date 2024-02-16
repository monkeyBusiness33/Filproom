const express = require('express')
const fs = require('fs')
const os = require('os')
const path = require('path')
const cors = require('cors')
const bodyParser = require('body-parser');
const compression = require('compression');

const puppeteer = require('puppeteer') // used to generate pdf from html
const hb = require('handlebars') // used to generate pdf from html
const PDFMerger = require('pdf-merger-js'); // used for barcodes - merge multiple pdfs together
const JsBarcode = require('jsbarcode'); // used to convert barcode value in barcode image
var { createCanvas, loadImage} = require("canvas"); // used to convert barcode value in barcode image
//const QRCode = require('qrcode')

const port = process.env.PORT || 8080

const app = express()
app.use(bodyParser.json());
app.use(compression());
app.use(cors())

/*
HANDLEBARS HELPERS:
    - used to create custom helpers for handlebars which allow to add logic
      to the template
    -USAGE EXAMPLES:
        {{#ifCond v1 v2}}
            {{v1}} is equal to {{v2}}
        {{else}}
            {{v1}} is not equal to {{v2}}
        {{/ifCond}}
* */

//custom if helper to compare values
hb.registerHelper('ifCond', function(v1, v2, options) {
    if(v1 === v2) {
        return options.fn(this);
    }
    return options.inverse(this);
});
//custom if helper to check if value exists
hb.registerHelper('ifExists', function(value, options) {
    if(value !== null && value !== undefined) {
        return options.fn(this);
    }
    return options.inverse(this);
});




function generateBarcodeImage(barcodeValue) {
    return new Promise((resolve, reject) => {
        var canvas = createCanvas()
        JsBarcode(canvas, barcodeValue, {displayValue: false});
        canvas.toDataURL('image/png', function(err, str) {
            if (err) resolve('')
            resolve(str)
        });
    })
}

const QRCode = require('qrcode')

async function generateQRCodeImage(barcodeValue) {
    //used to replace easyqrcodejs-nodejs since not workign with node 20
    return QRCode.toDataURL(barcodeValue)
}
    
const _QRCode = require('easyqrcodejs-nodejs');
async function generateQRCodeImage_deprecated(barcodeValue) {
    //replaced by 'qrcode' package since easyqrcodejs-nodejs not working yet (7/11/23) with node 20. Restore once new easyqrcodejs-nodejs version is released (currenlty 4.5.0)
    var options = {
        text: barcodeValue,
        logo: "./assets/fliproom_logo_black.png",
        dotScale: 0.5,
        dotScaleTiming: 0.5
    };

    const qrcode = new QRCode(options);
    return qrcode.toStream()
}


app.post('/generate/:templateName', async (req, res) => {
    /**
     * fileType: string 'pdf', 'png', 'jpeg'
     * templateData: Object
     * 
     * 
     */
    const templateName = req.params.templateName
    const templateData = req.body.templateData

    const _contentTypes = {
        'pdf': 'application/pdf',
        'png': 'image/png',
        'jpeg': 'image/jpeg'
    }
    
    try {
        console.log("templateName", templateName)
        const _template = fs.readFileSync(`./templates/${templateName}.html`, 'utf-8')
        const fileType = req.body.fileType || 'pdf'

        // Compile the template with handlebars
        const template = hb.compile(_template, { strict: true });
        // We can use this to add dyamic data to our handlebas template at run time from database or API as per need. you can read the official doc to learn more https://handlebarsjs.com/
        const result = template(templateData);
        const html = result;

        const browser = await puppeteer.launch({
            headless: true, 
            args:['--no-sandbox', '--disable-dev-shm-usage'],
            defaultViewport: {
                height: 842*2,
                width: 595*2
            },
            deviceScaleFactor: 2,
        });
        const page = await browser.newPage()

        if (templateName == 'receipt') {
            await page.setViewport({
                width: 250,
                height: 480,
              });
        }

        await page.setContent(html)

        const filename = path.join(os.tmpdir(), `${templateName}_${new Date().getTime()}.${fileType}`)

        if (fileType == 'pdf') {
            await page.pdf({ 
                path: filename, 
                format: 'A4', 
                displayHeaderFooter: true,
                headerTemplate: '<div style="height: 50px"></div>',
                footerTemplate: '<div style="height: 50px"></div>',
                margin: {
                    top: '2cm',
                    bottom: '2cm'
                }
            })
        } else if (fileType == 'png' || fileType == 'jpeg') {
            await page.screenshot({
                path: filename, 
                fullPage: true,
                displayHeaderFooter: true,
                headerTemplate: '<div style="height: 50px"></div>',
                footerTemplate: '<div style="height: 50px"></div>',
                margin: {
                    top: '2cm',
                    bottom: '2cm'
                }
            })
        }

        await browser.close();

        const generated = fs.readFileSync(filename)

        res.writeHead(200, {
            'Content-Length': Buffer.byteLength(generated),
            'Content-Type': _contentTypes[fileType],
            'Content-disposition': `attachment; filename=${filename}.${fileType}`
        }).end(generated);
    } catch(e) {
        console.log(e.message)
        res.status(500).send(e.message)
    }
    
    return
})


app.post('/generate/barcodes/:templateName', async (req, res) => {
    /**
     * templateName: string
     * barcodeType: string - barcode, qrcode
     * templateData: [{}]
     */
    const merger = new PDFMerger();

    try {
        const templateName = req.params.templateName
        const barcodeType = req.body.barcodeType || 'barcode'
        const templateData = req.body.templateData
        const height = req.body.templateSize ? req.body.templateSize.height : '7.0cm'
        const width = req.body.templateSize ? req.body.templateSize.width : '11.0cm'

        templateHTML = fs.readFileSync(`./templates/${templateName}.html`, 'utf-8') // TODO convert to default template to not break ytramo

        // Compile the template with handlebars
        const template = hb.compile(templateHTML, { strict: true });
        const browser = await puppeteer.launch({
            headless: true, 
            args:['--no-sandbox', '--disable-dev-shm-usage']
        });
        const tab = await browser.newPage()

        // Generate barcode images from barcodes values
        let barcodeImagesUrl
        if (barcodeType == "barcode") {
            barcodeImagesUrl = await Promise.all(templateData.map(templateRecord => generateBarcodeImage(templateRecord.barcodeValue)))
        } else if (barcodeType == "qrcode") {
            barcodeImagesUrl = await Promise.all(templateData.map(templateRecord => generateQRCodeImage(templateRecord.barcodeValue)))
        }

        console.log("prepare")
        const pdfBarcodes = []
        let idx = 0;
        for (var templateRecord of templateData) {
            templateRecord.barcodeImgUrl = barcodeImagesUrl[idx]
            // We can use this to add dyamic data to our handlebas template at run time from database or API as per need. you can read the official doc to learn more https://handlebarsjs.com/
            const result = template(templateRecord);
            const html = result;
            await tab.setContent(html)
            const filename = path.join(os.tmpdir(), `${templateName}_${templateRecord.barcodeValue}_${new Date().getTime()}.pdf`)
            await tab.pdf({ path: filename, width: width, height: height}) // save the genrated label locally for later be merged with other labels
            pdfBarcodes.push(filename)

            idx += 1 // pointer to load correct barcode image previously generated
        }

        await browser.close();

        // Merge barcodes togheter
        pdfBarcodes.forEach(filePath => merger.add(filePath))
        const mergedFilePath = path.join(os.tmpdir(), 'merged.pdf')
        await merger.save(mergedFilePath)

        // Load and send it back
        const pdfData = fs.readFileSync(mergedFilePath)
        res.writeHead(200, {
            'Content-Length': Buffer.byteLength(pdfData),
            'Content-Type': 'application/pdf',
            'Content-disposition': `attachment; filename=${mergedFilePath}.pdf`
        }).end(pdfData);
    } catch(e) {
        console.log(e.message)
        res.status(500).send(e.message)
    }
    
    return
})

app.listen(port, () => console.log('App listening on port ' + port))

module.exports = app; // for testing
