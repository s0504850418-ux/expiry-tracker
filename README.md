# מערכת ניהול תאריכי תפוגה למוצרים מוכנים במטבח

מעקב דיגיטלי אחר תאריכי תפוגה של מוצרים מוכנים במטבח מסעדה (כגון רטבים), במקום מדבקות ידניות. הדפסת מדבקה עם QR, מעקב פחת ועלויות, ודוחות רווחיות לבעל/ת העסק. פיילוט במסעדה אחת.

מסמך האפיון המלא (מטרות, תפעול, ארכיטקטורה, החלטות מוצר) נמצא אצל בעל/ת הפרויקט ואינו חלק מהריפו הזה — `CLAUDE.md` מתעד את ההחלטות הנעולות החשובות, ו-`DATA_MODEL.md` את מבנה ה-Firestore המלא.

## מצב נוכחי

**שלבים 1–7 בנויים ונבדקו בפועל** (כל אחד בענף/PR נפרד, מוערמים זה על זה, אף אחד עדיין לא מוזג ל-`main`):

1. הקמת פרויקט — React+TS+PWA, CI, סביבות dev/prod.
2. מודל נתונים ואבטחה — multi-tenant, PIN/קוד מנהל, Firestore Rules.
3. מסך הטאבלט — רשימת אצוות לפי FEFO, חיפוש, יצירת אצווה, סימון סטטוס.
4. מוצרים/מרכיבים/מתכונים ועלויות — owner-only.
5. QR והדפסה — Printer Adapter, טיפול בכשל הדפסה, הדפסה חוזרת, סריקת QR.
6. עבודה אופליין — Firestore persistence, מניעת שליחה כפולה, טרנזקציות.
7. מסך ניהול (`/admin`) — כניסה עם Google, דוח פחת ורווחיות, יומן פעולות, ייצוא PDF.

**שלב 8 (בדיקות מקיפות + הכנה לפריסה) — בתהליך.**

**מה עדיין אין**: פרויקט Firebase אמיתי (dev/prod — ראו ".firebaserc" למטה), טאבלט אנדרואיד אמיתי, מדפסת מדבקות תרמית (הדגם עדיין לא נבחר — ראו `src/printing/WebBluetoothPrinterAdapter.ts`).

## טכנולוגיות

- **React 19 + TypeScript**, בנוי עם **Vite**.
- **PWA** (Progressive Web App) דרך `vite-plugin-pwa` — נטען מהדפדפן, ניתן להתקנה למסך הבית בטאבלט, ללא חנות אפליקציות.
- **Firebase**: Hosting, **Firestore + Authentication + Cloud Functions** (`functions/`, TypeScript נפרד עם `package.json` משלו).
- **QR**: `qrcode` (יצירה), `jsqr` (סריקה מהמצלמה).

## דרישות מוקדמות

- Node.js גרסה 20 ומעלה.
- Java (JRE 11+) — רק אם רוצים להריץ את בדיקות ה-Emulator (`test:rules`/`test:functions`), לא נדרש להרצה רגילה.
- חשבון Firebase — לא נדרש להרצה מול Emulator, נדרש רק לפריסה אמיתית.

## התקנה והרצה מקומית

```bash
npm install
npm --prefix functions install
cp .env.example .env.local
# ערוך את .env.local ומלא ערכים אמיתיים מ-Firebase Console (או ראה "הרצה מול Emulator" למטה)
npm run dev
```

