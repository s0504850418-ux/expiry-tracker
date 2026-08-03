import { useState } from "react";
import { collection, doc, getDoc, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { exportWasteReportPdf } from "./exportWasteReportPdf";

type BatchStatus = "active" | "used" | "expired" | "discarded" | "archived";

interface ReportBatch {
  id: string;
  productId: string;
  productNameSnapshot: string;
  unit: string;
  quantity: number;
  preparedQuantity: number;
  status: BatchStatus;
  discardReason: string | null;
  recipeVersionId: string | null;
  costSnapshot: number | null; // null = אין נתון עלות (אין מתכון למוצר באותו זמן)
}

interface ProductBreakdown {
  productName: string;
  wasteCost: number;
  wasteBatchCount: number;
}

function toIsoDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toIsoDateInput(d);
}

/**
 * דוח פחת ורווחיות (owner-only). מצטרף ל-recipeVersions כדי לחשב
 * עלות — batches עצמן *לא* שומרות עלות (ראו הערה ב-createBatch.ts:
 * זה נתון כספי, ו-batches ניתן לקריאה גם למנהל/ת משמרת, אז העלות לא
 * יכולה לשבת שם). מבוסס על preparedAtClient בטווח הנבחר — "מה נוצר
 * בתקופה הזו ומה קרה לו", לא "מה שונה סטטוס בתקופה הזו".
 */
export function WasteReport() {
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(toIsoDateInput(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<ReportBatch[] | null>(null);

  async function generateReport() {
    setBusy(true);
    setError(null);
    setBatches(null);
    try {
      const businessId = getBusinessId();
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const batchesQuery = query(
        collection(db, "businesses", businessId, "batches"),
        where("preparedAtClient", ">=", Timestamp.fromDate(start)),
        where("preparedAtClient", "<=", Timestamp.fromDate(end)),
      );
      const snap = await getDocs(batchesQuery);

      const costCache = new Map<string, number | null>();
      const result: ReportBatch[] = [];

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const recipeVersionId = (data.recipeVersionId as string | null) ?? null;
        let costSnapshot: number | null = null;

        if (recipeVersionId) {
          const cacheKey = `${data.productId}/${recipeVersionId}`;
          if (costCache.has(cacheKey)) {
            costSnapshot = costCache.get(cacheKey)!;
          } else {
            const versionSnap = await getDoc(
              doc(
                db,
                "businesses",
                businessId,
                "products",
                data.productId,
                "recipeVersions",
                recipeVersionId,
              ),
            );
            costSnapshot = (versionSnap.data()?.totalCostSnapshot as number) ?? null;
            costCache.set(cacheKey, costSnapshot);
          }
        }

        result.push({
          id: docSnap.id,
          productId: data.productId,
          productNameSnapshot: data.productNameSnapshot,
          unit: data.unit,
          quantity: data.quantity,
          // fallback ל-quantity עצמו עבור אצוות ישנות שנוצרו לפני הוספת
          // השדה (יחס 1 = כל העלות מיוחסת לפחת, כמו ההתנהגות הקודמת).
          preparedQuantity: (data.preparedQuantity as number | undefined) ?? data.quantity,
          status: data.status,
          discardReason: data.discardReason ?? null,
          recipeVersionId,
          costSnapshot,
        });
      }

      setBatches(result);
    } catch {
      setError("הפקת הדוח נכשלה — נסה/י שוב");
    } finally {
      setBusy(false);
    }
  }

  const summary = batches && summarize(batches);

  return (
    <div>
      <h2>דוח פחת ורווחיות</h2>

      <div className="dashboard-toolbar">
        <label htmlFor="report-start">מתאריך</label>
        <input
          id="report-start"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <label htmlFor="report-end">עד תאריך</label>
        <input
          id="report-end"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <button type="button" onClick={generateReport} disabled={busy}>
          {busy ? "מפיק דוח..." : "הפקת דוח"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {summary && batches && (
        <div>
          <p>
            סה"כ אצוות בטווח: {batches.length} · שווי כולל שיוצר:{" "}
            {summary.totalCost.toFixed(2)} · שווי פחת (פג תוקף + הושלך):{" "}
            <strong>{summary.wasteCost.toFixed(2)}</strong>{" "}
            {summary.totalCost > 0 &&
              `(${((summary.wasteCost / summary.totalCost) * 100).toFixed(1)}% מהשווי הכולל)`}
          </p>
          {summary.batchesWithoutCost > 0 && (
            <p>
              {summary.batchesWithoutCost} אצוות בטווח בלי נתון עלות (למוצר לא
              היה מתכון בזמן היצירה) — לא נכללות בסכומי השווי.
            </p>
          )}

          <h3>פחת לפי מוצר</h3>
          {summary.byProduct.length === 0 ? (
            <p>אין פחת בטווח שנבחר</p>
          ) : (
            <ul>
              {summary.byProduct.map((p) => (
                <li key={p.productName}>
                  {p.productName}: {p.wasteBatchCount} אצוות, שווי{" "}
                  {p.wasteCost.toFixed(2)}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() =>
              exportWasteReportPdf({ startDate, endDate, batches, summary })
            }
          >
            ייצוא ל-PDF
          </button>
        </div>
      )}
    </div>
  );
}

function summarize(batches: ReportBatch[]) {
  let totalCost = 0;
  let wasteCost = 0;
  let batchesWithoutCost = 0;
  const byProductMap = new Map<string, ProductBreakdown>();

  for (const b of batches) {
    if (b.costSnapshot === null) {
      batchesWithoutCost += 1;
      continue;
    }
    totalCost += b.costSnapshot;
    if (b.status === "discarded" || b.status === "expired") {
      // costSnapshot הוא עלות ההכנה המלאה של המתכון, לא תלוי בכמות —
      // יש לייחס לפחת רק את החלק היחסי שבאמת הושלך/פג מתוך מה שהוכן,
      // לא את מלוא עלות האצווה (למשל שימוש חלקי: 7 מתוך 10 ק"ג נוצלו
      // כרגיל, רק 3 ק"ג הושלכו — לפחת מיוחסים 30% מהעלות, לא 100%).
      const wasteRatio = b.preparedQuantity > 0 ? b.quantity / b.preparedQuantity : 1;
      const batchWasteCost = b.costSnapshot * wasteRatio;
      wasteCost += batchWasteCost;
      const existing = byProductMap.get(b.productNameSnapshot);
      if (existing) {
        existing.wasteCost += batchWasteCost;
        existing.wasteBatchCount += 1;
      } else {
        byProductMap.set(b.productNameSnapshot, {
          productName: b.productNameSnapshot,
          wasteCost: batchWasteCost,
          wasteBatchCount: 1,
        });
      }
    }
  }

  const byProduct = [...byProductMap.values()].sort((a, b) => b.wasteCost - a.wasteCost);

  return { totalCost, wasteCost, batchesWithoutCost, byProduct };
}

export type { ReportBatch, ProductBreakdown };
