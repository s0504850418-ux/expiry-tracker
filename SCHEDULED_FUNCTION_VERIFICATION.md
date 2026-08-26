# אימות `checkExpiringBatches` בייצור אמיתי — תוכנית עבודה

מסמך זה מפרט את הצעדים המדויקים הדרושים כדי לוודא בפועל, ב-Google Cloud
Console, שהפיצ'ר **היחיד שהוגדר חובה לפיילוט** (התראות תפוגה בתוך המכשיר —
ראו CLAUDE.md, "מה המערכת") רץ בייצור בצורה אמינה. עד כה `checkExpiringBatches`
נבדקה **רק** דרך קריאה ישירה ל-`processBusiness` מתוך `tests/functions.test.js`
(מול Firestore Emulator אמיתי) — הלוגיקה העסקית נבדקה, אבל **מנגנון
ה-scheduling עצמו (Cloud Scheduler) מעולם לא רץ**, לא כאן (Pub/Sub Emulator לא
עולה בסביבת הפיתוח הזו על Windows) ולא בענן. זה פער שונה במהותו מבאג בלוגיקה:
גם קוד תקין ב-100% לא עוזר אם ה-scheduler שמפעיל אותו לא מוגדר/לא רץ/נכשל
בשקט.

**דרישת קדם שאין לדלג עליה**: פרויקט Firebase אמיתי (לא placeholder) בתוכנית
**Blaze** (pay-as-you-go) — Cloud Scheduler אינו זמין בתוכנית Spark החינמית.
כל הצעדים למטה מניחים שהפרויקט כבר משודרג ל-Blaze ושבוצע `firebase deploy
--only functions` בהצלחה לפחות פעם אחת.

---

## שלב 0 — פריסה

```
firebase use production   # או development, לפי הסביבה שנבדקת
firebase deploy --only functions
```

בסיום, פלט ה-CLI אמור לפרט את כל 17 הפונקציות שנפרסו, כולל
`checkExpiringBatches` — **אם היא לא מופיעה ברשימה, שום דבר למטה לא רלוונטי**,
יש לחזור ולבדוק שגיאות build/deploy קודם.

---

## שלב 1 — אימות שנוצרה עבודת Cloud Scheduler

**מיקום**: Google Cloud Console → **Cloud Scheduler** (לא Cloud Functions —
זו הטעות הכי נפוצה, כי היעד בפועל הוא job נפרד שמפעיל את הפונקציה, לא
הפונקציה עצמה).

1. לוודא שקיים job בשם דומה ל-`firebase-schedule-checkExpiringBatches-us-central1`
   (הפורמט הסטנדרטי: `firebase-schedule-<שם הפונקציה>-<region>`; הפרויקט לא
   קובע region במפורש בקוד, אז ברירת המחדל של Firebase Functions v2 היא
   `us-central1`).
2. עמודת **Frequency**: אמורה להראות `every 60 minutes` (כך מוגדר בקוד,
   `functions/src/notifications/checkExpiringBatches.ts`) — לא cron expression
   ריק/שונה.
3. עמודת **Status**: **Enabled** (לא Paused). אם מושהה — לחיצה על שלוש הנקודות
   → Resume.
4. לפתוח את ה-job ולבדוק את לשונית **Configuration**: סוג היעד (Target type)
   אמור להיות HTTP, עם כתובת שמצביעה לשירות ה-Cloud Run של הפונקציה (ב-Cloud
   Functions v2, scheduled functions רצות מעל Cloud Run מתחת למכסה המנוע) —
   ולא ריק/שגוי.

**אם ה-job לא קיים בכלל** אחרי deploy מוצלח — זה כשל אמיתי, לא רק "עוד לא
נבדק". יש לבדוק את לוגי ה-deploy (`firebase deploy --only functions --debug`)
לשגיאות מסוג `PERMISSION_DENIED` על יצירת Cloud Scheduler jobs (חשבון
ה-deploy צריך את ההרשאה `roles/cloudscheduler.admin` או שקול, בנוסף
להרשאות הרגילות של פריסת Functions).

---

## שלב 2 — הרצה ידנית מיידית ("Run Now"), בלי לחכות לשעה עגולה

