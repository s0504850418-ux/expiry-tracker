import { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { AuditLogViewer } from "./AuditLogViewer";
import { WasteReport } from "./WasteReport";
import { ManageAdminAccess } from "./ManageAdminAccess";
import { TeamManagement } from "./TeamManagement";
import { ProductsManagement } from "./ProductsManagement";
import { PendingPriceBanner } from "./PendingPriceBanner";
import { EnvBadge } from "../components/EnvBadge";

type Tab = "report" | "auditLog" | "access" | "team" | "products";

export function AdminDashboard() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("report");
  const [focusIngredients, setFocusIngredients] = useState(false);

  function goToIngredients() {
    setTab("products");
    setFocusIngredients(true);
  }

  return (
    <main dir="rtl" className="dashboard dashboard-admin">
      <header className="dashboard-header">
        <h1>מסך ניהול</h1>
        <div>
          <EnvBadge />
          <button type="button" onClick={() => signOut()}>
            יציאה
          </button>
        </div>
      </header>

      <PendingPriceBanner onGoToIngredients={goToIngredients} />

      <div className="dashboard-toolbar">
        <button
          type="button"
          onClick={() => setTab("report")}
          aria-pressed={tab === "report"}
        >
          דוח פחת ורווחיות
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("products");
            setFocusIngredients(false);
          }}
          aria-pressed={tab === "products"}
        >
          מוצרים ומתכונים
        </button>
        <button
          type="button"
          onClick={() => setTab("auditLog")}
          aria-pressed={tab === "auditLog"}
        >
          יומן פעולות
        </button>
        <button
          type="button"
          onClick={() => setTab("access")}
          aria-pressed={tab === "access"}
        >
          ניהול גישה
        </button>
        <button
          type="button"
          onClick={() => setTab("team")}
          aria-pressed={tab === "team"}
        >
          ניהול צוות
        </button>
      </div>

      {tab === "report" && <WasteReport onGoToIngredients={goToIngredients} />}
      {tab === "products" && <ProductsManagement focusIngredients={focusIngredients} />}
      {tab === "auditLog" && <AuditLogViewer />}
      {tab === "access" && <ManageAdminAccess />}
      {tab === "team" && <TeamManagement />}
    </main>
  );
}
