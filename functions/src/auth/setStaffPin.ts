import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireOwner } from "../lib/authz";
import { hashSecret } from "../lib/pin";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  staffId: string;
  name: string;
  pin: string;
  active: boolean;
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
    typeof d.pin !== "string" ||
    d.pin.length < 4 ||
    typeof d.active !== "boolean"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, staffId, name, pin (לפחות 4 תווים) ו-active נדרשים",
    );
  }
  return {
    businessId: d.businessId,
    staffId: d.staffId,
    name: d.name,
    pin: d.pin,
    active: d.active,
  };
}

/**
 * יוצר/ת עובד/ת משמרת חדש/ה או מעדכנ/ת PIN + סטטוס פעילות לעובד/ת
 * קיימ/ת. owner-only. הוספת/הסרת יכולות (למשל שינוי מחיר/מוצר) לא
 * ניתנת למנהל/ת משמרת במובנה הזה — ה-role נקבע פעם אחת ב-custom claims.
 */
export const setStaffPin = onCall(async (request) => {
  const { businessId, staffId, name, pin, active } = validate(request.data);
  requireOwner(request, businessId);

  const db = getFirestore();
  const staffRef = db.doc(`businesses/${businessId}/staff/${staffId}`);
  const secretRef = db.doc(`businesses/${businessId}/staffSecrets/${staffId}`);
  const existing = await staffRef.get();

  await staffRef.set(
    {
      name,
      active,
      createdAt: existing.exists
        ? existing.data()!.createdAt
        : FieldValue.serverTimestamp(),
      createdByUid: existing.exists
        ? existing.data()!.createdByUid
        : request.auth!.uid,
    },
    { merge: true },
  );

  const hash = await hashSecret(pin);
  await secretRef.set({
    hash,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    businessId,
    action: existing.exists ? "staff.pinUpdated" : "staff.created",
    performedByUid: request.auth!.uid,
    performedByRole: "owner",
    targetType: "staff",
    targetId: staffId,
  });

  return { success: true };
});
