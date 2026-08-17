/**
 * סקריפט הקמה אחד לעסק דמו מלא — לשיתוף הפרויקט עם מי שרק צריך
 * להריץ אותו מקומית (לא לפתח). ראו SETUP.md בשורש הריפו.
 *
 * יוצר: עסק (demoBiz), קוד מנהל, כתובת Gmail מורשית למסך הניהול,
 * עובד/ת משמרת עם PIN, שני מרכיבים, ושני מוצרים עם מתכון מוכן —
 * כדי שאפשר יהיה ליצור אצווה בטאבלט מיד בלי להגדיר כלום ידנית.
 *
 * אידמפוטנטי: מותר להריץ שוב על אותו emulator-data בלי לשבור נתונים
 * קיימים (למשל אם setup:demo הורץ פעמיים בטעות) — מזהי מסמך קבועים
 * + merge, ולא יוצר גרסת מתכון שנייה אם כבר יש אחת.
 *
 * הרצה: "npm run setup:demo" בשורש הריפו (לא ישירות) — זה מריץ את
 * הסקריפט הזה בתוך "firebase emulators:exec --only firestore", שמזריק
 * אוטומטית את FIRESTORE_EMULATOR_HOST/GCLOUD_PROJECT הנדרשים.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { hashSecret } from "../src/lib/pin";

const BUSINESS_ID = "demoBiz";
const BUSINESS_NAME = "מסעדת דמו";
const OWNER_CODE = "123456";
const OWNER_EMAIL = "owner@demo.test";
const STAFF_ID = "staff1";
const STAFF_NAME = "דנה";
const STAFF_PIN = "4321";

type Unit = "kg" | "liter" | "unit";

interface IngredientSpec {
  id: string;
  name: string;
  unit: Unit;
  price: number;
}

interface RecipeLineSpec {
  ingredientId: string;
  ingredientName: string;
  unit: Unit;
  price: number;
  quantity: number;
}

interface ProductSpec {
  id: string;
  name: string;
  unit: Unit;
  shelfLifeMinutes: number;
  lines: RecipeLineSpec[];
  yieldQuantity: number;
}

const INGREDIENTS: IngredientSpec[] = [
  { id: "tomato", name: "עגבניות", unit: "kg", price: 8 },
  { id: "basil", name: "בזיליקום", unit: "kg", price: 45 },
  { id: "oliveOil", name: "שמן זית", unit: "liter", price: 32 },
];

const PRODUCTS: ProductSpec[] = [
  {
    id: "tomatoSauce",
    name: "רוטב עגבניות",
    unit: "kg",
    shelfLifeMinutes: 60 * 24 * 3,
    lines: [{ ingredientId: "tomato", ingredientName: "עגבניות", unit: "kg", price: 8, quantity: 10 }],
    yieldQuantity: 8,
  },
  {
    id: "pesto",
    name: "רוטב פסטו",
    unit: "kg",
    shelfLifeMinutes: 60 * 24 * 2,
    lines: [
      { ingredientId: "basil", ingredientName: "בזיליקום", unit: "kg", price: 45, quantity: 2 },
      { ingredientId: "oliveOil", ingredientName: "שמן זית", unit: "liter", price: 32, quantity: 3 },
    ],
    yieldQuantity: 6,
  },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function seedProductWithRecipe(
  businessRef: DocumentReference,
  spec: ProductSpec,
): Promise<void> {
  const productRef = businessRef.collection("products").doc(spec.id);
  const productSnap = await productRef.get();

  await productRef.set(
    {
      name: spec.name,
      nameLower: spec.name.toLowerCase(),
      unit: spec.unit,
      shelfLifeMinutes: spec.shelfLifeMinutes,
      partialUsageUpdateFrequency: null,
      notifyBeforeExpiryMinutes: null,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(productSnap.exists ? {} : { currentRecipeVersionId: null }),
    },
    { merge: true },
  );

  if (productSnap.exists && productSnap.data()?.currentRecipeVersionId) {
    console.log(`מוצר "${spec.name}" כבר קיים עם מתכון — לא נוצרה גרסה נוספת`);
    return;
  }

  const computedLines = spec.lines.map((line) => ({
    ingredientId: line.ingredientId,
    ingredientNameSnapshot: line.ingredientName,
    quantity: line.quantity,
    unit: line.unit,
    pricePerUnitSnapshot: line.price,
    lineCostSnapshot: round2(line.quantity * line.price),
  }));
  const totalCostSnapshot = round2(
    computedLines.reduce((sum, line) => sum + line.lineCostSnapshot, 0),
  );
  const costPerUnitSnapshot = round2(totalCostSnapshot / spec.yieldQuantity);

  const versionRef = productRef.collection("recipeVersions").doc();
  await versionRef.set({
    versionNumber: 1,
    ingredients: computedLines,
    yieldQuantity: spec.yieldQuantity,
    totalCostSnapshot,
    costPerUnitSnapshot,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: "seed-script",
  });

  await productRef.update({
    currentRecipeVersionId: versionRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`נוצר מוצר "${spec.name}" עם מתכון (עלות ליחידה: ${costPerUnitSnapshot})`);
}

async function main(): Promise<void> {
  initializeApp();
  const db = getFirestore();
  const businessRef = db.collection("businesses").doc(BUSINESS_ID);

  await businessRef.set(
    {
      name: BUSINESS_NAME,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      settings: { defaultPartialUsageUpdateFrequency: "endOfBatchLife" },
    },
    { merge: true },
  );

  await businessRef.collection("secrets").doc("owner").set({
    hash: await hashSecret(OWNER_CODE),
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await businessRef
    .collection("secrets")
    .doc("googleAccess")
    .set({ ownerEmails: FieldValue.arrayUnion(OWNER_EMAIL) }, { merge: true });

  await businessRef.collection("staff").doc(STAFF_ID).set(
    {
      name: STAFF_NAME,
      active: true,
      isShiftManager: true,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await businessRef.collection("staffSecrets").doc(STAFF_ID).set({
    hash: await hashSecret(STAFF_PIN),
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  for (const ingredient of INGREDIENTS) {
    await businessRef.collection("ingredients").doc(ingredient.id).set(
      {
        name: ingredient.name,
        unit: ingredient.unit,
        currentPricePerUnit: ingredient.price,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  for (const product of PRODUCTS) {
    await seedProductWithRecipe(businessRef, product);
  }

  console.log("");
  console.log(`עסק דמו מוכן: "${BUSINESS_NAME}" (${BUSINESS_ID})`);
  console.log(`קוד מנהל: ${OWNER_CODE}`);
  console.log(`מייל למסך הניהול (Google, אמולטור בלבד): ${OWNER_EMAIL}`);
  console.log(`עובד/ת משמרת: ${STAFF_NAME} — PIN: ${STAFF_PIN}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
