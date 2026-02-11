// Firebase Configuration
// Replace these values with your Firebase project settings
// Get these from: https://console.firebase.google.com/ > Project Settings > Your Apps

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence()
    .catch((err) => {
        if (err.code === 'failed-precondition') {
            console.log('Multiple tabs open, persistence only enabled in one tab');
        } else if (err.code === 'unimplemented') {
            console.log('Browser does not support persistence');
        }
    });

console.log('Firebase initialized');
