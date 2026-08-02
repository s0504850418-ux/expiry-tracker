import { useState } from "react";
import { urgencyLevel, formatTimeRemaining } from "../lib/expiry";
import { printBatchLabel } from "../printing/printBatchLabel";
import type { Batch } from "../lib/types";

interface Props {
  batch: Batch;
  onMarkUsed: () => void;
  onMarkExpired: () => void;
  onMarkDiscarded: () => void;
  busy: boolean;
  disabled?: boolean;
}

export function BatchRow({
  batch,
  onMarkUsed,
  onMarkExpired,
  onMarkDiscarded,
  busy,
  disabled,
}: Props) {
  const urgency = urgencyLevel(batch.expiresAt);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    setPrintError(false);
    const result = await printBatchLabel(batch);
    setPrintError(!result.ok);
    setPrinting(false);
  }

  return (
    <li className={`batch-row urgency-${urgency}`}>
      <div className="batch-info">
        <strong>{batch.productNameSnapshot}</strong>
        <span>
          {batch.quantity} {batch.unit}
        </span>
        <span>{formatTimeRemaining(batch.expiresAt)}</span>
        {batch.printStatus === "failed" && !printing && (
          <span className="error-text">⚠️ ההדפסה נכשלה</span>
        )}
      </div>
      <div className="batch-actions">
        <button
          type="button"
          onClick={handlePrint}
          disabled={printing || disabled}
          className={batch.printStatus === "failed" ? "urgent-action" : undefined}
        >
          {printing
            ? "מדפיסה..."
            : batch.printStatus === "failed"
              ? "נסה שוב להדפיס"
              : "הדפסה חוזרת"}
        </button>
        <button type="button" onClick={onMarkUsed} disabled={busy || disabled}>
          נוצל
        </button>
        <button type="button" onClick={onMarkExpired} disabled={busy || disabled}>
          פג תוקף
        </button>
        <button type="button" onClick={onMarkDiscarded} disabled={busy || disabled}>
          הושלך
        </button>
      </div>
      {printError && <p className="error-text">ההדפסה נכשלה שוב — נסה/י שוב מאוחר יותר</p>}
    </li>
  );
}
