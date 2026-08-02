import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireOwner } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  email: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.email !== "string" ||
    !EMAIL_PATTERN.test(d.email.trim())
  ) {
    throw new HttpsError("invalid-argument", "businessId וכתובת מייל תקינה נדרשים");
  }
  return { businessId: d.businessId, email: d.email.trim().toLowerCase() };
}

/**
 * מוסיפה כתובת מייל לרשימת ה-Gmail המורשות להתחבר למסך הניהול
 * (מסלול Google, ראו claimOwnerAccessViaGoogle.ts). owner-only —
 * נקרא ע"י בעל/ת עסק שכבר מחובר/ת (דרך קוד מנהל בטאבלט, למשל), כדי
 * לתת גישה למסך הניהול למישהו אחר (או לעצמו/ה מחשבון Gmail).
 */
export const addAuthorizedOwnerEmail = onCall(async (request) => {
  const data = validate(request.data);
  requireOwner(request, data.businessId);

  // נשמר תחת secrets/ (חסום לגמרי ללקוח) ולא על מסמך העסק עצמו — כדי
  // שמנהל/ת משמרת, שיכול/ה לקרוא את מסמך העסק, לא ייחשף/תיחשף
  // לכתובות המייל של הבעלים. set(merge) כי המסמך אולי עוד לא קיים.
  const googleAccessRef = getFirestore().doc(
    `businesses/${data.businessId}/secrets/googleAccess`,
  );
  await googleAccessRef.set(
    { ownerEmails: FieldValue.arrayUnion(data.email) },
    { merge: true },
  );

  await writeAuditLog({
    businessId: data.businessId,
    action: "auth.ownerEmailAdded",
    performedByUid: request.auth!.uid,
    performedByRole: "owner",
    targetType: "business",
    targetId: data.businessId,
    metadata: { email: data.email },
  });

  return { success: true };
});
