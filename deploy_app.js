/* 
 Install stable android studio version (2021.3.1.16)
 https://redirector.gvt1.com/edgedl/android/studio/install/2021.3.1.16/android-studio-2021.3.1.16-mac.dmg
 Specs
   Android Studio:     2021.3.1.16
   Gradle:             7.2.1
   
 npm install @capacitor/android
 npm install @capacitor/ios@4.2.0
 npm install @capacitor/assets@next
 npm install --save-dev jetifier
 npx cap add android
 npx cap add ios

 cordova-res android --skip-config --copy
 cordova-res ios --skip-config --copy

 To run this file from the project root run : npm run deploy <new-version-number>
 ex.
    npm run deploy 0.0.7
*/

const fs = require('fs')
const execSync = require("child_process").execSync;
const plist = require('plist');
const args = require('minimist')(process.argv.slice(2));
const newAppVersion = args['_'][0]
const environment = args['_'].includes('staging') ? 'staging' : 'production'
const appName = args['_'].includes('edit-resell') ? 'edit-resell' : 'fliproom'

if (appName == 'edit-resell') {
  console.log("Deleting edit-resell files")
  fs.rmSync('edit-resell/src', { recursive: true, force: true });
  fs.rmSync('edit-resell/node_modules', { recursive: true, force: true });
  fs.rmSync('edit-resell/.angular', { recursive: true, force: true });
  fs.rmSync('edit-resell/package-lock.json', { recursive: true, force: true });
  
  //replace it with fliproom source
  console.log("Cloning fliproom src folder")
  fs.cpSync('fliproom/src', 'edit-resell/src', {recursive: true});
  fs.cpSync('fliproom/package.json', 'edit-resell/package.json', {recursive: true});
}


console.log("> update system.json file with new version")
const systemFile = JSON.parse(fs.readFileSync('./system.json'))
systemFile.appVersion = newAppVersion
fs.writeFileSync('./system.json', JSON.stringify(systemFile, null, 4))

// update api system
console.log("> update version on api")
fs.writeFileSync('./microservices/api/assets/system.json', JSON.stringify(systemFile, null, 4))

console.log(`>> [${appName}] update env variable`)
fs.writeFileSync(`./${appName}/src/assets/system.js`, `export const system = ${JSON.stringify(systemFile, null, 4)}`)

console.log(`>> [${appName}] update android version (.gradle)`)
let gradleVariables = fs.readFileSync(`./${appName}/android/variables.gradle`, 'utf-8')
const lines = gradleVariables.split(/\r?\n|\r|\n/g);
lines[2] = `    versionCode = ${parseInt(systemFile.appVersion.replace(/\./g,''))}`
lines[3] = `    versionName = "${systemFile.appVersion}"`
gradleVariables = lines.join("\n")
fs.writeFileSync(`./${appName}/android/variables.gradle`, gradleVariables)

console.log(`>> [${appName}] update ios version (.plist)`)
const plistVariables = plist.parse(fs.readFileSync(`./${appName}/ios/App/App/Info.plist`, 'utf-8'))
plistVariables.CFBundleShortVersionString = systemFile.appVersion
fs.writeFileSync(`./${appName}/ios/App/App/Info.plist`, plist.build(plistVariables))

console.log(`>> [${appName}] building src files`)
execSync(`cd ${appName} && npm install`)
execSync(`cd ${appName} && ng build --configuration=${environment}`)

console.log(`>> [${appName}] npx jetify`)
execSync(`cd ${appName} && npx jetify`)

console.log(`>> [${appName}] npx cap sync`)
execSync(`cd ${appName} && npx cap sync`)

/**
 * In fliproom/ios
 * - replace all occurences DT_TOOLCHAIN_DIR => TOOLCHAIN_DIR
 * - replace source="$(readlink "${source}")" => source="$(readlink -f "${source}")"
 */

const replaceInFiles = require('replace-in-file');
replaceInFiles({
  files: [
    `${appName}/ios/**`,
  ],

  //Replacement to make (string or regex) 
  from: /DT_TOOLCHAIN_DIR/g,
  to: 'TOOLCHAIN_DIR',
})
.then(changedFiles => {
  console.log(`>> [${appName}] open android studio`)
  execSync(`cd ${appName} && npx cap open android`)
  
  console.log(`>> [${appName}] open ios xcode`)
  execSync(`cd ${appName} && npx cap open ios`)
  
  replaceInFiles({
    files: [
      `${appName}/ios/**`,
    ],
  
    //Replacement to make (string or regex) 
    from: /source="$(readlink "${source}")"/g,
    to: 'source="$(readlink -f "${source}")"',
  })
})
.then(changedFiles => {
  console.error('DONE');
})
.catch(error => {
  console.error('Error occurred:', error);
});

