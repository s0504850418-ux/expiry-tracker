import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireBusinessMember } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";
import { DISCARD_REASONS } from "../lib/discardReasons";

const TERMINAL_STATUSES = ["used", "expired", "discarded"] as const;
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

interface Data {
  businessId: string;
  batchId: string;
  newStatus: TerminalStatus;
  quantity?: number;
  discardReason?: string;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.batchId !== "string" ||
    d.batchId.length === 0 ||
    typeof d.newStatus !== "string" ||
    !TERMINAL_STATUSES.includes(d.newStatus as TerminalStatus)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, batchId ו-newStatus (used/expired/discarded) נדרשים",
    );
  }
  if (d.quantity !== undefined && !(typeof d.quantity === "number" && d.quantity >= 0)) {
    throw new HttpsError("invalid-argument", "quantity חייב להיות מספר לא-שלילי");
  }
  if (
    d.newStatus === "discarded" &&
    !DISCARD_REASONS.includes(d.discardReason as (typeof DISCARD_REASONS)[number])
  ) {
    throw new HttpsError(
      "invalid-argument",
      "יש לבחור סיבת פחת מתוך הרשימה הסגורה כשמסמנים אצווה כמושלכת",
    );
  }
  return {
    businessId: d.businessId,
    batchId: d.batchId,
    newStatus: d.newStatus as TerminalStatus,
    quantity: d.quantity,
    discardReason: d.discardReason,
  };
}

/**
 * מעבר סטטוס יחיד: active -> used|expired|discarded. אין מעבר חזרה,
 * ואין אפשרות לשנות אצווה שכבר במצב סופי (אין מחיקה/עריכה לעולם —
 * ראו CLAUDE.md). זו גם ההזדמנות היחידה לעדכן כמות (שימוש חלקי),
 * לפי ברירת המחדל "עדכון בסוף חיי האצווה".
 *
 * הבדיקה-והכתיבה רצות בתוך טרנזקציית Firestore — אם שני מכשירים
 * (או שני טאבים) מנסים לשנות את אותה אצווה כמעט בו-זמנית (למשל
 * "נוצל" ו-"הושלך" באותו רגע אחרי חזרה מניתוק), רק הראשונה שמצליחה
 * "לנעול" את המסמך תבוצע — השנייה נכשלת עם אותה שגיאת
 * failed-precondition הרגילה, לא דורסת בשקט את הראשונה.
 *
 * "טיפול" בהתראת תפוגה (שלב 9) = שינוי סטטוס בפועל, לא כפתור
 * "אישרתי" נפרד — אם קיימת התראה pending לאצווה הזו, היא מסומנת
 * acknowledged באותה טרנזקציה.
 */
export const updateBatchStatus = onCall(async (request) => {
  const data = validate(request.data);
  const member = requireBusinessMember(request, data.businessId);

  const db = getFirestore();
  const batchRef = db.doc(`businesses/${data.businessId}/batches/${data.batchId}`);
  const notifRef = db.doc(`businesses/${data.businessId}/notifications/${data.batchId}`);

  await db.runTransaction(async (tx) => {
    const [snap, notifSnap] = await Promise.all([tx.get(batchRef), tx.get(notifRef)]);
    if (!snap.exists) {
      throw new HttpsError("not-found", "אצווה לא נמצאה");
    }
    const batch = snap.data()!;
    if (batch.status !== "active") {
      throw new HttpsError(
        "failed-precondition",
        `לא ניתן לשנות סטטוס מ-"${batch.status}" — רק אצווה פעילה ניתנת לעדכון`,
      );
    }
    if (
      data.quantity !== undefined &&
      typeof batch.preparedQuantity === "number" &&
      data.quantity > batch.preparedQuantity
    ) {
      throw new HttpsError(
        "invalid-argument",
        "הכמות לא יכולה להיות גדולה מהכמות שהוכנה במקור",
      );
    }

    const update: Record<string, unknown> = {
      status: data.newStatus,
      lastModifiedAt: FieldValue.serverTimestamp(),
    };
    if (data.newStatus === "discarded") {
      update.discardReason = data.discardReason;
    }
    if (data.quantity !== undefined) {
      update.quantity = data.quantity;
    }
    tx.update(batchRef, update);

    if (notifSnap.exists && notifSnap.data()?.status === "pending") {
      tx.update(notifRef, {
        status: "acknowledged",
        acknowledgedAt: FieldValue.serverTimestamp(),
        acknowledgedByStaffId: member.staffId ?? null,
      });
    }
  });

  await writeAuditLog({
    businessId: data.businessId,
    action: "batch.statusChanged",
    performedByUid: member.uid,
    performedByRole: member.role,
    performedByStaffId: member.staffId ?? null,
    targetType: "batch",
    targetId: data.batchId,
    metadata: { from: "active", to: data.newStatus },
  });

  return { success: true };
});
