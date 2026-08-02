import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  MAX_FAILED_ATTEMPTS,
  isLocked,
  recordFailure,
  recordSuccess,
  secretMatches,
} from "./pin";
import type { Role } from "./claims";
import { writeAuditLog } from "./audit";

interface VerifyParams {
  businessId: string;
  secretDocPath: string; // e.g. businesses/{id}/secrets/owner or .../staffSecrets/{staffId}
  plainSecret: string;
  uid: string;
  role: Role;
  staffId?: string;
  failedAction: string;
  successAction: string;
}

/**
 * ליבת האימות המשותפת לקוד מנהל ול-PIN של מנהל/ת משמרת: בודקת נעילה,
 * משווה מול ה-hash, מעדכנת מונה כשלונות/נעילה, כותבת ל-audit log,
 * ובהצלחה מנפיקה custom token עם ה-claims המתאימים.
 */
export async function verifySecretAndIssueToken(
  params: VerifyParams,
): Promise<string> {
  const db = getFirestore();
  const secretRef = db.doc(params.secretDocPath);
  const snap = await secretRef.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "פרטי הזדהות לא נמצאו");
  }

  const data = snap.data()!;
  const now = new Date();
  const lockedUntil: Date | null = data.lockedUntil
    ? (data.lockedUntil as Timestamp).toDate()
    : null;

  if (isLocked(lockedUntil, now)) {
    throw new HttpsError(
      "resource-exhausted",
      "יותר מדי ניסיונות כושלים — נסה/י שוב מאוחר יותר",
    );
  }

  const matches = await secretMatches(params.plainSecret, data.hash);

  if (!matches) {
    const { failedAttempts, lockedUntil: newLockedUntil } = recordFailure(
      data.failedAttempts ?? 0,
      now,
    );
    await secretRef.update({
      failedAttempts,
      lockedUntil: newLockedUntil
        ? Timestamp.fromDate(newLockedUntil)
        : null,
    });
    await writeAuditLog({
      businessId: params.businessId,
      action: params.failedAction,
      performedByUid: params.uid,
      performedByRole: params.role,
      performedByStaffId: params.staffId ?? null,
      targetType: "authAttempt",
      targetId: params.uid,
      metadata: { failedAttempts },
    });
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      throw new HttpsError(
        "resource-exhausted",
        "יותר מדי ניסיונות כושלים — נסה/י שוב מאוחר יותר",
      );
    }
    throw new HttpsError("permission-denied", "קוד שגוי");
  }

  const successState = recordSuccess();
  await secretRef.update({
    failedAttempts: successState.failedAttempts,
    lockedUntil: successState.lockedUntil,
  });
  await writeAuditLog({
    businessId: params.businessId,
    action: params.successAction,
    performedByUid: params.uid,
    performedByRole: params.role,
    performedByStaffId: params.staffId ?? null,
    targetType: "authAttempt",
    targetId: params.uid,
  });

  const claims: Record<string, unknown> = {
    businessId: params.businessId,
    role: params.role,
  };
  if (params.staffId) {
    claims.staffId = params.staffId;
  }

  return getAuth().createCustomToken(params.uid, claims);
}
