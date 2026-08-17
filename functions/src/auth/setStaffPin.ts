import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireOwner } from "../lib/authz";
import { hashSecret } from "../lib/pin";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  staffId: string;
  name: string;
  pin?: string;
  active: boolean;
  isShiftManager: boolean;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.staffId !== "string" ||
    d.staffId.length === 0 ||
    typeof d.name !== "string" ||
    d.name.trim().length === 0 ||
    typeof d.active !== "boolean" ||
    typeof d.isShiftManager !== "boolean" ||
    (d.pin !== undefined && (typeof d.pin !== "string" || d.pin.length < 4))
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, staffId, name, active ו-isShiftManager נדרשים; pin, כשמסופק, חייב להיות לפחות 4 תווים",
    );
  }
  return {
    businessId: d.businessId,
    staffId: d.staffId,
    name: d.name,
    pin: d.pin,
    active: d.active,
    isShiftManager: d.isShiftManager,
  };
}

/**
 * יוצר/ת עובד/ת חדש/ה או מעדכנ/ת עובד/ת קיימ/ת. owner-only.
 * ברירת מחדל: עובד/ת רגיל/ה (isShiftManager===false, בלי PIN, לא יכול/ה
 * להתחבר כמנהל/ת משמרת). isShiftManager===true דורש PIN תקף — אם עדיין
 * אין staffSecrets ולא נשלח pin בקריאה הזו, נדחה. הורדה בחזרה ל-false
 * מוחקת staffSecrets בפועל (לא רק מסתירה ב-UI) — כדי שה-PIN הישן לא
 * ימשיך לעבוד מול verifyStaffPin.
 */
export const setStaffPin = onCall(async (request) => {
  const { businessId, staffId, name, pin, active, isShiftManager } = validate(
    request.data,
  );
  requireOwner(request, businessId);

  const db = getFirestore();
  const staffRef = db.doc(`businesses/${businessId}/staff/${staffId}`);
  const secretRef = db.doc(`businesses/${businessId}/staffSecrets/${staffId}`);
  const existing = await staffRef.get();
  const existingSecret = await secretRef.get();

  if (isShiftManager && !existingSecret.exists && pin === undefined) {
    throw new HttpsError("invalid-argument", "יש להזין PIN למנהל/ת משמרת");
  }

  await staffRef.set(
    {
      name,
      active,
      isShiftManager,
      createdAt: existing.exists
        ? existing.data()!.createdAt
        : FieldValue.serverTimestamp(),
      createdByUid: existing.exists
        ? existing.data()!.createdByUid
        : request.auth!.uid,
    },
    { merge: true },
  );

  if (isShiftManager) {
    if (pin !== undefined) {
      const hash = await hashSecret(pin);
      await secretRef.set({
        hash,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  } else if (existingSecret.exists) {
    await secretRef.delete();
  }

  await writeAuditLog({
    businessId,
    action: existing.exists ? "staff.pinUpdated" : "staff.created",
    performedByUid: request.auth!.uid,
    performedByRole: "owner",
    targetType: "staff",
    targetId: staffId,
    metadata: { isShiftManager },
  });

  return { success: true };
});
