// בדיקת אינטגרציה אמיתית: מריצה את ה-Cloud Functions בפועל מול
// Auth + Firestore + Functions Emulator ביחד (לא mock), דרך אותו
// client SDK ('firebase/*') שהאפליקציה עצמה תשתמש בו.
//
// הרצה (ראו גם README.md):
//   npx firebase emulators:exec --only auth,firestore,functions \
//     --project demo-expiry-tracker "node --test tests/functions.test.js"
//
// דורש ש-functions/lib יהיה בנוי מראש (npm --prefix functions run build).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";

const PROJECT_ID = "demo-expiry-tracker";
const BUSINESS_ID = "demoBiz";
const OWNER_CODE = "123456";
const STAFF_ID = "staff1";
const STAFF_PIN = "4321";
const PRODUCT_ID = "prod1";
const PRODUCT_SHELF_LIFE_MINUTES = 60 * 24; // יממה

let rulesTestEnv;
let auth;
let functions;

async function callAsOwner(fn) {
  const verifyOwnerCode = httpsCallable(functions, "verifyOwnerCode");
  const { data } = await verifyOwnerCode({
    businessId: BUSINESS_ID,
    code: OWNER_CODE,
  });
  await signInWithCustomToken(auth, data.token);
  try {
    return await fn();
  } finally {
    await signOut(auth);
  }
}

async function callAsStaff(fn) {
  const verifyStaffPin = httpsCallable(functions, "verifyStaffPin");
  const { data } = await verifyStaffPin({
    businessId: BUSINESS_ID,
    staffId: STAFF_ID,
    pin: STAFF_PIN,
  });
  await signInWithCustomToken(auth, data.token);
  try {
    return await fn();
  } finally {
    await signOut(auth);
  }
}

before(async () => {
  // זריעת נתונים ישירות ב-Firestore Emulator, עוקפים rules (כמו admin) —
  // מקביל למה ש-functions/scripts/bootstrapBusiness.ts היה עושה נגד
  // פרויקט אמיתי.
  rulesTestEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const business = db.collection("businesses").doc(BUSINESS_ID);
    await business.set({ name: "מסעדת דמו", active: true });
    await business.collection("secrets").doc("owner").set({
      hash: bcrypt.hashSync(OWNER_CODE, 12),
      failedAttempts: 0,
      lockedUntil: null,
    });
    await business.collection("staff").doc(STAFF_ID).set({
      name: "דנה",
      active: true,
    });
    await business.collection("staffSecrets").doc(STAFF_ID).set({
      hash: bcrypt.hashSync(STAFF_PIN, 12),
      failedAttempts: 0,
      lockedUntil: null,
    });
    await business.collection("products").doc(PRODUCT_ID).set({
      name: "רוטב עגבניות",
      nameLower: "רוטב עגבניות",
      unit: "kg",
      shelfLifeMinutes: PRODUCT_SHELF_LIFE_MINUTES,
      partialUsageUpdateFrequency: null,
      currentRecipeVersionId: null,
      active: true,
    });
    await business.collection("products").doc("inactiveProd").set({
      name: "מוצר לא פעיל",
      nameLower: "מוצר לא פעיל",
      unit: "kg",
      shelfLifeMinutes: 60,
      active: false,
    });
  });

  const app = initializeApp({ apiKey: "fake-api-key", projectId: PROJECT_ID });
  auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
});

after(async () => {
  await signOut(auth).catch(() => {});
  await rulesTestEnv.cleanup();
});

test("verifyOwnerCode עם קוד נכון מנפיק token עם claims של owner", async () => {
  const verifyOwnerCode = httpsCallable(functions, "verifyOwnerCode");
  const { data } = await verifyOwnerCode({
    businessId: BUSINESS_ID,
    code: OWNER_CODE,
  });
  assert.ok(data.token);

  const cred = await signInWithCustomToken(auth, data.token);
  const idTokenResult = await cred.user.getIdTokenResult(true);
  assert.equal(idTokenResult.claims.businessId, BUSINESS_ID);
  assert.equal(idTokenResult.claims.role, "owner");
  await signOut(auth);
});

test("verifyOwnerCode עם קוד שגוי נדחה ולא מנפיק token", async () => {
  const verifyOwnerCode = httpsCallable(functions, "verifyOwnerCode");
  await assert.rejects(
    () => verifyOwnerCode({ businessId: BUSINESS_ID, code: "wrong-code" }),
    (err) => {
      assert.equal(err.code, "functions/permission-denied");
      return true;
    },
  );
});

test("verifyStaffPin עם PIN נכון מנפיק token עם claims של shiftManager", async () => {
  const verifyStaffPin = httpsCallable(functions, "verifyStaffPin");
  const { data } = await verifyStaffPin({
    businessId: BUSINESS_ID,
    staffId: STAFF_ID,
    pin: STAFF_PIN,
  });
  const cred = await signInWithCustomToken(auth, data.token);
  const idTokenResult = await cred.user.getIdTokenResult(true);
  assert.equal(idTokenResult.claims.role, "shiftManager");
  assert.equal(idTokenResult.claims.staffId, STAFF_ID);
  await signOut(auth);
});

