import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireOwner } from "../lib/authz";
import { hashSecret } from "../lib/pin";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  newCode: string;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.newCode !== "string" ||
    d.newCode.length < 4
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId וקוד מנהל חדש (לפחות 4 תווים) נדרשים",
    );
  }
  return { businessId: d.businessId, newCode: d.newCode };
}

export const setOwnerCode = onCall(async (request) => {
  const { businessId, newCode } = validate(request.data);
  requireOwner(request, businessId);

  const hash = await hashSecret(newCode);
  await getFirestore()
    .doc(`businesses/${businessId}/secrets/owner`)
    .set({
      hash,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

  await writeAuditLog({
    businessId,
    action: "auth.ownerCode.rotated",
    performedByUid: request.auth!.uid,
    performedByRole: "owner",
    targetType: "secret",
    targetId: "owner",
  });

  return { success: true };
});
