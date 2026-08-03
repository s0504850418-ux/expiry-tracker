import { AuthProvider } from "../auth/AuthContext";
import { useAuth } from "../auth/useAuth";
import { AdminLoginScreen } from "./AdminLoginScreen";
import { AdminDashboard } from "./AdminDashboard";

function AdminAppContent() {
  const { claims, loading, signOut } = useAuth();

  if (loading) {
    return (
      <main dir="rtl" style={{ padding: "2rem" }}>
        <p>טוען...</p>
      </main>
    );
  }

  if (!claims) {
    return <AdminLoginScreen />;
  }

  // הזרימה דרך Google (claimOwnerAccessViaGoogle) לעולם לא מנפיקה
  // role אחר מ-owner, אבל אם מישהו הגיע למסך הזה עם session ישן/אחר
  // (למשל התחברות קודמת מהטאבלט על אותו דפדפן) — לא להציג נתונים
  // כספיים למי שאינו owner.
  if (claims.role !== "owner") {
    return (
      <main dir="rtl" style={{ padding: "2rem" }}>
        <p className="error-text">מסך הניהול מיועד לבעל/ת העסק בלבד.</p>
        <button type="button" onClick={() => signOut()}>
          יציאה
        </button>
      </main>
    );
  }

  return <AdminDashboard />;
}

export function AdminApp() {
  return (
    <AuthProvider>
      <AdminAppContent />
    </AuthProvider>
  );
}
