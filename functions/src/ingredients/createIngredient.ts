import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireOwner } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  name: string;
  unit: string;
  pricePerUnit: number;
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
    typeof d.pricePerUnit !== "number" ||
    !(d.pricePerUnit >= 0)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, name, unit ו-pricePerUnit (לא שלילי) נדרשים",
    );
  }
  return {
    businessId: d.businessId,
    name: d.name.trim(),
    unit: d.unit.trim(),
    pricePerUnit: d.pricePerUnit,
  };
}

export const createIngredient = onCall(async (request) => {
  const data = validate(request.data);
  requireOwner(request, data.businessId);

  const db = getFirestore();
  const ingredientRef = db.collection(`businesses/${data.businessId}/ingredients`).doc();
  await ingredientRef.set({
    name: data.name,
    unit: data.unit,
    currentPricePerUnit: data.pricePerUnit,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    businessId: data.businessId,
    action: "ingredient.created",
    performedByUid: request.auth!.uid,
    performedByRole: "owner",
    targetType: "ingredient",
    targetId: ingredientRef.id,
    metadata: { name: data.name, pricePerUnit: data.pricePerUnit },
  });

  return { ingredientId: ingredientRef.id };
});
