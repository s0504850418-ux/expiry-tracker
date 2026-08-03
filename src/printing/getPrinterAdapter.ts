import type { PrinterAdapter } from "./types";
import { BrowserPrintAdapter } from "./BrowserPrintAdapter";
import { WebBluetoothPrinterAdapter } from "./WebBluetoothPrinterAdapter";

let activeAdapter: PrinterAdapter = new BrowserPrintAdapter();

export function getPrinterAdapter(): PrinterAdapter {
  return activeAdapter;
}

/**
 * מחליפה את האדפטר הפעיל — לשימוש כשתירכש מדפסת תרמית אמיתית (יוחלף
 * ברירת המחדל ל-WebBluetoothPrinterAdapter המוגדר), ולבדיקות שצריכות
 * לדמות כשל הדפסה.
 */
export function setPrinterAdapter(adapter: PrinterAdapter): void {
  activeAdapter = adapter;
}

declare global {
  interface Window {
    __setPrinterAdapter?: (adapter: PrinterAdapter) => void;
    __useWebBluetoothAdapter?: () => void;
    __useBrowserPrintAdapter?: () => void;
  }
}

// hooks לפיתוח/בדיקות בלבד — מאפשרים להחליף אדפטר בלי לגעת בקוד
// (למשל לדמות כשל הדפסה עם אדפטר שעדיין לא הוגדר עבור מדפסת אמיתית).
if (import.meta.env.DEV) {
  window.__setPrinterAdapter = setPrinterAdapter;
  window.__useWebBluetoothAdapter = () =>
    setPrinterAdapter(new WebBluetoothPrinterAdapter());
  window.__useBrowserPrintAdapter = () => setPrinterAdapter(new BrowserPrintAdapter());
}
