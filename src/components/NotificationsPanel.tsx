import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Batch } from "../lib/types";

interface NotificationRow {
  id: string; // = batchId
  type: "batchExpiringSoon" | "batchExpired";
}

interface Props {
  batches: Batch[]; // האצוות הפעילות שכבר נטענו ב-TabletDashboard — לא טוענים שוב
  onFocusBatch: (batchId: string) => void;
}

const TYPE_LABEL: Record<NotificationRow["type"], string> = {
  batchExpiringSoon: "⏰ מתקרבת לתפוגה",
  batchExpired: "⚠️ פג תוקף",
};

/**
 * מציגה התראות pending (נוצרות ע"י checkExpiringBatches, ה-Scheduled
 * Function שרצה כל שעה). "טיפול" בהתראה = שינוי הסטטוס בפועל דרך
 * updateBatchStatus (שמסמן אותה acknowledged בשרת), לא כפתור "אישרתי"
 * נפרד — לכן הכפתור כאן רק ממקד את האצווה ברשימה הראשית, לא סוגר
 * את ההתראה בעצמו.
 */
export function NotificationsPanel({ batches, onFocusBatch }: Props) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  useEffect(() => {
    const businessId = getBusinessId();
    const notificationsQuery = query(
      collection(db, "businesses", businessId, "notifications"),
      where("status", "==", "pending"),
    );
    return onSnapshot(notificationsQuery, (snap) => {
      setNotifications(
        snap.docs.map((d) => ({
          id: d.id,
          type: d.data().type,
        })),
      );
    });
  }, []);

  const rows = notifications
    .map((n) => {
      const batch = batches.find((b) => b.id === n.id);
      return batch ? { ...n, batch } : null;
    })
    .filter((r): r is NotificationRow & { batch: Batch } => r !== null)
    .sort((a, b) => a.batch.expiresAt.getTime() - b.batch.expiresAt.getTime());

  if (rows.length === 0) return null;

  return (
    <div className="notifications-panel">
      <p>
        <strong>⚠️ {rows.length} אצוות דורשות תשומת לב</strong>
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <span>
              {TYPE_LABEL[row.type]} · {row.batch.productNameSnapshot}
            </span>
            <button type="button" onClick={() => onFocusBatch(row.id)}>
              טפל/י באצווה
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
