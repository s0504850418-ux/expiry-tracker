export const MAX_FUTURE_DRIFT_MINUTES = 5;

/**
 * מחשב תאריך תפוגה מ-preparedAtClient (מה שהעובד/ת דיווח/ה), לא
 * מ-preparedAtServer — כדי שניתוק אינטרנט זמני ותסונכרון מאוחר לא
 * יעוותו את תאריך התפוגה האמיתי. ראו DATA_MODEL.md.
 */
export function computeExpiresAt(
  preparedAtClient: Date,
  shelfLifeMinutes: number,
): Date {
  return new Date(preparedAtClient.getTime() + shelfLifeMinutes * 60_000);
}

/**
 * הגנת שפיות בסיסית מול שעון מכשיר שגוי: preparedAtClient לא אמור
 * להיות בעתיד (מעבר לסטיית שעון סבירה).
 */
export function isImplausiblyFuture(
  preparedAtClient: Date,
  now: Date,
): boolean {
  return (
    preparedAtClient.getTime() >
    now.getTime() + MAX_FUTURE_DRIFT_MINUTES * 60_000
  );
}