בתוך אותו job ב-Cloud Scheduler: כפתור **"Force run"** (בעברית בממשק לפעמים
"הפעל עכשיו"). זה מדמה בדיוק את מה שהתזמון האמיתי יעשה, אבל מיידית — לא צריך
לחכות עד לשעה העגולה הבאה כדי לדעת אם זה עובד.

מיד אחרי הלחיצה, לבדוק את עמודת **Last run result** באותה שורה בטבלת ה-jobs:
- `Success` (קוד 200 מהיעד) — המשך לשלב 3 לאימות שגם הלוגיקה הפנימית רצה
  נכון, לא רק שההזמנה הגיעה.
- `Failed` — ללחוץ על ה-job לפרטים; לרוב יופיע קוד שגיאה HTTP (403 = בעיית
  IAM, ראו שלב 4; 500 = הפונקציה עצמה זרקה שגיאה, ראו שלב 3 ללוגים).

---

## שלב 3 — אימות בלוגים שהריצה בפועל עשתה את מה שצריך

**מיקום**: Google Cloud Console → **Cloud Logging** (או "Logs" מתוך מסך
הפונקציה ב-Cloud Functions ישירות — אותו מידע).

מסנן מומלץ ב-Logs Explorer:
```
resource.type="cloud_run_revision"
resource.labels.service_name="checkexpiringbatches"
```
(שם השירות ב-Cloud Run הוא שם הפונקציה באותיות קטנות; אם לא בטוחים בשם
המדויק — אפשר גם לפתוח ישירות Cloud Functions → `checkExpiringBatches` →
לשונית **Logs**, זה אותו מקור נתונים עם סינון אוטומטי).

מה לחפש:
1. שורת התחלה/סיום ריצה תקינה (Cloud Functions מתעד אוטומטית תחילת/סיום כל
   invocation, כולל משך זמן).
2. **אין** שורות `logger.error("checkExpiringBatches: processBusiness נכשל
   לעסק", ...)` — זו שורת השגיאה הספציפית שהקוד עצמו כותב כשעיבוד עסק בודד
   נכשל (ראו הקובץ, שורה ~115). אם היא מופיעה — יש businessId ספציפי בתוך
   ה-metadata של השורה שכשל, שימושי לאבחון (הרשאות/מסמך פגום/וכו').
3. **אין** שגיאות runtime גולמיות (unhandled exception, timeout) — אלה
   יופיעו כ-severity ERROR בלי הפורמט המובנה של השורה למעלה, ומעידות על באג
   שלא נתפס ב-try/catch של `checkExpiringBatches` עצמה (רק כשל *לעסק בודד*
   נתפס — ראו ההערה בקוד).

**אימות עמוק יותר, לא רק "אין שגיאות"**: לפתוח את ה-Firestore Console של
הפרויקט האמיתי, ולוודא שב-collection
`businesses/{businessId}/notifications` נוצר/התעדכן מסמך עבור אצווה שקרובה
לתפוגה בפועל (אם יש כזו במסד הנתונים של הפיילוט באותו רגע) — "אין שגיאות
בלוג" לא שווה-ערך ל"המסמך הנכון נכתב". אם אין כרגע אצווה אמיתית קרובה
לתפוגה לבדוק איתה, אפשר ליצור אצווה עם `shelfLifeMinutes`/`preparedAtClient`
מכוונים כך שתהיה בתוך חלון ההתראה עכשיו, להריץ Force run, ולוודא שההתראה
נוצרה — ואז לנקות/להשליך את האצווה הזו כדי לא להשאיר "זיהום" בנתוני
הפיילוט האמיתי.

---

## שלב 4 — IAM (רק אם שלב 2 נכשל עם קוד 403/הרשאה)

בפריסה תקינה, Firebase CLI אמור להגדיר את הכל אוטומטית — כולל הענקת
`roles/run.invoker` לחשבון השירות שבו Cloud Scheduler משתמש כדי לקרוא
לפונקציה. **הצעד הזה רלוונטי רק כתגובה לכשל בפועל**, לא checklist מקדים
שצריך "לתקן" בלי סיבה:

1. Cloud Scheduler → ה-job → **Configuration** → לבדוק תחת "Auth header"
   איזה service account מוגדר (בברירת מחדל: חשבון השירות המחושב של הפרויקט,
   `PROJECT_NUMBER-compute@developer.gserviceaccount.com`).
2. IAM & Admin → לוודא שלאותו service account יש את התפקיד **Cloud Run
   Invoker** (`roles/run.invoker`) על שירות ה-Cloud Run של הפונקציה
   הספציפית (או ברמת הפרויקט).
3. אם חסר — להוסיף ידנית (Grant Access), ואז לחזור לשלב 2 ולנסות Force run
   שוב.

---

## שלב 5 — לוודא שזה לא "עבד פעם אחת במקרה"

הרצה מוצלחת בודדת (שלב 2) לא מוכיחה אמינות לאורך זמן. אחרי השלמת שלבים
1–4 בהצלחה:

1. לחכות/לבדוק אחרי **2–3 מחזורי שעה טבעיים** (בלי Force run — התזמון האמיתי)
   שעמודת **Last run result** בטבלת ה-jobs ממשיכה להראות `Success` ברצף, לא
   רק בפעם שנבדקה ידנית.
2. לבדוק בלשונית **History** של ה-job (ב-Cloud Scheduler) את רצף ההרצות
   האחרונות — מחפשים דפוס עקבי, לא כשלים מתחלפים.

---

## שלב 6 — חיווט התראה בסיסית לכשל שקט (Cloud Monitoring)

זה מנגנון הבטיחות המרכזי של הפיצ'ר: אם ה-scheduler מתחיל להיכשל בשקט (למשל
בעיית quota, שינוי IAM לא מכוון, קוד ששבור מ-deploy עתידי), **אף אחד לא
ידע** בלי alert מפורש — ה-UI בטאבלט פשוט יפסיק לקבל התראות חדשות בלי הודעת
שגיאה גלויה למי שמשתמש/ת במערכת.

