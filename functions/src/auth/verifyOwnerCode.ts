import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { ownerUid } from "../lib/claims";
import { verifySecretAndIssueToken } from "../lib/verifySecret";

interface Data {
  businessId: string;
  code: string;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.code !== "string" ||
    d.code.length === 0
  ) {
    throw new HttpsError("invalid-argument", "businessId וקוד מנהל נדרשים");
  }
  return { businessId: d.businessId, code: d.code };
}

export const verifyOwnerCode = onCall(async (request) => {
  const { businessId, code } = validate(request.data);

  const businessSnap = await getFirestore()
    .collection("businesses")
    .doc(businessId)
    .get();
  if (!businessSnap.exists || businessSnap.data()?.active !== true) {
    throw new HttpsError("not-found", "עסק לא נמצא");
  }

  const uid = ownerUid(businessId);
  const token = await verifySecretAndIssueToken({
    businessId,
    secretDocPath: `businesses/${businessId}/secrets/owner`,
    plainSecret: code,
    uid,
    role: "owner",
    failedAction: "auth.ownerCode.failed",
    successAction: "auth.ownerCode.success",
  });

  return { token };
});
