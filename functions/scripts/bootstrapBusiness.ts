/**
 * סקריפט אדמין חד-פעמי ליצירת עסק ראשון + קוד מנהל התחלתי.
 * לא נפרס כ-Cloud Function, לא נגיש מהלקוח — מיועד למסעדת פיילוט
 * יחידה, לא ל-signup עצמי. הרצה:
 *
 *   נגד ה-emulator (לבדיקות):
 *   firebase emulators:exec --only firestore,auth "npm run bootstrap -- --businessId=demo --name='מסעדת דמו' --ownerCode=123456"
 *
 *   נגד פרויקט Firebase אמיתי (כשיהיה קיים):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *     npm run bootstrap -- --businessId=... --name=... --ownerCode=...
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { hashSecret } from "../src/lib/pin";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { businessId, name, ownerCode, ownerEmail } = args;

  if (!businessId || !name || !ownerCode) {
    console.error(
      "שימוש: npm run bootstrap -- --businessId=<id> --name=<שם> --ownerCode=<קוד> [--ownerEmail=<gmail>]",
    );
    process.exit(1);
  }
  if (ownerCode.length < 4) {
    console.error("קוד מנהל חייב להיות לפחות 4 תווים");
    process.exit(1);
  }

  initializeApp();
  const db = getFirestore();
  const businessRef = db.collection("businesses").doc(businessId);
  const existing = await businessRef.get();
  if (existing.exists) {
    console.error(`עסק בשם businessId="${businessId}" כבר קיים`);
    process.exit(1);
  }

  await businessRef.set({
    name,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    settings: { defaultPartialUsageUpdateFrequency: "endOfBatchLife" },
  });

  const hash = await hashSecret(ownerCode);
  await businessRef.collection("secrets").doc("owner").set({
    hash,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (ownerEmail) {
    await businessRef.collection("secrets").doc("googleAccess").set({
      ownerEmails: [ownerEmail.trim().toLowerCase()],
    });
  }

  console.log(
    `עסק "${name}" (${businessId}) נוצר בהצלחה עם קוד מנהל` +
      (ownerEmail ? ` וגישת Google עבור ${ownerEmail}.` : "."),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
