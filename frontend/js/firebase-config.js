/**
 * Smart Indian Public Distribution System (PDS)
 * Firebase Client SDK Configuration & Initialization
 * Project: ration-system-877e4
 */

const firebaseConfig = {
  apiKey: "AIzaSyCEB_ohsWhMBvkOPue8XGKkUeh8eDSNpkg",
  authDomain: "ration-system-877e4.firebaseapp.com",
  databaseURL: "https://ration-system-877e4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ration-system-877e4",
  storageBucket: "ration-system-877e4.firebasestorage.app",
  messagingSenderId: "803105490911",
  appId: "1:803105490911:web:4a91456b594dc4653c666a",
  measurementId: "G-BQ19ND2E46"
};

// Check if Firebase Web SDK is loaded via CDN/module
if (typeof firebase !== 'undefined') {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("🔥 Firebase Web Client Initialized for project:", firebaseConfig.projectId);
  }
}

// Export for module environments if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseConfig;
}

