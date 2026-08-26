import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  EXPIRING_SOON_WINDOW_MINUTES,
  classifyBatchNotification,
  shouldSendReminder,
} from "../lib/notificationTiming";

/**
 * מיוצאת (לא רק internal) כדי שתהיה ניתנת לקריאה ישירה מבדיקות
 * אינטגרציה — ה-Pub/Sub Emulator הנדרש כדי להפעיל onSchedule ידנית
 * לא עלה בסביבת הפיתוח הזו (תקלה ב-firebase-tools על Windows,
 * לא בקוד הזה — האמולטור עצמו כן עובד כשמריצים אותו ישירות). קריאה
 * ישירה לפונקציה הזו בודקת את כל הלוגיקה בפועל מול Firestore Emulator
 * אמיתי, בלי מוק — רק לא דרך מנגנון ה-schedule עצמו.
 */
export async function processBusiness(
  db: FirebaseFirestore.Firestore,
  businessId: string,
  now: Date,
): Promise<void> {
  // אין סינון expiresAt בשאילתה עצמה (בניגוד לגרסה קודמת): לכל מוצר
  // חלון התראה משלו (notifyBeforeExpiryMinutes, ראו CLAUDE.md — "לא
  // ערך גלובלי קבוע אחיד לכל המוצרים"), ויכול להיות גדול בהרבה מברירת
  // המחדל (EXPIRING_SOON_WINDOW_MINUTES) — סינון מוקדם לפי סף גלובלי
  // היה מפספס בשקט אצוות של מוצר עם חלון-התראה ארוך יותר. בקנה המידה
  // של פיילוט מסעדה יחידה (עשרות אצוות פעילות לכל היותר) שליפת כל
  // האצוות הפעילות וסינון בזיכרון זולה לגמרי.
  const [activeBatchesSnap, productsSnap] = await Promise.all([
    db.collection(`businesses/${businessId}/batches`).where("status", "==", "active").get(),
    db.collection(`businesses/${businessId}/products`).get(),
  ]);

  const notifyMinutesByProductId = new Map<string, number | null>();
  for (const productDoc of productsSnap.docs) {
    notifyMinutesByProductId.set(
      productDoc.id,
      (productDoc.data().notifyBeforeExpiryMinutes as number | null | undefined) ?? null,
    );
  }

  for (const batchDoc of activeBatchesSnap.docs) {
    const batchData = batchDoc.data();
    const expiresAt = (batchData.expiresAt as Timestamp).toDate();
    const productNotifyMinutes = notifyMinutesByProductId.get(batchData.productId as string);
    const soonWindowMinutes =
      typeof productNotifyMinutes === "number"
        ? productNotifyMinutes
        : EXPIRING_SOON_WINDOW_MINUTES;
    const type = classifyBatchNotification(expiresAt, now, soonWindowMinutes);
    if (!type) continue; // עדיין רחוק מתפוגה, לפי חלון ההתראה הספציפי למוצר הזה

    // batchId כמזהה מסמך ההתראה עצמו — התראה יחידה פעילה לכל אצווה,
    // בלי כפילויות, גם כשה-Scheduled Function רצה שוב ושוב.
    const notifRef = db.doc(`businesses/${businessId}/notifications/${batchDoc.id}`);
    const notifSnap = await notifRef.get();

    if (!notifSnap.exists) {
      await notifRef.set({
        type,
        batchId: batchDoc.id,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        lastRemindedAt: FieldValue.serverTimestamp(),
        acknowledgedAt: null,
        acknowledgedByStaffId: null,
      });
      continue;
    }

    const notif = notifSnap.data()!;
    if (notif.status !== "pending") continue; // כבר טופלה — לא נוגעים

    const update: Record<string, unknown> = {};
    if (notif.type !== type) {
      update.type = type; // שדרוג batchExpiringSoon -> batchExpired
    }
    const lastRemindedAt = notif.lastRemindedAt
      ? (notif.lastRemindedAt as Timestamp).toDate()
      : null;
    if (shouldSendReminder(lastRemindedAt, now)) {
      update.lastRemindedAt = FieldValue.serverTimestamp();
    }
    if (Object.keys(update).length > 0) {
      await notifRef.update(update);
    }
  }
}

/**
 * רצה כל שעה: בודקת אצוות active שמתקרבות לתפוגה (לפי חלון ההתראה
 * הספציפי של המוצר שלהן — notifyBeforeExpiryMinutes, או ברירת המחדל
 * הגלובלית EXPIRING_SOON_WINDOW_MINUTES אם לא הוגדר למוצר ערך משלו)
 * או שכבר עברו את זמן התפוגה, ויוצרת/מעדכנת התראה לכל אחת. אין
 * כפילויות (batchId = מזהה ההתראה). "תזכורת חוזרת" = lastRemindedAt
 * מתעדכן כל 3 שעות כל עוד ההתראה עדיין pending — לשימוש עתידי
 * (push/צליל) וכבסיס לפאנל ה-UI. הפסקת התראה = updateBatchStatus
 * (שינוי סטטוס ידני ע"י הצוות) מסמנת אותה acknowledged, לא כפתור נפרד.
 */
export const checkExpiringBatches = onSchedule("every 60 minutes", async () => {
  const db = getFirestore();
  const now = new Date();

  const businessesSnap = await db.collection("businesses").where("active", "==", true).get();
  for (const businessDoc of businessesSnap.docs) {
    // כשל בעסק אחד (מסמך פגום, שגיאת הרשאה נקודתית וכו') לא אמור
    // לעצור את הריצה של שאר העסקים באותה הרצה — כרגע פיילוט של עסק
    // יחיד, אבל הלולאה הזו אמורה להישאר נכונה גם כשיהיו כמה עסקים.
    // הכשל נרשם ב-logger (Cloud Logging) כדי שיהיה ניתן להתריע עליו —
    // ראו "מה עדיין חסר" לגבי חיווט התראה בפועל.
    try {
      await processBusiness(db, businessDoc.id, now);
    } catch (err) {
      logger.error("checkExpiringBatches: processBusiness נכשל לעסק", {
        businessId: businessDoc.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
});
