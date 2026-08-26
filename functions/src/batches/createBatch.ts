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
  // מי הכין את האצווה בפועל — לתיעוד/דוחות בלבד, לא מנגנון אבטחה (לא
  // קשור ל-createdByStaffId/createdByRole למטה, שהם זהות ה-session
  // המחובר). null = הוכן ע"י בעל/ת העסק (staff לא כולל את הבעלים).
  preparedByStaffId: string | null;
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
    typeof d.preparedAtClient !== "string" ||
    (d.preparedByStaffId !== null && typeof d.preparedByStaffId !== "string")
  ) {
    throw new HttpsError(
      "invalid-argument",
      "businessId, productId, quantity (חיובי), preparedAtClient ו-preparedByStaffId (מחרוזת או null) נדרשים",
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
    preparedByStaffId: d.preparedByStaffId,
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
  const { businessId, productId, quantity, preparedAtClient, clientRequestId, preparedByStaffId } =
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

  // preparedByStaffId=null מייצג "הוכן ע"י בעל/ת העסק" — לא תקין
  // כשמי שמחובר/ת הוא/היא לא ה-owner, אחרת מנהל/ת משמרת יכול/ה לייחס
  // הכנה לבעלים בלי שהוא/היא בכלל היה/הייתה שם.
  if (preparedByStaffId === null && member.role !== "owner") {
    throw new HttpsError(
      "invalid-argument",
      "preparedByStaffId נדרש (רק בעל/ת העסק יכול/ה להכין בלי לבחור עובד/ת)",
    );
  }

  const db = getFirestore();
  const productRef = db.doc(`businesses/${businessId}/products/${productId}`);
  const productSnap = await productRef.get();
  if (!productSnap.exists || productSnap.data()?.active !== true) {
    throw new HttpsError("not-found", "מוצר לא נמצא או לא פעיל");
  }
  const product = productSnap.data()!;

  let preparedByNameSnapshot: string;
  if (preparedByStaffId === null) {
    preparedByNameSnapshot = "בעל/ת העסק";
  } else {
    const staffSnap = await db
      .doc(`businesses/${businessId}/staff/${preparedByStaffId}`)
      .get();
    if (!staffSnap.exists) {
      throw new HttpsError("not-found", "העובד/ת שנבחר/ה לא נמצא/ה — רענן/י ובחר/י שוב");
    }
    preparedByNameSnapshot = staffSnap.data()!.name as string;
  }

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
      // preparedQuantity לעולם לא משתנה אחרי היצירה (בניגוד ל-quantity,
      // שמתעדכן ב-updateBatchStatus לכמות שבאמת הושלכה/נותרה) — כדי
      // שדוח הפחת יוכל לחשב עלות יחסית לחלק שבאמת בוזבז מתוך מה שהוכן.
      preparedQuantity: quantity,
      preparedAtClient: Timestamp.fromDate(preparedAtClientDate),
      preparedAtServer: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      // נקודת ההתחלה לבדיקת "עודכן היום" (ראו src/lib/quantityReminder.ts) —
      // אצווה חדשה נחשבת "מעודכנת" ברגע היצירה, גם בלי קריאה מפורשת
      // ל-updateBatchQuantity.
      quantityLastUpdatedAt: FieldValue.serverTimestamp(),
      status: "active",
      discardReason: null,
      printStatus: "pending",
      createdByRole: member.role,
      createdByStaffId: member.staffId ?? null,
      // מי הכין בפועל — לתיעוד/דוח פחת לפי עובד בלבד, ראו למעלה.
      preparedByStaffId,
      preparedByNameSnapshot,
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
    metadata: { productId, quantity, preparedByStaffId },
  });

  return { batchId: batchRef.id, expiresAt: expiresAt.toISOString() };
});
