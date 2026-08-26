import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireShiftManagerOrOwner } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  name: string;
  unit: string;
  pricePerUnit?: number;
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
    d.unit.trim().length === 0 ||
    (d.pricePerUnit !== undefined && !(typeof d.pricePerUnit === "number" && d.pricePerUnit >= 0))
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, name, unit נדרשים; pricePerUnit, כשמסופק, חייב להיות מספר לא שלילי",
    );
  }
  return {
    businessId: d.businessId,
    name: d.name.trim(),
    unit: d.unit.trim(),
    pricePerUnit: d.pricePerUnit,
  };
}

/**
 * יוצרת מרכיב חדש. **מנהל/ת משמרת** יכול/ה ליצור מרכיב עם שם+יחידה
 * בלבד — בלי מחיר בכלל (לא נחשף/ת למחירים, ראו CLAUDE.md, "שלוש
 * רמות הרשאה"). המרכיב נשמר תקין ושמיש מיד (currentPricePerUnit:
 * null = "ממתין למחיר") — אפשר להשתמש בו במתכון באותו רגע; רק
 * updateIngredientPrice (owner-only) יכול/ה למלא/לשנות את המחיר.
 * אם מנהל/ת משמרת מנסה בכל זאת לשלוח מחיר (למשל קריאת API ישירה,
 * לא דרך הממשק) — נדחה במפורש, לא מתעלמים בשקט.
 */
export const createIngredient = onCall(async (request) => {
  const data = validate(request.data);
  const member = requireShiftManagerOrOwner(request, data.businessId);

  if (member.role !== "owner" && data.pricePerUnit !== undefined) {
    throw new HttpsError(
      "permission-denied",
      "רק בעל/ת העסק יכול/ה להזין מחיר מרכיב",
    );
  }

  const db = getFirestore();
  const ingredientRef = db.collection(`businesses/${data.businessId}/ingredients`).doc();
  await ingredientRef.set({
    name: data.name,
    unit: data.unit,
    currentPricePerUnit: data.pricePerUnit ?? null,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    businessId: data.businessId,
    action: "ingredient.created",
    performedByUid: member.uid,
    performedByRole: member.role,
    performedByStaffId: member.staffId ?? null,
    targetType: "ingredient",
    targetId: ingredientRef.id,
    metadata: { name: data.name, pricePerUnit: data.pricePerUnit ?? null },
  });

  return { ingredientId: ingredientRef.id };
});
