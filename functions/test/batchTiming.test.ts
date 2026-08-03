import { describe, expect, it } from "vitest";
import {
  MAX_FUTURE_DRIFT_MINUTES,
  computeExpiresAt,
  isImplausiblyFuture,
} from "../src/lib/batchTiming";

describe("computeExpiresAt", () => {
  it("מחשב תפוגה לפי preparedAtClient + חיי מדף, לא לפי עכשיו", () => {
    const prepared = new Date("2026-01-01T10:00:00Z");
    const expires = computeExpiresAt(prepared, 60 * 24); // יממה
    expect(expires.toISOString()).toBe("2026-01-02T10:00:00.000Z");
  });

  it("תומך בחיי מדף קצרים (דקות)", () => {
    const prepared = new Date("2026-01-01T10:00:00Z");
    expect(computeExpiresAt(prepared, 30).toISOString()).toBe(
      "2026-01-01T10:30:00.000Z",
    );
  });
});

describe("isImplausiblyFuture", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("לא חריג כשהזמן בעבר או עכשיו", () => {
    expect(isImplausiblyFuture(now, now)).toBe(false);
    expect(
      isImplausiblyFuture(new Date(now.getTime() - 60_000), now),
    ).toBe(false);
  });

  it("לא חריג בתוך סטיית השעון המותרת", () => {
    const withinDrift = new Date(
      now.getTime() + (MAX_FUTURE_DRIFT_MINUTES - 1) * 60_000,
    );
    expect(isImplausiblyFuture(withinDrift, now)).toBe(false);
  });

  it("חריג מעבר לסטיית השעון המותרת", () => {
    const beyondDrift = new Date(
      now.getTime() + (MAX_FUTURE_DRIFT_MINUTES + 1) * 60_000,
    );
    expect(isImplausiblyFuture(beyondDrift, now)).toBe(true);
  });
});
