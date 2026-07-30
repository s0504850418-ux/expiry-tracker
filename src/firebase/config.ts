// אתחול Firebase עבור צד הלקוח (הטאבלט / מסך הניהול).
//
// חשוב: שום מפתח או ערך אמיתי לא כתוב כאן. כל הערכים מגיעים ממשתני
// סביבה (ראו .env.example), כדי שאפשר יהיה להפריד בין סביבת פיתוח
// לסביבת ייצור בלי לשנות קוד — רק קובץ .env שונה.

import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getFunctions, type Functions } from "firebase/functions";

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(
      `משתנה סביבה חסר: ${key}. ודא שקובץ .env.local קיים ומכיל את כל הערכים לפי .env.example`
    );
  }
  return value;
}

const firebaseConfig = {
  apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
  authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requireEnv("VITE_FIREBASE_APP_ID"),
};

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);
export const functions: Functions = getFunctions(app);
