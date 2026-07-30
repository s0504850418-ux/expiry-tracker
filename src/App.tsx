/**
 * שלב 1 (הקמת הפרויקט): עדיין אין כאן מסכי מוצר אמיתיים — אלה יגיעו
 * בשלבים 3 ואילך. המטרה כאן היא רק לוודא שהשלד עצמו עובד מקצה לקצה:
 * React + TypeScript נטען, ה-PWA מזוהה, וחיבור ה-Firebase מוגדר נכון
 * (בלי לגעת בפועל בשרת, כדי לא לדרוש פרויקט Firebase אמיתי כבר עכשיו).
 */

function App() {
  const env = import.meta.env.VITE_APP_ENV ?? "לא הוגדר";

  return (
    <main dir="rtl" style={{ fontFamily: "Arial, sans-serif", padding: "2rem" }}>
      <h1>מערכת ניהול תאריכי תפוגה</h1>
      <p>שלד הפרויקט פועל. סביבה נוכחית: <strong>{env}</strong></p>
      <p>מסכי המטבח והניהול ייבנו בשלבים הבאים לפי תוכנית הפיתוח.</p>
    </main>
  );
}

export default App;
