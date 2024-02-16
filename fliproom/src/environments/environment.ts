// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

// The list of file replacements can be found in `angular.json`.
import * as uuid from 'uuid';
import { system } from '../assets/system.js';

// NEW

export const environment = {
  name: "local",
  production: false,
  apiUrl: 'http://localhost:9000/',
  isCordovaAvailable: false,
  showDownloadMobileAppNotification: false,
  platform: null, //ios, android, web
  screenType: null,
  debug: true,
  appVersion: system.appVersion,
  latestVersion: null,
  signupSession: false,
  storageUrl: "https://storage.googleapis.com/staging-wiredhub/",
  defaultLanguage: "en",
  stockxApi: 'https://production-stockx-api-6dwjvpqvqa-nw.a.run.app/',
  sessionId: uuid.v4(),
  firebaseConfig: {
    apiKey: "AIzaSyA6vQPLyODF6R9Csrx7qZG_BqtDsKgBydU",
    authDomain: "fliproom---ga4.firebaseapp.com",
    projectId: "fliproom---ga4",
    storageBucket: "fliproom---ga4.appspot.com",
    messagingSenderId: "1059119330640",
    appId: "1:1059119330640:web:6c10b4f5c757c49e90e855",
    voluntaryApplicationServerIdentification: "BDaLNOFGcRNZ4ek7nk3dhCWD7aP6fKJMCjYZSkjfegTbYaS6SliWD-cPlJ2KI5W5JeVMN14ZOyPaR5E5vG3o82s",
    measurementId: "G-W22X0H2KYY"
  },
  stripe:{
    publicKey: 'pk_test_51MYe1sEhuZvDyoloiLnkUUibqGIf48v33gxQTVnwm6gsquqRLpR0nphTAwDTOqNvqRChY8iKZbdkvxgDkn0D9pI500yKoFXi93'
  },
  deviceID: null,
  cometChat: {
    region: "eu",
    appID: "231314c5efd65cb1",
    authKey: "80ecef42c5d2e3f007391dfbd9b8b7b873ea118f"
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
