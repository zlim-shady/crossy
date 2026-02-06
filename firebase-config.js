// Firebase Configuration
// Replace these values with your own Firebase project config
// Get these from: Firebase Console > Project Settings > Your Apps > Web App

const firebaseConfig = {
    apiKey: "AIzaSyCYDFFfk0gh19Cr_s5XPiTlcSAtYkLE4Bg",
    authDomain: "crossy-crossy.firebaseapp.com",
    databaseURL: "https://crossy-crossy-default-rtdb.firebaseio.com",
    projectId: "crossy-crossy",
    storageBucket: "crossy-crossy.firebasestorage.app",
    messagingSenderId: "837276909750",
    appId: "1:837276909750:web:5f525c40c4e0e66b436617",
    measurementId: "G-0XSC804BCL"
  };

// Initialize Firebase
let firebaseApp = null;
let database = null;

try {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log('Firebase initialized successfully');
} catch (error) {
    console.warn('Firebase initialization failed:', error.message);
    console.log('Falling back to localStorage for leaderboard');
}
