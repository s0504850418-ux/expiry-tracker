import { describe, expect, it } from "vitest";
import { classifyBatchNotification, shouldSendReminder } from "../src/lib/notificationTiming";

describe("classifyBatchNotification", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("מחזירה null כשהתפוגה רחוקה (מעבר לחלון 'בקרוב')", () => {
    const expiresAt = new Date("2026-01-02T12:00:00Z"); // עוד יממה
    expect(classifyBatchNotification(expiresAt, now)).toBeNull();
  });

  it("מחזירה batchExpiringSoon כשנותרו פחות מ-120 דקות", () => {
    const expiresAt = new Date(now.getTime() + 90 * 60_000);
    expect(classifyBatchNotification(expiresAt, now)).toBe("batchExpiringSoon");
  });

  it("מחזירה batchExpired כשזמן התפוגה כבר עבר", () => {
    const expiresAt = new Date(now.getTime() - 5 * 60_000);
    expect(classifyBatchNotification(expiresAt, now)).toBe("batchExpired");
  });

  it("מחזירה batchExpired בדיוק ברגע התפוגה (גבול)", () => {
    expect(classifyBatchNotification(now, now)).toBe("batchExpired");
  });

  it("מכבדת חלון 'בקרוב' מותאם אישית", () => {
    const expiresAt = new Date(now.getTime() + 30 * 60_000);
    expect(classifyBatchNotification(expiresAt, now, 20)).toBeNull();
    expect(classifyBatchNotification(expiresAt, now, 60)).toBe("batchExpiringSoon");
  });
});

describe("shouldSendReminder", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("true כשמעולם לא נשלחה תזכורת", () => {
    expect(shouldSendReminder(null, now)).toBe(true);
  });

  it("false כשהתזכורת האחרונה הייתה לפני פחות משעות המרווח", () => {
    const lastRemindedAt = new Date(now.getTime() - 60 * 60_000); // לפני שעה
    expect(shouldSendReminder(lastRemindedAt, now, 180)).toBe(false);
  });

  it("true כשעבר לפחות מרווח התזכורת מאז התזכורת האחרונה", () => {
    const lastRemindedAt = new Date(now.getTime() - 200 * 60_000); // לפני 3:20
    expect(shouldSendReminder(lastRemindedAt, now, 180)).toBe(true);
  });
});
