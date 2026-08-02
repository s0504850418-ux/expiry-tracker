export interface LabelData {
  batchId: string;
  productName: string;
  quantity: number;
  unit: string;
  preparedAt: Date;
  expiresAt: Date;
}

export interface PrinterAdapter {
  readonly name: string;
  print(label: LabelData): Promise<void>;
}
