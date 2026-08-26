import { useState } from "react";
import { urgencyLevel, formatTimeRemaining, formatExpiryDateTime } from "../lib/expiry";
import { printBatchLabel } from "../printing/printBatchLabel";
import type { Batch } from "../lib/types";
import { describeError } from "../lib/describeError";
import { Spinner } from "./Spinner";

// סטטוס "expired" עדיין קיים בסכמה/בשרת (updateBatchStatus ממשיך לתמוך
// בו), אבל אין יותר כפתור ייעודי אליו כאן — "פג תוקף" מסומן דרך
// "הושלך" + סיבת הפחת "פג תוקף" (כבר ברשימה הסגורה), לא כפעולה נפרדת.
const URGENCY_BADGE_LABEL: Record<ReturnType<typeof urgencyLevel>, string> = {
  expired: "פג תוקף",
  urgent: "דחוף",
  soon: "בקרוב",
  ok: "תוקף תקין",
};

interface Props {
  batch: Batch;
  onMarkUsed: () => void;
  onMarkDiscarded: () => void;
  onUpdateQuantity: (quantity: number) => Promise<void>;
  busy: boolean;
  disabled?: boolean;
  needsQuantityUpdateReminder?: boolean;
}

export function BatchRow({
  batch,
  onMarkUsed,
  onMarkDiscarded,
  onUpdateQuantity,
  busy,
  disabled,
  needsQuantityUpdateReminder,
}: Props) {
  const urgency = urgencyLevel(batch.expiresAt);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState(false);
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [quantityInput, setQuantityInput] = useState(String(batch.quantity));
  const [quantityError, setQuantityError] = useState<string | null>(null);

  async function handlePrint() {
    setPrinting(true);
    setPrintError(false);
    const result = await printBatchLabel(batch);
    setPrintError(!result.ok);
    setPrinting(false);
  }

  function startEditingQuantity() {
    setQuantityInput(String(batch.quantity));
    setQuantityError(null);
    setEditingQuantity(true);
  }

  async function handleQuantitySubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(quantityInput);
    if (!(value >= 0)) {
      setQuantityError("כמות לא תקינה");
      return;
    }
    setQuantityError(null);
    try {
      await onUpdateQuantity(value);
      setEditingQuantity(false);
    } catch (err) {
      setQuantityError(
        describeError(err, {
          "invalid-argument": "הכמות גדולה מהכמות שהוכנה במקור, או שלילית",
          "failed-precondition": "האצווה כבר לא פעילה — רענן/י את הרשימה",
        }),
      );
    }
  }

  return (
    <li className={`batch-row urgency-${urgency}`}>
      <div className="batch-info">
        <span className="urgency-badge">{URGENCY_BADGE_LABEL[urgency]}</span>
        {needsQuantityUpdateReminder && !editingQuantity && (
          <span className="reminder-badge">יש לעדכן כמות היום</span>
        )}
        {!editingQuantity && (
          <button
            type="button"
            className={`batch-info-action${needsQuantityUpdateReminder ? " urgent-action" : ""}`}
            onClick={startEditingQuantity}
            disabled={disabled}
          >
            עדכון כמות
          </button>
        )}
        <strong>{batch.productNameSnapshot}</strong>
        <span>
          {formatExpiryDateTime(batch.expiresAt)} · {formatTimeRemaining(batch.expiresAt)}
        </span>
        {batch.printStatus === "failed" && !printing && (
          <span className="error-text">ההדפסה נכשלה</span>
        )}
      </div>

      {editingQuantity ? (
        <form onSubmit={handleQuantitySubmit} className="quantity-update-form">
          <label htmlFor={`quantity-${batch.id}`}>כמות נותרת ({batch.unit})</label>
          <input
            id={`quantity-${batch.id}`}
            type="number"
            min="0"
            step="any"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={busy || disabled}>
            {busy && <Spinner />} עדכון
          </button>
          <button type="button" onClick={() => setEditingQuantity(false)}>
            ביטול
          </button>
          {quantityError && <p className="error-text">{quantityError}</p>}
        </form>
      ) : (
        <div className="batch-actions">
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing || disabled}
            className={batch.printStatus === "failed" ? "urgent-action" : undefined}
          >
            {printing && <Spinner />}{" "}
            {printing
              ? "מדפיסה..."
              : batch.printStatus === "failed"
                ? "נסה שוב להדפיס"
                : "הדפסה חוזרת"}
          </button>
          <button type="button" onClick={onMarkUsed} disabled={busy || disabled}>
            {busy && <Spinner />} נוצל במלואו
          </button>
          <button type="button" onClick={onMarkDiscarded} disabled={busy || disabled}>
            הושלך
          </button>
        </div>
      )}
      {printError && <p className="error-text">ההדפסה נכשלה שוב — נסה/י שוב מאוחר יותר</p>}
    </li>
  );
}
