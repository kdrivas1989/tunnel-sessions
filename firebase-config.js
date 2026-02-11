// Firebase Configuration
// Replace these values with your Firebase project settings
// Get these from: https://console.firebase.google.com/ > Project Settings > Your Apps

const firebaseConfig = {
    apiKey: "AIzaSyCk--xCcz0XFx9Qp0ZuLlwKQNIPVOzRAGc",
    authDomain: "tunnel-sessions.firebaseapp.com",
    projectId: "tunnel-sessions",
    storageBucket: "tunnel-sessions.firebasestorage.app",
    messagingSenderId: "582837847135",
    appId: "1:582837847135:web:2f31458bdc2fd0112307ea"
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
