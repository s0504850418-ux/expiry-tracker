export type PartialUsageUpdateFrequency = "endOfBatchLife" | "endOfDay" | null;

export interface Product {
  id: string;
  name: string;
  unit: string;
  shelfLifeMinutes: number;
  active: boolean;
  currentRecipeVersionId: string | null;
  partialUsageUpdateFrequency: PartialUsageUpdateFrequency;
  notifyBeforeExpiryMinutes: number | null;
}

export type PriceStatus = "set" | "pending";

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  active: boolean;
  // null = "ממתין למחיר" (מנהל/ת משמרת יכול/ה ליצור מרכיב בלי מחיר).
  // undefined = השרת לא שלח את השדה בכלל (listIngredients מצנזרת
  // אותו לחלוטין עבור מי שאינו owner — לא רק null, נעדר) — ראו
  // functions/src/ingredients/listIngredients.ts.
  currentPricePerUnit?: number | null;
  // מגיע מ-listIngredients לשני התפקידים; לא נתון כספי (לא חושף
  // כמה, רק אם הוגדר בכלל).
  priceStatus?: PriceStatus;
}

export interface RecipeLine {
  ingredientId: string;
  ingredientNameSnapshot: string;
  quantity: number;
  unit: string;
  // נעדרים לגמרי מהתשובה כש-caller אינו owner (getRecipeVersionForEdit/
  // createRecipeVersion) — נתון כספי, ראו CLAUDE.md.
  pricePerUnitSnapshot?: number | null;
  lineCostSnapshot?: number | null;
}

export interface RecipeVersion {
  id: string;
  versionNumber: number;
  ingredients: RecipeLine[];
  yieldQuantity: number;
  totalCostSnapshot?: number | null;
  costPerUnitSnapshot?: number | null;
}

export type BatchStatus = "active" | "used" | "expired" | "discarded" | "archived";
export type PrintStatus = "pending" | "printed" | "failed";

export interface Batch {
  id: string;
  productId: string;
  productNameSnapshot: string;
  unit: string;
  quantity: number;
  quantityLastUpdatedAt: Date;
  expiresAt: Date;
  preparedAtClient: Date;
  status: BatchStatus;
  discardReason: string | null;
  printStatus: PrintStatus;
}
