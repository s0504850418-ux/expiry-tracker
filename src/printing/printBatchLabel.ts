import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { getPrinterAdapter } from "./getPrinterAdapter";

export interface PrintableBatch {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  unit: string;
  preparedAtClient: Date;
  expiresAt: Date;
}

/**
 * מנסה להדפיס מדבקה לאצווה, ומעדכנת printStatus בשרת לפי התוצאה —
 * בין אם זו הדפסה ראשונה (מיד אחרי יצירת אצווה) ובין אם זו הדפסה
 * חוזרת. לעולם לא זורקת — מחזירה תוצאה מפורשת כדי שה-UI יחליט איך
 * להציג הצלחה/כשל (CLAUDE.md: כשל הדפסה לא הופך אצווה לפעילה בשקט).
 */
export async function printBatchLabel(
  batch: PrintableBatch,
): Promise<{ ok: true } | { ok: false }> {
  const businessId = getBusinessId();
  const updateBatchPrintStatus = httpsCallable(functions, "updateBatchPrintStatus");

  try {
    await getPrinterAdapter().print({
      batchId: batch.id,
      productName: batch.productNameSnapshot,
      quantity: batch.quantity,
      unit: batch.unit,
      preparedAt: batch.preparedAtClient,
      expiresAt: batch.expiresAt,
    });
    await updateBatchPrintStatus({ businessId, batchId: batch.id, printStatus: "printed" });
    return { ok: true };
  } catch {
    await updateBatchPrintStatus({
      businessId,
      batchId: batch.id,
      printStatus: "failed",
    }).catch(() => {});
    return { ok: false };
  }
}
