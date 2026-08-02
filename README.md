# מערכת ניהול תאריכי תפוגה למוצרים מוכנים במטבח

מעקב דיגיטלי אחר תאריכי תפוגה של מוצרים מוכנים במטבח מסעדה (כגון רטבים), במקום מדבקות ידניות. הדפסת מדבקה עם ברקוד/QR, התראות לפני פקיעה, מעקב פחת ועלויות, ודוחות לבעל/ת העסק.

מסמך האפיון המלא (מטרות, תפעול, ארכיטקטורה, החלטות מוצר) נמצא אצל בעל/ת הפרויקט ואינו חלק מהריפו הזה.

## מצב נוכחי

**שלב 2**: מודל נתונים ואבטחה. יש עכשיו Cloud Functions לאימות זהות (קוד מנהל / PIN מול bcrypt hash), custom claims, ו-Firestore Rules multi-tenant — כולם נבדקו בפועל מול Firebase Emulator (לא רק נכתבו, ראו "בדיקות" למטה). עדיין **אין** מסכי מוצר אמיתיים (מסך טאבלט, מסך ניהול), QR או מדפסת — אלה יגיעו בשלבים הבאים, כל אחד בענף ובקובץ Pull Request נפרד. ראו `DATA_MODEL.md` למבנה המלא, ו"מה עדיין חסר" בסוף המסמך.

## טכנולוגיות

- **React 19 + TypeScript**, בנוי עם **Vite**.
- **PWA** (Progressive Web App) דרך `vite-plugin-pwa` — נטען מהדפדפן, ניתן להתקנה למסך הבית בטאבלט, ללא חנות אפליקציות.
- **Firebase**: Hosting, **Firestore + Authentication + Cloud Functions** (`functions/`, TypeScript נפרד עם `package.json` משלו).

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

### אפליקציית ה-React

```bash
npx tsc -b --noEmit   # בדיקת טיפוסים
npm run lint          # לינטינג (oxlint)
npm run build         # בנייה מלאה + PWA (service worker, manifest)
```

### Cloud Functions (`functions/`)

```bash
cd functions
npm install
npm run typecheck     # tsc --noEmit
npm run lint          # oxlint
npm test              # vitest — בדיקות יחידה ל-lib/pin.ts (hash/verify/lockout)
npm run build         # מקמפל ל-lib/
```

### בדיקות מול Firebase Emulator (Rules + Cloud Functions בפועל, לא mock)

דורש Java (JRE 11+) מותקן — הריצו `java -version` לוודא. בפעם הראשונה ה-emulator מוריד קבצים (יכול לקחת כמה דקות).

```bash
# מהשורש, אחרי npm install ו-npm --prefix functions run build:
npm run test:rules       # firestore.rules מול Firestore Emulator — בידוד tenant, הרשאות owner/shiftManager, חסימת כתיבה ישירה
npm run test:functions   # verifyOwnerCode/verifyStaffPin/setOwnerCode/setStaffPin מול Auth+Firestore+Functions Emulator ביחד
```

כל הבדיקות למעלה **רצו בפועל** בסביבה הזו (לא רק "אמורות לעבוד") — ראו את תיאור ה-PR של שלב 2 לפירוט התוצאות. בניגוד לסביבת הפיתוח הקודמת (claude.ai) שבה `tests/rules.test.js` נכתב אך מעולם לא הורץ (Firestore Emulator לא עלה שם בגלל הגבלת רשת) — כאן הוא רץ ועבר.

## סביבות פיתוח וייצור

המערכת מיועדת לרוץ משני פרויקטי Firebase נפרדים — אחד לפיתוח/בדיקות ואחד לייצור — כדי ששינויים לא יגיעו ישירות למטבח האמיתי לפני שנבדקו.

