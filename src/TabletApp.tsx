import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/useAuth";
import { TabletDashboard } from "./screens/TabletDashboard";
import { Spinner } from "./components/Spinner";

function AppContent() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <main dir="rtl" className="login-screen">
        <p>
          <Spinner /> טוען...
        </p>
      </main>
    );
  }

  // אין יותר שער כניסה: claims מונפקים אוטומטית (worker, ראו
  // AuthContext.tsx) ברגע שאין session — הדשבורד תמיד מוצג. כניסה
  // כמנהל/ת משמרת/בעל/ת העסק נעשית מתוכו (ראו TabletDashboard.tsx).
  return <TabletDashboard />;
}

// קובץ נפרד (לא בתוך App.tsx) כדי ש-React.lazy יוכל לטעון אותו כ-chunk
// נפרד מ-AdminApp — ראו App.tsx.
export function TabletApp() {
  return (
    <AuthProvider enableWorkerFallback>
      <AppContent />
    </AuthProvider>
  );
}
