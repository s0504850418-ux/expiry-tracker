/**
 * סקריפט אדמין נוח לפיתוח/בדיקות בלבד: מוסיף כמה מוצרי דוגמה לעסק
 * קיים כדי שאפשר יהיה לנסות את מסך הטאבלט (יצירת אצווה) בלי לחכות
 * למסך ניהול מוצרים אמיתי (שלב 4). **אינו** תחליף לניהול מוצרים
 * אמיתי — אין כאן בדיקת ייחודיות שם, גרסת מתכון, או עלויות.
 *
 * הרצה נגד ה-emulator:
 *   firebase emulators:exec --only firestore "npm run seed:products -- --businessId=demo"
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

const SAMPLE_PRODUCTS = [
  { name: "רוטב עגבניות", unit: "kg", shelfLifeMinutes: 60 * 24 * 3 },
  { name: "רוטב פסטו", unit: "kg", shelfLifeMinutes: 60 * 24 * 2 },
  { name: "חמאת שום", unit: "kg", shelfLifeMinutes: 60 * 24 * 5 },
] as const;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { businessId } = args;
  if (!businessId) {
    console.error("שימוש: npm run seed:products -- --businessId=<id>");
    process.exit(1);
  }

  initializeApp();
  const db = getFirestore();
  const businessRef = db.collection("businesses").doc(businessId);
  const businessSnap = await businessRef.get();
  if (!businessSnap.exists) {
    console.error(`עסק "${businessId}" לא נמצא — הריצו קודם את bootstrapBusiness`);
    process.exit(1);
  }

  for (const product of SAMPLE_PRODUCTS) {
    const ref = businessRef.collection("products").doc();
    await ref.set({
      name: product.name,
      nameLower: product.name.toLowerCase(),
      unit: product.unit,
      shelfLifeMinutes: product.shelfLifeMinutes,
      partialUsageUpdateFrequency: null,
      currentRecipeVersionId: null,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`נוצר מוצר: ${product.name} (${ref.id})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
