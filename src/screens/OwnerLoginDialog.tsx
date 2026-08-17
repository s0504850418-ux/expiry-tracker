import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken } from "firebase/auth";
import { auth, functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { describeError } from "../lib/describeError";
import { Spinner } from "../components/Spinner";

interface Props {
  onClose: () => void;
}

function errorMessage(err: unknown): string {
  return describeError(err, {
    "permission-denied": "קוד שגוי",
    "not-found": "עסק לא נמצא",
  });
}

/**
 * מסך כניסה נפרד לבעל/ת העסק — קוד מנהל בלבד, בלי שום התייחסות
 * לעובדים (ראו CLAUDE.md: שלושה מסכים נפרדים). נפתח כדיאלוג מתוך
 * TabletDashboard. בהצלחה, ה-claims מתעדכנים אוטומטית
 * (onIdTokenChanged) ו-TabletDashboard סוגר/ת את הדיאלוג בעצמו.
 */
export function OwnerLoginDialog({ onClose }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  const businessId = getBusinessId();

  async function handleSubmit(e: React.FormEvent) {
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

  return (
    <div className="dialog-backdrop" dir="rtl">
      <div className="dialog">
        <h2>כניסה כבעל/ת העסק</h2>

        {!online && (
          <p className="error-text">
            אין חיבור לאינטרנט — לא ניתן להתחבר כרגע. ההתחברות דורשת רשת.
          </p>
        )}

        <form onSubmit={handleSubmit} className="login-form">
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
        </form>

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