הפרויקט ירוץ בכתובת שתוצג בטרמינל (בדרך כלל http://localhost:5173). מסך הטאבלט בנתיב הראשי, מסך הניהול ב-`/admin`.

> **הערה:** ללא `.env.local` תקין, האפליקציה תזרוק שגיאה ברורה בזמן טעינה ("משתנה סביבה חסר: ..."), במקום להיכשל בשקט. זו התנהגות מכוונת.

## הרצה מלאה מול Firebase Emulator (בלי פרויקט Firebase אמיתי)

שימושי לפיתוח/בדיקה ידנית בלי לחכות לפרויקט Firebase אמיתי:

```bash
# טרמינל 1:
FUNCTIONS_DISCOVERY_TIMEOUT=30 npx firebase emulators:start --only auth,firestore,functions --project demo-expiry-tracker

# טרמינל 2 — יצירת עסק דמו + מוצרים (חד-פעמי אחרי כל אתחול של ה-emulator):
cd functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-expiry-tracker \
  npx tsx scripts/bootstrapBusiness.ts --businessId=demoBiz --name="מסעדת דמו" --ownerCode=123456 --ownerEmail=you@example.com
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-expiry-tracker \
  npx tsx scripts/seedSampleProducts.ts --businessId=demoBiz

# טרמינל 3 — האפליקציה עצמה, עם .env.local שמכיל:
#   VITE_USE_EMULATORS=true
#   VITE_BUSINESS_ID=demoBiz
npm run dev
```

כניסה כבעל/ת עסק: קוד `123456` (בטאבלט) או Google עם `you@example.com` (ב-`/admin`, אחרי שנרשם ב-`--ownerEmail`).

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
npm test              # vitest — בדיקות יחידה (pin, batchTiming, recipeCost)
npm run build         # מקמפל ל-lib/
```

### בדיקות מול Firebase Emulator (Rules + Cloud Functions בפועל, לא mock)

דורש Java (JRE 11+) מותקן — הריצו `java -version` לוודא. בפעם הראשונה ה-emulator מוריד קבצים (יכול לקחת כמה דקות).

```bash
# מהשורש, אחרי npm install ו-npm --prefix functions run build:
npm run test:rules       # firestore.rules מול Firestore Emulator — בידוד tenant, הרשאות owner/shiftManager, חסימת כתיבה ישירה
npm run test:functions   # כל ה-Cloud Functions מול Auth+Firestore+Functions Emulator ביחד
```

כל הבדיקות למעלה **רצות בפועל** בכל שלב (לא רק "אמורות לעבוד") — ראו את תיאורי ה-PR של כל שלב לפירוט התוצאות המדויקות שהתקבלו. נכון לשלב 7: **vitest 18/18, `test:rules` 7/7, `test:functions` 17/17**.

## סביבות פיתוח וייצור

המערכת מיועדת לרוץ משני פרויקטי Firebase נפרדים — אחד לפיתוח/בדיקות ואחד לייצור — כדי ששינויים לא יגיעו ישירות למטבח האמיתי לפני שנבדקו.

- `.firebaserc` מגדיר שני aliases: `development` ו-`production`, כרגע עם ערכי placeholder (`REPLACE_WITH_DEV_PROJECT_ID` וכו').
- לכל סביבה קובץ `.env` נפרד (`.env.local` לפיתוח מקומי; ערכי הייצור יוזנו כ-Secrets ב-GitHub Actions בשלב הפריסה, לא בקובץ בריפו).
- מיתוג בין הסביבות מוצג בפועל במסך עצמו דרך `VITE_APP_ENV`, כדי שאי אפשר יהיה להתבלבל בין פיתוח לייצור.

## מבנה תיקיות

```
.github/workflows/ci.yml   בדיקות אוטומטיות בכל PR (אפליקציה + functions + emulator, 3 jobs)
CLAUDE.md                  הקשר לפרויקט + החלטות נעולות — קרא לפני שינויים
DATA_MODEL.md              מבנה Firestore המלא — קרא לפני שינוי סכמה
firestore.rules            חוקי אבטחה — allow write: if false כמעט בכל מקום, בכוונה
firestore.indexes.json     אינדקס מורכב יחיד (batches: status+expiresAt, ל-FEFO)

src/
  App.tsx                  routing: / (טאבלט) מול /admin (ניהול), בלי ספריית ניתוב
  firebase/config.ts        אתחול Firebase + Firestore persistentLocalCache (עבודה אופליין)
  auth/                      AuthContext/useAuth — משותף לטאבלט ולמסך הניהול
  screens/                   LoginScreen, TabletDashboard
  admin/                     AdminApp, AdminLoginScreen (Google), AdminDashboard, WasteReport,
                              AuditLogViewer, ManageAdminAccess, TeamManagement, StaffFormDialog,
                              ProductsManagement (מוצרים/מרכיבים/מתכונים, עבר לכאן מהטאבלט),
                              exportWasteReportPdf
  components/                CreateBatchDialog, BatchRow, DiscardReasonDialog, NotificationsPanel,
                              ProductFormDialog, IngredientFormDialog, RecipeEditorDialog
  printing/                   PrinterAdapter, BrowserPrintAdapter (עובד היום),
                              WebBluetoothPrinterAdapter (שלד, ממתין לדגם מדפסת)
  scanning/                   QrScannerDialog (jsQR + מצלמה)
  lib/                        types, expiry, businessId, discardReasons, qr, useOnlineStatus

functions/                 Cloud Functions, TypeScript נפרד עם package.json משלו
  src/lib/                   pin.ts (hash/verify/lockout), claims.ts, authz.ts, verifySecret.ts,
                              audit.ts, batchTiming.ts, recipeCost.ts, discardReasons.ts,
                              notificationTiming.ts
  src/auth/                  verifyOwnerCode, verifyStaffPin, setOwnerCode, setStaffPin,
                              claimOwnerAccessViaGoogle, addAuthorizedOwnerEmail
  src/staff/                 listActiveStaffNames
  src/batches/               createBatch, updateBatchStatus, updateBatchPrintStatus
  src/products/               createProduct, updateProduct
  src/ingredients/            createIngredient, updateIngredientPrice
  src/recipes/                 createRecipeVersion
  src/notifications/           checkExpiringBatches (Scheduled Function, כל שעה)
  src/testSupport.ts          חשיפת עזרי בדיקה (Firestore instance) לבדיקות אינטגרציה בלבד
  scripts/                    bootstrapBusiness.ts, seedSampleProducts.ts (סקריפטי אדמין, לא Cloud Functions)
  test/                       בדיקות יחידה (vitest)

tests/
  rules.test.js              בדיקות firestore.rules מול Firestore Emulator
  functions.test.js          בדיקות אינטגרציה לכל ה-Cloud Functions מול Auth+Firestore+Functions Emulator

.env.example                כל משתני הסביבה הנדרשים, עם placeholders
.firebaserc                  aliases לסביבת פיתוח/ייצור (placeholders)
firebase.json                 Hosting + Firestore rules/indexes + Functions + הגדרות emulators
```

## פריסה (Deployment) — לא בוצעה עדיין, תלויה בפרויקט Firebase אמיתי

```bash
npm install -g firebase-tools   # פעם אחת, אם עוד אין
firebase login
firebase use development        # או production, אחרי עדכון .firebaserc עם מזהי הפרויקטים האמיתיים
npm install && npm --prefix functions install
npm run build
firebase deploy --only hosting,firestore:rules,firestore:indexes,functions
```

לפני הפריסה הראשונה (ופעם אחת בלבד לכל עסק) יש להריץ את סקריפט ה-bootstrap כדי ליצור את העסק, קוד המנהל הראשוני, ואופציונלית גישת Google למסך הניהול:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
  npm --prefix functions run bootstrap -- --businessId=<id> --name="<שם המסעדה>" --ownerCode=<קוד> --ownerEmail=<gmail אופציונלי>
```

`.env.local`/Secrets של הסביבה האמיתית (production) צריכים להצביע על אותו `businessId`, ולהכיל `VITE_USE_EMULATORS=false` (או להיעדר).

## מה עדיין חסר להשלמה (פערים ידועים, לא באגים)

- **פרויקט Firebase אמיתי** — `.firebaserc` מכיל placeholders בלבד. יש ליצור פרויקט Firebase (מומלץ: אחד לפיתוח, אחד לייצור), לעדכן את המזהים, להפעיל Authentication (כולל ספק Google), ואז להריץ את סקריפט ה-bootstrap.
- **טאבלט אנדרואיד ומדפסת מדבקות תרמית** — טרם נרכשו. `WebBluetoothPrinterAdapter` הוא שלד שנכשל בכוונה עד שייבחר דגם; `BrowserPrintAdapter` (דיאלוג הדפסה של הדפדפן) הוא ברירת המחדל הפעילה בינתיים ועובד על כל מדפסת/PDF רגילים.
- **אייקוני PWA אמיתיים** (192×192, 512×512) — `vite.config.ts` מוכן לקבל אותם, השדה `icons` כרגע ריק.
- **גודל חבילת ה-JS** — כ-1MB לפני דחיסה (~310KB gzip). לא נדרש תיקון בשלב הזה; code splitting אפשרי בעתיד אם יתברר כצוואר בקבוק בפועל על טאבלט חלש.
- **דיוק כספי בדוח הפחת** (`src/admin/WasteReport.tsx`) — העלות מחושבת כ"עלות ריצת מתכון אחת" (`totalCostSnapshot`), לא מנורמלת לפי הכמות שהוזנה בפועל באצווה, כי אין שדה "כמות תפוקה" (yield) במודל המתכון. שווה החלטת מוצר מפורשת לפני שסומכים על המספרים בייצור.
- **אין תור כתיבה אופליין** — פעולות כתיבה (יצירת אצווה, שינוי סטטוס) חסומות בבירור כשאין חיבור, לא נצברות אוטומטית לשליחה כשהחיבור חוזר. קריאה כן עובדת אופליין (Firestore persistence). ראו PR של שלב 6 לדיון המלא.
- **אין `removeAuthorizedOwnerEmail`** — אפשר רק להוסיף גישת Google למסך הניהול, לא להסיר.
- **`FUNCTIONS_DISCOVERY_TIMEOUT`** — `npm run test:functions` מגדיר אותו ל-30 שניות (ראו `package.json`) כי firebase-tools עושה בדיקת גרסה מול npm ברשת לפני גילוי הפונקציות, ולפעמים זה לוקח יותר מ-10 השניות המוגדרות כברירת מחדל. אם עדיין נכשל ב-timeout בסביבה איטית יותר — אפשר להעלות את הערך.
