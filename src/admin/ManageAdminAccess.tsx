import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { Spinner } from "../components/Spinner";

export function ManageAdminAccess() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const addAuthorizedOwnerEmail = httpsCallable(functions, "addAuthorizedOwnerEmail");
      await addAuthorizedOwnerEmail({ businessId: getBusinessId(), email });
      setMessage(`הכתובת ${email} הורשתה לגשת למסך הניהול`);
      setEmail("");
    } catch {
      setError("ההוספה נכשלה — ודא/י שהכתובת תקינה ונסה/י שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>ניהול גישה למסך הניהול</h2>
      <p>
        הוספת כתובת Gmail תאפשר לבעל/ת חשבון Google הזה להתחבר למסך הניהול
        (דוחות, יומן פעולות). אין רשימה גלויה של הכתובות הקיימות מטעמי אבטחה —
        אפשר רק להוסיף.
      </p>
      <form onSubmit={handleSubmit} className="login-form">
        <label htmlFor="admin-email">כתובת Gmail</label>
        <input
          id="admin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          {busy && <Spinner />} הוספת גישה
        </button>
      </form>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
