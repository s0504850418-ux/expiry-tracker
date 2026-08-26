import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireShiftManagerOrOwner } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";
import { computeRecipeLines, computeTotalCost, computeCostPerUnit } from "../lib/recipeCost";

interface LineInput {
  ingredientId: string;
  quantity: number;
}

interface Data {
  businessId: string;
  productId: string;
  lines: LineInput[];
  yieldQuantity: number;
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
    d.lines.length === 0 ||
    typeof d.yieldQuantity !== "number" ||
    !(d.yieldQuantity > 0)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, productId, רשימת lines לא-ריקה, ו-yieldQuantity חיובי (כמה יוצא מהמתכון) נדרשים",
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
    yieldQuantity: d.yieldQuantity,
  };
}

/**
 * true אם השורות המחושבות (אחרי חיפוש המחיר הנוכחי לכל מרכיב) +
 * yieldQuantity המוצעים זהים בתוכנם לגרסה הנוכחית (לא תלוי בסדר
 * השורות) — משמש למניעת יצירת גרסה מיותרת (ראו למטה).
 *
 * חשוב: ההשוואה חייבת לכלול את pricePerUnitSnapshot המחושב (כולל
 * null = "ממתין למחיר"), לא רק ingredientId+quantity שהלקוח שולח —
 * אחרת שמירה חוזרת עם אותן שורות *אחרי* שמחיר מרכיב התעדכן הייתה
 * מסומנת בטעות כ"ללא שינוי", ולא הייתה יוצרת את הגרסה החדשה עם
 * העלות המעודכנת (ראו הבדיקה "createIngredient + updateIngredientPrice"
 * ב-tests/functions.test.js).
 */
function isSameAsCurrentVersion(
  currentIngredients: {
    ingredientId: string;
    quantity: number;
    pricePerUnitSnapshot: number | null;
  }[],
  currentYield: number,
  proposedLines: {
    ingredientId: string;
    quantity: number;
    pricePerUnitSnapshot: number | null;
  }[],
  proposedYield: number,
): boolean {
  if (currentYield !== proposedYield) return false;
  if (currentIngredients.length !== proposedLines.length) return false;
  const sortById = <T extends { ingredientId: string }>(arr: T[]) =>
    [...arr].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
  const a = sortById(currentIngredients);
  const b = sortById(proposedLines);
  return a.every(
    (line, i) =>
      line.ingredientId === b[i].ingredientId &&
      line.quantity === b[i].quantity &&
      line.pricePerUnitSnapshot === b[i].pricePerUnitSnapshot,
  );
}

/**
 * יוצרת גרסת מתכון חדשה למוצר — לעולם לא עריכה של גרסה קיימת.
 * מחירי המרכיבים נלקחים מהמחיר הנוכחי שלהם *עכשיו* ונשמרים כ-
 * snapshot בגרסה (null אם המרכיב עדיין "ממתין למחיר" — ראו
 * createIngredient.ts); עדכון מחיר מרכיב בעתיד לא ישפיע על הגרסה
 * הזו, רק על גרסה עתידית חדשה. אצוות שכבר קיימות שומרות הפניה
 * לגרסה שהיו בה, לא לגרסה החדשה.
 *
 * מנהל/ת משמרת יכול/ה להגדיר מתכון (כמויות+תפוקה, שלוש רמות הרשאה
 * — ראו CLAUDE.md) אבל **לא** להיחשף לעלויות: התגובה (לא המסמך
 * שנשמר ב-Firestore, שנשאר owner-only ב-Rules) משמיטה
 * totalCostSnapshot/costPerUnitSnapshot לגמרי כש-caller אינו owner
 * — גם בנתיב ה"רגיל" וגם ב-unchanged:true.
 */
export const createRecipeVersion = onCall(async (request) => {
  const data = validate(request.data);
  const member = requireShiftManagerOrOwner(request, data.businessId);

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
      pricePerUnitSnapshot: (ingredient.currentPricePerUnit as number | null | undefined) ?? null,
    };
  });

  const computedLines = computeRecipeLines(lineInputs);
  const totalCostSnapshot = computeTotalCost(computedLines);
  const costPerUnitSnapshot = computeCostPerUnit(totalCostSnapshot, data.yieldQuantity);

  function redactedCostFields(): { totalCostSnapshot: number | null; costPerUnitSnapshot: number | null } | Record<string, never> {
    return member.role === "owner" ? { totalCostSnapshot, costPerUnitSnapshot } : {};
  }

  const recipeVersionsRef = productRef.collection("recipeVersions");

  // אם הגרסה המוצעת זהה בתוכנה (מרכיבים+כמויות+מחיר+תפוקה) לגרסה
  // הנוכחית — לא יוצרים גרסה חדשה. בלי הבדיקה הזו, שמירה חוזרת של
  // אותו מתכון (למשל תוך כדי תיקון טעות בממשק) מקפיצה את מספר
  // הגרסה בלי שינוי אמיתי, ומטשטשת את היסטוריית המתכון.
  const currentVersionId = productSnap.data()?.currentRecipeVersionId as
    | string
    | null
    | undefined;
  if (currentVersionId) {
    const currentVersionSnap = await recipeVersionsRef.doc(currentVersionId).get();
    if (currentVersionSnap.exists) {
      const currentData = currentVersionSnap.data()!;
      const currentIngredients =
        (currentData.ingredients as
          | { ingredientId: string; quantity: number; pricePerUnitSnapshot: number | null }[]
          | undefined) ?? [];
      const currentYield = currentData.yieldQuantity as number | undefined;
      if (
        typeof currentYield === "number" &&
        isSameAsCurrentVersion(currentIngredients, currentYield, computedLines, data.yieldQuantity)
      ) {
        return {
          recipeVersionId: currentVersionSnap.id,
          versionNumber: currentData.versionNumber as number,
          unchanged: true,
          ...(member.role === "owner"
            ? {
                totalCostSnapshot: currentData.totalCostSnapshot as number | null,
                costPerUnitSnapshot: currentData.costPerUnitSnapshot as number | null,
              }
            : {}),
        };
      }
    }
  }

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
    yieldQuantity: data.yieldQuantity,
    totalCostSnapshot,
    costPerUnitSnapshot,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: member.uid,
  });

  await productRef.update({
    currentRecipeVersionId: versionRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    businessId: data.businessId,
    action: "recipe.versionCreated",
    performedByUid: member.uid,
    performedByRole: member.role,
    performedByStaffId: member.staffId ?? null,
    targetType: "recipeVersion",
    targetId: versionRef.id,
    metadata: { productId: data.productId, versionNumber: nextVersionNumber, totalCostSnapshot },
  });

  return {
    recipeVersionId: versionRef.id,
    versionNumber: nextVersionNumber,
    ...redactedCostFields(),
  };
});
