// מריץ פעם אחת (npm run setup:demo): מקים עסק דמו מלא בתוך ה-Firestore
// Emulator ומייצא את הנתונים לתיקיית emulator-data/, כדי ש-npm run
// start:all יוכל לטעון אותם בכל הפעלה הבאה בלי לזרוע מחדש.
//
// אם emulator-data/ כבר קיימת (למשל הסקריפט רץ בעבר, ויש בו כבר נתונים
// אמיתיים מהשימוש באפליקציה) — טוענים אותה קודם (--import) כדי לא
// למחוק בטעות נתונים קיימים; seedDemo.ts עצמו אידמפוטנטי, אז הרצה
// חוזרת רק מוודאת שעסק הדמו קיים, לא יוצרת כפילויות.
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const hasExistingData = existsSync("emulator-data/firebase-export-metadata.json");

console.log(
  hasExistingData
    ? "נמצאו נתוני אמולטור קיימים בתיקיית emulator-data — טוען אותם ומוודא שעסק הדמו קיים עליהם (בלי למחוק נתונים קיימים)."
    : "לא נמצאו נתוני אמולטור קודמים — יוצר עסק דמו חדש מאפס.",
);

const importFlag = hasExistingData ? "--import=emulator-data" : "";

try {
  execSync(
    `npx firebase emulators:exec --only firestore --project demo-expiry-tracker ${importFlag} --export-on-exit=emulator-data "npm --prefix functions run seed:demo"`,
    { stdio: "inherit" },
  );
} catch {
  console.error(
    "\nההקמה נכשלה — גללו למעלה בפלט לפרטי השגיאה המדויקים (ראו SETUP.md, \"מה לעשות אם משהו לא עובד\").",
  );
  process.exit(1);
}

console.log("\nהקמת עסק הדמו הושלמה בהצלחה. אפשר עכשיו להריץ: npm run start:all");
