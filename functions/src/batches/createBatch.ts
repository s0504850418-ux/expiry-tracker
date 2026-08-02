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
  clientRequestId?: string; // למניעת יצירה כפולה בניסיון חוזר/רשת לא יציבה
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
  if (d.clientRequestId !== undefined && typeof d.clientRequestId !== "string") {
    throw new HttpsError("invalid-argument", "clientRequestId לא תקין");
  }
  return {
    businessId: d.businessId,
    productId: d.productId,
    quantity: d.quantity,
    preparedAtClient: d.preparedAtClient,
    clientRequestId: d.clientRequestId,
  };
}

/**
 * יוצרת אצווה חדשה. status תמיד מתחיל 'active', printStatus 'pending'
 * (ניסיון ההדפסה בפועל מתבצע בלקוח מיד אחרי היצירה — ראו
 * src/printing/printBatchLabel.ts). expiresAt מחושב מ-preparedAtClient
 * (לא preparedAtServer) כדי שניתוק אינטרנט זמני לא יעוות את תאריך
 * התפוגה האמיתי.
 *
 * אידמפוטנטית לפי clientRequestId: אם נשלח, ונמצאת כבר אצווה עם אותו
 * מזהה בקשה, מוחזרת האצווה הקיימת במקום ליצור כפולה — מגנה מפני
 * שליחה כפולה (לחיצה כפולה, ניסיון חוזר אוטומטי אחרי ניתוק רגעי).
 */
export const createBatch = onCall(async (request) => {
  const { businessId, productId, quantity, preparedAtClient, clientRequestId } =
    validate(request.data);
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

  // הערה מכוונת: לא שומרים עלות (costSnapshot) על מסמך האצווה עצמו,
  // למרות שזה היה מפשט דוחות — כי batches ניתן לקריאה גם למנהל/ת
  // משמרת (FEFO), ועלויות הן נתון כספי ל-owner בלבד (כמו ingredients/
  // recipeVersions). הדוח הכספי (שלב 7) מצטרף במקום זאת ל-
  // recipeVersions לפי batch.recipeVersionId — קריאה ששמורה ל-owner
  // בלבד ב-Rules ממילא.

  // clientRequestId, כשקיים, הופך למזהה המסמך עצמו — כך שניסיון שני
  // עם אותו מזהה (לחיצה כפולה, ניסיון חוזר אחרי ניתוק רגעי) נתקל ב-
  // ALREADY_EXISTS מ-create() באופן אטומי בצד השרת, במקום מרוץ בין
  // "בדוק אם קיים" ל"צור" שהיה יכול עדיין ליצור כפילות.
  const batchRef = clientRequestId
    ? db.doc(`businesses/${businessId}/batches/${clientRequestId}`)
    : db.collection(`businesses/${businessId}/batches`).doc();

  try {
    await batchRef.create({
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
  } catch (err) {
    const alreadyExists = (err as { code?: number })?.code === 6; // gRPC ALREADY_EXISTS
    if (clientRequestId && alreadyExists) {
      const existing = await batchRef.get();
      const existingExpiresAt = existing.data()!.expiresAt as Timestamp;
      return {
        batchId: existing.id,
        expiresAt: existingExpiresAt.toDate().toISOString(),
      };
    }
    throw err;
  }

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
