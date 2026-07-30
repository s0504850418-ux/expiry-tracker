import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireBusinessMember } from "../lib/authz";
import { computeExpiresAt, isImplausiblyFuture } from "../lib/batchTiming";
import { writeAuditLog } from "../lib/audit";

interface Data {
  businessId: string;
  productId: string;
  quantity: number;
  preparedAtClient: string; // ISO 8601, מוזן בטאבלט
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (
    !d ||
    typeof d.businessId !== "string" ||
    d.businessId.length === 0 ||
    typeof d.productId !== "string" ||
    d.productId.length === 0 ||
    typeof d.quantity !== "number" ||
    !(d.quantity > 0) ||
    typeof d.preparedAtClient !== "string"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, productId, quantity (חיובי) ו-preparedAtClient נדרשים",
    );
  }
  return {
    businessId: d.businessId,
    productId: d.productId,
    quantity: d.quantity,
    preparedAtClient: d.preparedAtClient,
  };
}

/**
 * יוצרת אצווה חדשה. status תמיד מתחיל 'active', printStatus 'pending' —
 * הדפסה בפועל (ושילוב הכשל שלה בזרימה) עדיין לא קיימת, תגיע בשלב 5
 * (Printer Adapter). expiresAt מחושב מ-preparedAtClient (לא preparedAtServer)
 * כדי שניתוק אינטרנט זמני לא יעוות את תאריך התפוגה האמיתי.
 */
export const createBatch = onCall(async (request) => {
  const { businessId, productId, quantity, preparedAtClient } = validate(
    request.data,
  );
  const member = requireBusinessMember(request, businessId);

  const preparedAtClientDate = new Date(preparedAtClient);
  if (Number.isNaN(preparedAtClientDate.getTime())) {
    throw new HttpsError("invalid-argument", "preparedAtClient לא תקין");
  }
  const now = new Date();
  if (isImplausiblyFuture(preparedAtClientDate, now)) {
    throw new HttpsError(
      "invalid-argument",
      "preparedAtClient לא יכול להיות בעתיד",
    );
  }

  const db = getFirestore();
  const productRef = db.doc(`businesses/${businessId}/products/${productId}`);
  const productSnap = await productRef.get();
  if (!productSnap.exists || productSnap.data()?.active !== true) {
    throw new HttpsError("not-found", "מוצר לא נמצא או לא פעיל");
  }
  const product = productSnap.data()!;

  const expiresAt = computeExpiresAt(
    preparedAtClientDate,
    product.shelfLifeMinutes as number,
  );

  const batchRef = db.collection(`businesses/${businessId}/batches`).doc();
  await batchRef.set({
    productId,
    productNameSnapshot: product.name,
    unit: product.unit,
    recipeVersionId: product.currentRecipeVersionId ?? null,
    quantity,
    preparedAtClient: Timestamp.fromDate(preparedAtClientDate),
    preparedAtServer: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    status: "active",
    discardReason: null,
    printStatus: "pending",
    createdByRole: member.role,
    createdByStaffId: member.staffId ?? null,
    lastModifiedAt: FieldValue.serverTimestamp(),
    archivedAt: null,
  });

  await writeAuditLog({
    businessId,
    action: "batch.created",
    performedByUid: member.uid,
    performedByRole: member.role,
    performedByStaffId: member.staffId ?? null,
    targetType: "batch",
    targetId: batchRef.id,
    metadata: { productId, quantity },
  });

  return { batchId: batchRef.id, expiresAt: expiresAt.toISOString() };
});
