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

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentPricePerUnit: number;
  active: boolean;
}

export interface RecipeLine {
  ingredientId: string;
  ingredientNameSnapshot: string;
  quantity: number;
  unit: string;
  pricePerUnitSnapshot: number;
  lineCostSnapshot: number;
}

export interface RecipeVersion {
  id: string;
  versionNumber: number;
  ingredients: RecipeLine[];
  totalCostSnapshot: number;
}

export type BatchStatus = "active" | "used" | "expired" | "discarded" | "archived";

export interface Batch {
  id: string;
  productId: string;
  productNameSnapshot: string;
  unit: string;
  quantity: number;
  expiresAt: Date;
  preparedAtClient: Date;
  status: BatchStatus;
  discardReason: string | null;
}
