import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { StaffFormDialog } from "./StaffFormDialog";
import { describeError } from "../lib/describeError";
import { Spinner } from "../components/Spinner";

export interface Staff {
  id: string;
  name: string;
  active: boolean;
}

/**
 * ניהול עובדי משמרת (owner-only): הוספת עובד/ת חדש/ה עם PIN, עדכון
 * שם/PIN, והשבתת עובד/ת שעזב/ה. בלי המסך הזה אין דרך להוסיף עובד/ת
 * חדש/ה למערכת בכלל — setStaffPin קיימת כ-Cloud Function מאז שלב 2
 * אבל לא הייתה מחוברת לשום מסך.
 */
export function TeamManagement() {
  const businessId = getBusinessId();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [editingStaff, setEditingStaff] = useState<Staff | "new" | null>(null);
  const [busyStaffId, setBusyStaffId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(collection(db, "businesses", businessId, "staff"), (snap) => {
      setStaff(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          active: d.data().active,
        })),
      );
    });
  }, [businessId]);

  async function toggleActive(member: Staff) {
    setBusyStaffId(member.id);
    setError(null);
    try {
      const setStaffPin = httpsCallable(functions, "setStaffPin");
      await setStaffPin({
        businessId,
        staffId: member.id,
        name: member.name,
        active: !member.active,
      });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyStaffId(null);
    }
  }

  const newStaffId =
    editingStaff === "new" ? doc(collection(db, "businesses", businessId, "staff")).id : undefined;

  return (
    <div>
      <h2>ניהול צוות</h2>
      <button type="button" onClick={() => setEditingStaff("new")}>
        עובד/ת חדש/ה
      </button>

      {error && <p className="error-text">{error}</p>}

      {staff.length === 0 ? (
        <p>אין עדיין עובדי משמרת רשומים</p>
      ) : (
        <ul className="batch-list">
          {staff.map((member) => (
            <li key={member.id} className="batch-row">
              <div className="batch-info">
                <strong>{member.name}</strong>
                <span>{member.active ? "פעיל/ה" : "לא פעיל/ה"}</span>
              </div>
              <div className="batch-actions">
                <button type="button" onClick={() => setEditingStaff(member)}>
                  עריכה
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(member)}
                  disabled={busyStaffId === member.id}
                >
                  {busyStaffId === member.id && <Spinner />}{" "}
                  {member.active ? "השבתה" : "הפעלה"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingStaff && (
        <StaffFormDialog
          staff={editingStaff === "new" ? null : editingStaff}
          newStaffId={newStaffId}
          onClose={() => setEditingStaff(null)}
          onSaved={() => setEditingStaff(null)}
        />
      )}
    </div>
  );
}