test("setOwnerCode: shiftManager מקבל permission-denied, owner מצליח ומסובב את הקוד בפועל", async () => {
  const verifyStaffPin = httpsCallable(functions, "verifyStaffPin");
  const setOwnerCode = httpsCallable(functions, "setOwnerCode");
  const verifyOwnerCode = httpsCallable(functions, "verifyOwnerCode");

  const { data: staffLogin } = await verifyStaffPin({
    businessId: BUSINESS_ID,
    staffId: STAFF_ID,
    pin: STAFF_PIN,
  });
  await signInWithCustomToken(auth, staffLogin.token);
  await assert.rejects(
    () => setOwnerCode({ businessId: BUSINESS_ID, newCode: "999999" }),
    (err) => {
      assert.equal(err.code, "functions/permission-denied");
      return true;
    },
  );
  await signOut(auth);

  await callAsOwner(() =>
    setOwnerCode({ businessId: BUSINESS_ID, newCode: "999999" }),
  );

  await assert.rejects(() =>
    verifyOwnerCode({ businessId: BUSINESS_ID, code: OWNER_CODE }),
  );
  const { data: newLogin } = await verifyOwnerCode({
    businessId: BUSINESS_ID,
    code: "999999",
  });
  assert.ok(newLogin.token);

  // מחזירים למצב ההתחלתי כדי לא לשבור בדיקות אחרות שרצות אחרי זו.
  await signInWithCustomToken(auth, newLogin.token);
  await setOwnerCode({ businessId: BUSINESS_ID, newCode: OWNER_CODE });
  await signOut(auth);
});

test("setStaffPin: owner יכול ליצור עובד/ת חדש/ה, וה-PIN החדש עובד", async () => {
  const setStaffPin = httpsCallable(functions, "setStaffPin");
  const verifyStaffPin = httpsCallable(functions, "verifyStaffPin");

  await callAsOwner(() =>
    setStaffPin({
      businessId: BUSINESS_ID,
      staffId: "staff2",
      name: "יוסי",
      pin: "1111",
      active: true,
    }),
  );

  const { data } = await verifyStaffPin({
    businessId: BUSINESS_ID,
    staffId: "staff2",
    pin: "1111",
  });
  assert.ok(data.token);
});

test("listActiveStaffNames מחזיר שמות עובדים פעילים בלי אימות מוקדם", async () => {
  const listActiveStaffNames = httpsCallable(functions, "listActiveStaffNames");
  const { data } = await listActiveStaffNames({ businessId: BUSINESS_ID });
  assert.ok(Array.isArray(data.staff));
  const staff1Entry = data.staff.find((s) => s.staffId === STAFF_ID);
  assert.ok(staff1Entry);
  assert.equal(staff1Entry.name, "דנה");
});

test("createBatch יוצר אצווה עם expiresAt מחושב נכון, ודוחה מוצר לא פעיל", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const preparedAtClient = new Date().toISOString();

  const { data } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 5,
      preparedAtClient,
    }),
  );
  assert.ok(data.batchId);
  const expectedExpiry =
    new Date(preparedAtClient).getTime() + PRODUCT_SHELF_LIFE_MINUTES * 60_000;
  assert.equal(new Date(data.expiresAt).getTime(), expectedExpiry);

  await assert.rejects(
    () =>
      callAsStaff(() =>
        createBatch({
          businessId: BUSINESS_ID,
          productId: "inactiveProd",
          quantity: 1,
          preparedAtClient,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/not-found");
      return true;
    },
  );
});

test("updateBatchStatus: מעבר ל-discarded דורש סיבה, ואי אפשר לשנות אצווה שכבר במצב סופי", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const updateBatchStatus = httpsCallable(functions, "updateBatchStatus");

  const { data: created } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 3,
      preparedAtClient: new Date().toISOString(),
    }),
  );

  await assert.rejects(
    () =>
      callAsStaff(() =>
        updateBatchStatus({
          businessId: BUSINESS_ID,
          batchId: created.batchId,
          newStatus: "discarded",
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );

  await callAsStaff(() =>
    updateBatchStatus({
      businessId: BUSINESS_ID,
      batchId: created.batchId,
      newStatus: "discarded",
      discardReason: "נשפך על הרצפה",
      quantity: 0,
    }),
  );

  await assert.rejects(
    () =>
      callAsStaff(() =>
        updateBatchStatus({
          businessId: BUSINESS_ID,
          batchId: created.batchId,
          newStatus: "used",
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/failed-precondition");
      return true;
    },
  );
});

test("נעילה זמנית אחרי כמה ניסיונות PIN כושלים רצופים", async () => {
  const verifyStaffPin = httpsCallable(functions, "verifyStaffPin");
  let lastErrorCode;
  for (let i = 0; i < 6; i++) {
    try {
      await verifyStaffPin({
        businessId: BUSINESS_ID,
        staffId: STAFF_ID,
        pin: "0000",
      });
      lastErrorCode = null;
    } catch (err) {
      lastErrorCode = err.code;
    }
  }
  assert.equal(lastErrorCode, "functions/resource-exhausted");

  // גם עם ה-PIN הנכון, כל עוד נעול — עדיין נדחה.
  await assert.rejects(
    () =>
      verifyStaffPin({
        businessId: BUSINESS_ID,
        staffId: STAFF_ID,
        pin: STAFF_PIN,
      }),
    (err) => {
      assert.equal(err.code, "functions/resource-exhausted");
      return true;
    },
  );
});
