import * as uuid from 'uuid';
import { system } from '../assets/system.js';

export const environment = {
  name: "production",
  production: true,
  apiUrl: 'https://production-api-6dwjvpqvqa-nw.a.run.app/',
  isCordovaAvailable: false,
  showDownloadMobileAppNotification: false,
  platform: null, //ios, android, web
  screenType: null,
  debug: true,
  appVersion: system.appVersion,
  latestVersion: null,
  signupSession: false,
  storageUrl: "https://storage.googleapis.com/production-wiredhub/",
  stockxApi: 'https://production-stockx-api-6dwjvpqvqa-nw.a.run.app/',
  defaultLanguage: "en",
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
  deviceID: null,
  stripe:{
    publicKey: 'pk_live_51MYe1sEhuZvDyolopTGTNaU4CdZtg8oVltmGF555iMhuNGKoWJA6Fw7NYtztaBSrE3A3qJq09t0ZEaEb6slrYVSg000nQRQ1Qn'
  },
  cometChat: {
    region: "eu",
    appID: "226556fe65e9894c",
    authKey: "f16ec63962e52c7520988a41d8a4e519aaa672b4"
  }
};

