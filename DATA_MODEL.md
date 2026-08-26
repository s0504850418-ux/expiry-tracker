# מבנה נתונים — Firestore

מסמך זה מתעד את מבנה ה-Firestore בפועל כפי שמומש בקוד. הוא הראשון מסוגו בריפו: `CLAUDE.md` הפנה אליו כמסמך קיים, אך בפועל הוא לא נמצא כאן — ייתכן שהוא נמצא רק במסמך האפיון המלא אצל בעל הפרויקט. **המבנה שלהלן הוא תכנון שנגזר מההחלטות הנעולות ב-`CLAUDE.md`**, לא העתקה ממקור קיים. אם קיים מסמך אפיון עם מבנה שונה — יש להשוות ולעדכן.

## עקרונות מנחים (מ-CLAUDE.md)

- **Multi-tenant**: כל עסק (מסעדה) מבודד לחלוטין תחת `businesses/{businessId}`.
- **אין כתיבה ישירה מהלקוח לשום דבר רגיש** — כל הכתיבות הרגישות עוברות Cloud Functions עם Admin SDK. Firestore Rules בפועל הן `allow write: if false` כמעט בכל מקום (ראו `firestore.rules`).
- **אין מחיקה לעולם** — סטטוסים בלבד.
- **אצווה (Batch) היא הישות המרכזית.**

## זהות והרשאות (איך זה עובד בפועל)

אין הרשמת משתמשים פתוחה. זיהוי מתבצע כך:

