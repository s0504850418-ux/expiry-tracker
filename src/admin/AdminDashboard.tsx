import { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { AuditLogViewer } from "./AuditLogViewer";
import { WasteReport } from "./WasteReport";
import { ManageAdminAccess } from "./ManageAdminAccess";

type Tab = "report" | "auditLog" | "access";

export function AdminDashboard() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("report");

  return (
    <main dir="rtl" className="dashboard">
      <header className="dashboard-header">
        <h1>מסך ניהול</h1>
        <button type="button" onClick={() => signOut()}>
          יציאה
        </button>
      </header>

      <div className="dashboard-toolbar">
        <button type="button" onClick={() => setTab("report")}>
          דוח פחת ורווחיות
        </button>
        <button type="button" onClick={() => setTab("auditLog")}>
          יומן פעולות
        </button>
        <button type="button" onClick={() => setTab("access")}>
          ניהול גישה
        </button>
      </div>

      {tab === "report" && <WasteReport />}
      {tab === "auditLog" && <AuditLogViewer />}
      {tab === "access" && <ManageAdminAccess />}
    </main>
  );
}
