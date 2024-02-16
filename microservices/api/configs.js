module.exports = {
	"environment": process.env.ENVIRONMENT,
	"port": process.env.PORT || 9000,
	"onCloud": false,
	"sql": {
		"host": process.env.DB_HOST,
		"database": process.env.DB_NAME,
		"username": process.env.DB_USERNAME,
		"password": process.env.DB_PSW,
		"port": process.env.DB_PORT,
		"connection_name": process.env.DB_CONN_NAME
	},
	"jwt": {
		'secret': process.env.JWT_SECRET,
		'expiresIn': 5 * 60 // expires every 5 mins - keeps jwt always updated
	},
	"microservices": {
		"app": process.env.MICROSERVICE_APP,
		"api": process.env.MICROSERVICE_API,
		"email": process.env.MICROSERVICE_EMAIL,
		"stockx-api": process.env.MICROSERVICE_STOCKX_API,
		"pdfGenerator": process.env.MICROSERVICE_PDFGENERATOR,
	},
	"apis": {
		"cometChat": {
			"region": process.env.COMETCHAT_REGION,
			"appID": process.env.COMETCHAT_APP_ID,
			"authKey": process.env.COMETCHAT_AUTH_KEY,
			"restApiKey": process.env.COMETCHAT_REST_API_KEY
		},
		"algolia":{
			"appID": process.env.ALGOLIA_APP_ID,
			"adminAPIKey": process.env.ALGOLIA_ADMIN_API_KEY,
		},
		"gcloud": {
			"bucket_name": process.env.GCLOUD_BUCKET_NAME,
			"resourcesPath": `https://storage.googleapis.com/${process.env.GCLOUD_BUCKET_NAME}`
		},
		"shipEngine": process.env.SHIPENGINE_API,
		"revolut": {
			"url": process.env.REVOLUT_URL,
		},
		"stripeUK": {
			"apiKey": process.env.STRIPE_UK_API_KEY,
		},
		"stripeUAE": {
			"apiKey": process.env.STRIPE_UAE_API_KEY,
		},
		"sendGrid": {
			"apiKey": process.env.SENDGRID_API_KEY || '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',
		},
		"redis": {
			"instanceUrl": process.env.REDIS_INSTANCE || '127.0.0.1:6379'
		},
	},
}

