import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireBusinessMember } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

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
  if (d.newStatus === "discarded" && !d.discardReason?.trim()) {
    throw new HttpsError(
      "invalid-argument",
      "יש לציין סיבת פחת כשמסמנים אצווה כמושלכת",
    );
  }
  return {
    businessId: d.businessId,
    batchId: d.batchId,
    newStatus: d.newStatus as TerminalStatus,
    quantity: d.quantity,
    discardReason: d.discardReason?.trim(),
  };
}

/**
 * מעבר סטטוס יחיד: active -> used|expired|discarded. אין מעבר חזרה,
 * ואין אפשרות לשנות אצווה שכבר במצב סופי (אין מחיקה/עריכה לעולם —
 * ראו CLAUDE.md). זו גם ההזדמנות היחידה לעדכן כמות (שימוש חלקי),
 * לפי ברירת המחדל "עדכון בסוף חיי האצווה".
 */
export const updateBatchStatus = onCall(async (request) => {
  const data = validate(request.data);
  const member = requireBusinessMember(request, data.businessId);

  const db = getFirestore();
  const batchRef = db.doc(`businesses/${data.businessId}/batches/${data.batchId}`);
  const snap = await batchRef.get();
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
  await batchRef.update(update);

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
