// firebaseAdmin.js
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON); // 👈 your secret key from Firebase Console

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
