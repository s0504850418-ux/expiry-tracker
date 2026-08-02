import { urgencyLevel, formatTimeRemaining } from "../lib/expiry";
import type { Batch } from "../lib/types";

interface Props {
  batch: Batch;
  onMarkUsed: () => void;
  onMarkExpired: () => void;
  onMarkDiscarded: () => void;
  busy: boolean;
}

export function BatchRow({ batch, onMarkUsed, onMarkExpired, onMarkDiscarded, busy }: Props) {
  const urgency = urgencyLevel(batch.expiresAt);

  return (
    <li className={`batch-row urgency-${urgency}`}>
      <div className="batch-info">
        <strong>{batch.productNameSnapshot}</strong>
        <span>{formatTimeRemaining(batch.expiresAt)}</span>
      </div>
      <div className="batch-actions">
        <button type="button" onClick={onMarkUsed} disabled={busy}>
          נוצל
        </button>
        <button type="button" onClick={onMarkExpired} disabled={busy}>
          פג תוקף
        </button>
        <button type="button" onClick={onMarkDiscarded} disabled={busy}>
          הושלך
        </button>
      </div>
    </li>
  );
}
