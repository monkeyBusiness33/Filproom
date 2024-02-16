module.exports = {
	"environment": process.env.ENVIRONMENT || 'local',
	"port": process.env.PORT || 11000,
	"authorizations": {
		"poolSize": 20,
		"maxConsecutiveErrors": 20
	},
	"queue": {
		"batchesPerJob": 2,
		"maxConcurrency": 5,
		"maxRetryAttempts": 5,
		"daysBetweenUpdates": 3,
	},
	"sql": {
		"host": process.env.DB_HOST || 'localhost',//'34.105.152.183',
		"database": process.env.DB_NAME || 'fliproom',
		"username": process.env.DB_USERNAME || 'root',
		"password": process.env.DB_PSW || 'rootroot',
		"port": process.env.DB_PORT || 3306,
		"connection_name": process.env.DB_CONN_NAME || null
	},
	"proxy": {
		"hostname": 'proxy.packetstream.io',
		"port": 31111,
		"username": 'steveoo',
		"password": 'j0Tvzo3IFvyWcQ5c'
	},
	// "cloud": {
	// 	"bucket_name": process.env.BUCKET_NAME || 'staging-wiredhub',
	// 	"bucket_auths": "cloud.storage.access.auths.json"
	// },
	// "jwt": {
	// 	'secret': 'supersecret'
	// },
	// "microservices": {
	// 	"email": process.env.MICROSERVICE_EMAIL || 'https://staging-email-6dwjvpqvqa-nw.a.run.app'
}
