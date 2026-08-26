import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";

interface AuditLogRow {
  id: string;
  action: string;
  performedByRole: string;
  performedByStaffId: string | null;
  targetType: string;
  targetId: string;
  createdAt: Date;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ROLE_LABEL: Record<string, string> = {
  owner: "בעל/ת העסק",
  shiftManager: "מנהל/ת משמרת",
  system: "מערכת",
};

export function AuditLogViewer() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);

  useEffect(() => {
    const businessId = getBusinessId();
    const auditQuery = query(
      collection(db, "businesses", businessId, "auditLog"),
      orderBy("createdAt", "desc"),
      limit(200),
    );
    return onSnapshot(auditQuery, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            action: data.action,
            performedByRole: data.performedByRole,
            performedByStaffId: data.performedByStaffId ?? null,
            targetType: data.targetType,
            targetId: data.targetId,
            createdAt:
              data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(0),
          };
        }),
      );
    });
  }, []);

  return (
    <div>
      <h2>יומן פעולות (200 אחרונות)</h2>
      {rows.length === 0 ? (
        <p>אין עדיין רשומות ביומן</p>
      ) : (
        <div className="table-scroll">
          <table className="audit-table">
            <thead>
              <tr>
                <th>זמן</th>
                <th>פעולה</th>
                <th>בוצע ע"י</th>
                <th>יעד</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.action}</td>
                  <td>{ROLE_LABEL[row.performedByRole] ?? row.performedByRole}</td>
                  <td>
                    {row.targetType}/{row.targetId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
