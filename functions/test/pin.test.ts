import { describe, expect, it } from "vitest";
import {
  MAX_FAILED_ATTEMPTS,
  hashSecret,
  isLocked,
  recordFailure,
  recordSuccess,
  secretMatches,
} from "../src/lib/pin";

describe("hashSecret / secretMatches", () => {
  it("מאמת קוד נכון מול ה-hash שלו", async () => {
    const hash = await hashSecret("1234");
    expect(await secretMatches("1234", hash)).toBe(true);
  });

  it("דוחה קוד שגוי", async () => {
    const hash = await hashSecret("1234");
    expect(await secretMatches("9999", hash)).toBe(false);
  });

  it("מייצר hash שונה בכל פעם (salt אקראי) גם לאותו קלט", async () => {
    const [a, b] = await Promise.all([hashSecret("1234"), hashSecret("1234")]);
    expect(a).not.toBe(b);
  });

  it("אף פעם לא שומר את הקוד כטקסט גלוי בתוך ה-hash", async () => {
    const hash = await hashSecret("1234");
    expect(hash).not.toContain("1234");
  });
});

describe("isLocked", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("לא נעול כשאין lockedUntil", () => {
    expect(isLocked(null, now)).toBe(false);
  });

  it("נעול כשה-lockedUntil בעתיד", () => {
    const future = new Date(now.getTime() + 60_000);
    expect(isLocked(future, now)).toBe(true);
  });

  it("לא נעול כשה-lockedUntil כבר עבר", () => {
    const past = new Date(now.getTime() - 60_000);
    expect(isLocked(past, now)).toBe(false);
  });
});

describe("recordFailure / recordSuccess", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("סופר ניסיון כושל בלי לנעול לפני שמגיעים לסף", () => {
    const state = recordFailure(0, now);
    expect(state.failedAttempts).toBe(1);
    expect(state.lockedUntil).toBeNull();
  });

  it("נועל אחרי MAX_FAILED_ATTEMPTS ניסיונות רצופים", () => {
    const state = recordFailure(MAX_FAILED_ATTEMPTS - 1, now);
    expect(state.failedAttempts).toBe(MAX_FAILED_ATTEMPTS);
    expect(state.lockedUntil).not.toBeNull();
    expect(state.lockedUntil!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("מאפס לגמרי בהצלחה", () => {
    const state = recordSuccess();
    expect(state.failedAttempts).toBe(0);
    expect(state.lockedUntil).toBeNull();
  });
});
