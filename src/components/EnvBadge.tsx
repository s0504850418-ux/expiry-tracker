/**
 * מוצג רק בסביבת פיתוח — כדי שאי אפשר יהיה להתבלבל בין דפדוף בנתוני
 * פיתוח/בדיקה לבין המערכת האמיתית מול לקוחות (VITE_APP_ENV, ראו README).
 */
export function EnvBadge() {
  if (import.meta.env.VITE_APP_ENV === "production") return null;
  return <span className="env-badge">סביבת פיתוח</span>;
}
