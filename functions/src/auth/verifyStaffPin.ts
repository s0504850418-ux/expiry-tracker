import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { staffUid } from "../lib/claims";
import { verifySecretAndIssueToken } from "../lib/verifySecret";

interface Data {
  businessId: string;
  staffId: string;
  pin: string;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.staffId !== "string" ||
    d.staffId.length === 0 ||
    typeof d.pin !== "string" ||
    d.pin.length === 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, staffId ו-PIN נדרשים",
    );
  }
  return { businessId: d.businessId, staffId: d.staffId, pin: d.pin };
}

export const verifyStaffPin = onCall(async (request) => {
  const { businessId, staffId, pin } = validate(request.data);

  const staffSnap = await getFirestore()
    .doc(`businesses/${businessId}/staff/${staffId}`)
    .get();
  if (!staffSnap.exists || staffSnap.data()?.active !== true) {
    throw new HttpsError("not-found", "עובד/ת לא נמצא/ה או לא פעיל/ה");
  }

  const uid = staffUid(businessId, staffId);
  const token = await verifySecretAndIssueToken({
    businessId,
    secretDocPath: `businesses/${businessId}/staffSecrets/${staffId}`,
    plainSecret: pin,
    uid,
    role: "shiftManager",
    staffId,
    failedAction: "auth.staffPin.failed",
    successAction: "auth.staffPin.success",
  });

  return { token };
});
