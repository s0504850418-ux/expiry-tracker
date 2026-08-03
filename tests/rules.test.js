// בדיקות אמיתיות של firestore.rules מול Firestore Emulator.
// הרצה (ראו גם README.md):
//   npx firebase emulators:exec --only firestore --project demo-expiry-tracker \
//     "node --test tests/rules.test.js"
//
// חשוב: בניגוד לסביבה הקודמת (claude.ai) שבה קובץ מקביל נכתב אך
// מעולם לא הורץ בפועל (Firestore Emulator לא עלה שם), הקובץ הזה
// *רץ בפועל* בסביבה הזו — ראו הדוח שנמסר בסיום שלב 2.

import { test, before, after } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = "demo-expiry-tracker";

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(
        path.resolve(__dirname, "..", "firestore.rules"),
        "utf8",
      ),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(":")[0] ?? "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1] ?? 8080),
    },
  });

  // זריעת נתונים כ-admin (עוקף rules) לשני עסקים, כדי לבדוק גם בידוד
  // בין tenants ולא רק הרשאות בתוך אותו עסק.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const businessA = db.collection("businesses").doc("businessA");
    const businessB = db.collection("businesses").doc("businessB");

    await businessA.set({ name: "עסק א", active: true });
    await businessB.set({ name: "עסק ב", active: true });

    await businessA.collection("secrets").doc("owner").set({ hash: "x" });
    await businessA
      .collection("staffSecrets")
      .doc("staff1")
      .set({ hash: "y" });
    await businessA.collection("staff").doc("staff1").set({ name: "דנה" });
    await businessA
      .collection("products")
      .doc("prod1")
      .set({ name: "רוטב עגבניות", unit: "kg" });
    await businessA
      .collection("ingredients")
      .doc("ing1")
      .set({ name: "עגבניות", currentPricePerUnit: 5 });
    await businessA
      .collection("products")
      .doc("prod1")
      .collection("recipeVersions")
      .doc("v1")
      .set({ versionNumber: 1, totalCostSnapshot: 10 });
    await businessA
      .collection("batches")
      .doc("batch1")
      .set({ productId: "prod1", status: "active" });
    await businessA
      .collection("auditLog")
      .doc("log1")
      .set({ action: "test" });
    await businessA
      .collection("notifications")
      .doc("notif1")
      .set({ type: "batchExpiringSoon" });
  });
});

after(async () => {
  await testEnv.cleanup();
});

function ownerCtx(businessId) {
  return testEnv.authenticatedContext(`owner_${businessId}`, {
    businessId,
    role: "owner",
  });
}

function staffCtx(businessId, staffId = "staff1") {
  return testEnv.authenticatedContext(`staff_${businessId}_${staffId}`, {
    businessId,
    role: "shiftManager",
    staffId,
  });
}

function anonCtx() {
  return testEnv.unauthenticatedContext();
}

test("משתמש לא מחובר לא יכול לקרוא כלום", async () => {
  const db = anonCtx().firestore();
  await assertFails(db.doc("businesses/businessA/products/prod1").get());
  await assertFails(db.doc("businesses/businessA").get());
});

test("owner יכול לקרוא את כל האוספים בעסק שלו", async () => {
  const db = ownerCtx("businessA").firestore();
  await assertSucceeds(db.doc("businesses/businessA").get());
  await assertSucceeds(db.doc("businesses/businessA/products/prod1").get());
  await assertSucceeds(db.doc("businesses/businessA/ingredients/ing1").get());
  await assertSucceeds(
    db.doc("businesses/businessA/products/prod1/recipeVersions/v1").get(),
  );
  await assertSucceeds(db.doc("businesses/businessA/batches/batch1").get());
  await assertSucceeds(db.doc("businesses/businessA/staff/staff1").get());
  await assertSucceeds(db.doc("businesses/businessA/auditLog/log1").get());
  await assertSucceeds(
    db.doc("businesses/businessA/notifications/notif1").get(),
  );
});

test("shiftManager יכול לקרוא רק מוצרים/אצוות/התראות, לא כספים/סגל/יומן", async () => {
  const db = staffCtx("businessA").firestore();
  await assertSucceeds(db.doc("businesses/businessA").get());
  await assertSucceeds(db.doc("businesses/businessA/products/prod1").get());
  await assertSucceeds(db.doc("businesses/businessA/batches/batch1").get());
  await assertSucceeds(
    db.doc("businesses/businessA/notifications/notif1").get(),
  );

  await assertFails(db.doc("businesses/businessA/ingredients/ing1").get());
  await assertFails(
    db.doc("businesses/businessA/products/prod1/recipeVersions/v1").get(),
  );
  await assertFails(db.doc("businesses/businessA/staff/staff1").get());
  await assertFails(db.doc("businesses/businessA/auditLog/log1").get());
});

test("סודות (owner code / staff PIN hash) חסומים לחלוטין לכולם, כולל owner", async () => {
  const owner = ownerCtx("businessA").firestore();
  const staff = staffCtx("businessA").firestore();
  await assertFails(owner.doc("businesses/businessA/secrets/owner").get());
  await assertFails(
    owner.doc("businesses/businessA/staffSecrets/staff1").get(),
  );
  await assertFails(staff.doc("businesses/businessA/secrets/owner").get());
});

test("בידוד בין עסקים: owner/shiftManager של עסק A לא יכולים לקרוא נתוני עסק B", async () => {
  const ownerA = ownerCtx("businessA").firestore();
  const staffA = staffCtx("businessA").firestore();
  await assertFails(ownerA.doc("businesses/businessB").get());
  await assertFails(staffA.doc("businesses/businessB").get());
});

test("אף אחד — לא owner ולא shiftManager — לא יכול לכתוב ישירות ל-Firestore", async () => {
  const owner = ownerCtx("businessA").firestore();
  const staff = staffCtx("businessA").firestore();

  await assertFails(
    owner.doc("businesses/businessA/products/newProd").set({ name: "x" }),
  );
  await assertFails(
    owner
      .doc("businesses/businessA/batches/batch1")
      .update({ status: "used" }),
  );
  await assertFails(
    owner.doc("businesses/businessA/staff/newStaff").set({ name: "x" }),
  );
  await assertFails(owner.doc("businesses/businessA").update({ name: "y" }));

  await assertFails(
    staff
      .doc("businesses/businessA/batches/batch1")
      .update({ status: "used" }),
  );
  await assertFails(
    staff.doc("businesses/businessA/products/newProd").set({ name: "x" }),
  );
});

test("אף אחד לא יכול למחוק מסמכים (אין מחיקה לעולם)", async () => {
  const owner = ownerCtx("businessA").firestore();
  await assertFails(owner.doc("businesses/businessA/batches/batch1").delete());
});
