import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireShiftManagerOrOwner } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

const UNITS = ["kg", "liter", "unit"] as const;
type Unit = (typeof UNITS)[number];

interface Data {
  businessId: string;
  name: string;
  unit: Unit;
  shelfLifeMinutes: number;
  partialUsageUpdateFrequency?: "endOfBatchLife" | "endOfDay" | null;
  notifyBeforeExpiryMinutes?: number | null;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.name !== "string" ||
    d.name.trim().length === 0 ||
    typeof d.unit !== "string" ||
    !UNITS.includes(d.unit as Unit) ||
    typeof d.shelfLifeMinutes !== "number" ||
    !(d.shelfLifeMinutes > 0)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, name, unit (kg/liter/unit) ו-shelfLifeMinutes (חיובי) נדרשים",
    );
  }
  if (
    d.partialUsageUpdateFrequency !== undefined &&
    d.partialUsageUpdateFrequency !== null &&
    d.partialUsageUpdateFrequency !== "endOfBatchLife" &&
    d.partialUsageUpdateFrequency !== "endOfDay"
  ) {
    throw new HttpsError("invalid-argument", "partialUsageUpdateFrequency לא תקין");
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
    name: d.name.trim(),
    unit: d.unit as Unit,
    shelfLifeMinutes: d.shelfLifeMinutes,
    partialUsageUpdateFrequency: d.partialUsageUpdateFrequency ?? null,
    notifyBeforeExpiryMinutes: d.notifyBeforeExpiryMinutes ?? null,
  };
}

/**
 * יוצרת מוצר חדש. שם ייחודי בעסק (case-insensitive, נבדק מול כל
 * המוצרים כולל לא-פעילים כדי שלא ליצור התנגשות בהפעלה מחדש של שם
 * מוצר שהופסק). unit קבוע לכל חיי המוצר — אין לו endpoint לעדכון,
 * לפי "אין המרה בין יחידות מידה" ב-CLAUDE.md.
 *
 * מנהל/ת משמרת יכול/ה ליצור מוצר חדש (שלוש רמות הרשאה, ראו
 * CLAUDE.md) — אבל רק עם name/unit/shelfLifeMinutes; notifyBefore-
 * ExpiryMinutes/partialUsageUpdateFrequency נשארים owner-only, בדיוק
 * כמו חיי מדף ומחיר היו לפני השינוי הזה. אם מנהל/ת משמרת מנסה בכל
 * זאת לשלוח ערך לא-null לאחד מהם — נדחה במפורש, לא נשמר בשקט כ-null.
 */
export const createProduct = onCall(async (request) => {
  const data = validate(request.data);
  const member = requireShiftManagerOrOwner(request, data.businessId);

  if (
    member.role !== "owner" &&
    (data.partialUsageUpdateFrequency !== null || data.notifyBeforeExpiryMinutes !== null)
  ) {
    throw new HttpsError(
      "permission-denied",
      "תדירות עדכון כמות וזמן התראה לפני תפוגה ניתנים לשינוי ע\"י בעל/ת העסק בלבד",
    );
  }

  const db = getFirestore();
  const productsRef = db.collection(`businesses/${data.businessId}/products`);
  const nameLower = data.name.toLowerCase();

  const existing = await productsRef.where("nameLower", "==", nameLower).limit(1).get();
  if (!existing.empty) {
    throw new HttpsError("already-exists", "כבר קיים מוצר בשם הזה");
  }

  const productRef = productsRef.doc();
  await productRef.set({
    name: data.name,
    nameLower,
    unit: data.unit,
    shelfLifeMinutes: data.shelfLifeMinutes,
    partialUsageUpdateFrequency: data.partialUsageUpdateFrequency,
    notifyBeforeExpiryMinutes: data.notifyBeforeExpiryMinutes,
    currentRecipeVersionId: null,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    businessId: data.businessId,
    action: "product.created",
    performedByUid: member.uid,
    performedByRole: member.role,
    performedByStaffId: member.staffId ?? null,
    targetType: "product",
    targetId: productRef.id,
    metadata: { name: data.name },
  });

  return { productId: productRef.id };
});
