import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken } from "firebase/auth";
import { auth, functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { describeError } from "../lib/describeError";
import { Spinner } from "../components/Spinner";

interface StaffOption {
  staffId: string;
  name: string;
}

interface Props {
  onClose: () => void;
  onSwitchToOwnerLogin: () => void;
}

function errorMessage(err: unknown): string {
  return describeError(err, {
    "permission-denied": "קוד שגוי",
    "not-found": "עסק/עובד לא נמצא",
  });
}

/**
 * מסך כניסה נפרד למנהל/ת משמרת — רשימת עובדים (רק מי שמסומן/ת
 * isShiftManager, ראו listActiveStaffNames({ onlyShiftManagers: true }))
 * ואז PIN, בלי שום שלב "בחירת תפקיד" מקדים (ראו CLAUDE.md: שלושה
 * מסכים נפרדים). נפתח כדיאלוג מתוך TabletDashboard.
 */
export function StaffLoginDialog({ onClose, onSwitchToOwnerLogin }: Props) {
  const [mode, setMode] = useState<"picker" | "pin">("picker");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  const businessId = getBusinessId();

  useEffect(() => {
    let cancelled = false;
    async function loadStaff() {
      setLoadingStaff(true);
      try {
        const listActiveStaffNames = httpsCallable<
          { businessId: string; onlyShiftManagers: boolean },
          { staff: StaffOption[] }
        >(functions, "listActiveStaffNames");
        const { data } = await listActiveStaffNames({
          businessId,
          onlyShiftManagers: true,
        });
        if (!cancelled) setStaff(data.staff);
      } catch {
        if (!cancelled) setError("לא ניתן לטעון את רשימת העובדים — נסה/י שוב");
      } finally {
        if (!cancelled) setLoadingStaff(false);
      }
    }
    loadStaff();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStaff) return;
    setBusy(true);
    setError(null);
    try {
      const verifyStaffPin = httpsCallable<
        { businessId: string; staffId: string; pin: string },
        { token: string }
      >(functions, "verifyStaffPin");
      const { data } = await verifyStaffPin({
        businessId,
        staffId: selectedStaff.staffId,
        pin,
      });
      await signInWithCustomToken(auth, data.token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" dir="rtl">
      <div className="dialog">
        <h2>כניסה כמנהל/ת משמרת</h2>

        {!online && (
          <p className="error-text">
            אין חיבור לאינטרנט — לא ניתן להתחבר כרגע. ההתחברות דורשת רשת.
          </p>
        )}

        {mode === "picker" && (
          <div className="button-stack">
            {loadingStaff && (
              <p>
                <Spinner /> טוען רשימת עובדים...
              </p>
            )}
            {!loadingStaff && staff.length === 0 && (
              <>
                <p className="warning-text">
                  אין עדיין עובדי משמרת רשומים במערכת. הוספת עובד/ת דורשת קוד
                  מנהל של בעל/ת העסק.
                </p>
                <button type="button" onClick={onSwitchToOwnerLogin}>
                  מעבר להתחברות כבעל/ת העסק (להוספת עובד/ת)
                </button>
              </>
            )}
            {staff.map((s) => (
              <button
                key={s.staffId}
                type="button"
                onClick={() => {
                  setSelectedStaff(s);
                  setPin("");
                  setError(null);
                  setMode("pin");
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {mode === "pin" && selectedStaff && (
          <form onSubmit={handlePinSubmit} className="login-form">
            <label htmlFor="staff-pin">PIN של {selectedStaff.name}</label>
            <input
              id="staff-pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={busy || !online || pin.length === 0}>
              {busy && <Spinner />} כניסה
            </button>
            <button type="button" onClick={() => setMode("picker")}>
              חזרה
            </button>
          </form>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
