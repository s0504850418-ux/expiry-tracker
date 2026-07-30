# מערכת ניהול תאריכי תפוגה למוצרים מוכנים במטבח

מעקב דיגיטלי אחר תאריכי תפוגה של מוצרים מוכנים במטבח מסעדה (כגון רטבים), במקום מדבקות ידניות. הדפסת מדבקה עם ברקוד/QR, התראות לפני פקיעה, מעקב פחת ועלויות, ודוחות לבעל/ת העסק.

מסמך האפיון המלא (מטרות, תפעול, ארכיטקטורה, החלטות מוצר) נמצא אצל בעל/ת הפרויקט ואינו חלק מהריפו הזה.

## מצב נוכחי

זהו **שלב 1 בלבד**: הקמת הפרויקט. עדיין **אין** כאן מסכי מוצר אמיתיים (מסך טאבלט, מסך ניהול), חיבור בפועל ל-Firestore, PIN, QR או מדפסת. אלה יגיעו בשלבים הבאים, כל אחד בענף ובקובץ Pull Request נפרד. ראו "מה עדיין חסר" בסוף המסמך.

## טכנולוגיות

- **React 19 + TypeScript**, בנוי עם **Vite**.
- **PWA** (Progressive Web App) דרך `vite-plugin-pwa` — נטען מהדפדפן, ניתן להתקנה למסך הבית בטאבלט, ללא חנות אפליקציות.
- **Firebase**: Hosting (בשלב זה), Firestore + Authentication + Cloud Functions (יתווספו בשלב 2).

## דרישות מוקדמות

- Node.js גרסה 20 ומעלה.
- חשבון Firebase (לא נדרש עדיין לשלב 1 — נדרש רק כשמריצים מול Firebase אמיתי).

## התקנה והרצה מקומית

```bash
npm install
cp .env.example .env.local
# ערוך את .env.local ומלא ערכים אמיתיים מ-Firebase Console
npm run dev
```

הפרויקט ירוץ בכתובת שתוצג בטרמינל (בדרך כלל http://localhost:5173).

> **הערה:** ללא `.env.local` תקין, האפליקציה תזרוק שגיאה ברורה בזמן טעינה ("משתנה סביבה חסר: ..."), במקום להיכשל בשקט. זו התנהגות מכוונת.

## בדיקות ותקינות (בדיוק מה שרץ ב-CI)

```bash
npx tsc -b --noEmit   # בדיקת טיפוסים
npm run lint          # לינטינג (oxlint)
npm run build         # בנייה מלאה + PWA (service worker, manifest)
```

שלושתן נבדקו בפועל ועברו בהצלחה לפני שהשלב הזה נמסר.

## סביבות פיתוח וייצור

המערכת מיועדת לרוץ משני פרויקטי Firebase נפרדים — אחד לפיתוח/בדיקות ואחד לייצור — כדי ששינויים לא יגיעו ישירות למטבח האמיתי לפני שנבדקו.

- `.firebaserc` מגדיר שני aliases: `development` ו-`production`, כרגע עם ערכי placeholder (`REPLACE_WITH_DEV_PROJECT_ID` וכו').
- לכל סביבה קובץ `.env` נפרד (`.env.local` לפיתוח מקומי; ערכי הייצור יוזנו כ-Secrets ב-GitHub Actions בשלב הפריסה, לא בקובץ בריפו).
- מיתוג בין הסביבות מוצג בפועל במסך עצמו דרך `VITE_APP_ENV`, כדי שאי אפשר יהיה להתבלבל בין פיתוח לייצור.

## מבנה תיקיות

```
.github/workflows/ci.yml   בדיקות אוטומטיות בכל Pull Request
src/
  firebase/config.ts       אתחול Firebase מתוך משתני סביבה בלבד
  App.tsx, main.tsx        נקודת הכניסה (עדיין placeholder בשלב 1)
  vite-env.d.ts            טיפוסים למשתני הסביבה
.env.example                כל משתני הסביבה הנדרשים, עם placeholders
.firebaserc                  aliases לסביבת פיתוח/ייצור (placeholders)
firebase.json                 תצורת Firebase Hosting
```

## פריסה (Deployment) — לא בוצעה עדיין

הפריסה בפועל תלויה בפרויקט Firebase אמיתי שטרם נוצר. כשהוא ייווצר:

```bash
npm install -g firebase-tools   # פעם אחת, אם עוד אין
firebase login
firebase use development        # או production
npm run build
firebase deploy --only hosting
```

## מה עדיין חסר להשלמה (פערים ידועים, לא באגים)

- **פרויקט Firebase אמיתי** — `.firebaserc` מכיל placeholders בלבד. יש ליצור פרויקט Firebase (מומלץ: אחד לפיתוח, אחד לייצור) ולעדכן את המזהים.
- **אייקוני PWA אמיתיים** (192×192, 512×512) — `vite.config.ts` מוכן לקבל אותם, השדה `icons` כרגע ריק.
- **גודל חבילת ה-JS** — כ-686KB לפני דחיסה, בעיקר בגלל טעינת כל ה-Firebase SDK יחד. ברגע שנוספים מסכים בפועל (שלבים הבאים), כדאי לפצל טעינה (code splitting) כדי שהטעינה הראשונית בטאבלט תהיה מהירה. לא נדרש תיקון בשלב הזה.
- **Firestore, Authentication, Cloud Functions** — עדיין לא מחוברים בפועל. יגיעו בשלב 2 (feature/auth-and-permissions), יחד עם firestore.rules וחוקי האבטחה.
