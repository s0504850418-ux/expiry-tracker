import { useState } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { auth, functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";

function errorMessage(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  switch (code) {
    case "functions/permission-denied":
      return "כתובת ה-Gmail הזו לא מורשית לגשת למסך הניהול של העסק הזה";
    case "functions/not-found":
      return "עסק לא נמצא";
    default:
      return "ההתחברות נכשלה — נסה/י שוב";
  }
}

/**
 * כניסה למסך הניהול — נפרדת ומכוונת מ"קוד מנהל" של הטאבלט (שלב 2/3).
 * מיועדת למכשיר אחר (מחשב משרד), עם חשבון Google אמיתי שהבעלים
 * הרשה/ו במפורש (ראו addAuthorizedOwnerEmail, functions/src/auth/
 * claimOwnerAccessViaGoogle.ts).
 */
export function AdminLoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);

      const claimOwnerAccessViaGoogle = httpsCallable(
        functions,
        "claimOwnerAccessViaGoogle",
      );
      await claimOwnerAccessViaGoogle({ businessId: getBusinessId() });

      // custom claims התעדכנו בצד השרת — צריך לרענן את ה-ID token
      // המקומי כדי שהם ייכנסו לתוקף. onIdTokenChanged (ב-AuthContext)
      // יתעדכן אוטומטית ברגע שהרענון מסתיים.
      await auth.currentUser?.getIdToken(true);
    } catch (err) {
      setError(errorMessage(err));
      await firebaseSignOut(auth).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="login-screen">
      <h1>מסך ניהול</h1>
      <p>כניסה עם חשבון Google מורשה בלבד</p>
      <button type="button" onClick={handleGoogleSignIn} disabled={busy}>
        {busy ? "מתחבר/ת..." : "התחברות עם Google"}
      </button>
      {error && <p className="error-text">{error}</p>}
    </main>
  );
}
