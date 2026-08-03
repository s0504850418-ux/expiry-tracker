import { describe, expect, it } from "vitest";
import { computeRecipeLines, computeTotalCost } from "../src/lib/recipeCost";

describe("computeRecipeLines / computeTotalCost", () => {
  it("מחשב עלות שורה כ-quantity * pricePerUnitSnapshot", () => {
    const lines = computeRecipeLines([
      {
        ingredientId: "ing1",
        ingredientNameSnapshot: "עגבניות",
        quantity: 2,
        unit: "kg",
        pricePerUnitSnapshot: 5,
      },
    ]);
    expect(lines[0].lineCostSnapshot).toBe(10);
  });

  it("מסכם את כל השורות לעלות כוללת", () => {
    const lines = computeRecipeLines([
      {
        ingredientId: "ing1",
        ingredientNameSnapshot: "עגבניות",
        quantity: 2,
        unit: "kg",
        pricePerUnitSnapshot: 5,
      },
      {
        ingredientId: "ing2",
        ingredientNameSnapshot: "שמן זית",
        quantity: 0.5,
        unit: "liter",
        pricePerUnitSnapshot: 20,
      },
    ]);
    expect(computeTotalCost(lines)).toBe(20);
  });

  it("מעגל לשתי ספרות אחרי הנקודה", () => {
    const lines = computeRecipeLines([
      {
        ingredientId: "ing1",
        ingredientNameSnapshot: "תבלין",
        quantity: 3,
        unit: "kg",
        pricePerUnitSnapshot: 0.333,
      },
    ]);
    expect(lines[0].lineCostSnapshot).toBe(1);
  });
});
