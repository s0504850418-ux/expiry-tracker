import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireBusinessMember } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  batchId: string;
  quantity: number;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.batchId !== "string" ||
    d.batchId.length === 0 ||
    typeof d.quantity !== "number" ||
    !(d.quantity >= 0)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, batchId ו-quantity (מספר לא-שלילי) נדרשים",
    );
  }
  return { businessId: d.businessId, batchId: d.batchId, quantity: d.quantity };
}

/**
 * עדכון כמות נותרת על אצווה שעדיין 'active' — שימוש חלקי באמצע חיי
 * האצווה (למשל "כל סוף יום"), בנפרד מ-updateBatchStatus שהוא המעבר
 * הסופי לסטטוס מסופי. שומרת רק את הכמות הנוכחית; אין היסטוריית
 * עדכונים — מספיק כדי לדעת "מה יש עכשיו במקרר" (ראו CLAUDE.md).
 *
 * preparedQuantity לעולם לא משתנה כאן (רק quantity), ולכן דוח הפחת
 * ממשיך לחשב נכון לפי quantity/preparedQuantity *בזמן ההשלכה הסופית*
 * — לא לפי ההפרש בין עדכוני כמות ביניים.
 *
 * quantityLastUpdatedAt מתעדכן כדי שהטאבלט יוכל להציג תזכורת ויזואלית
 * למוצרים שמוגדרים ל"כל סוף יום" ולא עודכנו היום — ראו
 * src/lib/quantityReminder.ts.
 */
export const updateBatchQuantity = onCall(async (request) => {
  const data = validate(request.data);
  const member = requireBusinessMember(request, data.businessId);

  const db = getFirestore();
  const batchRef = db.doc(`businesses/${data.businessId}/batches/${data.batchId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(batchRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "אצווה לא נמצאה");
    }
    const batch = snap.data()!;
    if (batch.status !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "לא ניתן לעדכן כמות לאצווה שאינה פעילה",
      );
    }
    if (
      typeof batch.preparedQuantity === "number" &&
      data.quantity > batch.preparedQuantity
    ) {
      throw new HttpsError(
        "invalid-argument",
        "הכמות לא יכולה להיות גדולה מהכמות שהוכנה במקור",
      );
    }

    tx.update(batchRef, {
      quantity: data.quantity,
      quantityLastUpdatedAt: FieldValue.serverTimestamp(),
      lastModifiedAt: FieldValue.serverTimestamp(),
    });
  });

  await writeAuditLog({
    businessId: data.businessId,
    action: "batch.quantityUpdated",
    performedByUid: member.uid,
    performedByRole: member.role,
    performedByStaffId: member.staffId ?? null,
    targetType: "batch",
    targetId: data.batchId,
    metadata: { quantity: data.quantity },
  });

  return { success: true };
});
