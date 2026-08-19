import type { EmployeeBreakdown, ReportBatch } from "./WasteReport";
import { formatCurrency } from "../lib/currency";

const PRINT_ROOT_ID = "print-label-root";

interface Summary {
  totalCost: number;
  wasteCost: number;
  batchesWithoutCostByReason: { noRecipe: number; unpricedIngredient: number };
  productsAwaitingPrice: string[];
  byProduct: { productName: string; wasteCost: number; wasteBatchCount: number }[];
  byEmployee: EmployeeBreakdown[];
}

interface Params {
  startDate: string;
  endDate: string;
  batches: ReportBatch[];
  summary: Summary;
}

const STATUS_LABEL: Record<string, string> = {
  active: "פעילה",
  used: "נוצלה",
  expired: "פגה",
  discarded: "הושלכה",
  archived: "בארכיון",
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * "ייצוא ל-PDF" בפועל = דיאלוג ההדפסה של הדפדפן (destination: Save as
 * PDF) — לא jsPDF. jsPDF (וספריות PDF client-side דומות) לא תומכות
 * בעברית בלי הטמעת גופן משלהן (הפונטים המובנים הם Latin-only, טקסט
 * עברי היה יוצא ריק/מרובע). הדפדפן עצמו כן יודע לצייר עברית כמו שצריך
 * — לכן זה פתרון אמיתי ועובד היום, לא פשרה זמנית. אותה תשתית
 * #print-label-root כמו הדפסת מדבקות (src/printing/BrowserPrintAdapter.ts).
 */
export function exportWasteReportPdf({ startDate, endDate, batches, summary }: Params): void {
  const root = document.getElementById(PRINT_ROOT_ID);
  if (!root) return;

  const container = el("div");
  container.className = "printed-report";

  container.appendChild(el("h1", "דוח פחת ורווחיות"));
  container.appendChild(el("p", `טווח: ${startDate} עד ${endDate}`));
  container.appendChild(
    el(
      "p",
      `שווי כולל: ${formatCurrency(summary.totalCost)} · שווי פחת: ${formatCurrency(summary.wasteCost)}` +
        (summary.totalCost > 0
          ? ` (${((summary.wasteCost / summary.totalCost) * 100).toFixed(1)}%)`
          : ""),
    ),
  );
  if (summary.batchesWithoutCostByReason.noRecipe > 0) {
    container.appendChild(
      el(
        "p",
        `${summary.batchesWithoutCostByReason.noRecipe} אצוות בטווח בלי מתכון בזמן ההכנה — לא נכללות בסכומים.`,
      ),
    );
  }
  if (summary.productsAwaitingPrice.length > 0) {
    container.appendChild(
      el(
        "p",
        `מוצרים עם מרכיב הממתין למחיר (לא נכללים בחישוב): ${summary.productsAwaitingPrice.join(", ")}`,
      ),
    );
  }

  const productHeading = el("h2", "פחת לפי מוצר");
  container.appendChild(productHeading);
  if (summary.byProduct.length === 0) {
    container.appendChild(el("p", "אין פחת בטווח שנבחר"));
  } else {
    const table = el("table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", "מוצר"));
    headRow.appendChild(el("th", "מס' אצוות"));
    headRow.appendChild(el("th", "שווי פחת"));
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el("tbody");
    for (const p of summary.byProduct) {
      const row = el("tr");
      row.appendChild(el("td", p.productName));
      row.appendChild(el("td", String(p.wasteBatchCount)));
      row.appendChild(el("td", formatCurrency(p.wasteCost)));
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }

  const employeeHeading = el("h2", "פחת לפי עובד");
  container.appendChild(employeeHeading);
  if (summary.byEmployee.length === 0) {
    container.appendChild(el("p", "אין פחת בטווח שנבחר"));
  } else {
    const table = el("table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", "עובד/ת"));
    headRow.appendChild(el("th", "מס' אצוות"));
    headRow.appendChild(el("th", "שווי פחת"));
    headRow.appendChild(el("th", "פירוט לפי סיבה"));
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el("tbody");
    for (const emp of summary.byEmployee) {
      const row = el("tr");
      row.appendChild(el("td", emp.employeeName));
      row.appendChild(el("td", String(emp.wasteBatchCount)));
      row.appendChild(el("td", formatCurrency(emp.wasteCost)));
      row.appendChild(
        el(
          "td",
          emp.byReason
            .map((r) => `${r.reason}: ${r.wasteBatchCount} (${formatCurrency(r.wasteCost)})`)
            .join(" · "),
        ),
      );
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }

  container.appendChild(el("h2", "כל האצוות בטווח"));
  const fullTable = el("table");
  const fullThead = el("thead");
  const fullHeadRow = el("tr");
  ["מוצר", "כמות", "סטטוס", "סיבת פחת", "עלות"].forEach((h) =>
    fullHeadRow.appendChild(el("th", h)),
  );
  fullThead.appendChild(fullHeadRow);
  fullTable.appendChild(fullThead);
  const fullTbody = el("tbody");
  for (const b of batches) {
    const row = el("tr");
    row.appendChild(el("td", b.productNameSnapshot));
    row.appendChild(el("td", `${b.quantity} ${b.unit}`));
    row.appendChild(el("td", STATUS_LABEL[b.status] ?? b.status));
    row.appendChild(el("td", b.discardReason ?? ""));
    row.appendChild(el("td", formatCurrency(b.costSnapshot)));
    fullTbody.appendChild(row);
  }
  fullTable.appendChild(fullTbody);
  container.appendChild(fullTable);

  root.replaceChildren(container);
  window.print();
}
