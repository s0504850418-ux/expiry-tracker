import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { Role } from "./claims";

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

export interface BusinessMember {
  uid: string;
  role: Role;
  staffId?: string;
}

/**
 * מוודא שהקורא מחובר ומשוייך לאותו businessId, כ-owner או
 * כ-shiftManager (שני התפקידים היחידים שמורשים לפעול בתוך המכשיר/
 * טאבלט). מחזיר את הזהות שנגזרת מה-claims, לשימוש ב-audit log וב-
 * שדות "מי ביצע".
 */
export function requireBusinessMember(
  request: CallableRequest,
  businessId: string,
): BusinessMember {
  const token = request.auth?.token;
  if (
    !token ||
    token.businessId !== businessId ||
    (token.role !== "owner" && token.role !== "shiftManager")
  ) {
    throw new HttpsError(
      "permission-denied",
      "יש להתחבר לעסק הזה כדי לבצע פעולה זו",
    );
  }
  return {
    uid: request.auth!.uid,
    role: token.role as Role,
    staffId: token.staffId as string | undefined,
  };
}
