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

const BUSINESS_MEMBER_ROLES: Role[] = ["owner", "shiftManager", "worker"];

/**
 * מוודא שהקורא מחובר ומשוייך לאותו businessId, בכל אחד משלושת
 * התפקידים (owner/shiftManager/worker — כולם מורשים לפעול בתוך
 * המכשיר/טאבלט ברמה כלשהי; worker הוא session שקוף בלי PIN, ראו
 * startWorkerSession.ts). מחזיר את הזהות שנגזרת מה-claims, לשימוש
 * ב-audit log וב-שדות "מי ביצע".
 */
export function requireBusinessMember(
  request: CallableRequest,
  businessId: string,
): BusinessMember {
  const token = request.auth?.token;
  if (
    !token ||
    token.businessId !== businessId ||
    !BUSINESS_MEMBER_ROLES.includes(token.role as Role)
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

/**
 * כמו requireBusinessMember, אבל דוחה במפורש session מסוג worker —
 * לפעולות "מגדירים מה מכינים" (מוצר/מרכיב/מתכון חדש) שמותרות
 * ל-shiftManager ול-owner בלבד, לא לעובד/ת רגיל/ה בלי PIN.
 */
export function requireShiftManagerOrOwner(
  request: CallableRequest,
  businessId: string,
): BusinessMember {
  const member = requireBusinessMember(request, businessId);
  if (member.role === "worker") {
    throw new HttpsError(
      "permission-denied",
      "פעולה זו דורשת התחברות כמנהל/ת משמרת או בעל/ת העסק",
    );
  }
  return member;
}
