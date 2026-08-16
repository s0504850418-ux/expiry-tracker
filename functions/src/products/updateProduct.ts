import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireShiftManagerOrOwner } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  productId: string;
  name?: string;
  shelfLifeMinutes?: number;
  partialUsageUpdateFrequency?: "endOfBatchLife" | "endOfDay" | null;
  notifyBeforeExpiryMinutes?: number | null;
  active?: boolean;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.productId !== "string" ||
    d.productId.length === 0
  ) {
    throw new HttpsError("invalid-argument", "businessId ו-productId נדרשים");
  }
  if (d.name !== undefined && (typeof d.name !== "string" || d.name.trim().length === 0)) {
    throw new HttpsError("invalid-argument", "name לא תקין");
  }
  if (
    d.shelfLifeMinutes !== undefined &&
    !(typeof d.shelfLifeMinutes === "number" && d.shelfLifeMinutes > 0)
  ) {
    throw new HttpsError("invalid-argument", "shelfLifeMinutes חייב להיות מספר חיובי");
  }
  if (d.active !== undefined && typeof d.active !== "boolean") {
    throw new HttpsError("invalid-argument", "active לא תקין");
  }
  if (
    d.notifyBeforeExpiryMinutes !== undefined &&
    d.notifyBeforeExpiryMinutes !== null &&
    !(typeof d.notifyBeforeExpiryMinutes === "number" && d.notifyBeforeExpiryMinutes > 0)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "notifyBeforeExpiryMinutes חייב להיות מספר חיובי או null",
    );
  }
  return {
    businessId: d.businessId,
    productId: d.productId,
    name: d.name?.trim(),
    shelfLifeMinutes: d.shelfLifeMinutes,
    partialUsageUpdateFrequency: d.partialUsageUpdateFrequency,
    notifyBeforeExpiryMinutes: d.notifyBeforeExpiryMinutes,
    active: d.active,
  };
}

/**
 * מעדכנת שדות מוצר קיים. **לא** ניתן לשנות unit (קבוע לכל חיי
 * המוצר). active=false = "מוצר הופסק" — לא מחיקה, אצוות היסטוריות
 * נשארות שלמות.
 *
 * מנהל/ת משמרת יכול/ה לשנות name/shelfLifeMinutes בלבד (שלוש רמות
 * הרשאה, ראו CLAUDE.md) — partialUsageUpdateFrequency/notifyBefore-
 * ExpiryMinutes/active נשארים owner-only, נדחים במפורש אם נשלחים
 * ע"י מנהל/ת משמרת (לא מתעלמים מהם בשקט).
 */
export const updateProduct = onCall(async (request) => {
  const data = validate(request.data);
  const member = requireShiftManagerOrOwner(request, data.businessId);

  if (
    member.role !== "owner" &&
    (data.partialUsageUpdateFrequency !== undefined ||
      data.notifyBeforeExpiryMinutes !== undefined ||
      data.active !== undefined)
  ) {
    throw new HttpsError(
      "permission-denied",
      "תדירות עדכון כמות, זמן התראה לפני תפוגה, וסטטוס פעילות ניתנים לשינוי ע\"י בעל/ת העסק בלבד",
    );
  }

  const db = getFirestore();
  const productRef = db.doc(`businesses/${data.businessId}/products/${data.productId}`);
  const snap = await productRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "מוצר לא נמצא");
  }

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (data.name !== undefined) {
    const nameLower = data.name.toLowerCase();
    if (nameLower !== snap.data()!.nameLower) {
      const productsRef = db.collection(`businesses/${data.businessId}/products`);
      const existing = await productsRef.where("nameLower", "==", nameLower).limit(1).get();
      if (!existing.empty) {
        throw new HttpsError("already-exists", "כבר קיים מוצר בשם הזה");
      }
    }
    update.name = data.name;
    update.nameLower = nameLower;
  }
  if (data.shelfLifeMinutes !== undefined) {
    update.shelfLifeMinutes = data.shelfLifeMinutes;
  }
  if (data.partialUsageUpdateFrequency !== undefined) {
    update.partialUsageUpdateFrequency = data.partialUsageUpdateFrequency;
  }
  if (data.notifyBeforeExpiryMinutes !== undefined) {
    update.notifyBeforeExpiryMinutes = data.notifyBeforeExpiryMinutes;
  }
  if (data.active !== undefined) {
    update.active = data.active;
  }

  await productRef.update(update);

  await writeAuditLog({
    businessId: data.businessId,
    action: "product.updated",
    performedByUid: member.uid,
    performedByRole: member.role,
    performedByStaffId: member.staffId ?? null,
    targetType: "product",
    targetId: data.productId,
    metadata: { fields: Object.keys(update) },
  });

  return { success: true };
});
