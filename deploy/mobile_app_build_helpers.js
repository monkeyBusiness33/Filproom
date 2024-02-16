const fs = require('fs')
const axios = require('axios')
const { Storage } = require('@google-cloud/storage');
const myArgs = process.argv.slice(2);

String.prototype.replaceAt = function(index, replacement) {
    return this.substr(0, index) + replacement + this.substr(index + replacement.length);
}

const mode = myArgs[0]
const bucketName =  myArgs[1]
const appFolder = myArgs[2]

/**
 * INTERNAL VARIABLES
 */
const _apkSourcePath = './android/app/build/outputs/apk/release/app-release.apk'
const _xmlFilename = 'app.update.xml'

if (mode == "update") {
     update(bucketName, appFolder)
}

if (mode == "upload") {
    upload(bucketName, appFolder)
}

async function update(bucketName, appFolder) {
    console.log(`https://storage.googleapis.com/${bucketName}/${appFolder}/${_xmlFilename}?${new Date().getTime()}`)
    const response = await axios.get(`https://storage.googleapis.com/${bucketName}/${appFolder}/${_xmlFilename}?${new Date().getTime()}`)
    const currentXML = response.data
    const _startIdx = currentXML.indexOf("<version>") + 9
    const appCurrentVersion = currentXML.slice(_startIdx, _startIdx + 5).replaceAt(1, ".").replaceAt(3, ".")
    
    // Compute new version name
    const newVersionDigitsList = ((parseInt(appCurrentVersion.replaceAll(".", "")) + 1).toString()).split("")
    const appNewVersion = newVersionDigitsList.reduce((newVersion, char, idx) => newVersion += `${char}${idx != 2 ? '.' : ''}`, "")
    
    // Update build.gradle
    let buildGradleText = fs.readFileSync('./android/app/build.gradle', 'utf-8')
    const sliceStart = buildGradleText.indexOf("versionName") + 13
    const sliceEnd = sliceStart + 5
    const gradleOldVersion = buildGradleText.slice(sliceStart, sliceEnd)

    buildGradleText = buildGradleText.replace(gradleOldVersion, appNewVersion);
    buildGradleText = buildGradleText.replace(gradleOldVersion.replaceAll(".", "0"), appNewVersion.replaceAll(".", "0"));
    
    // Save new build.gradle
    fs.writeFileSync('./android/app/build.gradle', buildGradleText)

    console.log(`Updating ${appCurrentVersion} -> ${appNewVersion}`)

    const appNames = {
        'pilot-app': 'Wiredhub Pilot',
        'warehouse-app': 'wiredhub-mobile' 
    } 
    // Save new app.update xml
    const newXml=`<update>
    <version>${appNewVersion.replaceAll(".", "0")}</version>
    <name>${appNames[appFolder]}</name>
    <url>https://storage.googleapis.com/${bucketName}/${appFolder}/versions/release_v${appNewVersion}.apk</url>
</update>`
    fs.writeFileSync(`./${_xmlFilename}`, newXml)
}

async function upload(bucketName, appFolder) {
    const storage = new Storage({ keyFilename: './storage.auths.json' });
    const appXML = fs.readFileSync(`./${_xmlFilename}`, 'utf-8')
    const sliceStart = appXML.indexOf("release_v") + 9
    const sliceEnd = appXML.indexOf(".apk")
    const _appVersion = appXML.slice(sliceStart, sliceEnd)
    const apkFilename = `release_v${_appVersion}.apk`

    console.log(`Uploading ${apkFilename}`)
    // Upload APK
    await storage.bucket(bucketName).upload(`${_apkSourcePath}`, { destination: `${appFolder}/versions/${apkFilename}`});
    console.log(`Uploading app.update.xml`)
    // Upload XML
    await storage.bucket(bucketName).upload(`./${_xmlFilename}`, { destination: `${appFolder}/${_xmlFilename}`});
    
    console.log("DONE")
}
