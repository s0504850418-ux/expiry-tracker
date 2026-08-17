# תוכנית מימוש — סבב תיקונים + שינוי מודל הרשאות (שלב 15+16)

> **סטטוס: תכנון בלבד, טרם מומש שום דבר.** קובץ זה נכתב בשיחת תכנון נפרדת (ללא מימוש בפועל, לפי בקשה מפורשת) כדי שאפשר יהיה להתחיל שיחה חדשה לגמרי ולהמשיך ישר לביצוע בלי לחזור על הניתוח. קרא את כל הקובץ לפני שמתחילים — הוא כולל את כל ההחלטות שכבר אושרו מול בעל הפרויקט (כולל שאלות הבהרה שנשאלו ונענו בשיחת התכנון).
>
> **מבנה העבודה:** שתי חטיבות, לפי בקשת בעל הפרויקט. **לסיים את חטיבה א' במלואה (כולל אימות בדפדפן) לפני שמתחילים בחטיבה ב'.** בסיום כל חטיבה: להריץ רגרסיה מלאה, לדווח מה נבנה/אילו קבצים/איך בודקים/אילו בדיקות רצו בפועל/מה פתוח — בדיוק לפי המוסכמה הקיימת ב-CLAUDE.md.
>
> **הערה על תשתית בדיקות קיימת בריפו** (חשוב להבין לפני שמתחילים לממש): אין שום תשתית לבדיקות יחידה/קומפוננטה של React בפרויקט הזה (לא Jest, לא Testing Library). כל הבדיקות האוטומטיות הקיימות הן משני סוגים בלבד: (1) `tests/functions.test.js` — בדיקות אינטגרציה אמיתיות של Cloud Functions מול Auth+Firestore+Functions Emulator, דרך `node:test`; (2) `tests/rules.test.js` — בדיקות Firestore Rules מול Firestore Emulator, גם דרך `node:test`. כל שינוי שהוא **רק React/UI** (כמעט כל חטיבה א') לא ניתן לבדיקה אוטומטית בריפו הזה — האימות היחיד הוא **דפדפן אמיתי (Playwright, headless, מול Emulator אמיתי + `npm run dev`)**, בדיוק כמו שנעשה בכל שלב קודם (ראו CLAUDE.md שלבים 10, 12, 13, 14). אל תמציא/תציע להוסיף Jest/RTL בלי לשאול קודם — זה שינוי תשתית שלא התבקש.

---

## ממצאים מרכזיים לפני שמתחילים (קרא קודם — משפיעים על התוכנית)

1. **הבאג בעורך המתכון הוא nested `<form>`, אומת מהקוד (לא ניחוש) — ראו סעיף א.1 למטה.**
2. **חטיבה ב' ("שינוי מודל הרשאות") כבר ממומשת בפועל בכ-90% מהיקפה בקוד הקיים.** ה-Rules (`firestore.rules`) וה-Cloud Functions (`createProduct`, `createIngredient`, `createRecipeVersion`, `getRecipeVersionForEdit`, `listIngredients`) כבר מגבילים בדיוק לפי שלוש הרמות שתוארו — כולל חסימת שדה מחיר לגמרי ממנהל/ת משמרת (לא רק הסתרה ב-UI). זה קרה בהדרגה בשלבים 9–14 בלי שהוסבר במפורש כ"שינוי החלטה נעולה". **אבל:** הבולט הרלוונטי ב-CLAUDE.md תחת "החלטות מוצר נעולות" עדיין אומר במפורש ההפך — "מנהל משמרת לא יכול להוסיף מוצר/מרכיב חדש, לשנות מחיר או חיי מדף" — כלומר יש **סתירה מתועדת בין CLAUDE.md לקוד בפועל**, לא רק בין CLAUDE.md לבקשה החדשה. חטיבה ב' בפועל היא בעיקר: (א) לסגור את הפער האמיתי היחיד שנשאר — הפרדת עובד/ת רגיל/ה ממנהל/ת משמרת (סעיף א.8), (ב) לתקן חוסר-בהירות אמיתי בדוח הפחת, (ג) להוסיף בדיקות הרשאה ייעודיות שהיו חסרות, (ד) ליישר את הניסוח ב-CLAUDE.md/DATA_MODEL.md מול המציאות. **זה לא "לבנות ממודל הרשאות דו-שכבתי למודל תלת-שכבתי" מאפס.**
3. **`ProductsManagement` כבר מכיל `focusIngredients` prop עם הערה שאומרת "משמש את באנר 'ממתין למחיר' ב-AdminDashboard"** — אבל שום קוד לא קורא ל-`AdminDashboard` עם הבאנר הזה בפועל. זו כנראה תשתית מוכנה-מראש בדיוק לסעיף א.4, שלא חוברה מעולם. משתמשים בה כמו שהיא.
4. **הסרת כפתור "עדכון כמות" משורת האצווה (סעיף א.5) הייתה שוברת בשקט תכונה שלמה שנבנתה ונבדקה בשלב 12** (`updateBatchQuantity` + תג "יש לעדכן כמות היום"). **נפתר מול בעל הפרויקט**: נשאר טופס העדכון הקיים (inline), אבל מופעל מפקד משני קטן ליד תגי הדחיפות בשורה — לא כפתור רביעי בפעולות הראשיות. פירוט מלא בסעיף א.5.
5. **הסרת כפתור "פג תוקף" (סעיף א.5) אושרה מפורשות** — הדרך היחידה לסמן אצווה כפגת-תוקף תהיה "הושלך" + סיבה "פג תוקף" (כבר קיימת ברשימה הסגורה). **לא נוגעים ב-`updateBatchStatus` בשרת** (ממשיך לתמוך ב-`newStatus: "expired"` — רק שום קליינט לא ישלח את זה יותר).
6. **סעיף א.7 (הצגת תאריך תפוגה) אושר: להציג גם תאריך+שעה וגם ספירה לאחור יחד**, לא להחליף אחד בשני.
7. **סעיף א.2 הובהר**: שלושה מסכים נפרדים לגמרי — (1) מסך הבית/הטאבלט = מסך העובדים, כבר פתוח בלי התחברות (`TabletApp`/`AppContent`, אין צורך בשינוי קוד שם — רק לוודא/לתעד), (2) מסך כניסה נפרד למנהל/ת משמרת (שם+PIN), (3) מסך כניסה נפרד לבעל/ת העסק (קוד). כרגע שניהם (2)+(3) מאוחדים ב-`LoginScreen.tsx` אחד עם צעד "בחירת תפקיד".

---

## סדר ביצוע מומלץ (חטיבה א')

הסדר **שונה מהמספור בבקשה המקורית** כי יש תלות אמיתית: סעיף 2 (מסכי כניסה נפרדים) צריך את הפרדת עובד/מנהל-משמרת שנבנית בסעיף 8, אחרת מסך הכניסה למנהל/ת משמרת יציג גם עובדים רגילים ברשימת ה-PIN.

1. **א.1 — תיקון באג עורך המתכון** (דחוף, עצמאי, ראשון)
2. **א.8 — הפרדת עובד/ת רגיל/ה ממנהל/ת משמרת** (תשתית נתונים; א.2 תלוי בזה)
3. **א.2 — מסכי כניסה נפרדים** (תלוי ב-8)
4. **א.6 — "תוקף תקין"** (טריוויאלי)
5. **א.7 — תאריך+שעה+ספירה לאחור**
6. **א.5 — שלושה כפתורים + מיקום מחדש של עדכון כמות**
7. **א.3 — סימן ₪**
8. **א.4 — באנר "ממתין למחיר" למנהל/ת העסק**
9. רגרסיה מלאה (`test:functions`, `test:rules`, `lint`, `tsc -b && vite build`) + אימות Playwright מקיף לכל השינויים למעלה, כולל תרחיש הבאג המקורי (א.1) בפירוט.

רק אחרי שכל זה עבר בפועל ואומת בדפדפן — לעבור לחטיבה ב'.

---

## חטיבה א' — פירוט לפי סעיף

### א.1 — באג עורך המתכון: מרכיב חדש לא נשמר, הדיאלוג נסגר

#### אבחון שורש הבעיה (מהקוד, לא ניחוש)

ב-[`src/components/RecipeLinesEditor.tsx`](src/components/RecipeLinesEditor.tsx) הרכיב מחזיר:

```tsx
<form onSubmit={handleSubmit}>
  ...
  {showAddIngredient && (
    <IngredientFormDialog
      ingredient={null}
      onClose={() => setShowAddIngredient(false)}
      onSaved={handleIngredientCreated}
    />
  )}
</form>
```

וב-[`src/components/IngredientFormDialog.tsx`](src/components/IngredientFormDialog.tsx) הרכיב עצמו מחזיר **`<form onSubmit={handleSubmit} className="dialog">`** משלו.

כשהדיאלוג פתוח (`showAddIngredient === true`), ה-DOM בפועל מכיל `<form>` בתוך `<form>` — nesting לא תקין ב-HTML5. React בונה את זה ישירות דרך `document.createElement`/`appendChild` (לא דרך parser של HTML), אז ה-nesting *נבנה בפועל* בעץ ה-DOM (בניגוד למה שהיה קורה עם `innerHTML`, ששם חוק הפרסינג היה מוחק את התג הפנימי).

**מנגנון הבאג בפועל**: `submit` הוא אירוע bubbling. לחיצה על "שמירה" בתוך `IngredientFormDialog` יוצרת אירוע `submit` יחיד שה-DOM/React מפיצים תחילה ל-handler של היעד עצמו (`IngredientFormDialog.handleSubmit`) ולאחר מכן, מכיוון שהוא bubbling, **גם** ל-handler של ה-`<form>` האב — `RecipeLinesEditor.handleSubmit` — **באותה דיספאצ'ה בדיוק**, בלי קשר לזה שה-`<form>` החיצוני מעולם לא "הוגש" בפועל. שני ה-handlers רצים סינכרונית בזה אחר זה (כל אחד מתחיל לרוץ, מגיע ל-`await` הראשון שלו, ותורם לתור); `e.preventDefault()` שנקרא ע"י ה-handler הפנימי מונע ניווט דפדפן אמיתי, אבל **לא** עוצר את ההפצה ל-handler החיצוני.

התוצאה: כל לחיצה על "שמירה" בטופס "מרכיב חדש" **גם** מפעילה בשוגג את `handleSubmit` של `RecipeLinesEditor` עצמו (=שמירת גרסת מתכון!) עם מצב ה-`lines`/`yieldQuantity` הנוכחי של הטופס החיצוני — לא בכוונה, ולא קשור בכלל למרכיב שרק נוצר (שעדיין לא נכנס ל-`lines`, כי `handleIngredientCreated` רץ רק אחרי שה-`createIngredient` async מסתיים).

שני תרחישים אפשריים אחרי זה:
- **אם ה-`lines`/`yieldQuantity` הנוכחיים זהים בדיוק לגרסה השמורה** (משתמש/ת פתח/ה עורך מתכון קיים ומיד לחצ/ה "מרכיב חדש" בלי לגעת בכלום) — השמירה החיצונית-בשוגג מחזירה `unchanged:true`, לא נוצרת גרסה חדשה, ולכאורה "לא קורה כלום" — אבל זו עדיין קריאת שרת מיותרת/שגויה שרצה בכל פעם.
- **אם המשתמש/ת כבר שינה/תה כמות בשורה קיימת (או הסיר/ה שורה) *לפני* שלחצ/ה "מרכיב חדש"** — תרחיש טבעי לגמרי בזרימת עבודה אמיתית — השמירה החיצונית-בשוגג **כן** יוצרת גרסת מתכון חדשה, עם הנתונים החלקיים/לא-גמורים, **בלי** המרכיב שהמשתמש/ת עדיין באמצע להוסיף. `RecipeEditorDialog.onSaved` מריץ `setReloadKey(k+1)`, שגורם ל-`loadCurrentVersion()` לרוץ מחדש ולעדכן `current` עם הגרסה החדשה שזה עתה נוצרה. מכיוון ש-`current.versionNumber` השתנה, ה-`key` שמועבר ל-`RecipeLinesEditor` (`key={current.hasRecipe ? String(current.versionNumber) : "new"}`) משתנה — **React עושה remount מלא ל-`RecipeLinesEditor`**, מה שמאפס את `showAddIngredient` (הדיאלוג הפנימי נעלם, גם אם בקשת `createIngredient` שלו עדיין לא הסתיימה או שכן הסתיימה אבל אין יותר `lines` state לעדכן) ומאתחל מחדש `lines` לפי הנתונים החדשים מהשרת — **בלי** המרכיב החדש. זה בדיוק "הדיאלוג נסגר לגמרי והעבודה שהוזנה עד אז הולכת לאיבוד".

גם בתרחיש הראשון (unchanged) זה עדיין באג אמיתי — שליחה כפולה לא-מכוונת לאנדפוינט הלא-נכון בכל לחיצה על "שמירה" בטופס מרכיב.

#### התיקון

קובץ יחיד, שינוי שורה אחת: **[`src/components/IngredientFormDialog.tsx`](src/components/IngredientFormDialog.tsx)**, בתוך `handleSubmit`:

```tsx
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  e.stopPropagation(); // ← חדש
  ...
```

הוסף הערה קצרה מעל השורה שמסבירה שהרכיב הזה יכול לרוץ מקונן בתוך `<form>` אחר (`RecipeLinesEditor`, זרימת "מרכיב חדש"), ו-`submit` הוא bubbling אירוע — בלי `stopPropagation` ה-`<form>` החיצוני "מגיש" את עצמו בשוגג.

**למה לא Portal**: שקלתי `ReactDOM.createPortal` (להוציא את ה-DOM subtree של `IngredientFormDialog` מחוץ ל-`<form>` החיצוני פיזית) כפתרון "כללי יותר" שהיה מונע את כל המחלקה הזו של באגים לכל דיאלוג עתידי. לא ממליץ: הריפו לא משתמש ב-Portal בשום מקום כרגע, זו הוספת דפוס/תשתית חדשה, וזה הבאג היחיד הידוע מהסוג הזה בקוד הנוכחי (ראו בדיקה למטה) — לא הצדקה מספיקה לפי העיקרון "לא לתכנן לתרחישים היפותטיים עתידיים" ב-CLAUDE.md. `stopPropagation` הוא תיקון שורש נכון וממוקד לבעיה בפועל.

**וידוא שאין מופעים דומים נוספים** (נבדק בשלב התכנון): `IngredientFormDialog` נפתח גם ישירות מ-`ProductsManagement.tsx` (בלשונית "מרכיבים") — שם הוא **לא** מקונן בתוך `<form>` אחר (רק בתוך `<div>`), אז ההוספה של `stopPropagation` שם היא no-op בטוח, לא משנה התנהגות קיימת. שאר הדיאלוגים בריפו (`ProductFormDialog`, `NewProductWizard`, `RecipeEditorDialog`, `StaffFormDialog`, `CreateBatchDialog`, `DiscardReasonDialog`) **אף פעם** לא מקוננים בתוך `<form>` אחר — כולם נפתחים כ-siblings מתוך `<div>`/component רגיל. `RecipeLinesEditor` (המקור לבעיה) משמש גם את `NewProductWizard` בשלב 2 שלו — התיקון ב-`IngredientFormDialog` מתקן את שני מקומות השימוש (`RecipeEditorDialog` ו-`NewProductWizard`) בבת אחת, כי שניהם עוטפים את אותו `RecipeLinesEditor` משותף.

> **עדכון בפועל אחרי בדיקה אמיתית בדפדפן — הניתוח למעלה לא היה מלא, וההמלצה "לא Portal" התבררה כשגויה.** `e.stopPropagation()` לבד תיקן את בעיית ה-bubbling הלוגי של React (מנע מ-`RecipeLinesEditor.handleSubmit` לרוץ בשוגג), אבל **לא** מנע התנהגות חמורה יותר שהניתוח הקודם לא צפה: הדפדפן עצמו (לא React) עדיין ביצע **הגשה (submit) מקורית ברמת ה-DOM** של ה-`<form>` המקונן פיזית, וניווט מחדש לעמוד (`location.href` עם query string ריק) — איפוס מלא של המצב, כולל session/dialogs פתוחים, בלי שום קשר ל-`e.preventDefault()`/`stopPropagation()` ברמת React (אומת עם Playwright: האזנה ל-`framenavigated`+`load` וגם monkey-patch של `Event.prototype.preventDefault`/`stopPropagation` הראו שהדפדפן ניווט מחדש **אחרי** ששני אלה נקראו כראוי — תוצר לוואי של ה-DOM הלא-תקני עצמו, לא של קוד React). **התיקון בפועל: גם `e.stopPropagation()` וגם `ReactDOM.createPortal`** (מוציא את ה-DOM subtree של `IngredientFormDialog` פיזית מחוץ ל-`<form>` החיצוני, ל-`document.body`) — **שניהם ביחד, לא אחד או השני**: ה-Portal פותר את בעיית ה-DOM/ניווט, אבל **לא** מספיק לבד כי React מבעבע אירועים לפי מבנה ה-**JSX/React tree** (המיקום הלוגי, לא מיקום ה-DOM בפועל) — תיעוד רשמי של React על Portals: אירוע שמקורו בתוך portal ממשיך "לבעבע" להורים בעץ ה-React הלוגי גם כשהם לא הורים ב-DOM. בלי `stopPropagation` גם עם Portal, `RecipeLinesEditor.handleSubmit` עדיין רץ בשוגג (אומת בפועל: הסרת `stopPropagation` ובדיקה מחדש הראתה בדיוק את זה — גרסת מתכון נוצרת מוקדם מדי). ראו הקוד המעודכן ב-`IngredientFormDialog.tsx` להסבר המלא בהערה. **לקח כללי**: ניתוח קוד סטטי לא הספיק כאן — רק בדיקה אמיתית בדפדפן (Playwright, לא רק `curl`/קריאת קוד) חשפה את הפער. בנוסף, נמצא **באג שני, נפרד**, שהניתוח למעלה לא צפה כלל: אחרי יצירת המרכיב, ה-`<select>` של השורה שאמורה "להיבחר אוטומטית" הציג ריק (למרות שה-state הפנימי היה תקין) — כי הרשימה `ingredients` שמגיעה כ-prop מה-הורה (`ProductsManagement`) לא מתעדכנת כשמרכיב נוצר מתוך העורך המקונן, אז אין `<option>` תואם לרנדר. תוקן עם רשימת `locallyCreatedIngredients` מקומית ב-`RecipeLinesEditor` שמתמזגת עם ה-prop לצורך רינדור האפשרויות.

#### בדיקות

אין תשתית לבדיקת קומפוננטות React (ראו הערה למעלה) — האימות היחיד הוא **דפדפן אמיתי (Playwright)**:
1. מוצר קיים עם מתכון של 2+ שורות → פתיחת עורך מתכון → **שינוי כמות בשורה קיימת (בלי לשמור!)** → לחיצה "מרכיב חדש" → מילוי שם+יחידה למרכיב חדש → "שמירה". לוודא: מספר הגרסה **לא** קפץ בשוגג, הדיאלוג הפנימי נסגר כרגיל (לא ה-modal החיצוני), המרכיב נבחר אוטומטית בשורה (הריקה אם הייתה, אחרת חדשה), הכמות שהוזנה קודם בשורה הקיימת **עדיין שם** (לא אופסה). שמירה סופית של המתכון כולל את המרכיב החדש.
2. אותו תרחיש בלי לשנות כלום קודם (openעורך → מיד "מרכיב חדש") — לוודא שאין קריאת `createRecipeVersion` מיותרת (אפשר לבדוק ברשת ה-DevTools של Playwright, או ע"י מעקב אחרי מספר הגרסה שלא השתנה).
3. אותו זרימה גם דרך `NewProductWizard` (שלב 2, יצירת מוצר חדש) — לוודא תיקון זהה.

---

### א.8 — הפרדת עובד/ת רגיל/ה ממנהל/ת משמרת

**מצב היום**: `staff` collection מייצג רק "מנהלי משמרת בכוח" — `setStaffPin` (functions/src/auth/setStaffPin.ts) **דורש** PIN בעת יצירת עובד/ת חדש/ה (`if (!existing.exists && pin === undefined) throw`). כל עובד/ת שנוסף/ה יכול/ה מיד להתחבר כ-`shiftManager` דרך `verifyStaffPin`. אין שום "עובד/ת רגיל/ה בלי PIN" בסכמה.

#### שינוי סכמה

`businesses/{businessId}/staff/{staffId}` מקבל שדה חדש: **`isShiftManager: boolean`**.
- ברירת מחדל ליצירה חדשה: `false` (עובד/ת רגיל/ה — לפי הבקשה "הוספת עובד רגיל כברירת מחדל").
- `true` = יש PIN תקף (`staffSecrets/{staffId}` קיים) והעובד/ת יכול/ה להתחבר כ-`shiftManager`.
- **אין שינוי ל-Firestore Rules** — `staff/{staffId}` כבר `allow read: if isOwner(businessId); allow write: if false;`, וזה חל על המסמך כולו כולל השדה החדש. אין צורך בכלל ברמת-שדה.

#### `functions/src/auth/setStaffPin.ts`

Data חדש: `{ businessId, staffId, name, active, isShiftManager: boolean, pin?: string }`.

לוגיקה חדשה (מחליפה את הבדיקה הנוכחית "PIN נדרש תמיד ביצירה"):
- `isShiftManager === true`:
  - אם אין `staffSecrets/{staffId}` קיים **וגם** לא נשלח `pin` בקריאה הזו → `invalid-argument`: "יש להזין PIN למנהל/ת משמרת".
  - אם נשלח `pin` → hash + `set` (יצירה או סיבוב) על `staffSecrets/{staffId}`, בדיוק כמו היום.
  - אם `pin` לא נשלח אבל `staffSecrets` כבר קיים → משאירים כמו שהוא (זהה להתנהגות הקיימת "עדכון בלי PIN לא נוגע בקיים").
- `isShiftManager === false`:
  - אם `staffSecrets/{staffId}` קיים → **מוחקים אותו** (`secretRef.delete()`) — שולל גישת PIN מיידית. זה חשוב: בלי המחיקה, עובד/ת שהוחזר/ה ל"רגיל/ה" עדיין יוכל/תוכל להתחבר עם ה-PIN הישן דרך `verifyStaffPin` למרות שה-UI כבר לא מציג/ה אותו/ה כמנהל/ת משמרת.
  - כל `pin` שנשלח בקריאה הזו מתעלמים ממנו (לא נכתב).
- כתיבת מסמך `staff`: מוסיפים `isShiftManager: data.isShiftManager` לאובייקט שנכתב.
- Audit log: להוסיף `isShiftManager` ל-`metadata`.

#### `functions/src/auth/verifyStaffPin.ts` — הקשחה (הגנת עומק)

אחרי טעינת `staffSnap`, להוסיף בדיקה נוספת ליד הבדיקה הקיימת של `active`:
```ts
if (!staffSnap.exists || staffSnap.data()?.active !== true || staffSnap.data()?.isShiftManager !== true) {
  throw new HttpsError("not-found", "עובד/ת לא נמצא/ה או לא פעיל/ה");
}
```
זו הגנה נוספת מעבר למחיקת `staffSecrets` ב-`setStaffPin` — לא אמורה להיות קריטית אם המחיקה עובדת נכון, אבל זול וטוב לתחזוקה (defense in depth), ועקבי עם העיקרון "לא רק הסתרה בממשק" שחטיבה ב' מבקשת במפורש.

#### `functions/src/staff/listActiveStaffNames.ts`

הפונקציה הזו משמשת **שני צרכנים שונים** שצריכים תוצאות שונות:
1. `CreateBatchDialog.tsx` ("מי הכין") — צריך **את כולם** (גם עובדים רגילים, גם מנהלי משמרת — כל מי שיכול/ה "להכין" אצווה).
2. מסך הכניסה למנהל/ת משמרת (סעיף א.2) — צריך **רק** מי שיש לו/ה `isShiftManager === true` (אין טעם להציג עובד/ת רגיל/ה ברשימת בחירה לפני הזנת PIN — ל-PIN שלו/ה אין בכלל).

הוספת פרמטר אופציונלי:
```ts
interface Data {
  businessId: string;
  onlyShiftManagers?: boolean;
}
```
כשה-flag מסופק ו-`true`, מוסיפים `.where("isShiftManager", "==", true)` לשאילתה הקיימת (יחד עם `.where("active", "==", true)`). ברירת המחדל (`false`/לא מסופק) = כל ההתנהגות הקיימת, ללא סינון נוסף — כך `CreateBatchDialog` לא צריך שינוי כלל.

#### `src/components/StaffFormDialog.tsx`

- state חדש: `isShiftManager` (checkbox), מאותחל מ-`staff?.isShiftManager ?? false`.
- שדה ה-PIN: מוצג **רק** כש-`isShiftManager` מסומן (checkbox). הלייבל משתנה בהתאם למצב:
  - מנהל/ת משמרת חדש/ה (`!staff && isShiftManager`): "PIN (לפחות 4 ספרות)" — חובה.
  - קידום עובד/ת קיים/ת שהייתה `isShiftManager===false` → מסמנים checkbox → אותו לייבל "PIN (לפחות 4 ספרות)" — חובה (אין PIN קודם לשמור).
  - עריכת מנהל/ת משמרת קיים/ת שכבר `isShiftManager===true`: "PIN חדש (ריק = השארת ה-PIN הקיים)" — כמו היום.
- ולידציה בקליינט: PIN נדרש אם ורק אם `isShiftManager===true` **וגם** (`staff===null` **או** `staff.isShiftManager===false`). אחרת PIN אופציונלי (אם מוזן, לפחות 4 תווים — כמו היום).
- `handleSubmit` שולח `isShiftManager` לקריאת `setStaffPin`.
- checkbox חדש בטופס: `<label><input type="checkbox" checked={isShiftManager} onChange={...} /> גם מנהל/ת משמרת (דורש PIN)</label>` — ממוקם מעל שדה ה-PIN, כברירת מחדל **לא מסומן** (עובד/ת רגיל/ה כברירת מחדל).

#### `src/admin/TeamManagement.tsx`

- `Staff` interface: הוספת `isShiftManager: boolean`.
- מיפוי `onSnapshot`: `isShiftManager: d.data().isShiftManager ?? false` (fallback בטוח, לא קריטי כי אין נתוני production אמיתיים עדיין — רק Emulator/seed).
- `toggleActive`: לעדכן את קריאת `setStaffPin` להעביר גם `isShiftManager: member.isShiftManager` (לא לשנות בטעות את התפקיד כשמשביתים/מפעילים).
- תצוגת הרשימה: להוסיף אינדיקציה ויזואלית קטנה ליד השם — למשל `{member.isShiftManager && <span className="reminder-badge">מנהל/ת משמרת</span>}` (שימוש חוזר בclass קיים, לא class חדש).

#### `src/components/CreateBatchDialog.tsx`

**אין שינוי קוד** — כבר קורא ל-`listActiveStaffNames` בלי `onlyShiftManagers`, כלומר מקבל את כולם, בדיוק כמו שצריך (כל עובד/ת, לא רק מנהלי משמרת, יכול/ה להיות "מי הכין").

#### קבצי seed/בדיקות שחייבים עדכון (אחרת בדיקות קיימות ייכשלו)

- **`tests/functions.test.js`**, ה-`before()` block: זריעת `staff/staff1` (שורה ~118) חייבת לקבל `isShiftManager: true` — אחרת `verifyStaffPin` המוקשח (למעלה) ידחה את `callAsStaff()` שהרבה בדיקות קיימות תלויות בו.
- **`functions/scripts/seedDemo.ts`**: אותו דבר, זריעת `staff/staff1` (שורה ~174) מקבלת `isShiftManager: true` — אחרת `npm run setup:demo` ייצור עובד/ת שלא יכול/ה להתחבר בטאבלט למרות שה-PIN נזרע.
- `functions/scripts/bootstrapBusiness.ts` ו-`functions/scripts/seedSampleProducts.ts`: נבדק — לא זורעים `staff` בכלל, אין צורך בשינוי.

#### `DATA_MODEL.md`

בסעיף `staff/{staffId}` להוסיף לסכמה:
```
isShiftManager: boolean   // false = עובד/ת רגיל/ה (בלי PIN, לא יכול/ה להתחבר כמנהל/ת משמרת). true = יש staffSecrets תואם.
```
ולעדכן את המשפט "כתיבה: רק Admin SDK... קריאה: owner בלבד" — אין שינוי בו, רק להוסיף הערה שהשדה נוסף בשלב 15.

#### בדיקות שצריך להוסיף (`tests/functions.test.js`)

בדיקה חדשה, למשל `"setStaffPin: הפרדת עובד/ת רגיל/ה ממנהל/ת משמרת — יצירה בלי PIN, קידום, הורדה"`:
1. `setStaffPin` כ-owner עם `isShiftManager: false`, בלי `pin` → מצליח (לא זורק "יש להזין PIN").
2. `verifyStaffPin` נגד אותו staffId → נכשל (`not-found`) — עובד/ת רגיל/ה לא יכול/ה להתחבר.
3. `listActiveStaffNames({ onlyShiftManagers: true })` → **לא** כולל את העובד/ת הזה. `listActiveStaffNames({})` (בלי flag) → **כן** כולל אותו/ה.
4. `setStaffPin` שוב על אותו staffId עם `isShiftManager: true` בלי `pin` → נכשל (`invalid-argument`, "יש להזין PIN למנהל/ת משמרת").
5. `setStaffPin` עם `isShiftManager: true` ו-`pin: "1234"` → מצליח. `verifyStaffPin` עם `"1234"` → מצליח, `claims.role === "shiftManager"`.
6. `setStaffPin` שוב עם `isShiftManager: false` (הורדה) → מצליח. `verifyStaffPin` עם `"1234"` (אותו PIN ישן) → נכשל (`not-found`) — ה-PIN נמחק בפועל, לא רק "מוסתר".

---

### א.2 — מסכי כניסה נפרדים

**תלוי בסעיף א.8** (`listActiveStaffNames` עם `onlyShiftManagers`).

**מה כבר קיים ולא משתנה**: מסך הבית (`TabletApp.tsx`/`TabletDashboard.tsx`) כבר פתוח ללא התחברות — `AuthContext` עם `enableWorkerFallback` קורא ל-`startWorkerSession` אוטומטית, ו-`AppContent` ב-`TabletApp.tsx` מציג את `TabletDashboard` ישר בלי שער כניסה. **אין כאן שום שינוי קוד** — רק לוודא בבדיקת דפדפן שזה עדיין ככה, ולתעד ב-CLAUDE.md שזה "מסך 1" מתוך שלושה במפורש.

**מה משתנה**: פיצול `src/screens/LoginScreen.tsx` (קיים, דיאלוג יחיד עם 4 modes: `chooseRole`/`ownerCode`/`staffPicker`/`staffPin`) לשני קבצים נפרדים:

1. **חדש: `src/screens/OwnerLoginDialog.tsx`** — רק מה שהיה `mode === "ownerCode"`: טופס קוד מנהל + `verifyOwnerCode` + `signInWithCustomToken`. Props: `{ onClose: () => void }`. בלי מצב `chooseRole` — זה כל הדיאלוג.
2. **חדש: `src/screens/StaffLoginDialog.tsx`** — מה שהיה `mode === "staffPicker"` + `mode === "staffPin"`: קריאה ל-`listActiveStaffNames({ businessId, onlyShiftManagers: true })` (השינוי מסעיף א.8!) בטעינה (לא בלחיצת כפתור נפרדת — כבר אין צעד `chooseRole` שמקדים את זה, אז אפשר לטעון ישר ב-`useEffect` בעת פתיחת הדיאלוג, לפשט את זרימת ה-state). בחירת שם → הזנת PIN → `verifyStaffPin` → `signInWithCustomToken`. משמר את מסך "אין עדיין עובדי משמרת רשומים... מעבר להתחברות כבעל/ת העסק" (עם `onSwitchToOwnerLogin` prop חדש שמאפשר למסך הזה "לקפוץ" למסך השני — צריך ל-TabletDashboard לתאם בין שני ה-state-ים, ראו למטה). Props: `{ onClose: () => void; onSwitchToOwnerLogin: () => void }`.
3. **מחיקה: `src/screens/LoginScreen.tsx`** — לא נשאר עוד קובץ מאחד; לפי העיקרון "לא backwards-compat shims", לא משאירים re-export ריק.

#### `src/screens/TabletDashboard.tsx`

- להחליף `showLoginDialog: boolean` בשני states: `showStaffLogin: boolean`, `showOwnerLogin: boolean`.
- להחליף את הכפתור היחיד `"כניסה כמנהל/ת משמרת / בעל/ת העסק"` בשני כפתורים נפרדים (שניהם מוצגים רק כש-`claims?.role === "worker"`, בדיוק כמו היום):
  ```tsx
  <button type="button" onClick={() => setShowStaffLogin(true)}>כניסה כמנהל/ת משמרת</button>
  <button type="button" onClick={() => setShowOwnerLogin(true)}>כניסה כבעל/ת העסק</button>
  ```
- ה-`useEffect` הקיים שסוגר את דיאלוג הכניסה אוטומטית כש-`role` עובר מ-`worker` לתפקיד אחר (`prevRoleRef`) — לעדכן שיסגור **את שני ה-state-ים** (`setShowStaffLogin(false); setShowOwnerLogin(false);`), לא רק את הישן.
- `onSwitchToOwnerLogin` שמועבר ל-`StaffLoginDialog`: `() => { setShowStaffLogin(false); setShowOwnerLogin(true); }`.
- ייבוא: `import { StaffLoginDialog } from "./StaffLoginDialog"; import { OwnerLoginDialog } from "./OwnerLoginDialog";` במקום `LoginScreen`.

#### בדיקות

Playwright בלבד (UI): (1) לחיצה על "כניסה כמנהל/ת משמרת" פותחת ישר רשימת עובדים (לא צעד "בחירת תפקיד" מקדים), והרשימה **לא** כוללת עובד/ת רגיל/ה שנוצר/ה בלי PIN (מסעיף א.8) — רק מי שמסומן/ת `isShiftManager`. (2) לחיצה על "כניסה כבעל/ת העסק" פותחת ישר טופס קוד — בלי שום התייחסות לעובדים. (3) מסך "אין עובדי משמרת" מוביל נכון לדיאלוג השני. (4) מסך הבית עצמו (בלי ללחוץ כלום) כבר מציג רשימת אצוות/יצירת אצווה — לוודא שלא נדרשת שום פעולת התחברות כדי להגיע לשם.

---

### א.6 — "תקין" → "תוקף תקין"

קובץ יחיד: **[`src/components/BatchRow.tsx`](src/components/BatchRow.tsx)**, קבוע `URGENCY_BADGE_LABEL`:
```ts
const URGENCY_BADGE_LABEL: Record<ReturnType<typeof urgencyLevel>, string> = {
  expired: "פג תוקף",
  urgent: "דחוף",
  soon: "בקרוב",
  ok: "תוקף תקין", // היה "תקין"
};
```
שינוי מחרוזת יחיד. בדיקה: Playwright/עין — אצווה עם urgency `ok` מציגה את הטקסט החדש.

---

### א.7 — הצגת תאריך תפוגה + ספירה לאחור (שניהם, לפי ההחלטה שאושרה)

#### `src/lib/expiry.ts`

הוספת פונקציה חדשה, לצד `urgencyLevel`/`formatTimeRemaining` הקיימות (לא נוגעים בהן — `formatTimeRemaining` ממשיכה לשמש בדיוק כמו היום):
```ts
export function formatExpiryDateTime(date: Date): string {
  return date.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
```
(תואם את הדפוס הקיים ב-`AuditLogViewer.tsx`'s `formatDateTime`, בלי `year` — תאריכי תפוגה תמיד קרובים, בתוך חיי המדף של המוצר, אין צורך בשנה בפריסת שורה צפופה. פרט קוסמטי קל לשינוי אם רוצים).

#### `src/components/BatchRow.tsx`

```tsx
<span>{formatExpiryDateTime(batch.expiresAt)} · {formatTimeRemaining(batch.expiresAt)}</span>
```
במקום `<span>{formatTimeRemaining(batch.expiresAt)}</span>` היום. import מעודכן מ-`../lib/expiry`.

בדיקות: Playwright — שורת אצווה מציגה גם תאריך+שעה וגם "עוד X ימים/שעות" יחד, בפורמט קריא.

---

### א.5 — שלושה כפתורים בשורת האצווה + מיקום מחדש של עדכון כמות

**קובץ יחיד: [`src/components/BatchRow.tsx`](src/components/BatchRow.tsx)** (הלוגיקה הפנימית `editingQuantity`/`quantityInput`/`handleQuantitySubmit` **נשארת כמעט זהה** — רק מיקום ה-trigger משתנה).

שינויים:
1. **הסרת** הכפתור `onClick={onMarkExpired}` ("פג תוקף") מ-`.batch-actions` לגמרי. הסרת ה-prop `onMarkExpired` מ-`Props` interface.
2. **שינוי טקסט** הכפתור `onMarkUsed`: "נוצל" → "נוצל במלואו".
3. **הסרת** כפתור "עדכון כמות" מתוך `.batch-actions` (נשארים שם רק 3: הדפסה חוזרת, נוצל במלואו, הושלך).
4. **הוספת** trigger חדש, קטן/משני, בתוך `.batch-info` (ליד `urgency-badge`/`reminder-badge`, לא בתוך `.batch-actions`):
   ```tsx
   {!editingQuantity && (
     <button
       type="button"
       className={`batch-info-action${needsQuantityUpdateReminder ? " urgent-action" : ""}`}
       onClick={startEditingQuantity}
       disabled={disabled}
     >
       עדכון כמות
     </button>
   )}
   ```
   ממוקם בתוך `.batch-info`, אחרי הבאדג'ים ולפני/אחרי השם — מיקום מדויק לפי טעם עיצובי בזמן המימוש, לא קריטי.
5. שאר הלוגיקה (`editingQuantity`, `quantity-update-form`, `handleQuantitySubmit`) **לא משתנה** — רק מי שקורא ל-`startEditingQuantity` (עבר מ-`.batch-actions` ל-`.batch-info`).

#### `src/index.css` — class חדש

```css
/* פקד משני קטן בתוך .batch-info (לא כפתור פעולה ראשי) — עדכון כמות
   ביניים, נגיש תמיד אבל לא תופס מקום בשורת הפעולות הראשית. */
.batch-info-action {
  align-self: flex-start;
  min-height: 2.75rem; /* קטן מ---touch-target (52px) בכוונה — פקד משני, לא ראשי; עדיין ≥44px למגע אמין */
  padding: 0.35rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 999px;
  background: transparent;
  border: 1.5px dashed var(--color-border);
  color: var(--color-text-muted);
}

.batch-info-action.urgent-action {
  border-style: solid;
}
```
(גדלים/צבעים בדיוק — לכוונן בפועל מול הדפדפן, זה לא ערך קדוש; העיקרון: פחות בולט מ-3 הכפתורים הראשיים, אבל עדיין קריא/לחיץ בנוחות על טאבלט).

#### `src/screens/TabletDashboard.tsx`

- הסרת ה-JSX handler `onMarkExpired={...}` מקריאת `<BatchRow .../>`.
- לצמצם את הטיפוס של `updateStatus`'s `newStatus` פרמטר מ-`"used" | "expired" | "discarded"` ל-**`"used" | "discarded"`** (אף קליינט לא שולח `"expired"` יותר) — **בלי לגעת ב-`updateBatchStatus` בשרת**, שממשיך לתמוך ב-`"expired"` כערך תקין ל-`newStatus` (יישאר נתמך בסכמה/שרת, ליתר ביטחון/עתידיות, כפי שאושר).
- הסרת `STATUS_TOAST_LABEL.expired` (לא בשימוש יותר), עדכון `STATUS_TOAST_LABEL.used` ל-`"הסטטוס עודכן ל'נוצל במלואו'"`.

#### תיעוד

יש להעיר בקוד (`BatchRow.tsx` או `TabletDashboard.tsx`) שסטטוס `expired` עדיין קיים בסכמה/בשרת אבל אין יותר כפתור ייעודי אליו — "פג תוקף" הפך לסיבת פחת בתוך "הושלך", לא סטטוס נפרד שנבחר ידנית. ל-`DATA_MODEL.md` (סעיף `batches`, שדה `status`) להוסיף הערה דומה.

#### בדיקות

Playwright: (1) שורת אצווה מציגה בדיוק 3 כפתורי פעולה ראשיים ("הדפסה חוזרת"/"נסה שוב להדפיס", "נוצל במלואו", "הושלך") — אין "פג תוקף" ואין "עדכון כמות" ביניהם. (2) פקד "עדכון כמות" הקטן ליד התגים פותח את אותו טופס inline כמו היום, עדכון מצליח. (3) מוצר עם `partialUsageUpdateFrequency: "endOfDay"` ואצווה שלא עודכנה היום — הפקד הקטן מקבל class מודגש (`urgent-action`), לא נעלם. (4) "הושלך" ממשיך לפתוח את `DiscardReasonDialog` (סיבה+כמות) בדיוק כמו היום — אין שינוי שם.

---

### א.3 — סימן ₪ בכל מקום שמוצג בו מחיר/עלות

#### חדש: `src/lib/currency.ts`

```ts
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `₪${value.toFixed(2)}`;
}
```
פונקציה משותפת אחת, כדי לא לפזר `.toFixed(2)` + "₪" בכל קובץ בנפרד עם סיכון לחוסר-עקביות (פורמט/מיקום הסימן).

#### קבצים שמשתמשים בה (כל מקום שמציג **ערך** כספי מחושב — לא שדה קלט):

- **`src/components/RecipeEditorDialog.tsx`**: "עלות כוללת להכנה אחת" (`totalCostSnapshot`), "עלות ל-X בודד/ת" (`costPerUnitSnapshot`), ולכל שורת מרכיב: `pricePerUnitSnapshot` ו-`lineCostSnapshot`. כל המופעים של `.toFixed(2)` הקיימים בקובץ הזה מוחלפים ב-`formatCurrency(...)`.
- **`src/admin/ProductsManagement.tsx`**: תא "מחיר נוכחי" בטבלת מרכיבים — `` `${ing.currentPricePerUnit} ל-${ing.unit}` `` → `` `${formatCurrency(ing.currentPricePerUnit)} ל-${ing.unit}` ``.
- **`src/admin/WasteReport.tsx`**: שורת הסיכום ("שווי כולל שיוצר"/"שווי פחת"), רשימת "פחת לפי מוצר", טבלת "פחת לפי עובד" (כולל הפירוט לפי סיבה בתוך התא) — כל `.toFixed(2)` קיים מוחלף.
- **`src/admin/exportWasteReportPdf.ts`**: אותם ערכים בדיוק, כפולים בבניית ה-HTML להדפסה (שורת הסיכום, טבלת "פחת לפי מוצר", טבלת "פחת לפי עובד", טבלת "כל האצוות בטווח" — עמודת "עלות").

#### שדות **קלט** (לא ערכים מחושבים) — לא `formatCurrency`, רק תוספת טקסטואלית ללייבל:

- **`src/components/IngredientFormDialog.tsx`**: `<label htmlFor="ingredient-price">מחיר ל-{ingredient?.unit ?? unit} אחד/ת</label>` → הוספת `(₪)`: `מחיר ל-{...} אחד/ת (₪)`.

#### מה **לא** נוגעים בו (נבדק, אין בו נתון כספי)

`NewProductWizard.tsx`, `ProductFormDialog.tsx`, `CreateBatchDialog.tsx` (תצוגת "לפי המתכון" מציגה כמויות בלבד, בכוונה בלי מחיר — `getRecipePreview` לא חושפת נתון כספי), `AuditLogViewer.tsx` (לא מציג `metadata` בכלל).

#### בדיקות

אין קוד לוגי משמעותי לבדוק (מחרוזת פורמט בלבד) — Playwright/עין: ₪ מופיע בטופס מרכיב, בטבלת מרכיבים, בעורך מתכון, בדוח הפחת (מסך + PDF שנפתח מתצוגת `window.print()` — אפשר לבדוק את ה-DOM שנוצר ב-`#print-label-root` לפני הדפסה בפועל).

---

### א.4 — התראה לבעל/ת העסק על מרכיב ללא מחיר

#### חדש: `src/admin/PendingPriceBanner.tsx`

```tsx
interface Props {
  onGoToIngredients: () => void;
}
```
- טוען `listIngredients` (Cloud Function קיימת) ב-mount.
- מסנן `priceStatus === "pending"`.
- אם `count === 0` → `return null` (בלי רעש כשאין מה לדווח).
- אחרת: מציג פאנל בסגנון warning **תוך שימוש חוזר ב-class הקיים `.notifications-panel`** (אין צורך ב-CSS חדש — אותו treatment ויזואלי כמו `NotificationsPanel.tsx` בטאבלט): "X מרכיבים ממתינים למחיר — [כפתור: השלמת מחירים]" → `onClick={onGoToIngredients}`.

#### `src/admin/AdminDashboard.tsx`

- state חדש: `focusIngredients: boolean` (ברירת מחדל `false`).
- `goToIngredients = () => { setTab("products"); setFocusIngredients(true); }`.
- כפתור הניווט הרגיל "מוצרים ומתכונים" (`onClick={() => setTab("products")}`) **חייב** גם לאפס: `onClick={() => { setTab("products"); setFocusIngredients(false); }}` — אחרת אחרי לחיצה אחת על באנר, כל כניסה עתידית ללשונית "מוצרים" (גם דרך הניווט הרגיל) "תיתקע" על תת-לשונית מרכיבים.
- לרנדר `<PendingPriceBanner onGoToIngredients={goToIngredients} />` **מעל** אזור הלשוניות (גלוי מכל לשונית, לא רק "מוצרים" — כמו `NotificationsPanel` שגלוי תמיד בטאבלט).
- `{tab === "products" && <ProductsManagement focusIngredients={focusIngredients} />}` — משתמש בפרופ הקיים שכבר מוכן ולא היה מחובר (ראו ממצא #3 למעלה).

#### בדיקות

Playwright: (1) כ-shiftManager בטאבלט → יצירת מרכיב חדש בלי מחיר. (2) התחברות ל-`/admin` כ-owner → הבאנר מופיע עם ספירה נכונה. (3) לחיצה על "השלמת מחירים" → נוחת על לשונית "מוצרים ומתכונים", תת-לשונית "מרכיבים" (לא "מוצרים"). (4) השלמת המחיר → רענון/כניסה חוזרת ל-`/admin` → הבאנר נעלם (או הספירה יורדת).

---

## חטיבה ב' — מודל הרשאות תלת-שכבתי

**כפי שצוין בממצאים למעלה: רוב חטיבה זו כבר קיימת בפועל.** הטבלה הבאה מסכמת בדיוק מה כבר עובד ומה חדש:

| דרישה | מצב היום | פעולה נדרשת |
|---|---|---|
| עובד/ת רגיל/ה: אצוות/סטטוס/כמות/בחירת שם | ✅ כבר עובד (`worker` role, `startWorkerSession`) | תלוי בא.8 שכבר נבנה |
| מנהל/ת משמרת: מוצר חדש+חיי מדף | ✅ כבר עובד (`createProduct`/`updateProduct` עם `requireShiftManagerOrOwner`) | אין |
| מנהל/ת משמרת: מרכיב בלי מחיר, שדה מחיר מוסתר לגמרי (לא רק חסום) | ✅ כבר עובד (`createIngredient` + `IngredientFormDialog`'s `showPriceField`) | אין |
| מנהל/ת משמרת: מתכון (כמויות+תפוקה) בלי עלויות | ✅ כבר עובד (`createRecipeVersion`/`getRecipeVersionForEdit` מצנזרים לפי role) | אין |
| owner בלעדית: מחירים/דוחות/צוות/יומן | ✅ כבר עובד (Rules + כל ה-Cloud Functions) | אין |
| מרכיב בלי מחיר נשמר תקין, מסומן "ממתין למחיר" | ✅ כבר עובד | אין |
| השלמת מחיר משפיעה על עתיד בלבד | ✅ כבר עובד (snapshot pattern) | אין |
| מוצר עם מרכיב-בלי-מחיר לא נכנס לחישוב, **ומוצג בבירור למה** | ⚠️ חלקי — לא נכנס לחישוב כן, "מוצג בבירור למה" **לא** (הודעה כללית שגויה לפעמים) | **תיקון אמיתי, ראו ב.1 למטה** |
| הפרדת עובד/מנהל-משמרת (כדי שרשימת "מי הכין" תכלול גם עובדים רגילים) | ❌ לא היה קיים | **כבר נבנה בא.8** (חטיבה א') |
| Rules חוסמות ingredients/recipeVersions/staff/auditLog ממנהל/ת משמרת | ✅ כבר עובד ונבדק (`rules.test.js`) | אין (רק להרחיב כיסוי ל-`worker`, ראו ב.3) |
| בדיקות הרשאה ייעודיות | ⚠️ חלקי — יש כיסוי טוב ל-Rules, **חסר** כיסוי ל-response-redaction של Cloud Functions ול-`worker` role | **להוסיף, ראו ב.3** |
| CLAUDE.md מתעד את המודל בצורה נכונה | ❌ הבולט הישן עדיין אומר ההפך | **לתקן, ראו ב.4** |

### ב.1 — תיקון אמיתי: דוח הפחת לא מסביר נכון "אין נתון עלות"

#### הבעיה בפועל (נבדק בקוד, `src/admin/WasteReport.tsx`)

```ts
const costPerUnitSnapshot = recipeVersionId
  ? (costPerUnitCache.get(`${data.productId}/${recipeVersionId}`) ?? null)
  : null;
```
`costSnapshot` (ולכן ה"אין נתון עלות") נהיה `null` בשני מקרים **שונים לגמרי**:
1. `recipeVersionId === null` — לא היה בכלל מתכון בזמן הכנת האצווה.
2. `recipeVersionId` קיים, **אבל** `costPerUnitSnapshot` השמור על אותה גרסת מתכון עצמה הוא `null` — כי באותה גרסה יש (הייתה) שורת מרכיב "ממתין למחיר" (`computeTotalCost` ב-`functions/src/lib/recipeCost.ts` מחזירה `null` אם **ולו שורה אחת** חסרת מחיר).

ה-UI היום (`summary.batchesWithoutCost`) מציג הודעה **אחת גורפת** ושגויה לתרחיש 2: `"X אצוות בטווח בלי נתון עלות (למוצר לא היה מתכון בזמן היצירה)"` — זה נכון רק לתרחיש 1. עבור תרחיש 2 זו הטעיה ממש: היה מתכון, יש עלות ליחידה חסרה כי מרכיב בתוכו ממתין למחיר — וזה **בדיוק** התרחיש שהבקשה של חטיבה ב' מבקשת "יוצג בבירור למה — לא להשמיט אותו בשקט".

#### התיקון

**`src/admin/WasteReport.tsx`**:
- `ReportBatch` interface: הוספת `costMissingReason: "noRecipe" | "unpricedIngredient" | null`.
- ב-`generateReport()`: לחשב `costMissingReason = recipeVersionId === null ? "noRecipe" : (costPerUnitSnapshot === null ? "unpricedIngredient" : null)`.
- ב-`summarize()`: להחליף `batchesWithoutCost: number` בפירוט:
  ```ts
  batchesWithoutCostByReason: { noRecipe: number; unpricedIngredient: number };
  productsAwaitingPrice: string[]; // שמות מוצרים ייחודיים עם reason==="unpricedIngredient", ל"קישור ישיר להשלמה"
  ```
- ה-JSX: להחליף את המשפט היחיד בשני משפטים מותנים (כל אחד רק אם > 0):
  - `"X אצוות בטווח בלי מתכון בזמן ההכנה — לא ניתן לחשב עלות רטרואקטיבית."` (reason=noRecipe, לא ניתן לפעולה).
  - `"X אצוות בטווח שהוכנו לפי מתכון עם מרכיב שממתין למחיר (Y מוצרים: [רשימה]) — לכן לא נכללות בחישוב."` + כפתור **"השלמת מחירים"** (reason=unpricedIngredient, ניתן לפעולה — **קישור ישיר**, בדיוק כמו הבקשה בסעיף א.4).
- Prop חדש ל-`WasteReport`: `onGoToIngredients?: () => void` — **אותה callback בדיוק** שכבר הוגדרה ב-`AdminDashboard.tsx` עבור `PendingPriceBanner` (סעיף א.4) — עקביות/שימוש חוזר, לא callback שנייה נפרדת.

**`src/admin/AdminDashboard.tsx`**: להעביר את אותו `goToIngredients` גם ל-`<WasteReport onGoToIngredients={goToIngredients} />`.

**`src/admin/exportWasteReportPdf.ts`**: אין קישור לחיצה אפשרי בדף מודפס — רק טקסט. להוסיף שורה בסיכום: `"מוצרים עם מרכיב הממתין למחיר (לא נכללים בחישוב): [שמות]"` כשה-`productsAwaitingPrice` לא ריק. `Summary` interface בקובץ הזה (מיובא מ-`WasteReport.tsx`) צריך לכלול את השדה החדש.

#### בדיקות

Playwright: יצירת מוצר עם מתכון שמכיל מרכיב ללא מחיר → יצירת אצווה ממנו → השלכה → דוח פחת: לוודא שההודעה הספציפית ("מרכיב שממתין למחיר") מופיעה, שם המוצר מופיע ברשימה, וכפתור "השלמת מחירים" מוביל ללשונית מרכיבים. **בנפרד**, אצווה של מוצר בלי שום מתכון (`recipeVersionId===null`) → לוודא שההודעה השנייה ("לא היה מתכון") מופיעה, לא הראשונה.

### ב.2 — התאמת `staff.isShiftManager` (כבר נבנה בא.8)

אין עבודה נוספת כאן — רק לוודא, כחלק מרגרסיית חטיבה ב', שהמעבר בין `worker`/`shiftManager`/`owner` עדיין תואם למודל התלת-שכבתי המתועד (בדיקת עשן חוזרת, לא קוד חדש).

### ב.3 — בדיקות הרשאה ייעודיות חדשות

#### `tests/functions.test.js`

בדיקות חדשות שממלאות פערי כיסוי אמיתיים (אומתו בקריאת הקובץ — הפונקציות האלה **לא** מוזכרות היום בשום assertion):

1. **`getRecipeVersionForEdit` מצנזר עלויות ל-shiftManager**: ליצור עלות דרך owner (מרכיב עם מחיר → מוצר → מתכון), ואז לקרוא `getRecipeVersionForEdit` פעם כ-owner (`totalCostSnapshot`/`costPerUnitSnapshot`/`pricePerUnitSnapshot`/`lineCostSnapshot` **קיימים** בתשובה) ופעם כ-shiftManager (אותם שדות **לא קיימים בכלל** באובייקט — `assert.equal(data.totalCostSnapshot, undefined)` וכו', לא רק `!== value` — כדי לתפוס גם מקרה של דליפה בתור `null` בטעות).
2. **`listIngredients` מצנזר `currentPricePerUnit` ל-shiftManager**: owner מקבל את השדה (עם ערך), shiftManager מקבל אובייקט **בלי** את המפתח בכלל (`assert.equal("currentPricePerUnit" in item, false)` לכל פריט), שניהם מקבלים `priceStatus`.
3. **`worker` role נדחה מכל פעולות "מגדיר מה מכינים"**: `createProduct`, `createIngredient`, `createRecipeVersion`, `updateProduct` — כל אחת בנפרד, קריאה עם session מסוג `worker` (דרך `startWorkerSession`, לא `callAsOwner`/`callAsStaff`) → `permission-denied`. **לא קיים כיום שום test עם session מסוג worker על הפונקציות האלה** (רק shiftManager עם שדה אסור, ו-owner מוצלח).
4. **`verifyStaffPin` דוחה עובד/ת עם `isShiftManager: false`** — כבר מכוסה בבדיקה שנוספה בא.8 (ראו שם), אין כפילות.

#### `tests/rules.test.js`

חסר כיסוי מלא ל-role `worker` — כל הבדיקות הקיימות בודקות רק `anon`/`owner`/`shiftManager`. להוסיף:
```js
function workerCtx(businessId) {
  return testEnv.authenticatedContext(`worker_${businessId}`, {
    businessId,
    role: "worker",
  });
}
```
ובדיקה חדשה, מקבילה ל-`"shiftManager יכול לקרוא רק מוצרים/אצוות/התראות..."` הקיימת, עם אותם assertions בדיוק אבל על `workerCtx` — לוודא ש-`isWorker()` ב-Rules (שכבר קיימת בקובץ, ראו `firestore.rules`) באמת חוסמת `ingredients`/`recipeVersions`/`staff`/`auditLog` בדיוק כמו `shiftManager`, לא רק שהפונקציה קיימת בתחביר.

### ב.4 — עדכון תיעוד (CLAUDE.md + DATA_MODEL.md)

#### `CLAUDE.md`

בסעיף **"החלטות מוצר נעולות"**, להחליף את המשפט:
> "הרשאות דו-שכבתיות: בעל/ת העסק (קוד מנהל, גישה מלאה כולל דוחות כספיים ורווחיות) מול מנהל/ת משמרת (PIN אישי, מוגבל לטאבלט בלבד — פתיחת אצוות מוצרים קיימים וסימונן כטופלו/פג תוקף/הושלכו). מנהל משמרת לא יכול להוסיף מוצר/מרכיב חדש, לשנות מחיר או חיי מדף."

ב:
> "**הרשאות תלת-שכבתיות** (עודכן בשלב 16 — ראו למטה): (1) עובד/ת רגיל/ה, בלי התחברות — יצירת אצוות, סימון נוצל/הושלך, עדכון כמות, בחירת שם מרשימת עובדים. (2) מנהל/ת משמרת, PIN אישי שנקבע ידנית ע"י הבעלים לעובד/ת ספציפי/ת (לא כל עובד/ת אוטומטית מנהל/ת משמרת) — כל מה שלמעלה, ובנוסף הוספת מוצר חדש/שינוי חיי מדף, הוספת מרכיב חדש (שם+יחידה בלבד — **שדה המחיר לא מוצג לו/ה בכלל**, לא רק חסום), הגדרת מתכון (כמויות+תפוקה) — בלי חשיפה לשום נתון כספי בשום מסך. (3) בעל/ת העסק (Google, `/admin`) — הכל, ובלעדית: מחירים, דוחות פחת ורווחיות, ניהול צוות, יומן פעולות."

ולהוסיף הערה קצרה שמסבירה את השינוי (חשוב לשקיפות היסטורית):
> "**הערה**: הניסוח שהיה כאן קודם ('מנהל משמרת לא יכול להוסיף מוצר/מרכיב חדש') כבר לא תאם את הקוד בפועל מאז שלבים 9–14, שהרחיבו בהדרגה את יכולות מנהל/ת המשמרת בלי לעדכן את הבולט הזה. שלב 16 יישר את התיעוד מול המימוש בפועל, סגר את הפער האמיתי שכן היה קיים (הפרדת עובד/ת רגיל/ה ממנהל/ת משמרת — כל עובד/ת שהתווסף/ה הפך/ה אוטומטית למנהל/ת משמרת, ראו שלב 15), ותיקן חוסר-בהירות בדוח הפחת לגבי הסיבה שאצווה לא נכללת בחישוב."

בסוף רשימת השלבים, להוסיף שני ערכים חדשים (15 ו-16) בסגנון הקיים, אחרי סיום המימוש בפועל (לא לפני!) — עם תיאור מה נבנה, אילו קבצים, אילו בדיקות רצו בפועל, מה נשאר פתוח.

#### `DATA_MODEL.md`

- סעיף `staff/{staffId}`: הוספת `isShiftManager: boolean` (ראו א.8).
- סעיף `batches/{batchId}`, שדה `status`: הערה שסטטוס `expired` עדיין נתמך בשרת אבל אין יותר כפתור ייעודי בטאבלט (ראו א.5) — "פג תוקף" מתבצע כ"הושלך" + סיבה.
- ה"פתוח לשלב מאוחר יותר"/"מה עוד לא נבנה" — לבדוק אם צריך עדכון (כנראה לא, זה לא נוגע לפערים שם).

---

## סדר ביצוע מומלץ (חטיבה ב')

1. ב.1 — תיקון WasteReport (עצמאי מבחינה טכנית, אבל הגיוני לעשות אחרי שא.4 כבר קיים כי חולק callback).
2. ב.3 — בדיקות הרשאה חדשות (functions.test.js + rules.test.js).
3. ב.4 — עדכון CLAUDE.md + DATA_MODEL.md.
4. רגרסיה מלאה: `npm --prefix functions run build && npm --prefix functions run lint && npm --prefix functions run typecheck`, `npx firebase emulators:exec --only auth,firestore,functions --project demo-expiry-tracker "node --test tests/functions.test.js"`, `npx firebase emulators:exec --only firestore --project demo-expiry-tracker "node --test tests/rules.test.js"`, `npm run lint`, `tsc -b && vite build`.
5. אימות Playwright: shiftManager עובר על **כל** מסך בטאבלט (כולל "מוצרים ומרכיבים", עורך מתכון) ומוודאים ויזואלית שאין שום ₪/מספר כספי בשום מקום — לא רק בדיקת קוד.

---

## סיכום קבצים שישתנו (מפה מהירה)

**חדשים:**
- `src/screens/OwnerLoginDialog.tsx`
- `src/screens/StaffLoginDialog.tsx`
- `src/lib/currency.ts`
- `src/admin/PendingPriceBanner.tsx`

**נמחקים:**
- `src/screens/LoginScreen.tsx`

**חטיבה א' — שינויים:**
- `src/components/IngredientFormDialog.tsx` (א.1 — `stopPropagation`; א.3 — לייבל ₪)
- `functions/src/auth/setStaffPin.ts` (א.8)
- `functions/src/auth/verifyStaffPin.ts` (א.8)
- `functions/src/staff/listActiveStaffNames.ts` (א.8)
- `src/admin/StaffFormDialog.tsx` (א.8)
- `src/admin/TeamManagement.tsx` (א.8)
- `tests/functions.test.js` (א.8 seed + בדיקות חדשות)
- `functions/scripts/seedDemo.ts` (א.8 seed)
- `src/screens/TabletDashboard.tsx` (א.2, א.5)
- `src/components/BatchRow.tsx` (א.5, א.6, א.7)
- `src/index.css` (א.5 — `.batch-info-action`)
- `src/lib/expiry.ts` (א.7)
- `src/components/RecipeEditorDialog.tsx` (א.3)
- `src/admin/ProductsManagement.tsx` (א.3 — רק תא הטבלה; `focusIngredients` prop כבר קיים)
- `src/admin/WasteReport.tsx` (א.3)
- `src/admin/exportWasteReportPdf.ts` (א.3)
- `src/admin/AdminDashboard.tsx` (א.4)
- `DATA_MODEL.md` (א.8, א.5 הערה)

**חטיבה ב' — שינויים נוספים (לא כפולים למעלה):**
- `src/admin/WasteReport.tsx` (ב.1 — בנוסף לא.3)
- `src/admin/exportWasteReportPdf.ts` (ב.1 — בנוסף לא.3)
- `src/admin/AdminDashboard.tsx` (ב.1 — prop נוסף ל-WasteReport)
- `tests/functions.test.js` (ב.3)
- `tests/rules.test.js` (ב.3)
- `CLAUDE.md` (ב.4)
- `DATA_MODEL.md` (ב.4)

---

## מה **לא** בתוכנית הזו (במפורש, כדי שלא יתערבב)

- שום שינוי ל-Firestore Rules בפועל (`firestore.rules`) — נבדק שהם כבר תואמים למודל המבוקש במלואו, אין צורך בשינוי אפילו שורה אחת שם.
- שום Portal / שינוי ארכיטקטוני לדיאלוגים (נשקל עבור א.1, נדחה — ראו שם).
- שום תשתית בדיקות חדשה (Jest/RTL) — לא התבקש, לא קיים בריפו היום.
- ארכוב טכני אצוות בנות שנה, `settings.defaultPartialUsageUpdateFrequency` ברמת עסק, אמינות ה-Scheduled Function בענן אמיתי — כל הפערים הפתוחים הידועים האלה (מ"מה עדיין חסר" ב-CLAUDE.md) **לא קשורים** לתוכנית הזו ולא נוגעים בה.
