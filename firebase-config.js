// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBFL6RkTZIkFsr1PsYa5oVsOdP3orjdRKc",
  authDomain: "mnrfoodbill-a8cf6.firebaseapp.com",
  projectId: "mnrfoodbill-a8cf6",
  storageBucket: "mnrfoodbill-a8cf6.firebasestorage.app",
  messagingSenderId: "122551470168",
  appId: "1:122551470168:web:e519681f82e03f4d66a22d",
  measurementId: "G-7H0JS12B7Z"
};

// Initialize Firebase only if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app();
}

const auth = firebase.auth();
const db = firebase.firestore();

// Make auth and db globally available
window.auth = auth;
window.db = db;

// IMPORTANT: Set settings BEFORE calling any other Firestore methods (like enablePersistence)
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

// Enable offline persistence
// iOS Safari does NOT support synchronizeTabs:true — fall back gracefully
db.enablePersistence({ synchronizeTabs: true })
  .then(() => {
    console.log('[Firestore] Offline persistence enabled (multi-tab)');
  })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      // Multi-tab not supported (iOS Safari) — retry without it
      db.enablePersistence({ synchronizeTabs: false })
        .then(() => console.log('[Firestore] Offline persistence enabled (single-tab)'))
        .catch(e => console.warn('[Firestore] Persistence unavailable:', e.code));
    } else if (err.code === 'unimplemented') {
      console.warn('[Firestore] Browser does not support offline persistence.');
    } else {
      console.warn('[Firestore] Persistence error:', err.code);
    }
  });

// Global online status helper used by billing.js and others
window.isOnline = () => navigator.onLine;

// Initialize Firebase Remote Config
let remoteConfig = null;

if (firebase.remoteConfig) {
    remoteConfig = firebase.remoteConfig();

    // Set minimum fetch interval (in seconds) for development/production
    remoteConfig.settings = {
        minimumFetchIntervalMillis: 3600000, // 1 hour for production
        fetchTimeoutMillis: 60000 // 60 seconds timeout
    };

    // Set default values
    remoteConfig.defaultConfig = {
        'imgbb_api_key': '' // Empty by default, will be fetched from server
    };
}

// Export remoteConfig
window.remoteConfig = remoteConfig;
