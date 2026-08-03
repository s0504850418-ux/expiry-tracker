import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * לשימוש בבדיקות אינטגרציה בלבד (tests/functions.test.js), לא
 * מיוצא/נטען ע"י הקוד עצמו. לא Cloud Function (אין onCall/onSchedule)
 * — לא נפרס.
 *
 * הבעיה שזה פותר: אם בדיקה בונה מופע Firestore משלה דרך ה-
 * firebase-admin של השורש (node_modules נפרד לגמרי מ-functions/) ואז
 * מעבירה אותו לפונקציה שקומפלה מתוך functions/ (שמשתמשת ב-Timestamp
 * מתוך firebase-admin *שלה עצמה*), ה-SDK דוחה את זה — "Timestamp" משתי
 * עותקי חבילה שונות אינו אותו class, למרות שהוא זהה מבנית. הפתרון:
 * לבנות את מופע ה-Firestore מתוך אותה חבילת firebase-admin בדיוק
 * שבה שימוש בקוד הנבדק.
 */
export function getTestFirestore(): FirebaseFirestore.Firestore {
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-expiry-tracker" });
  }
  return getFirestore();
}
