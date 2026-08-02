import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

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
 * מחזירה רק staffId+name של עובדי משמרת פעילים — בכוונה ללא אימות
 * (unauthenticated), כי המכשיר עדיין לא מחובר בשלב שבו הוא צריך
 * להציג את בורר העובדים לפני הזנת PIN. לא חושפת PIN/hash/כל מידע
 * רגיש אחר — ראו firestore.rules ש-staff/* חסום לגמרי מקריאה ישירה.
 */
export const listActiveStaffNames = onCall(async (request) => {
  const { businessId } = validate(request.data);

  const db = getFirestore();
  const businessSnap = await db.collection("businesses").doc(businessId).get();
  if (!businessSnap.exists || businessSnap.data()?.active !== true) {
    throw new HttpsError("not-found", "עסק לא נמצא");
  }

  const staffSnap = await db
    .collection("businesses")
    .doc(businessId)
    .collection("staff")
    .where("active", "==", true)
    .get();

  const staff = staffSnap.docs.map((doc) => ({
    staffId: doc.id,
    name: doc.data().name as string,
  }));

  return { staff };
});
