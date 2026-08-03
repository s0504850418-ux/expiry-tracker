import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Staff } from "./TeamManagement";

interface Props {
  staff: Staff | null; // null = עובד/ת חדש/ה
  newStaffId?: string; // מזהה מוכן מראש עבור עובד/ת חדש/ה
  onClose: () => void;
  onSaved: () => void;
}

export function StaffFormDialog({ staff, newStaffId, onClose, onSaved }: Props) {
  const [name, setName] = useState(staff?.name ?? "");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(staff?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("יש להזין שם");
      return;
    }
    if (!staff && pin.length < 4) {
      setError("יש להזין PIN בן 4 ספרות לפחות לעובד/ת חדש/ה");
      return;
    }
    if (pin.length > 0 && pin.length < 4) {
      setError("PIN חייב להיות לפחות 4 ספרות");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const setStaffPin = httpsCallable(functions, "setStaffPin");
      await setStaffPin({
        businessId: getBusinessId(),
        staffId: staff?.id ?? newStaffId,
        name: name.trim(),
        active,
        ...(pin.length > 0 ? { pin } : {}),
      });
      onSaved();
    } catch {
      setError("השמירה נכשלה — נסה/י שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" dir="rtl">
      <form onSubmit={handleSubmit} className="dialog">
        <h2>{staff ? "עריכת עובד/ת" : "עובד/ת משמרת חדש/ה"}</h2>

        <label htmlFor="staff-name">שם</label>
        <input
          id="staff-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label htmlFor="staff-pin">
          {staff ? "PIN חדש (ריק = השארת ה-PIN הקיים)" : "PIN (לפחות 4 ספרות)"}
        </label>
        <input
          id="staff-pin"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />

        {staff && (
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            {" "}פעיל/ה (יכול/ה להתחבר לטאבלט)
          </label>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" disabled={busy}>
            שמירה
          </button>
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
