import { lazy, Suspense } from "react";
import { Spinner } from "./components/Spinner";

// כל נתיב נטען כ-chunk נפרד (React.lazy/import דינמי) כדי שכל צד יוריד
// רק את הקוד שהוא בפועל צריך — לפני התיקון הזה כל הביקורים (טאבלט
// ו-/admin כאחד) הורידו חבילת JS אחת של 1.03MB (317KB gzip) שכללה גם
// את כל מסכי הניהול (מוצרים/מתכונים/דוח פחת/צוות) עבור מכשיר הטאבלט,
// ולהפך.
const TabletApp = lazy(() =>
  import("./TabletApp").then((m) => ({ default: m.TabletApp })),
);
const AdminApp = lazy(() =>
  import("./admin/AdminApp").then((m) => ({ default: m.AdminApp })),
);

function RouteLoadingFallback() {
  return (
    <main dir="rtl" className="login-screen">
      <p>
        <Spinner /> טוען...
      </p>
    </main>
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
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {isAdmin ? <AdminApp /> : <TabletApp />}
    </Suspense>
  );
}

export default App;
