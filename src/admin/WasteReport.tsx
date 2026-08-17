import { useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { exportWasteReportPdf } from "./exportWasteReportPdf";
import { describeError } from "../lib/describeError";
import { formatCurrency } from "../lib/currency";
import { Spinner } from "../components/Spinner";

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
  preparedByStaffId: string | null;
  preparedByNameSnapshot: string | null;
  // עלות האצווה בפועל כפי שהוכנה (costPerUnitSnapshot * preparedQuantity),
  // לא "עלות הרצה אחת של המתכון" — ראו הערה ב-generateReport למטה.
  // null = אין נתון עלות (אין מתכון למוצר, או שהמתכון נשמר לפני הוספת
  // תפוקה/עלות-ליחידה).
  costSnapshot: number | null;
}

interface ProductBreakdown {
  productName: string;
  wasteCost: number;
  wasteBatchCount: number;
}

interface EmployeeReasonBreakdown {
  reason: string;
  wasteCost: number;
  wasteBatchCount: number;
}

interface EmployeeBreakdown {
  employeeName: string;
  wasteCost: number;
  wasteBatchCount: number;
  byReason: EmployeeReasonBreakdown[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toIsoDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toIsoDateInput(d);
}

// תקרה בטיחותית על מספר האצוות שהדוח מושך לזיכרון בבת אחת, למקרה של
// טווח תאריכים ענק (בטעות או בכוונה) — לא לתקרה "שקטה": אם נפגעה,
// truncated מסומן ל-true ומוצגת אזהרה מפורשת שהסכומים לא כוללים את כל
// הטווח (ראו JSX למטה), כדי שלא יוצג דוח כספי לא-שלם כאילו הוא מלא.
const REPORT_BATCH_LIMIT = 2000;

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
  const [truncated, setTruncated] = useState(false);