- `.firebaserc` מגדיר שני aliases: `development` ו-`production`, כרגע עם ערכי placeholder (`REPLACE_WITH_DEV_PROJECT_ID` וכו').
- לכל סביבה קובץ `.env` נפרד (`.env.local` לפיתוח מקומי; ערכי הייצור יוזנו כ-Secrets ב-GitHub Actions בשלב הפריסה, לא בקובץ בריפו).
- מיתוג בין הסביבות מוצג בפועל במסך עצמו דרך `VITE_APP_ENV`, כדי שאי אפשר יהיה להתבלבל בין פיתוח לייצור.

## מבנה תיקיות

```
.github/workflows/ci.yml   בדיקות אוטומטיות בכל Pull Request (אפליקציה + functions + emulator)
DATA_MODEL.md              מבנה Firestore המלא — קרא לפני שינוי סכמה
firestore.rules            חוקי אבטחה — allow write: if false כמעט בכל מקום, בכוונה
firestore.indexes.json     אינדקסים (ריק כרגע)
src/
  firebase/config.ts       אתחול Firebase מתוך משתני סביבה בלבד
  App.tsx, main.tsx        נקודת הכניסה (עדיין placeholder)
  vite-env.d.ts            טיפוסים למשתני הסביבה
functions/                 Cloud Functions, TypeScript נפרד עם package.json משלו
  src/lib/pin.ts             hash/verify/lockout (bcrypt) — יחידה הכי רגישה, יש לה בדיקות ייעודיות
  src/lib/claims.ts          בניית uid דטרמיניסטי ל-owner/staff
  src/lib/authz.ts           requireOwner — בדיקת role מתוך custom claims
  src/lib/verifySecret.ts    ליבת האימות המשותפת (owner code + staff PIN)
  src/auth/*.ts               4 ה-callable functions: verifyOwnerCode, verifyStaffPin, setOwnerCode, setStaffPin
  scripts/bootstrapBusiness.ts  יצירת עסק ראשון + קוד מנהל (לא Cloud Function, סקריפט אדמין)
  test/pin.test.ts            בדיקות יחידה (vitest)
tests/
  rules.test.js              בדיקות firestore.rules מול Firestore Emulator
  functions.test.js          בדיקות אינטגרציה ל-Cloud Functions מול Auth+Firestore+Functions Emulator
.env.example                כל משתני הסביבה הנדרשים, עם placeholders
.firebaserc                  aliases לסביבת פיתוח/ייצור (placeholders)
firebase.json                 Hosting + Firestore rules + Functions + הגדרות emulators
```

## פריסה (Deployment) — לא בוצעה עדיין

הפריסה בפועל תלויה בפרויקט Firebase אמיתי שטרם נוצר. כשהוא ייווצר:

```bash
npm install -g firebase-tools   # פעם אחת, אם עוד אין
firebase login
firebase use development        # או production
npm run build
firebase deploy --only hosting,firestore:rules,functions
```

לפני הפריסה הראשונה יש להריץ פעם אחת את סקריפט ה-bootstrap כדי ליצור את העסק וקוד המנהל הראשוני:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
  npm --prefix functions run bootstrap -- --businessId=<id> --name="<שם המסעדה>" --ownerCode=<קוד>
```

## מה עדיין חסר להשלמה (פערים ידועים, לא באגים)

- **פרויקט Firebase אמיתי** — `.firebaserc` מכיל placeholders בלבד. יש ליצור פרויקט Firebase (מומלץ: אחד לפיתוח, אחד לייצור) ולעדכן את המזהים, ואז להריץ את סקריפט ה-bootstrap פעם אחת.
- **אייקוני PWA אמיתיים** (192×192, 512×512) — `vite.config.ts` מוכן לקבל אותם, השדה `icons` כרגע ריק.
- **גודל חבילת ה-JS** — כ-686KB לפני דחיסה. לא נדרש תיקון בשלב הזה.
- **איך טאבלט "משוייך" לעסק בפעם הראשונה (pairing)** — ה-Cloud Functions בשלב זה מקבלות `businessId` כפרמטר מפורש; זרימת ה-UI לשיוך התקן תיבנה בשלב 3 או 7. ראו "פתוח לשלב מאוחר יותר" ב-`DATA_MODEL.md`.
- **Cloud Functions עסקיות** (יצירת אצווה, שינוי סטטוס, ניהול מוצרים/מתכונים) — שלב 2 בנה רק את תשתית הזהות/ההרשאות; אלה יתווספו בהדרגה בשלבים 3-5.
- **Google login למסך ניהול** — מתוכנן לשלב 7; כרגע לבעל/ת העסק יש רק "קוד מנהל" (owner code) מבוסס PIN, לא כניסה עם Google.
- **`FUNCTIONS_DISCOVERY_TIMEOUT`** — `npm run test:functions` מגדיר אותו ל-30 שניות (ראו `package.json`) כי firebase-tools עושה בדיקת גרסה מול npm ברשת לפני גילוי הפונקציות, ולפעמים זה לוקח יותר מ-10 השניות המוגדרות כברירת מחדל. אם עדיין נכשל ב-timeout בסביבה איטית יותר — אפשר להעלות את הערך.
