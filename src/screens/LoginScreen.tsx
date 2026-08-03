import { useState } from "react";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { signInWithCustomToken } from "firebase/auth";
import { auth, functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { Spinner } from "../components/Spinner";

type Mode = "chooseRole" | "ownerCode" | "staffPicker" | "staffPin";

interface StaffOption {
  staffId: string;
  name: string;
}

function errorMessage(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  switch (code) {
    case "functions/permission-denied":
      return "קוד שגוי";
    case "functions/resource-exhausted":
      return "יותר מדי ניסיונות כושלים — נסה/י שוב בעוד כמה דקות";
    case "functions/not-found":
      return "עסק/עובד לא נמצא";
    default:
      return "שגיאה בהתחברות — נסה/י שוב";
  }
}

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("chooseRole");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  const businessId = getBusinessId();

  async function handleOwnerSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const verifyOwnerCode = httpsCallable<
        { businessId: string; code: string },
        { token: string }
      >(functions, "verifyOwnerCode");
      const { data } = await verifyOwnerCode({ businessId, code });
      await signInWithCustomToken(auth, data.token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openStaffPicker() {
    setBusy(true);
    setError(null);
    try {
      const listActiveStaffNames = httpsCallable<
        { businessId: string },
        { staff: StaffOption[] }
      >(functions, "listActiveStaffNames");
      const { data } = await listActiveStaffNames({ businessId });
      setStaff(data.staff);
      setMode("staffPicker");
    } catch {
      setError("לא ניתן לטעון את רשימת העובדים — נסה/י שוב");
    } finally {
      setBusy(false);
    }
  }

  async function handleStaffPinSubmit(e: React.FormEvent) {
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
    <main dir="rtl" className="login-screen">
      <h1>מערכת ניהול תאריכי תפוגה</h1>

      {!online && (
        <p className="error-text">
          אין חיבור לאינטרנט — לא ניתן להתחבר כרגע. ההתחברות דורשת רשת.
        </p>
      )}

      {mode === "chooseRole" && (
        <div className="button-stack">
          <button type="button" onClick={() => setMode("ownerCode")}>
            בעל/ת העסק
          </button>
          <button type="button" onClick={openStaffPicker} disabled={busy || !online}>
            {busy && <Spinner />} מנהל/ת משמרת
          </button>
        </div>
      )}

      {mode === "ownerCode" && (
        <form onSubmit={handleOwnerSubmit} className="login-form">
          <label htmlFor="owner-code">קוד מנהל</label>
          <input
            id="owner-code"
            type="password"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={busy || !online || code.length === 0}>
            {busy && <Spinner />} כניסה
          </button>
          <button type="button" onClick={() => setMode("chooseRole")}>
            חזרה
          </button>
        </form>
      )}

      {mode === "staffPicker" && (
        <div className="button-stack">
          {staff.length === 0 && <p>אין עובדי משמרת פעילים רשומים</p>}
          {staff.map((s) => (
            <button
              key={s.staffId}
              type="button"
              onClick={() => {
                setSelectedStaff(s);
                setPin("");
                setError(null);
                setMode("staffPin");
              }}
            >
              {s.name}
            </button>
          ))}
          <button type="button" onClick={() => setMode("chooseRole")}>
            חזרה
          </button>
        </div>
      )}

      {mode === "staffPin" && selectedStaff && (
        <form onSubmit={handleStaffPinSubmit} className="login-form">
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
          <button type="button" onClick={() => setMode("staffPicker")}>
            חזרה
          </button>
        </form>
      )}

      {error && <p className="error-text">{error}</p>}
    </main>
  );
}
