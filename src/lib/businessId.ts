// מזהה העסק שהמכשיר הזה משוייך אליו. אין עדיין UI לשיוך טאבלט לעסק
// (pairing) — לפיילוט מסעדה יחידה זה נקבע דרך משתנה סביבה. ראו
// "פתוח לשלב מאוחר יותר" ב-DATA_MODEL.md.
export function getBusinessId(): string {
  return import.meta.env.VITE_BUSINESS_ID;
}
