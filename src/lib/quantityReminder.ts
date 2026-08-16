import type { Batch, Product } from "./types";

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * true אם המוצר מוגדר במפורש ל"כל סוף יום" (partialUsageUpdateFrequency
 * === "endOfDay") והאצווה לא עודכנה (quantityLastUpdatedAt) מאז תחילת
 * היום המקומי הנוכחי. מוצר בברירת המחדל (null/"endOfBatchLife") לעולם
 * לא מציג תזכורת — ראו CLAUDE.md, "החלטות מוצר נעולות".
 */
export function needsDailyQuantityUpdate(
  batch: Pick<Batch, "quantityLastUpdatedAt">,
  product: Pick<Product, "partialUsageUpdateFrequency"> | undefined,
  now: Date = new Date(),
): boolean {
  if (product?.partialUsageUpdateFrequency !== "endOfDay") return false;
  return !isSameLocalDay(batch.quantityLastUpdatedAt, now);
}
