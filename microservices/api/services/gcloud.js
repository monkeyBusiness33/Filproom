const path = require('path')
const os = require('os')
const { v1: uuidv1 } = require('uuid');
const configs = require('../configs');
const fs = require('fs');
const axios = require('axios')
const httpContext = require('express-http-context');
const logger = require('../libs/logger')
const service = require('./main')
const utils = require('../libs/utils')
const crypto = require('crypto')
const db = require('../libs/db')
const Op = require('sequelize').Op;
const {Sequelize} = require('sequelize')

// Google Cloud Tasks library.
const {CloudTasksClient} = require('@google-cloud/tasks');
const client = new CloudTasksClient();

// Google Cloud mysql library.
const sqladmin = require('@google-cloud/sql').v1;

const firebase = require('firebase-admin');
const serviceAccount = require("../libs/firebase-admin-certificate.json");
firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount)
});

const firebaseMessaging = firebase.messaging();

process.env['GOOGLE_APPLICATION_CREDENTIALS'] = path.join(__dirname, '../libs/dev-account-service.json')

exports.addTask = async (queueName, httpMethod, url, headers, taskId = null, payload = null, inSeconds = null) => {

    if (configs.environment == "local") {
        logger.info('Using Local Environment - Skipping Cloud Task')
        return
    }

    if (configs.environment == "staging") {
        queueName = `staging-${queueName}`
    }

    const project = 'wiredhub';
    const location = 'europe-west2';
    const parent = client.queuePath(project, location, queueName);
    
    const task = {
        httpRequest: {
            httpMethod: httpMethod,
            url: url,
            headers: {
                'content-type': 'application/json',
                'sessionid': httpContext.get('sessionId')
            }
        }
    };

    if (headers) {
        for (var key in headers) {
            task.httpRequest.headers[key] = headers[key]
        }
    }

    /**
     * Explicitly specifying a task ID enables task de-duplication. 
     * If a task's ID is identical to that of an existing task or a task that was deleted or executed recently then 
     * the call will fail with google.rpc.Code.ALREADY_EXISTS
     */
    task.name = `projects/${project}/locations/${location}/queues/${queueName}/tasks/${taskId ? taskId : uuidv1()}`

    if (payload) {
        task.httpRequest.body = Buffer.from(JSON.stringify(payload)).toString('base64');
    }

    if (inSeconds) {
        // The time when the task is scheduled to be attempted.
        task.scheduleTime = {
          seconds: inSeconds + Date.now() / 1000,
        };
    }

    const request = {
        parent: parent,
        task: task,
    };

    try {
        await client.createTask(request);
    } catch (e) {
        if (e.code == 6) {
            logger.warn(`Task already exists with id ${taskId}`, {data: e})
            return
        } else {
            throw {status: 500, message: `Error creating cloud task | ${e}`}
        }
    }
}

exports.deleteTask = async (queueName, id) => {
    if (configs.environment == "local") {
        logger.info('Using Local Environment - Skipping Cloud Task')
        return
    }

    if (configs.environment == "staging") {
        queueName = `staging-${queueName}`
    }

    const project = 'wiredhub';
    const location = 'europe-west2';
    const parent = client.queuePath(project, location, queueName);

    await client.deleteTask({
        name: `projects/${project}/locations/${location}/queues/${queueName}/tasks/${id}`,
    });    
}

exports.listTasks = async (queueName) => {
    if (configs.environment == "local") {
        logger.info('Using Local Environment - Skipping Cloud Task')
        return
    }

    if (configs.environment == "staging") {
        queueName = `staging-${queueName}`
    }

    const project = 'wiredhub';
    const location = 'europe-west2';
    const parent = client.queuePath(project, location, queueName);

    // Construct request
    const request = {
        parent: `projects/${project}/locations/${location}/queues/${queueName}`,
    };

    // Run request - you need to use "for await" since the response is a stream
    const responseStream = await client.listTasksAsync(request);
    return responseStream
}

// Google Cloud Bucker Library
const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const GCBucket = storage.bucket(configs.apis.gcloud.bucket_name);

exports.save = async (fileBase64, fileType, destPath = null) => {
    /**
     * Upload the file and return filename
     */
    //if fileBase string passed as data:application/pdf;base64,.... remove data:application/pdf;base64,
    if (fileBase64.split(",").length == 2) {
        fileBase64 = fileBase64.split(",")[1]
    }

    const filename = `${uuidv1().replace(/-/g, '')}`
    const localFilePath  = path.join(os.tmpdir(), filename);
    const buffer = Buffer.from(fileBase64, 'base64');
    fs.writeFileSync(localFilePath, buffer);


    if (fileType.includes(".")) {
        fileType = fileType.replace(".", "")
    }

    
    let destFilePath = `${filename}.${fileType}`
    if (destPath) {
        destFilePath = `${destPath}/${filename}.${fileType}`
    }

    destFilePath =`resources/${destFilePath}`

    await GCBucket.upload(localFilePath, { destination: destFilePath})

    return Promise.resolve(`${filename}.${fileType}`)
}

