# מבנה נתונים — Firestore

מסמך זה מתעד את מבנה ה-Firestore בפועל כפי שמומש בקוד. הוא הראשון מסוגו בריפו: `CLAUDE.md` הפנה אליו כמסמך קיים, אך בפועל הוא לא נמצא כאן — ייתכן שהוא נמצא רק במסמך האפיון המלא אצל בעל הפרויקט. **המבנה שלהלן הוא תכנון שנגזר מההחלטות הנעולות ב-`CLAUDE.md`**, לא העתקה ממקור קיים. אם קיים מסמך אפיון עם מבנה שונה — יש להשוות ולעדכן.

## עקרונות מנחים (מ-CLAUDE.md)

- **Multi-tenant**: כל עסק (מסעדה) מבודד לחלוטין תחת `businesses/{businessId}`.
- **אין כתיבה ישירה מהלקוח לשום דבר רגיש** — כל הכתיבות הרגישות עוברות Cloud Functions עם Admin SDK. Firestore Rules בפועל הן `allow write: if false` כמעט בכל מקום (ראו `firestore.rules`).
- **אין מחיקה לעולם** — סטטוסים בלבד.
- **אצווה (Batch) היא הישות המרכזית.**

## זהות והרשאות (איך זה עובד בפועל)

אין הרשמת משתמשים פתוחה. זיהוי מתבצע כך:

1. **בעל עסק** מזין "קוד מנהל" (owner code) שנקבע מראש. **מנהל/ת משמרת** מזינה PIN אישי.
2. הקוד/PIN נשלחים ל-Cloud Function ניתנת-לקריאה (`verifyOwnerCode` / `verifyStaffPin`) שמאמתת אותם מול hash (bcrypt) השמור בצד השרת בלבד — לעולם לא נשלח/נשמר בטקסט גלוי, ולעולם לא נגיש לקריאה מהלקוח.
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
totalCostSnapshot: number
createdAt: Timestamp
createdByUid: string
```
שינוי מתכון = מסמך חדש (גרסה חדשה), לעולם לא עריכה של גרסה קיימת. אצווה שומרת `recipeVersionId` — עדכון מחיר מרכיב משפיע רק על גרסאות עתידיות כי המחיר נשמר כ-snapshot. כתיבה: רק Admin SDK. קריאה: owner בלבד (עלויות = כספי).

### תת-אוסף `businesses/{businessId}/batches/{batchId}`

```
productId: string
productNameSnapshot: string
unit: string                      // snapshot מהמוצר
recipeVersionId: string | null
quantity: number
preparedAtClient: Timestamp       // מה שהעובד הזין במכשיר
preparedAtServer: Timestamp       // זמן קבלה בשרת — לזיהוי חריגות/ניתוק
expiresAt: Timestamp              // מחושב מ-preparedAtClient + shelfLifeMinutes (לא מ-preparedAtServer, כדי שניתוק זמני לא יעוות את התאריך האמיתי)
status: 'active' | 'used' | 'expired' | 'discarded' | 'archived'
discardReason: string | null      // חובה כשסטטוס = discarded
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
בתוך המכשיר בלבד (לא וואטסאפ/SMS), תזכורת חוזרת אם לא טופלה — הלוגיקה בפועל (Scheduled Function שבודקת אצוות קרובות לתפוגה) תיבנה בשלב מאוחר יותר; כרגע רק המבנה קיים.

## מה עוד לא נבנה בשלב 2 (בכוונה)

- לוגיקת FEFO/UI (שלב 3), ניהול מתכונים בפועל מעבר לסכמה (שלב 4), QR/הדפסה (שלב 5), עבודה אופליין וסנכרון (שלב 6), Google login למסך ניהול ודוחות (שלב 7).
- Cloud Functions ליצירה/עדכון בפועל של אצוות ומוצרים (`createBatch`, `updateBatchStatus`, `createProduct` וכו') — שלב 2 בונה את **תשתית הזהות וההרשאות** (`verifyOwnerCode`, `verifyStaffPin`, `setStaffPin`, `setOwnerCode`, `bootstrapBusiness`) ואת ה-Rules, לא את כל ה-Cloud Functions העסקיות. אלה יתווספו בהדרגה בשלבים 3-5 לפי הצורך, ויכתבו מעל אותו דפוס אימות (role מתוך custom claims + כתיבה רק דרך Admin SDK).