1. Google Cloud Console → **Monitoring** → **Alerting** → **Create Policy**.
2. **Select a metric**: `Cloud Run Revision` → `Request Count`, עם פילטר
   `service_name = checkexpiringbatches` ו-`response_code_class != 2xx`
   (או, דרך שקולה: metric `Cloud Function` → `Execution count` מסונן
   ל-`function_name = checkExpiringBatches` ו-`status = error`, תלוי אילו
   metrics זמינים בפועל בזמן ההגדרה — הממשק משתנה מעת לעת, לוודא בזמן אמת
   מול הקונסולה).
3. **Configure trigger**: "Any time series violates" → threshold `> 0`, על
   חלון של, למשל, שעה אחת (כך שכשל בודד לא מייצר רעש, אבל רצף כשלים כן
   מתריע).
4. **Notification channel**: כתובת Gmail של בעל/ת הפרויקט (או ערוץ אחר לפי
   העדפה) — **חובה להוסיף לפני שמירת המדיניות**, מדיניות בלי ערוץ התראה לא
   שווה כלום.
5. שם למדיניות: משהו מזוהה בבירור, למשל `checkExpiringBatches – כשל בהרצה
   מתוזמנת`.
6. **לבדוק שהערוץ עצמו עובד** — רוב הממשקים מאפשרים לשלוח התראת בדיקה
   (Test notification) לפני סגירת האשף; לא לדלג על זה.

---

## הגדרת "גמור" — checklist מסכם

- [ ] `firebase deploy --only functions` רץ בהצלחה על פרויקט Blaze אמיתי,
      `checkExpiringBatches` ברשימת הפונקציות שנפרסו.
- [ ] קיים Cloud Scheduler job מתאים, **Enabled**, תדירות `every 60 minutes`.
- [ ] Force run ידני מחזיר `Success`.
- [ ] לוגים מאותה הרצה נקיים משגיאות (לא `processBusiness נכשל לעסק`, לא
      unhandled exception).
- [ ] אומת ב-Firestore Console שמסמך `notifications` נכתב/עודכן בפועל
      לאצווה רלוונטית (לא רק "אין שגיאה בלוג").
- [ ] רצף של 2–3 הרצות תזמון טבעיות (לא ידניות) מצליח.
- [ ] מדיניות Alert מוגדרת ב-Cloud Monitoring, עם ערוץ התראה שנבדק בפועל.

רק אחרי שכל השורות מסומנות — אפשר להכריז על הפיצ'ר הזה כאמין לפיילוט. עד
אז, "מה עדיין חסר" ב-CLAUDE.md ממשיך לתעד את זה כפער פתוח.