1. **בעל/ת העסק** מתחבר/ת ל-`/admin` עם **Google** (כתובת Gmail מורשית מראש, ראו `secrets/googleAccess` למטה) — **לא** מהטאבלט. **מנהל/ת משמרת** מזינה PIN אישי בטאבלט.
2. ה-PIN נשלח ל-Cloud Function ניתנת-לקריאה (`verifyStaffPin`) שמאמתת אותו מול hash (bcrypt) השמור בצד השרת בלבד — לעולם לא נשלח/נשמר בטקסט גלוי, ולעולם לא נגיש לקריאה מהלקוח. **`verifyOwnerCode`/"קוד מנהל" עדיין קיימים בשרת** (נבדקים ב-`tests/functions.test.js`, ומשמשים את `bootstrapBusiness.ts` ליצירת העסק הראשוני) — אבל **אין להם עוד שום UI לקוח**; הוסרו מהטאבלט (ראו CLAUDE.md, "הסרת כניסת בעלים מהטאבלט") כי בעל/ת העסק כבר עובד/ת מ-`/admin` עם Google בפועל, וקיום הדרך השנייה רק בילבל.
3. בהצלחה, הפונקציה יוצרת **custom token** של Firebase Auth עם **custom claims**: `{ businessId, role: 'owner' | 'shiftManager', staffId? }`. ה-uid נבנה דטרמיניסטית (`owner_{businessId}` או `staff_{businessId}_{staffId}`).
4. הלקוח מתחבר עם ה-custom token (`signInWithCustomToken`). מרגע זה יש לו `request.auth` עם ה-claims, ולכן יכול **לקרוא** (בלבד) את מה שמותר לו לפי Firestore Rules.
5. כל פעולה שמשנה נתונים (יצירת אצווה, שינוי סטטוס, יצירת מוצר, שינוי מחיר וכו') **עדיין** עוברת דרך Cloud Function ייעודית שמאמתת את ה-role מתוך ה-ID token ומבצעת את הכתיבה בעצמה עם Admin SDK. הלקוח **לעולם** לא כותב ל-Firestore ישירות.
6. הגנת brute-force: כל מסמך secret שומר `failedAttempts` ו-`lockedUntil` — אחרי מספר ניסיונות כושלים רצופים יש נעילה זמנית (ראו `functions/src/lib/pin.ts`).

**פתוח לשלב מאוחר יותר (לא נבנה כאן):** איך בדיוק טאבלט "משוייך" לעסק מסוים בפעם הראשונה (pairing) — לצורך שלב 2 ה-Cloud Functions מקבלות `businessId` כפרמטר מפורש; זרימת ה-UI לשיוך התקן תיבנה בשלב 3 (מסך הטאבלט) או 7 (מסך ניהול). יצירת העסק הראשון וקוד המנהל הראשוני נעשית כרגע רק דרך סקריפט אדמין ידני (`functions/scripts/bootstrapBusiness.ts`), לא דרך UI — זה מתאים למסעדת פיילוט יחידה, לא SaaS עם הרשמה עצמית.

## אוסף `businesses/{businessId}`

```
name: string
active: boolean
createdAt: Timestamp
settings: {
  defaultPartialUsageUpdateFrequency: 'endOfBatchLife' | 'endOfDay'
}
```
כתיבה: רק Admin SDK. קריאה: owner/shiftManager של אותו עסק בלבד.

**פער שנמצא בסקירה עצמית (2026-08-03, ראו CLAUDE.md שלב 11), חלקית תוקן בשלב 12:** המנגנון עצמו (`updateBatchQuantity`, UI, תזכורת) **נבנה בשלב 12** — אבל רק ברמת המוצר, כשה-`partialUsageUpdateFrequency` שלו מוגדר במפורש ל-`'endOfDay'`. `settings.defaultPartialUsageUpdateFrequency` (ברמת העסק, עבור מוצרים עם `partialUsageUpdateFrequency: null`) עדיין נכתב ב-`bootstrapBusiness.ts` בלבד ואף קוד לא קורא אותו — פער שנשאר פתוח במפורש. ראו הפירוט המלא ב-CLAUDE.md.

### תת-אוסף `businesses/{businessId}/secrets/owner`

```
codeHash: string        // bcrypt
failedAttempts: number
lockedUntil: Timestamp | null
updatedAt: Timestamp
```
**חסום לחלוטין ללקוח** (read+write: false). רק Admin SDK נוגע בזה.

### מסמך `businesses/{businessId}/secrets/googleAccess`

```
ownerEmails: string[]    // כתובות Gmail מורשות לכניסה למסך הניהול
```
**חסום לחלוטין ללקוח**, כמו `secrets/owner` (אותו כלל wildcard ב-Rules). נבדק ע"י `claimOwnerAccessViaGoogle` (Cloud Function) אחרי התחברות Google — לא ב-Rules, כי הלקוח לעולם לא קורא את זה ישירות. מנוהל דרך `addAuthorizedOwnerEmail` (owner-only, מזוהה/ת דרך קוד מנהל קיים).

### תת-אוסף `businesses/{businessId}/staff/{staffId}`

```
name: string
active: boolean
isShiftManager: boolean  // נוסף בשלב 15. false = עובד/ת רגיל/ה (בלי PIN,
                          // לא יכול/ה להתחבר כמנהל/ת משמרת — רק להופיע
                          // ברשימת "מי הכין"). true = יש staffSecrets תואם.
createdAt: Timestamp
createdByUid: string
```
כתיבה: רק Admin SDK (דרך `setStaffPin` / עדכון עתידי). קריאה: owner בלבד (מנהל/ת משמרת לא צריכה לראות רשימת עובדים אחרים).

### תת-אוסף `businesses/{businessId}/staffSecrets/{staffId}`

```
pinHash: string         // bcrypt
failedAttempts: number
lockedUntil: Timestamp | null
updatedAt: Timestamp
```
**חסום לחלוטין ללקוח**, כמו `secrets/owner`.

### תת-אוסף `businesses/{businessId}/products/{productId}`

```
name: string
nameLower: string        // לבדיקת ייחודיות שם, case-insensitive
unit: 'kg' | 'liter' | 'unit'     // קבוע למוצר, אין המרה בין יחידות
shelfLifeMinutes: number
partialUsageUpdateFrequency: 'endOfBatchLife' | 'endOfDay' | null   // null = להשתמש בברירת המחדל של העסק
notifyBeforeExpiryMinutes: number | null   // כמה דקות לפני תפוגה לשלוח התראה; null = להשתמש בערך ברירת המחדל הגלובלי (owner-only, כמו חיי מדף ומחיר — ראו CLAUDE.md)
currentRecipeVersionId: string | null
active: boolean          // false = מוצר הופסק, לא נמחק
createdAt: Timestamp
updatedAt: Timestamp
```
כתיבה: רק Admin SDK. קריאה: owner/shiftManager (שניהם צריכים לראות מוצרים כדי ליצור/לסרוק אצוות). **שם ייחודי בעסק נאכף ברמת ה-Cloud Function** (בדיקת `nameLower` לפני יצירה/שינוי שם) — Firestore עצמו לא תומך באילוץ ייחודיות מובנה.

### תת-אוסף `businesses/{businessId}/ingredients/{ingredientId}`

```
name: string
unit: string
currentPricePerUnit: number
active: boolean
createdAt: Timestamp
updatedAt: Timestamp
```
כתיבה: רק Admin SDK. קריאה: **owner בלבד** (מחירים = נתון כספי, לפי "גישה מלאה כולל דוחות כספיים ורווחיות" לבעלים בלבד).

### תת-אוסף `businesses/{businessId}/products/{productId}/recipeVersions/{versionId}`

```
versionNumber: number
ingredients: [{
  ingredientId: string,
  ingredientNameSnapshot: string,
  quantity: number,
  unit: string,
  pricePerUnitSnapshot: number,
  lineCostSnapshot: number
}]
yieldQuantity: number       // כמה יוצא מהמתכון, ביחידת המוצר (למשל 20 ליטר) — ראו CLAUDE.md, "תפוקת מתכון"
totalCostSnapshot: number   // עלות הכנה אחת מלאה של המתכון (סכום lineCostSnapshot)
costPerUnitSnapshot: number // = round2(totalCostSnapshot / yieldQuantity), מחושב ונשמר בזמן היצירה
createdAt: Timestamp
createdByUid: string
```
שינוי מתכון = מסמך חדש (גרסה חדשה), לעולם לא עריכה של גרסה קיימת. אצווה שומרת `recipeVersionId` — עדכון מחיר מרכיב משפיע רק על גרסאות עתידיות כי המחיר נשמר כ-snapshot. **שמירה עם בדיוק אותם מרכיבים/כמויות/תפוקה כמו הגרסה הנוכחית לא יוצרת גרסה חדשה** (`createRecipeVersion` בודקת זהות תוכן לפני כתיבה ומחזירה `unchanged:true` על הגרסה הקיימת) — מונע קפיצת מספר גרסה משמירות חוזרות בלי שינוי אמיתי. כתיבה: רק Admin SDK. קריאה: owner בלבד (עלויות = כספי).

**חשיפה חלקית ל-shiftManager**: `costPerUnitSnapshot`/`pricePerUnitSnapshot`/`lineCostSnapshot`/`totalCostSnapshot` הם נתון כספי ונשארים owner-only לגמרי (גם ב-Rules וגם בכל קריאה ישירה). כדי שמנהל/ת משמרת עדיין יוכל/תוכל לראות **כמויות** מרכיבים (לא מחירים) ביצירת אצווה, יש Cloud Function ייעודית — `getRecipePreview({businessId, productId})` — שקוראת את המסמך הזה בצד השרת (Admin SDK) ומחזירה רק `{ingredientNameSnapshot, unit, perUnitQuantity}` לכל שורה (`perUnitQuantity = quantity/yieldQuantity`), בלי אף שדה כספי. אותה תבנית כמו `listActiveStaffNames`.

### תת-אוסף `businesses/{businessId}/batches/{batchId}`

```
productId: string
productNameSnapshot: string
unit: string                      // snapshot מהמוצר
recipeVersionId: string | null
quantity: number                  // כמות נוכחית/שנותרה; מתעדכנת ב-updateBatchStatus (מעבר לסטטוס סופי) וב-updateBatchQuantity (שימוש חלקי באמצע חיי אצווה active) — שני המקומות היחידים, אין היסטוריית עדכונים
preparedQuantity: number          // הכמות שהוכנה בפועל ביצירה — קבועה לעולם, לא מתעדכנת אף פעם (גם לא ע"י updateBatchQuantity). עלות האצווה בפועל = recipeVersion.costPerUnitSnapshot * preparedQuantity (לא totalCostSnapshot הגולמי — ראו סעיף recipeVersions למעלה); הדוח מייחס לפחת רק את החלק היחסי (quantity/preparedQuantity) בזמן ההשלכה הסופית
quantityLastUpdatedAt: Timestamp  // זמן העדכון האחרון של quantity; נכתב ביצירה (=preparedAtServer) ומתעדכן ב-updateBatchQuantity בלבד (לא ב-updateBatchPrintStatus/updateBatchStatus) — משמש רק לתזכורת "עודכן היום?" ב-endOfDay (ראו src/lib/quantityReminder.ts), לא לדוח הכספי
preparedAtClient: Timestamp       // מה שהעובד הזין במכשיר
preparedAtServer: Timestamp       // זמן קבלה בשרת — לזיהוי חריגות/ניתוק
preparedByStaffId: string | null  // מי הכין בפועל — לתיעוד/דוח פחת-לפי-עובד בלבד, לא אימות. null = הוכן ע"י בעל/ת העסק. לא קשור ל-createdByStaffId למטה (זהות ה-session המחובר)
preparedByNameSnapshot: string    // snapshot של שם המכין/ה, עקבי עם productNameSnapshot
expiresAt: Timestamp              // מחושב מ-preparedAtClient + shelfLifeMinutes (לא מ-preparedAtServer, כדי שניתוק זמני לא יעוות את התאריך האמיתי)
status: 'active' | 'used' | 'expired' | 'discarded' | 'archived'  // 'expired' עדיין נתמך ב-updateBatchStatus בשרת, אבל מאז שלב 15 אין כפתור ייעודי אליו בטאבלט — "פג תוקף" מתבצע כ"הושלך" + discardReason="פג תוקף"
discardReason: string | null      // חובה כשסטטוס = discarded; מרשימה סגורה וקבועה מראש (ראו functions/src/lib/discardReasons.ts), לא טקסט חופשי
printStatus: 'pending' | 'printed' | 'failed'
createdByRole: 'owner' | 'shiftManager'
createdByStaffId: string | null
lastModifiedAt: Timestamp
archivedAt: Timestamp | null      // ארכוב טכני ~שנה, לא מחיקה
```
כתיבה: רק Admin SDK. קריאה: owner/shiftManager. **הישות המרכזית של המערכת** — כל דוח, סריקת QR והיסטוריה מתייחסים ל-batchId.

### תת-אוסף `businesses/{businessId}/auditLog/{logId}`

```
action: string                    // למשל 'batch.statusChanged', 'staff.pinSet'
performedByUid: string            // request.auth.uid בזמן הפעולה
performedByRole: 'owner' | 'shiftManager' | 'system'
performedByStaffId: string | null
deviceUid: string                 // = performedByUid בפועל, כי ה-uid צמוד למכשיר/למשתמש שהתחבר בו
targetType: string
targetId: string
metadata: map                     // פרטים ספציפיים לפעולה
createdAt: Timestamp
```
**בלתי ניתן לעריכה מצד הלקוח** — כתיבה: רק Admin SDK בתוך כל Cloud Function רגישה. קריאה: owner בלבד.

### תת-אוסף `businesses/{businessId}/notifications/{notificationId}`

```
type: string                      // 'batchExpiringSoon' | 'batchExpired'
batchId: string
status: 'pending' | 'acknowledged'
createdAt: Timestamp
lastRemindedAt: Timestamp
acknowledgedAt: Timestamp | null
acknowledgedByStaffId: string | null
```
בתוך המכשיר בלבד (לא וואטסאפ/SMS), תזכורת חוזרת אם לא טופלה. **עודכן (שלב 9, 2026-08-03): נבנה בפועל.** `checkExpiringBatches` (Scheduled Function, כל שעה) בודקת אצוות `active` ויוצרת/משדרגת התראה לפי `notifyBeforeExpiryMinutes` הספציפי של המוצר (או ברירת מחדל גלובלית — `EXPIRING_SOON_WINDOW_MINUTES`, ראו `functions/src/lib/notificationTiming.ts`). `NotificationsPanel` בטאבלט מציג התראות `pending`; "טיפול" = שינוי סטטוס האצווה בפועל (`updateBatchStatus` מסמנת `acknowledged` אוטומטית). **פער נפרד עדיין פתוח**: ה-Scheduled Function מעולם לא נבדקה דרך Cloud Scheduler האמיתי (לא כאן, לא בייצור) — ראו CLAUDE.md, "מה עדיין חסר".

## מה עוד לא נבנה בשלב 2 (בכוונה)

- לוגיקת FEFO/UI (שלב 3), ניהול מתכונים בפועל מעבר לסכמה (שלב 4), QR/הדפסה (שלב 5), עבודה אופליין וסנכרון (שלב 6), Google login למסך ניהול ודוחות (שלב 7).
- Cloud Functions ליצירה/עדכון בפועל של אצוות ומוצרים (`createBatch`, `updateBatchStatus`, `createProduct` וכו') — שלב 2 בונה את **תשתית הזהות וההרשאות** (`verifyOwnerCode`, `verifyStaffPin`, `setStaffPin`, `setOwnerCode`, `bootstrapBusiness`) ואת ה-Rules, לא את כל ה-Cloud Functions העסקיות. אלה יתווספו בהדרגה בשלבים 3-5 לפי הצורך, ויכתבו מעל אותו דפוס אימות (role מתוך custom claims + כתיבה רק דרך Admin SDK).