exports.downloadFile = async (filepath) => {
    const [bufferFile] = await GCBucket.file(filepath).download()
    return Buffer.from(bufferFile).toString('base64')
}

exports.publishEvent = async (user, eventName, data) => {
    /**
     * Notifications
     *  eventName: order-in/created, order-in/completed, sale-order/created, order-out/completed, packing-list/generated
     *  userID: number // the user to notify
     *  accountID: // account of which the event should trigger for 
     */
    logger.info(`Publish Event ${eventName}`)

    let serviceUser, _configs, emailTemplate, emailRequest, usersToNotify = []; registrationTokens = [];

    //generate signature for webhooks
    const timestamp = new Date().getTime()
    const webhookSubscriptions = [
        {
            accountID: 3,
            eventName: 'product/created',
            url: configs.environment == "prod" ? 'https://theeditldn-admin.revton.com/rest/V1/ldn/products' : 'https://m246-ldn.revton.com/rest/V1/ldn/products',
            clientKey: configs.environment == "prod" ? 'd3tsii4ef728q55z' : 'etxy6108uzslfazm',
            headers: {
                'CF-Access-Client-Secret': '32ff33825790797af2a8fc20ea0145ee215b6c7a79309b8a5adc1e3c289c2fc3',
                'CF-Access-Client-Id': 'cda842a06bd9d52c72302308b9772045.access',
                'Authorization': `Bearer ${configs.environment == "prod" ? '4g36tq6klqy5j1h1co2ppqaipq20bvv4' : 'ojsj3ov02ek3o2trqyajlsug6inz710m'}`,

            }
        },
        {
            accountID: 3,
            eventName: 'sale_channel_listing/changed',
            saleChannelID: 3594,
            url: configs.environment == "prod" ? 'https://theeditldn-admin.revton.com/rest/V1/ldn/inventory' : 'https://m246-ldn.revton.com/rest/V1/ldn/inventory',
            clientKey: configs.environment == "prod" ? 'd3tsii4ef728q55z' : 'etxy6108uzslfazm',
            headers: {
                'CF-Access-Client-Secret': '32ff33825790797af2a8fc20ea0145ee215b6c7a79309b8a5adc1e3c289c2fc3',
                'CF-Access-Client-Id': 'cda842a06bd9d52c72302308b9772045.access',
                'Authorization': `Bearer ${configs.environment == "prod" ? '4g36tq6klqy5j1h1co2ppqaipq20bvv4' : 'ojsj3ov02ek3o2trqyajlsug6inz710m'}`,

            }
        }
    ] // fetch webhook subscriptions to publish events to 

    const webhooksToPublish = []

    switch(eventName) {
        case 'product/created':
            webhooksToPublish.push(...webhookSubscriptions.filter(record => record.eventName == eventName && record.accountID == data.accountID))
            break;
        case 'product/updated':
            break;
        case 'product/deleted':
            break;
        case 'sale_channel_listing/changed':
            webhooksToPublish.push(...webhookSubscriptions.filter(record => record.eventName == eventName && record.accountID == data.accountID && record.saleChannelID == data.saleChannel.ID))
            break;
        case 'purchase-order/created':
            break;
        case 'sale-order/created':
            break;
        case 'sale-order/updated':
            break;
        case 'sale-order/pending-reminder':
            break;
        case 'sale-order/fulfill-reminder':
            break;
        case 'sale-order/canceled':
            /**
             * @param {Object}   data -  An object of type Order
             */
            await service.notification.saleOrderCanceled(user, data.ID)
            break;
        case 'payout/triggered':
            /**
             * @param {Object}   data -  An object of type transaction
             */
            await service.notification.payoutTriggered(user, data.ID)
            break;
        case 'payment/triggered':
            /**
             * Occur when a payment for a sale transaction is started and the payment processor is 
             * capturing the funds from the customer bank account
             * @param {Object}   data -  An object of type transaction
             */
            await service.notification.paymentTriggered(user, data.ID)
            break;
        case 'payment/captured':
            /**
             * @param {Object}   data -  An object of type transaction
             */
            await service.notification.paymentCaptured(user, data.ID)
            break;
        case 'fulfillment/created':
            /**
             * Occur when a fulfillment is created
             * 
             * @param {Fulfillment}    data:     the fulfillment object
             */

            //TODO: fetch subscriptions by accountID and eventname and publish webhook
            if (configs.environment == "staging" && (data.inboundOrder?.account.ID == 7 || data.outboundOrder?.account.ID == 7)) {
                webhookRecords.push(
                    {url: 'https://m246-ldn.revton.com/rest/ldn/order/update', clientKey: 'etxy6108uzslfazm', headers: {
                        'CF-Access-Client-Secret': '32ff33825790797af2a8fc20ea0145ee215b6c7a79309b8a5adc1e3c289c2fc3',
                        'CF-Access-Client-Id': 'cda842a06bd9d52c72302308b9772045.access',
                        'Authorization': `Bearer ojsj3ov02ek3o2trqyajlsug6inz710m`,
                    }}
                )
            }
            break;
        case 'fulfillment/updated':
            /**
             * Occur when a fulfillment is updated. Added shipping label or tracking number, changed reference or status
             * 
             * @param {Fulfillment}    data:     the fulfillment object
             */

            //TODO: fetch subscriptions by accountID and eventname and publish webhook
            if (configs.environment == "staging" && (data.inboundOrder?.account.ID == 7 || data.outboundOrder?.account.ID == 7)) {
                webhookRecords.push(
                    {url: 'https://m246-ldn.revton.com/rest/ldn/order/update', clientKey: 'etxy6108uzslfazm', headers: {
                        'CF-Access-Client-Secret': '32ff33825790797af2a8fc20ea0145ee215b6c7a79309b8a5adc1e3c289c2fc3',
                        'CF-Access-Client-Id': 'cda842a06bd9d52c72302308b9772045.access',
                        'Authorization': `Bearer ojsj3ov02ek3o2trqyajlsug6inz710m`,
                    }}
                )
            }
            break;
            break;
        case 'order-line-item/canceled':
            /**
             * Occur when an order line item is cancelled
             */
            await service.notification.saleOrderItemCanceled(user, data.ID)
            break
        default:
            break;
    }

    console.log(`webhooksToPublish`, webhooksToPublish.length)
    await Promise.all(webhooksToPublish.map( record => {
        const sha256EventSignature = crypto.createHmac('sha256', record.clientKey).update(`${timestamp}.${eventName}`).digest("hex");
        return service.gcloud.addTask('events', 'POST', `${record.url}`, 
        Object.assign({}, {
            'fliproom-signature': sha256EventSignature,
        }, record.headers
        ),
        null,
        {
            timestamp: timestamp,
            eventName: eventName,
            data: JSON.parse(JSON.stringify(data))
        })
    }))
    return
}

