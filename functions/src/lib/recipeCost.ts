export interface RecipeLineInput {
  ingredientId: string;
  ingredientNameSnapshot: string;
  quantity: number;
  unit: string;
  pricePerUnitSnapshot: number;
}

export interface RecipeLineWithCost extends RecipeLineInput {
  lineCostSnapshot: number;
}

export function computeRecipeLines(lines: RecipeLineInput[]): RecipeLineWithCost[] {
  return lines.map((line) => ({
    ...line,
    lineCostSnapshot: round2(line.quantity * line.pricePerUnitSnapshot),
  }));
}

export function computeTotalCost(lines: RecipeLineWithCost[]): number {
  return round2(lines.reduce((sum, line) => sum + line.lineCostSnapshot, 0));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
