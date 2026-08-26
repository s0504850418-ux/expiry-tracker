import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireShiftManagerOrOwner } from "../lib/authz";

interface Data {
  businessId: string;
  productId: string;
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
  return { businessId: d.businessId, productId: d.productId };
}

interface StoredLine {
  ingredientId: string;
  ingredientNameSnapshot: string;
  quantity: number;
  unit: string;
  pricePerUnitSnapshot: number | null;
  lineCostSnapshot: number | null;
}

/**
 * מחזירה את גרסת המתכון הנוכחית של מוצר, לצורך תצוגה/pre-fill
 * בעורך המתכון (RecipeEditorDialog) — מחליפה קריאה ישירה ל-Firestore
 * (`recipeVersions` חסום לגמרי ב-Rules למי שאינו owner, כי המסמך
 * מכיל עלויות). **רק owner** מקבל/ת גם שדות כספיים
 * (pricePerUnitSnapshot/lineCostSnapshot לכל שורה, totalCostSnapshot/
 * costPerUnitSnapshot) — מנהל/ת משמרת מקבל/ת אך ורק
 * ingredientId/שם/כמות/יחידה, מספיק כדי לערוך את המתכון בלי להיחשף
 * לעלויות (שלוש רמות הרשאה, ראו CLAUDE.md).
 */
export const getRecipeVersionForEdit = onCall(async (request) => {
  const { businessId, productId } = validate(request.data);
  const member = requireShiftManagerOrOwner(request, businessId);

  const db = getFirestore();
  const productSnap = await db.doc(`businesses/${businessId}/products/${productId}`).get();
  if (!productSnap.exists) {
    throw new HttpsError("not-found", "מוצר לא נמצא");
  }

  const currentRecipeVersionId = productSnap.data()?.currentRecipeVersionId as
    | string
    | null
    | undefined;
  if (!currentRecipeVersionId) {
    return { hasRecipe: false };
  }

  const versionSnap = await db
    .doc(
      `businesses/${businessId}/products/${productId}/recipeVersions/${currentRecipeVersionId}`,
    )
    .get();
  if (!versionSnap.exists) {
    return { hasRecipe: false };
  }

  const versionData = versionSnap.data()!;
  const lines = (versionData.ingredients as StoredLine[] | undefined) ?? [];

  const redactedLines = lines.map((line) => ({
    ingredientId: line.ingredientId,
    ingredientNameSnapshot: line.ingredientNameSnapshot,
    quantity: line.quantity,
    unit: line.unit,
    ...(member.role === "owner"
      ? {
          pricePerUnitSnapshot: line.pricePerUnitSnapshot,
          lineCostSnapshot: line.lineCostSnapshot,
        }
      : {}),
  }));

  return {
    hasRecipe: true,
    versionNumber: versionData.versionNumber as number,
    yieldQuantity: versionData.yieldQuantity as number,
    lines: redactedLines,
    ...(member.role === "owner"
      ? {
          totalCostSnapshot: versionData.totalCostSnapshot as number | null,
          costPerUnitSnapshot: versionData.costPerUnitSnapshot as number | null,
        }
      : {}),
  };
});
