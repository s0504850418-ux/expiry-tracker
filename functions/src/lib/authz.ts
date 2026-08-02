import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";

/**
 * מוודא שהקורא מחובר ומזוהה כ-owner של אותו businessId בדיוק
 * (לא של עסק אחר) — נבדק מתוך ה-custom claims של ה-ID token, לא
 * מתוך פרמטרים שהלקוח שולח.
 */
export function requireOwner(
  request: CallableRequest,
  businessId: string,
): void {
  const token = request.auth?.token;
  if (!token || token.role !== "owner" || token.businessId !== businessId) {
    throw new HttpsError(
      "permission-denied",
      "פעולה זו מותרת לבעל/ת העסק בלבד",
    );
  }
}
