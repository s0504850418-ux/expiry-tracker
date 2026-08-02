import { useState } from "react";
import type { Batch } from "../lib/types";
import { DISCARD_REASONS } from "../lib/discardReasons";

interface Props {
  batch: Batch;
  onClose: () => void;
  onConfirm: (reason: string, quantity: number) => Promise<void>;
}

export function DiscardReasonDialog({ batch, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState(String(batch.quantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("יש לבחור סיבת פחת");
      return;
    }
    const quantityNumber = Number(quantity);
    if (!(quantityNumber >= 0)) {
      setError("כמות לא תקינה");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason, quantityNumber);
    } catch {
      setError("הפעולה נכשלה — נסה/י שוב");
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" dir="rtl">
      <form onSubmit={handleSubmit} className="dialog">
        <h2>השלכת אצווה: {batch.productNameSnapshot}</h2>

        <label htmlFor="discard-quantity">כמות שהושלכה ({batch.unit})</label>
        <input
          id="discard-quantity"
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />

        <label htmlFor="discard-reason">סיבת פחת</label>
        <select
          id="discard-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        >
          <option value="">בחר/י סיבה...</option>
          {DISCARD_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" disabled={busy}>
            אישור
          </button>
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
