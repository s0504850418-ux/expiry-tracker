import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/useAuth";
import { LoginScreen } from "./screens/LoginScreen";
import { TabletDashboard } from "./screens/TabletDashboard";
import { AdminApp } from "./admin/AdminApp";
import { Spinner } from "./components/Spinner";

function AppContent() {
  const { claims, loading } = useAuth();

  if (loading) {
    return (
      <main dir="rtl" className="login-screen">
        <p>
          <Spinner /> טוען...
        </p>
      </main>
    );
  }

  return claims ? <TabletDashboard /> : <LoginScreen />;
}

function TabletApp() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

/**
 * שני נתיבי כניסה נפרדים לגמרי (לא רק מסכים שונים בתוך אותה זרימה):
 * הטאבלט (ברירת המחדל) ומסך הניהול (/admin, שלב 7) — עם AuthProvider
 * נפרד לכל אחד כי הם sessions נפרדים מטבעם (התחברות קוד/PIN מול
 * Google), לעיתים אפילו על מכשירים שונים.
 */
function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  return isAdmin ? <AdminApp /> : <TabletApp />;
}

export default App;
