import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireBusinessMember } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

const PRINT_STATUSES = ["printed", "failed"] as const;
type PrintStatus = (typeof PRINT_STATUSES)[number];

interface Data {
  businessId: string;
  batchId: string;
  printStatus: PrintStatus;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.batchId !== "string" ||
    d.batchId.length === 0 ||
    typeof d.printStatus !== "string" ||
    !PRINT_STATUSES.includes(d.printStatus as PrintStatus)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, batchId ו-printStatus (printed/failed) נדרשים",
    );
  }
  return {
    businessId: d.businessId,
    batchId: d.batchId,
    printStatus: d.printStatus as PrintStatus,
  };
}

/**
 * מעדכנת printStatus אחרי ניסיון הדפסה בפועל שבוצע בלקוח (Printer
 * Adapter). ניתן לקרוא שוב ושוב על אותה אצווה (הדפסה חוזרת / ניסיון
 * חוזר אחרי כשל) כל עוד היא עדיין 'active' — לפי CLAUDE.md, כשל
 * הדפסה לא הופך אצווה לפעילה "בשקט"; ה-UI מציג שגיאה עם אפשרות
 * ניסיון חוזר, וזו הפונקציה שמתעדת כל ניסיון.
 */
export const updateBatchPrintStatus = onCall(async (request) => {
  const data = validate(request.data);
  const member = requireBusinessMember(request, data.businessId);

  const db = getFirestore();
  const batchRef = db.doc(`businesses/${data.businessId}/batches/${data.batchId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(batchRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "אצווה לא נמצאה");
    }
    if (snap.data()!.status !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "לא ניתן לעדכן סטטוס הדפסה לאצווה שאינה פעילה",
      );
    }
    tx.update(batchRef, {
      printStatus: data.printStatus,
      lastModifiedAt: FieldValue.serverTimestamp(),
    });
  });

  await writeAuditLog({
    businessId: data.businessId,
    action: "batch.printStatusChanged",
    performedByUid: member.uid,
    performedByRole: member.role,
    performedByStaffId: member.staffId ?? null,
    targetType: "batch",
    targetId: data.batchId,
    metadata: { printStatus: data.printStatus },
  });

  return { success: true };
});
