// אתחול Firebase עבור צד הלקוח (הטאבלט / מסך הניהול).
//
// חשוב: שום מפתח או ערך אמיתי לא כתוב כאן. כל הערכים מגיעים ממשתני
// סביבה (ראו .env.example), כדי שאפשר יהיה להפריד בין סביבת פיתוח
// לסביבת ייצור בלי לשנות קוד — רק קובץ .env שונה.

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  type Firestore,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";

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

// עבודה אופליין דרך Firestore persistence מובנה (CLAUDE.md) — נתונים
// שנטענו פעם אחת (רשימת אצוות/מוצרים) נשארים זמינים לקריאה גם בלי
// חיבור, ומסתנכרנים אוטומטית כשהחיבור חוזר. יחיד לטאב אחד (טאבלט
// אחד, טאב אחד בפועל) — לא multi-tab.
export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({}),
});
export const auth: Auth = getAuth(app);
export const functions: Functions = getFunctions(app);

// חיבור ל-Firebase Emulator Suite המקומי לפיתוח/בדיקות בלבד — ראו
// README, "בדיקות מול Firebase Emulator". בפרודקשן VITE_USE_EMULATORS
// לא מוגדר (או "false") והאפליקציה מתחברת לפרויקט Firebase האמיתי.
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
