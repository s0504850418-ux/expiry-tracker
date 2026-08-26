import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireBusinessMember } from "../lib/authz";

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

/**
 * מחזירה כמויות מרכיבים ליחידה אחת של המוצר (יחסית ל-yieldQuantity
 * של המתכון הנוכחי), בלי אף שדה כספי (מחיר/עלות) — כדי שגם מנהל/ת
 * משמרת (לא רק owner) יוכל/תוכל לראות "כמה מכל מרכיב צריך" ביצירת
 * אצווה, בלי לחשוף נתון כספי. recipeVersions/ingredients חסומים
 * לקריאה ישירה מ-shiftManager ב-Rules (עלויות = נתון כספי, owner
 * בלבד) — הפונקציה הזו קוראת אותם בצד השרת עם Admin SDK ומחזירה רק
 * תת-קבוצה בטוחה, באותה תבנית כמו listActiveStaffNames.
 */
export const getRecipePreview = onCall(async (request) => {
  const { businessId, productId } = validate(request.data);
  requireBusinessMember(request, businessId);

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
  const yieldQuantity = versionSnap.data()?.yieldQuantity as number | undefined;
  if (!versionSnap.exists || !yieldQuantity) {
    return { hasRecipe: false };
  }

  const ingredients =
    (versionSnap.data()?.ingredients as
      | { ingredientNameSnapshot: string; unit: string; quantity: number }[]
      | undefined) ?? [];

  return {
    hasRecipe: true,
    yieldQuantity,
    lines: ingredients.map((line) => ({
      ingredientNameSnapshot: line.ingredientNameSnapshot,
      unit: line.unit,
      perUnitQuantity: line.quantity / yieldQuantity,
    })),
  };
});
