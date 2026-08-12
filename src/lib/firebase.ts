import { initializeApp } from "firebase/app";
import { getAuth, browserLocalPersistence, initializeAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAoVME5XZVb4Noy0HQjiCvcV18ol96Q0QU",
  authDomain: "eventspot-r2xqx.firebaseapp.com",
  projectId: "eventspot-r2xqx",
  storageBucket: "eventspot-r2xqx.firebasestorage.app",
  messagingSenderId: "993842389749",
  appId: "1:993842389749:web:df0697e82c82615e8c9bbc"
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, "ai-studio-0bfaf330-d35d-47f3-9b04-29d5d9294679");