  async function generateReport() {
    setBusy(true);
    setError(null);
    setBatches(null);
    setTruncated(false);
    try {
      const businessId = getBusinessId();
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const batchesQuery = query(
        collection(db, "businesses", businessId, "batches"),
        where("preparedAtClient", ">=", Timestamp.fromDate(start)),
        where("preparedAtClient", "<=", Timestamp.fromDate(end)),
        orderBy("preparedAtClient", "desc"),
        limit(REPORT_BATCH_LIMIT),
      );
      const snap = await getDocs(batchesQuery);

      // שלב 1: לאסוף את כל שילובי מוצר/גרסת-מתכון הייחודיים בטווח.
      const uniqueVersions = new Map<string, { productId: string; recipeVersionId: string }>();
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const recipeVersionId = (data.recipeVersionId as string | null) ?? null;
        if (recipeVersionId) {
          uniqueVersions.set(`${data.productId}/${recipeVersionId}`, {
            productId: data.productId,
            recipeVersionId,
          });
        }
      }

      // שלב 2: לשלוף את כל עלויות-היחידה במקביל (Promise.all) במקום
      // ברצף אחד-אחד — נמדד בפועל מול Emulator: ~475ms ברצף מול ~270ms
      // במקביל על 15 שילובים ייחודיים, וההפרש רק גדל ככל שיש יותר
      // מוצרים/גרסאות מתכון בעסק.
      const costEntries = await Promise.all(
        [...uniqueVersions.entries()].map(async ([cacheKey, { productId, recipeVersionId }]) => {
          const versionSnap = await getDoc(
            doc(db, "businesses", businessId, "products", productId, "recipeVersions", recipeVersionId),
          );
          const costPerUnitSnapshot =
            (versionSnap.data()?.costPerUnitSnapshot as number | undefined) ?? null;
          return [cacheKey, costPerUnitSnapshot] as const;
        }),
      );
      const costPerUnitCache = new Map(costEntries);

      // שלב 3: להרכיב את שורות הדוח מתוך המטמון שכבר מולא. עלות אצווה
      // = עלות ליחידה (מהמתכון, קבועה) × הכמות שהוכנה בפועל באצווה
      // הזו (preparedQuantity, משתנה מאצווה לאצווה) — לא עלות "הרצה
      // אחת" של המתכון בלי קשר לכמות שהוזנה. ראו CLAUDE.md, סעיף
      // "תפוקת מתכון".
      const result: ReportBatch[] = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        const recipeVersionId = (data.recipeVersionId as string | null) ?? null;
        // fallback ל-quantity עצמו עבור אצוות ישנות שנוצרו לפני הוספת
        // השדה (יחס 1 = כל העלות מיוחסת לפחת, כמו ההתנהגות הקודמת).
        const preparedQuantity = (data.preparedQuantity as number | undefined) ?? data.quantity;
        const costPerUnitSnapshot = recipeVersionId
          ? (costPerUnitCache.get(`${data.productId}/${recipeVersionId}`) ?? null)
          : null;
        const costSnapshot =
          costPerUnitSnapshot !== null ? round2(costPerUnitSnapshot * preparedQuantity) : null;
        return {
          id: docSnap.id,
          productId: data.productId,
          productNameSnapshot: data.productNameSnapshot,
          unit: data.unit,
          quantity: data.quantity,
          preparedQuantity,
          status: data.status,
          discardReason: data.discardReason ?? null,
          recipeVersionId,
          preparedByStaffId: (data.preparedByStaffId as string | null | undefined) ?? null,
          preparedByNameSnapshot: (data.preparedByNameSnapshot as string | undefined) ?? null,
          costSnapshot,
        };
      });

      setBatches(result);
      setTruncated(snap.size === REPORT_BATCH_LIMIT);
    } catch (err) {
      setError(describeError(err));
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
          {busy && <Spinner />} {busy ? "מפיק דוח..." : "הפקת דוח"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {truncated && (
        <p className="warning-text">
          הטווח שנבחר מכיל יותר מ-{REPORT_BATCH_LIMIT} אצוות — הדוח מציג רק את
          {" "}
          {REPORT_BATCH_LIMIT} האצוות האחרונות בטווח, והסכומים למטה{" "}
          <strong>אינם משקפים את כל הטווח</strong>. יש לצמצם את טווח התאריכים
          לקבלת דוח מדויק.
        </p>
      )}

      {summary && batches && (
        <div>
          <p>
            סה"כ אצוות בטווח: {batches.length} · שווי כולל שיוצר:{" "}
            {formatCurrency(summary.totalCost)} · שווי פחת (פג תוקף + הושלך):{" "}
            <strong>{formatCurrency(summary.wasteCost)}</strong>{" "}
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
                  {formatCurrency(p.wasteCost)}
                </li>
              ))}
            </ul>
          )}

          <h3>פחת לפי עובד</h3>
          <p className="field-hint">
            מבוסס על מי שהכין את האצווה, לא על מי שסימן אותה כמושלכת/פגה — כלי
            לזיהוי צורך בהדרכה לפי מקור הפחת.
          </p>
          {summary.byEmployee.length === 0 ? (
            <p>אין פחת בטווח שנבחר</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>עובד/ת</th>
                    <th>סה"כ שווי פחת</th>
                    <th>מס' אצוות</th>
                    <th>פירוט לפי סיבה</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byEmployee.map((emp) => (
                    <tr key={emp.employeeName}>
                      <td>{emp.employeeName}</td>
                      <td>{formatCurrency(emp.wasteCost)}</td>
                      <td>{emp.wasteBatchCount}</td>
                      <td>
                        {emp.byReason
                          .map((r) => `${r.reason}: ${r.wasteBatchCount} (${formatCurrency(r.wasteCost)})`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
  const byEmployeeMap = new Map<
    string,
    { employeeName: string; wasteCost: number; wasteBatchCount: number; reasons: Map<string, EmployeeReasonBreakdown> }
  >();

  for (const b of batches) {
    if (b.costSnapshot === null) {
      batchesWithoutCost += 1;
      continue;
    }
    totalCost += b.costSnapshot;
    if (b.status === "discarded" || b.status === "expired") {
      // costSnapshot כאן הוא כבר עלות האצווה בפועל (עלות ליחידה × כמות
      // שהוכנה) — יש לייחס לפחת רק את החלק היחסי שבאמת הושלך/פג מתוך
      // מה שהוכן, לא את מלוא עלות האצווה (למשל שימוש חלקי: 7 מתוך 10
      // ק"ג נוצלו כרגיל, רק 3 ק"ג הושלכו — לפחת מיוחסים 30% מהעלות).
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

      const employeeKey = b.preparedByStaffId ?? b.preparedByNameSnapshot ?? "__unknown__";
      const employeeName = b.preparedByNameSnapshot ?? "לא ידוע (אצווה ישנה)";
      const reason = b.status === "expired" ? "פג תוקף (לא טופל בזמן)" : (b.discardReason ?? "לא צוין");

      let employee = byEmployeeMap.get(employeeKey);
      if (!employee) {
        employee = { employeeName, wasteCost: 0, wasteBatchCount: 0, reasons: new Map() };
        byEmployeeMap.set(employeeKey, employee);
      }
      employee.wasteCost += batchWasteCost;
      employee.wasteBatchCount += 1;
      const reasonEntry = employee.reasons.get(reason);
      if (reasonEntry) {
        reasonEntry.wasteCost += batchWasteCost;
        reasonEntry.wasteBatchCount += 1;
      } else {
        employee.reasons.set(reason, { reason, wasteCost: batchWasteCost, wasteBatchCount: 1 });
      }
    }
  }

  const byProduct = [...byProductMap.values()].sort((a, b) => b.wasteCost - a.wasteCost);
  const byEmployee: EmployeeBreakdown[] = [...byEmployeeMap.values()]
    .map((emp) => ({
      employeeName: emp.employeeName,
      wasteCost: emp.wasteCost,
      wasteBatchCount: emp.wasteBatchCount,
      byReason: [...emp.reasons.values()].sort((a, b) => b.wasteCost - a.wasteCost),
    }))
    .sort((a, b) => b.wasteCost - a.wasteCost);

  return { totalCost, wasteCost, batchesWithoutCost, byProduct, byEmployee };
}

export type { ReportBatch, ProductBreakdown, EmployeeBreakdown };
