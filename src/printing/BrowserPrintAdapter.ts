import type { LabelData, PrinterAdapter } from "./types";
import { generateBatchQrDataUrl } from "../lib/qr";

const PRINT_ROOT_ID = "print-label-root";

function formatDateTime(date: Date): string {
  return date.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildLabelElement(label: LabelData, qrDataUrl: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "printed-label";

  const title = document.createElement("h2");
  title.textContent = label.productName;
  container.appendChild(title);

  const quantity = document.createElement("p");
  quantity.textContent = `${label.quantity} ${label.unit}`;
  container.appendChild(quantity);

  const prepared = document.createElement("p");
  prepared.textContent = `הוכן: ${formatDateTime(label.preparedAt)}`;
  container.appendChild(prepared);

  const expires = document.createElement("p");
  expires.textContent = `תוקף עד: ${formatDateTime(label.expiresAt)}`;
  container.appendChild(expires);

  const img = document.createElement("img");
  img.src = qrDataUrl;
  img.alt = label.batchId;
  container.appendChild(img);

  const batchIdText = document.createElement("p");
  batchIdText.className = "printed-label-batch-id";
  batchIdText.textContent = label.batchId;
  container.appendChild(batchIdText);

  return container;
}

/**
 * מדפיסה דרך דיאלוג ההדפסה של הדפדפן — עובד היום על כל מדפסת/PDF,
 * בלי צורך בחומרה מיוחדת. זו ברירת המחדל הפעילה עד שתירכש מדפסת
 * מדבקות תרמית אמיתית (ראו WebBluetoothPrinterAdapter).
 *
 * מגבלה ידועה, לא רק של המימוש הזה: window.print() לא מחזירה אות
 * הצלחה/כישלון אמיתי — "הצלחה" כאן פירושה שהדפדפן קיבל את הבקשה
 * להדפיס, לא שהמדבקה אכן יצאה מהמדפסת הפיזית.
 */
export class BrowserPrintAdapter implements PrinterAdapter {
  readonly name = "browser";

  async print(label: LabelData): Promise<void> {
    const root = document.getElementById(PRINT_ROOT_ID);
    if (!root) {
      throw new Error("אלמנט ההדפסה לא נמצא בדף");
    }
    const qrDataUrl = await generateBatchQrDataUrl(label.batchId);
    root.replaceChildren(buildLabelElement(label, qrDataUrl));
    window.print();
  }
}
