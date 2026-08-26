export interface RecipeLineInput {
  ingredientId: string;
  ingredientNameSnapshot: string;
  quantity: number;
  unit: string;
  // null = המרכיב עדיין "ממתין למחיר" (מנהל/ת משמרת יכול/ה ליצור
  // מרכיב בלי מחיר כלל, ראו createIngredient.ts) — עלות השורה/המתכון
  // הופכת בלתי-ידועה, לא מחושבת כאילו המחיר הוא 0.
  pricePerUnitSnapshot: number | null;
}

export interface RecipeLineWithCost extends RecipeLineInput {
  lineCostSnapshot: number | null;
}

export function computeRecipeLines(lines: RecipeLineInput[]): RecipeLineWithCost[] {
  return lines.map((line) => ({
    ...line,
    lineCostSnapshot:
      line.pricePerUnitSnapshot === null
        ? null
        : round2(line.quantity * line.pricePerUnitSnapshot),
  }));
}

// null אם *לפחות* שורה אחת חסרת-מחיר — לא מחשבת "עלות חלקית" מטעה
// מתוך שאר השורות הידועות.
export function computeTotalCost(lines: RecipeLineWithCost[]): number | null {
  if (lines.some((line) => line.lineCostSnapshot === null)) {
    return null;
  }
  return round2(lines.reduce((sum, line) => sum + (line.lineCostSnapshot as number), 0));
}

export function computeCostPerUnit(
  totalCost: number | null,
  yieldQuantity: number,
): number | null {
  if (totalCost === null) {
    return null;
  }
  return round2(totalCost / yieldQuantity);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
