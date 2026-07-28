"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Firebase web config is public identifier info (not a secret), per Google's
// docs. Access control is enforced by Firebase security rules + our own
// server-side ID token verification.
const firebaseConfig = {
  apiKey: "AIzaSyB0VlKIgJC6PqtERB6UnoDL9HXTzjinMdY",
  authDomain: "ratify-75052.firebaseapp.com",
  projectId: "ratify-75052",
  storageBucket: "ratify-75052.firebasestorage.app",
  messagingSenderId: "912097908586",
  appId: "1:912097908586:web:3ce1b874e5e7276ed87713",
  measurementId: "G-393S7LSC8P",
};

let app: FirebaseApp;
let authInstance: Auth;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
