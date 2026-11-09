const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { MockFirestore, MockAuth } = require('../services/mockFirestore');

dotenv.config();

let db;
let auth;
let storageBucket = null;
let isUsingMock = false;

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ration-system-877e4';
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://ration-system-877e4-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'ration-system-877e4.firebasestorage.app';

function initializeFirebase() {
  try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : path.join(__dirname, 'serviceAccountKey.json');

    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: FIREBASE_DATABASE_URL,
        storageBucket: FIREBASE_STORAGE_BUCKET
      });

      db = admin.firestore();
      auth = admin.auth();
      storageBucket = admin.storage().bucket();
      console.log(`✅ Real Firebase Admin initialized with service account for project: ${serviceAccount.project_id || FIREBASE_PROJECT_ID}`);
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }),
        databaseURL: FIREBASE_DATABASE_URL,
        storageBucket: FIREBASE_STORAGE_BUCKET
      });

      db = admin.firestore();
      auth = admin.auth();
      storageBucket = admin.storage().bucket();
      console.log(`✅ Real Firebase Admin initialized with environment credentials for project: ${FIREBASE_PROJECT_ID}`);
    } else {
      console.log(`ℹ️ Project ID set to '${FIREBASE_PROJECT_ID}'.`);
      console.log(`ℹ️ No Google Service Account JSON provided. Activating persistent local Firestore mirror for ${FIREBASE_PROJECT_ID}...`);
      const mockDb = new MockFirestore();
      db = mockDb;
      auth = new MockAuth(mockDb);
      isUsingMock = true;
      console.log(`✅ Persistent Firestore engine active (backend/data/firestore_db.json) mapped to ${FIREBASE_PROJECT_ID}.`);
    }
  } catch (error) {
    console.warn('⚠️ Warning initializing Firebase Admin:', error.message);
    console.log('ℹ️ Falling back to persistent local Firestore engine.');
    const mockDb = new MockFirestore();
    db = mockDb;
    auth = new MockAuth(mockDb);
    isUsingMock = true;
  }
}

initializeFirebase();

module.exports = {
  admin,
  db,
  auth,
  storageBucket,
  isUsingMock,
  FIREBASE_PROJECT_ID,
  FIREBASE_DATABASE_URL,
  FIREBASE_STORAGE_BUCKET
};
