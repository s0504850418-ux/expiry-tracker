export const EXPIRING_SOON_WINDOW_MINUTES = 120; // "בקרוב לפוג" = תוך שעתיים
export const REMINDER_INTERVAL_MINUTES = 180; // תזכורת חוזרת כל 3 שעות אם לא טופלה

export type NotificationType = "batchExpiringSoon" | "batchExpired";

/**
 * לפי CLAUDE.md: "התראות בתוך המכשיר... עם תזכורת חוזרת כל כמה שעות
 * אם לא טופלה". קובעת אם אצווה פעילה צריכה התראה עכשיו, ואיזו.
 * null = לא צריך התראה (עדיין רחוק מהתפוגה).
 */
export function classifyBatchNotification(
  expiresAt: Date,
  now: Date,
  soonWindowMinutes: number = EXPIRING_SOON_WINDOW_MINUTES,
): NotificationType | null {
  if (expiresAt.getTime() <= now.getTime()) {
    return "batchExpired";
  }
  const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / 60_000;
  if (minutesUntilExpiry <= soonWindowMinutes) {
    return "batchExpiringSoon";
  }
  return null;
}

/**
 * האם עבר מספיק זמן מאז התזכורת האחרונה כדי לשלוח תזכורת חוזרת.
 */
export function shouldSendReminder(
  lastRemindedAt: Date | null,
  now: Date,
  reminderIntervalMinutes: number = REMINDER_INTERVAL_MINUTES,
): boolean {
  if (!lastRemindedAt) return true;
  const minutesSinceLastReminder = (now.getTime() - lastRemindedAt.getTime()) / 60_000;
  return minutesSinceLastReminder >= reminderIntervalMinutes;
}
