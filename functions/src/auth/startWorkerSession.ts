import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { workerUid } from "../lib/claims";

interface Data {
  businessId: string;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (!d || typeof d.businessId !== "string" || d.businessId.length === 0) {
    throw new HttpsError("invalid-argument", "businessId נדרש");
  }
  return { businessId: d.businessId };
}

/**
 * מנפיקה session "עובד/ת רגיל/ה" שקוף — בלי PIN/קוד, בלי זהות אישית
 * — לפעולות הבסיס בטאבלט (יצירת אצווה, סימון סטטוס, עדכון כמות).
 * נקראת אוטומטית ע"י האפליקציה בטעינה (AuthContext), לא ביוזמת
 * לחיצה של המשתמש/ת — בדיוק כמו listActiveStaffNames, בכוונה ללא
 * אימות סוד כלשהו.
 *
 * uid משותף לכל בקשת session לעסק הזה (worker_{businessId}, ראו
 * functions/src/lib/claims.ts) — לא מזהה מכשיר/אדם ספציפי, ולכן
 * לא נרשמת ל-audit log כפעולה (בדיוק כמו listActiveStaffNames):
 * ההנפקה עצמה אינה "פעולה", וה"מי הכין" האמיתי (תיעוד, לא אבטחה)
 * ממשיך להירשם על האצווה עצמה דרך preparedByStaffId.
 */
export const startWorkerSession = onCall(async (request) => {
  const { businessId } = validate(request.data);

  const businessSnap = await getFirestore().collection("businesses").doc(businessId).get();
  if (!businessSnap.exists || businessSnap.data()?.active !== true) {
    throw new HttpsError("not-found", "עסק לא נמצא");
  }

  const uid = workerUid(businessId);
  const token = await getAuth().createCustomToken(uid, {
    businessId,
    role: "worker",
  });

  return { token };
});
