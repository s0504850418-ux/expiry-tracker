import { onSchedule } from "firebase-functions/v2/scheduler";
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
  const soonThreshold = new Date(now.getTime() + EXPIRING_SOON_WINDOW_MINUTES * 60_000);

  const activeBatchesSnap = await db
    .collection(`businesses/${businessId}/batches`)
    .where("status", "==", "active")
    .where("expiresAt", "<=", Timestamp.fromDate(soonThreshold))
    .get();

  for (const batchDoc of activeBatchesSnap.docs) {
    const expiresAt = (batchDoc.data().expiresAt as Timestamp).toDate();
    const type = classifyBatchNotification(expiresAt, now);
    if (!type) continue; // לא אמור לקרות (השאילתה כבר סיננה), הגנת שפיות

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
 * רצה כל שעה: בודקת אצוות active שמתקרבות לתפוגה (עד שעתיים) או שכבר
 * עברו את זמן התפוגה, ויוצרת/מעדכנת התראה לכל אחת. אין כפילויות
 * (batchId = מזהה ההתראה). "תזכורת חוזרת" = lastRemindedAt מתעדכן
 * כל 3 שעות כל עוד ההתראה עדיין pending — לשימוש עתידי (push/צליל)
 * וכבסיס לפאנל ה-UI. הפסקת התראה = updateBatchStatus (שינוי סטטוס
 * ידני ע"י הצוות) מסמנת אותה acknowledged, לא כפתור נפרד.
 */
export const checkExpiringBatches = onSchedule("every 60 minutes", async () => {
  const db = getFirestore();
  const now = new Date();

  const businessesSnap = await db.collection("businesses").where("active", "==", true).get();
  for (const businessDoc of businessesSnap.docs) {
    await processBusiness(db, businessDoc.id, now);
  }
});
