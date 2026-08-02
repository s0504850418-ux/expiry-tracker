import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { Role } from "./claims";

export interface AuditLogEntry {
  businessId: string;
  action: string;
  performedByUid: string;
  performedByRole: Role | "system";
  performedByStaffId?: string | null;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const db = getFirestore();
  await db
    .collection("businesses")
    .doc(entry.businessId)
    .collection("auditLog")
    .add({
      action: entry.action,
      performedByUid: entry.performedByUid,
      performedByRole: entry.performedByRole,
      performedByStaffId: entry.performedByStaffId ?? null,
      deviceUid: entry.performedByUid,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
}
