export interface Product {
  id: string;
  name: string;
  unit: string;
  shelfLifeMinutes: number;
  active: boolean;
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
