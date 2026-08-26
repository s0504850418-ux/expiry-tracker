type ErrorWithCode = { code?: string };

function normalizeCode(err: unknown): string | undefined {
  const code = (err as ErrorWithCode | undefined)?.code;
  if (!code) return undefined;
  // Cloud Functions errors מגיעים כ-"functions/invalid-argument" וכו',
  // שגיאות Firestore ישירות (למשל בדוח הפחת) מגיעות בלי הקידומת —
  // מנרמלים לאותה צורה כדי שאפשר יהיה להשתמש באותה מפה לשניהם.
  return code.startsWith("functions/") ? code.slice("functions/".length) : code;
}

/**
 * הודעת שגיאה לפי קוד השגיאה *בפועל* שחזר מהשרת — לא ניחוש. לדוגמה:
 * לפני התיקון הזה, טופס מוצר הציג "ייתכן ששם המוצר כבר קיים" על כל
 * כשל, כולל ניתוק מוחלט מהשרת (Emulator/רשת כבויים) — מטעה, כי אז
 * שם המוצר כלל לא נבדק.
 *
 * `overrides` מאפשר ניסוח ספציפי-להקשר לקוד מסוים (למשל "already-exists"
 * בטופס מוצר לעומת טופס אחר). קודים ש-internal/unavailable/
 * deadline-exceeded/ללא קוד בכלל מקובצים יחד בכוונה: אלה לא ניתנים
 * להבחנה זה מזה ברמת ה-SDK של Firebase עצמו — גם ניתוק רשת/Emulator
 * כבוי וגם שגיאה לא צפויה בשרת חוזרים כאותו קוד ("internal"), ולכן
 * ההודעה כאן משקפת את חוסר הידיעה הזה בכנות במקום להעמיד פנים
 * שידוע בדיוק מה קרה.
 */
export function describeError(
  err: unknown,
  overrides: Partial<Record<string, string>> = {},
): string {
  const code = normalizeCode(err);
  if (code && overrides[code]) return overrides[code]!;
  switch (code) {
    case "permission-denied":
      return "אין הרשאה לבצע פעולה זו";
    case "unauthenticated":
      return "ההתחברות פגה — יש להתחבר מחדש";
    case "not-found":
      return "הפריט המבוקש לא נמצא";
    case "already-exists":
      return "הערך כבר קיים";
    case "invalid-argument":
      return "הנתונים שהוזנו לא תקינים";
    case "failed-precondition":
      return "הפעולה לא אפשרית במצב הנוכחי של הפריט";
    case "resource-exhausted":
      return "יותר מדי ניסיונות כושלים — נסה/י שוב בעוד כמה דקות";
    default:
      return "אין חיבור לשרת, או שגיאה לא צפויה בצד השרת — בדוק/י חיבור לאינטרנט ונסה/י שוב";
  }
}