exports.pushNotification = async (registrationTokens, data) => {
    const message = {
        notification: {
            title: data.title,
            body: data.body
        },
        data: {
            notificationType: data.notificationType,
            action: data.action,
            panel: data.panel,
        },
        tokens: registrationTokens,
    };
    if (data.id) {
        message.data.id = data.id;
    }

    try {
        const response = await firebaseMessaging.sendMulticast(message)
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (resp.success) return
                //log why notification failed
                const registeredToken = registrationTokens[idx]
                logger.warn(`Notification failed ${resp.error}`, {data: {registeredToken}})
            })
        }
    } catch (e) {
        throw e
    }
}

exports.mysql = {
    export: async () => {
        /**
         * This function is used to export the production database to a file in the google cloud bucket
         * In order to use this function, you need to do the following setup
         * 1. grant to the service account the Cloud SQL Admin role
         *      - IAM > service account > edit > add role > Cloud SQL Admin
         * 2. grant the mySQL service account (production) the Storage Object Admin role on the bucket
         *      - storage > bucket > permissions > add member > service account > Storage Object Admin
         */
        logger.info('gcloud.mysql.export')
        const sqlOperationsClient = new sqladmin.SqlOperationsServiceClient({fallback: 'rest'});
        const sqlClient = new sqladmin.SqlInstancesServiceClient({fallback: 'rest'});

        const projectId = await sqlClient.getProjectId();

        try {
            const exportResponse = await sqlClient.export({
                instance: 'production',
                project: projectId,
                body: {
                    exportContext: {
                        fileType: 'SQL',
                        uri: `gs://wiredhub-secrets/production.sql`,
                        databases: ['wms'],
                    }
                }
            });
            let exportOperation = exportResponse[0];
            while (exportOperation.status !== 'DONE') {
                logger.info(`Waiting for operation EXPORT to complete...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                [exportOperation] = await sqlOperationsClient.get({
                    operation: exportOperation.name,
                    project: projectId,
                  });
            }
            logger.info('Database exported successfully')
        } catch (exportErrorResponse) {
            logger.info(exportErrorResponse)
            throw {status: 500, message: `Error exporting database | ${exportErrorResponse}`}
        }
    },
    import: async () => {
        /**
         * This function is used to import the production.sql in the bloud bucket to staging db instance
         * In order to use this function, you need to do the following setup
         * 1. grant the mySQL service account (staging instance) the Storage Object Admin role on the bucket
         *      - storage > bucket > permissions > add member > service account > Storage Object Admin
         */
        logger.info('gcloud.mysql.import')
        const sqlOperationsClient = new sqladmin.SqlOperationsServiceClient({fallback: 'rest'});
        const sqlClient = new sqladmin.SqlInstancesServiceClient({fallback: 'rest'});
        const projectId = await sqlClient.getProjectId();

        try {
            const importResponse = await sqlClient.import({
                instance: 'staging',
                project: projectId,
                body: {
                    importContext: {
                        fileType: 'SQL',
                        uri: `gs://wiredhub-secrets/production.sql`,
                        databases: ['wms'],
                    }
                }
            });
            let importOperation = importResponse[0];
            while (importOperation.status !== 'DONE') {
                logger.info(`Waiting for operation IMPORT to complete...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                [importOperation] = await sqlOperationsClient.get({
                    operation: importOperation.name,
                    project: projectId,
                  });
            }
            logger.info('Database imported successfully')
        } catch (importErrorResponse) {
            logger.info(importErrorResponse)
        }
    }
}