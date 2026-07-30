import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/useAuth";
import { LoginScreen } from "./screens/LoginScreen";
import { TabletDashboard } from "./screens/TabletDashboard";

function AppContent() {
  const { claims, loading } = useAuth();

  if (loading) {
    return (
      <main dir="rtl" style={{ padding: "2rem" }}>
        <p>טוען...</p>
      </main>
    );
  }

  return claims ? <TabletDashboard /> : <LoginScreen />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
