importScripts("https://www.gstatic.com/firebasejs/9.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: "AIzaSyDYpoJftYGI0qFnMEtJYaIMQrFtPkNIJZM",
    authDomain: "fliproom-c30f1.firebaseapp.com",
    projectId: "fliproom-c30f1",
    databaseURL: 'https://fliproom-c30f1.firebaseio.com',
    storageBucket: "fliproom-c30f1.appspot.com",
    messagingSenderId: "555644628280",
    appId: "1:555644628280:web:51f13d0cf42a97e547a5cd",
    measurementId: "G-04P297BRML"
  });

const messaging = firebase.messaging();

