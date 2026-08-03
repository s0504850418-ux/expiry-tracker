import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireOwner } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  ingredientId: string;
  newPricePerUnit: number;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.ingredientId !== "string" ||
    d.ingredientId.length === 0 ||
    typeof d.newPricePerUnit !== "number" ||
    !(d.newPricePerUnit >= 0)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, ingredientId ו-newPricePerUnit (לא שלילי) נדרשים",
    );
  }
  return {
    businessId: d.businessId,
    ingredientId: d.ingredientId,
    newPricePerUnit: d.newPricePerUnit,
  };
}

/**
 * מעדכנת את המחיר הנוכחי של מרכיב. **לא** משפיעה על גרסאות מתכון
 * שכבר נוצרו — אלה שומרות snapshot של המחיר בזמן היצירה. משפיע רק
 * על גרסאות מתכון עתידיות. לפי CLAUDE.md.
 */
export const updateIngredientPrice = onCall(async (request) => {
  const data = validate(request.data);
  requireOwner(request, data.businessId);

  const db = getFirestore();
  const ingredientRef = db.doc(
    `businesses/${data.businessId}/ingredients/${data.ingredientId}`,
  );
  const snap = await ingredientRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "מרכיב לא נמצא");
  }

  await ingredientRef.update({
    currentPricePerUnit: data.newPricePerUnit,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    businessId: data.businessId,
    action: "ingredient.priceUpdated",
    performedByUid: request.auth!.uid,
    performedByRole: "owner",
    targetType: "ingredient",
    targetId: data.ingredientId,
    metadata: {
      previousPrice: snap.data()!.currentPricePerUnit,
      newPrice: data.newPricePerUnit,
    },
  });

  return { success: true };
});
