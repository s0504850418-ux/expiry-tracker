import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (!d || typeof d.businessId !== "string" || d.businessId.length === 0) {
    throw new HttpsError("invalid-argument", "businessId נדרש");
  }
  return { businessId: d.businessId };
}

/**
 * נקראת אחרי שהלקוח כבר התחבר עם Google (signInWithPopup/Redirect —
 * לא custom token). בודקת אם כתובת המייל של המשתמש המחובר מופיעה
 * ברשימת ownerEmails של העסק; אם כן, מעניקה custom claims של owner
 * ל-uid הזה (שהוא ה-uid שגוגל הנפיקה, לא owner_{businessId} כמו
 * בזרימת קוד המנהל). הלקוח חייב לרענן את ה-ID token אחרי הצלחה
 * (getIdTokenResult(true)) כדי שה-claims החדשים ייכנסו לתוקף.
 *
 * זהו מסלול נפרד ומכוון מ"קוד מנהל" — מיועד למסך הניהול (שלב 7),
 * לרוב ממכשיר אחר (מחשב משרד) ולא מהטאבלט.
 */
export const claimOwnerAccessViaGoogle = onCall(async (request) => {
  const { businessId } = validate(request.data);

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "יש להתחבר עם Google תחילה");
  }
  const email = request.auth.token.email as string | undefined;
  if (!email || !request.auth.token.email_verified) {
    throw new HttpsError(
      "permission-denied",
      "נדרשת כתובת Gmail מאומתת",
    );
  }

  const businessSnap = await getFirestore().doc(`businesses/${businessId}`).get();
  if (!businessSnap.exists || businessSnap.data()?.active !== true) {
    throw new HttpsError("not-found", "עסק לא נמצא");
  }
  // ownerEmails נשמר תחת secrets/ (חסום לגמרי ללקוח, כמו שאר הסודות)
  // ולא על מסמך העסק עצמו — כדי שמנהל/ת משמרת, שיכול/ה לקרוא את
  // מסמך העסק, לא ייחשף/תיחשף לכתובות המייל של הבעלים.
  const googleAccessSnap = await getFirestore()
    .doc(`businesses/${businessId}/secrets/googleAccess`)
    .get();
  const ownerEmails = (googleAccessSnap.data()?.ownerEmails as string[] | undefined) ?? [];
  const authorized = ownerEmails.some(
    (e) => e.toLowerCase() === email.toLowerCase(),
  );

  if (!authorized) {
    await writeAuditLog({
      businessId,
      action: "auth.googleAccess.denied",
      performedByUid: request.auth.uid,
      performedByRole: "system",
      targetType: "authAttempt",
      targetId: request.auth.uid,
      metadata: { email },
    });
    throw new HttpsError(
      "permission-denied",
      "כתובת המייל הזו לא מורשית לגשת למסך הניהול של העסק הזה",
    );
  }

  await getAuth().setCustomUserClaims(request.auth.uid, {
    businessId,
    role: "owner",
  });

  await writeAuditLog({
    businessId,
    action: "auth.googleAccess.granted",
    performedByUid: request.auth.uid,
    performedByRole: "owner",
    targetType: "authAttempt",
    targetId: request.auth.uid,
    metadata: { email },
  });

  return { success: true };
});
