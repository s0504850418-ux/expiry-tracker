import QRCode from "qrcode";

/**
 * QR מכיל רק batchId (לא שאר פרטי האצווה) — כדי שסריקה תמיד תשלוף
 * נתונים עדכניים מ-Firestore בזמן אמת, לפי CLAUDE.md.
 */
export async function generateBatchQrDataUrl(batchId: string): Promise<string> {
  return QRCode.toDataURL(batchId, { margin: 1, width: 220 });
}
