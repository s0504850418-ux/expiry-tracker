import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Staff } from "./TeamManagement";
import { describeError } from "../lib/describeError";
import { Spinner } from "../components/Spinner";

interface Props {
  staff: Staff | null; // null = עובד/ת חדש/ה
  newStaffId?: string; // מזהה מוכן מראש עבור עובד/ת חדש/ה
  onClose: () => void;
  onSaved: () => void;
}

export function StaffFormDialog({ staff, newStaffId, onClose, onSaved }: Props) {
  const [name, setName] = useState(staff?.name ?? "");
  const [isShiftManager, setIsShiftManager] = useState(staff?.isShiftManager ?? false);
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(staff?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // PIN חדש חובה כשאין PIN קודם לשמור — עובד/ת חדש/ה, או קידום עובד/ת
  // רגיל/ה קיימ/ת שהייתה isShiftManager===false. עריכת מנהל/ת משמרת
  // שכבר יש לו/ה PIN — הזנה ריקה משאירה את הקיים (כמו היום).
  const pinRequired = isShiftManager && (!staff || !staff.isShiftManager);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("יש להזין שם");
      return;
    }
    if (pinRequired && pin.length < 4) {
      setError("יש להזין PIN בן 4 ספרות לפחות למנהל/ת משמרת");
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
        isShiftManager,
        ...(pin.length > 0 ? { pin } : {}),
      });
      onSaved();
    } catch (err) {
      setError(describeError(err));
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

        <label>
          <input
            type="checkbox"
            checked={isShiftManager}
            onChange={(e) => setIsShiftManager(e.target.checked)}
          />
          {" "}גם מנהל/ת משמרת (דורש PIN)
        </label>

        {isShiftManager && (
          <>
            <label htmlFor="staff-pin">
              {staff?.isShiftManager
                ? "PIN חדש (ריק = השארת ה-PIN הקיים)"
                : "PIN (לפחות 4 ספרות)"}
            </label>
            <input
              id="staff-pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </>
        )}

        {staff && (
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            {" "}פעיל/ה (מוצג/ת ברשימות עובדים)
          </label>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" disabled={busy}>
            {busy && <Spinner />} שמירה
          </button>
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
