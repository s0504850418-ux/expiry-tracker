import type { LabelData, PrinterAdapter } from "./types";

/**
 * שלד להדפסה ישירה למדפסת מדבקות תרמית דרך Web Bluetooth — לפי
 * CLAUDE.md: "מדפסת מדבקות תרמית — דגם עדיין לא נבחר/נרכש. אין
 * להניח תאימות לדגם ספציפי". ה-service/characteristic UUIDs ופרוטוקול
 * הפקודות (ESC/POS או TSPL, תלוי בדגם) ימולאו כאן ברגע שתירכש מדפסת
 * אמיתית ויבחר הדגם. עד אז נכשלת במפורש — לא מעמידה פנים שהיא עובדת,
 * כדי שזרימת "טיפול בכשל הדפסה" (CLAUDE.md) תהיה אמיתית וניתנת
 * לבדיקה גם בלי חומרה.
 */
export class WebBluetoothPrinterAdapter implements PrinterAdapter {
  readonly name = "web-bluetooth";

  async print(_label: LabelData): Promise<void> {
    if (!("bluetooth" in navigator)) {
      throw new Error("הדפדפן/המכשיר הזה לא תומך ב-Web Bluetooth");
    }
    throw new Error(
      "מדפסת מדבקות תרמית עדיין לא הוגדרה — לא נבחר דגם (ראו CLAUDE.md).",
    );
  }
}
