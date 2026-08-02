import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireOwner } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";
import { computeRecipeLines, computeTotalCost } from "../lib/recipeCost";

interface LineInput {
  ingredientId: string;
  quantity: number;
}

interface Data {
  businessId: string;
  productId: string;
  lines: LineInput[];
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.productId !== "string" ||
    d.productId.length === 0 ||
    !Array.isArray(d.lines) ||
    d.lines.length === 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, productId, ורשימת lines לא-ריקה נדרשים",
    );
  }
  for (const line of d.lines) {
    if (
      !line ||
      typeof line.ingredientId !== "string" ||
      line.ingredientId.length === 0 ||
      typeof line.quantity !== "number" ||
      !(line.quantity > 0)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "כל שורה חייבת לכלול ingredientId וכמות חיובית",
      );
    }
  }
  return {
    businessId: d.businessId,
    productId: d.productId,
    lines: d.lines,
  };
}

/**
 * יוצרת גרסת מתכון חדשה למוצר — לעולם לא עריכה של גרסה קיימת.
 * מחירי המרכיבים נלקחים מהמחיר הנוכחי שלהם *עכשיו* ונשמרים כ-
 * snapshot בגרסה; עדכון מחיר מרכיב בעתיד לא ישפיע על הגרסה הזו.
 * אצוות שכבר קיימות שומרות הפניה לגרסה שהיו בה, לא לגרסה החדשה.
 */
export const createRecipeVersion = onCall(async (request) => {
  const data = validate(request.data);
  requireOwner(request, data.businessId);

  const db = getFirestore();
  const productRef = db.doc(`businesses/${data.businessId}/products/${data.productId}`);
  const productSnap = await productRef.get();
  if (!productSnap.exists || productSnap.data()?.active !== true) {
    throw new HttpsError("not-found", "מוצר לא נמצא או לא פעיל");
  }

  const ingredientIds = data.lines.map((l) => l.ingredientId);
  const uniqueIngredientIds = [...new Set(ingredientIds)];
  if (uniqueIngredientIds.length !== ingredientIds.length) {
    throw new HttpsError("invalid-argument", "אין לכלול אותו מרכיב פעמיים באותה גרסה");
  }

  const ingredientSnaps = await Promise.all(
    uniqueIngredientIds.map((id) =>
      db.doc(`businesses/${data.businessId}/ingredients/${id}`).get(),
    ),
  );
  const ingredientById = new Map(ingredientSnaps.map((s) => [s.id, s]));

  const lineInputs = data.lines.map((line) => {
    const snap = ingredientById.get(line.ingredientId);
    if (!snap || !snap.exists || snap.data()?.active !== true) {
      throw new HttpsError(
        "not-found",
        `מרכיב לא נמצא או לא פעיל: ${line.ingredientId}`,
      );
    }
    const ingredient = snap.data()!;
    return {
      ingredientId: line.ingredientId,
      ingredientNameSnapshot: ingredient.name as string,
      quantity: line.quantity,
      unit: ingredient.unit as string,
      pricePerUnitSnapshot: ingredient.currentPricePerUnit as number,
    };
  });

  const computedLines = computeRecipeLines(lineInputs);
  const totalCostSnapshot = computeTotalCost(computedLines);

  const recipeVersionsRef = productRef.collection("recipeVersions");
  const lastVersionSnap = await recipeVersionsRef
    .orderBy("versionNumber", "desc")
    .limit(1)
    .get();
  const nextVersionNumber = lastVersionSnap.empty
    ? 1
    : (lastVersionSnap.docs[0].data().versionNumber as number) + 1;

  const versionRef = recipeVersionsRef.doc();
  await versionRef.set({
    versionNumber: nextVersionNumber,
    ingredients: computedLines,
    totalCostSnapshot,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: request.auth!.uid,
  });

  await productRef.update({
    currentRecipeVersionId: versionRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    businessId: data.businessId,
    action: "recipe.versionCreated",
    performedByUid: request.auth!.uid,
    performedByRole: "owner",
    targetType: "recipeVersion",
    targetId: versionRef.id,
    metadata: { productId: data.productId, versionNumber: nextVersionNumber, totalCostSnapshot },
  });

  return {
    recipeVersionId: versionRef.id,
    versionNumber: nextVersionNumber,
    totalCostSnapshot,
  };
});
