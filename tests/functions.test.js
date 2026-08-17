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
import { initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
// ה-Pub/Sub Emulator הנדרש כדי להפעיל onSchedule "כמו בייצור" לא עלה
// בסביבת הפיתוח הזו (תקלת firebase-tools על Windows — ראו PR של שלב
// 9). קוראים ל-processBusiness ישירות במקום זאת: בודק בפועל מול
// Firestore Emulator אמיתי את כל הלוגיקה, רק לא דרך מנגנון ה-schedule.
// getTestFirestore (במקום לבנות מופע Firestore מה-firebase-admin של
// השורש) חיוני: processBusiness משתמש ב-Timestamp מתוך firebase-admin
// *של functions/* (node_modules נפרד) — מופע Firestore ממקור אחר
// נדחה ע"י ה-SDK כ"סוג לא תואם", גם אם מבנית זהה.
import { processBusiness } from "../functions/lib/notifications/checkExpiringBatches.js";
import { getTestFirestore } from "../functions/lib/testSupport.js";

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
let adminAuth;
let adminFirestore;

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

// מדמה "התחברות עם Google" בלי דפדפן/OAuth אמיתי: יוצרת (או משתמשת
// ב-)משתמש ב-Auth Emulator עם email+emailVerified מוגדרים על רשומת
// המשתמש עצמה — ה-ID token שינפיק כל sign-in לאותו uid (גם דרך
// custom token, כמו כאן) יכלול את claims הסטנדרטיים email/email_verified
// שנגזרים מרשומת המשתמש, בדיוק כמו אחרי Google sign-in אמיתי.
async function callAsGoogleUser(email, fn) {
  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(email);
  } catch {
    userRecord = await adminAuth.createUser({ email, emailVerified: true });
  }
  const customToken = await adminAuth.createCustomToken(userRecord.uid);
  await signInWithCustomToken(auth, customToken);
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
      isShiftManager: true,
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

  const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, "admin-test-app");
  adminAuth = getAdminAuth(adminApp);
  adminFirestore = getTestFirestore();
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
      isShiftManager: true,
    }),
  );

  const { data } = await verifyStaffPin({
    businessId: BUSINESS_ID,
    staffId: "staff2",
    pin: "1111",
  });
  assert.ok(data.token);
});

test("setStaffPin: מנהל/ת משמרת חדש/ה דורש PIN; עדכון שם/סטטוס בלי PIN לא נוגע ב-PIN הקיים; השבתה חוסמת כניסה", async () => {
  const setStaffPin = httpsCallable(functions, "setStaffPin");
  const verifyStaffPin = httpsCallable(functions, "verifyStaffPin");

  // יצירת מנהל/ת משמרת חדש/ה בלי PIN נדחית.
  await assert.rejects(
    () =>
      callAsOwner(() =>
        setStaffPin({
          businessId: BUSINESS_ID,
          staffId: "staff3",
          name: "מיכל",
          active: true,
          isShiftManager: true,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );

  await callAsOwner(() =>
    setStaffPin({
      businessId: BUSINESS_ID,
      staffId: "staff3",
      name: "מיכל",
      pin: "2222",
      active: true,
      isShiftManager: true,
    }),
  );

  // עדכון שם בלבד, בלי PIN — ה-PIN הקיים ממשיך לעבוד.
  await callAsOwner(() =>
    setStaffPin({
      businessId: BUSINESS_ID,
      staffId: "staff3",
      name: "מיכל כהן",
      active: true,
      isShiftManager: true,
    }),
  );
  const { data: stillWorks } = await verifyStaffPin({
    businessId: BUSINESS_ID,
    staffId: "staff3",
    pin: "2222",
  });
  assert.ok(stillWorks.token);

  // השבתה (active: false, בלי PIN) — כניסה נחסמת גם עם ה-PIN הנכון.
  await callAsOwner(() =>
    setStaffPin({
      businessId: BUSINESS_ID,
      staffId: "staff3",
      name: "מיכל כהן",
      active: false,
      isShiftManager: true,
    }),
  );
  await assert.rejects(
    () => verifyStaffPin({ businessId: BUSINESS_ID, staffId: "staff3", pin: "2222" }),
    (err) => {
      assert.equal(err.code, "functions/not-found");
      return true;
    },
  );
});

test("setStaffPin: הפרדת עובד/ת רגיל/ה ממנהל/ת משמרת — יצירה בלי PIN, קידום, הורדה", async () => {
  const setStaffPin = httpsCallable(functions, "setStaffPin");
  const verifyStaffPin = httpsCallable(functions, "verifyStaffPin");
  const listActiveStaffNames = httpsCallable(functions, "listActiveStaffNames");

  // 1. עובד/ת רגיל/ה — נוצר/ת בלי PIN בהצלחה.
  await callAsOwner(() =>
    setStaffPin({
      businessId: BUSINESS_ID,
      staffId: "staff4",
      name: "רועי",
      active: true,
      isShiftManager: false,
    }),
  );

  // 2. עובד/ת רגיל/ה לא יכול/ה להתחבר עם PIN (אין לו/ה בכלל).
  await assert.rejects(
    () => verifyStaffPin({ businessId: BUSINESS_ID, staffId: "staff4", pin: "0000" }),
    (err) => {
      assert.equal(err.code, "functions/not-found");
      return true;
    },
  );

  // 3. onlyShiftManagers מסנן אותו החוצה; בלי הדגל הוא כלול.
  const { data: onlyManagers } = await listActiveStaffNames({
    businessId: BUSINESS_ID,
    onlyShiftManagers: true,
  });
  assert.ok(!onlyManagers.staff.some((s) => s.staffId === "staff4"));
  const { data: everyone } = await listActiveStaffNames({ businessId: BUSINESS_ID });
  assert.ok(everyone.staff.some((s) => s.staffId === "staff4"));

  // 4. קידום ל-isShiftManager:true בלי PIN נדחה.
  await assert.rejects(
    () =>
      callAsOwner(() =>
        setStaffPin({
          businessId: BUSINESS_ID,
          staffId: "staff4",
          name: "רועי",
          active: true,
          isShiftManager: true,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );

  // 5. קידום עם PIN — מצליח, ואפשר להתחבר.
  await callAsOwner(() =>
    setStaffPin({
      businessId: BUSINESS_ID,
      staffId: "staff4",
      name: "רועי",
      active: true,
      isShiftManager: true,
      pin: "1234",
    }),
  );
  const { data: promoted } = await verifyStaffPin({
    businessId: BUSINESS_ID,
    staffId: "staff4",
    pin: "1234",
  });
  assert.equal(promoted.token && true, true);

  // 6. הורדה בחזרה ל-isShiftManager:false — ה-PIN הישן נמחק בפועל, לא רק מוסתר.
  await callAsOwner(() =>
    setStaffPin({
      businessId: BUSINESS_ID,
      staffId: "staff4",
      name: "רועי",
      active: true,
      isShiftManager: false,
    }),
  );
  await assert.rejects(
    () => verifyStaffPin({ businessId: BUSINESS_ID, staffId: "staff4", pin: "1234" }),
    (err) => {
      assert.equal(err.code, "functions/not-found");
      return true;
    },
  );
});

test("addAuthorizedOwnerEmail + claimOwnerAccessViaGoogle: מייל מורשה מקבל role=owner, מייל לא מורשה נדחה", async () => {
  const addAuthorizedOwnerEmail = httpsCallable(functions, "addAuthorizedOwnerEmail");
  const claimOwnerAccessViaGoogle = httpsCallable(functions, "claimOwnerAccessViaGoogle");
  const authorizedEmail = "owner-test@example.com";
  const strangerEmail = "stranger@example.com";

  await callAsOwner(() =>
    addAuthorizedOwnerEmail({ businessId: BUSINESS_ID, email: authorizedEmail }),
  );

  // מייל לא מורשה — נדחה, ולא מקבל claims.
  await assert.rejects(
    () =>
      callAsGoogleUser(strangerEmail, () =>
        claimOwnerAccessViaGoogle({ businessId: BUSINESS_ID }),
      ),
    (err) => {
      assert.equal(err.code, "functions/permission-denied");
      return true;
    },
  );

  // shiftManager לא יכול/ה להוסיף מיילים מורשים.
  await assert.rejects(
    () =>
      callAsStaff(() =>
        addAuthorizedOwnerEmail({ businessId: BUSINESS_ID, email: "other@example.com" }),
      ),
    (err) => {
      assert.equal(err.code, "functions/permission-denied");
      return true;
    },
  );

  // מייל מורשה — מקבל claims של owner, ואפשר לאמת את זה מה-ID token
  // אחרי רענון (בדיוק כמו ש-AdminLoginScreen עושה בפועל).
  await callAsGoogleUser(authorizedEmail, async () => {
    const { data } = await claimOwnerAccessViaGoogle({ businessId: BUSINESS_ID });
    assert.equal(data.success, true);
    const idTokenResult = await auth.currentUser.getIdTokenResult(true);
    assert.equal(idTokenResult.claims.businessId, BUSINESS_ID);
    assert.equal(idTokenResult.claims.role, "owner");
  });
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
      preparedByStaffId: STAFF_ID,
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
          preparedByStaffId: STAFF_ID,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/not-found");
      return true;
    },
  );
});

test("createBatch עם clientRequestId זהה מחזירה את אותה אצווה — לא יוצרת כפולה (מניעת שליחה כפולה)", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const clientRequestId = `test-idempotency-${Date.now()}`;
  const preparedAtClient = new Date().toISOString();

  const { data: first } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 7,
      preparedAtClient,
      clientRequestId,
      preparedByStaffId: STAFF_ID,
    }),
  );

  // "ניסיון חוזר" עם אותו clientRequestId — מדמה לחיצה כפולה או ריטריי
  // אחרי ניתוק רגעי שבו התשובה המקורית לא הגיעה ללקוח.
  const { data: retry } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 7,
      preparedAtClient,
      clientRequestId,
      preparedByStaffId: STAFF_ID,
    }),
  );

  assert.equal(retry.batchId, first.batchId);
  assert.equal(retry.expiresAt, first.expiresAt);
});

test("updateBatchStatus: שתי קריאות בו-זמנית על אותה אצווה — רק אחת מצליחה (טרנזקציה מונעת מרוץ)", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const updateBatchStatus = httpsCallable(functions, "updateBatchStatus");

  const { data: created } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 1,
      preparedAtClient: new Date().toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );

  const results = await callAsStaff(() =>
    Promise.allSettled([
      updateBatchStatus({
        businessId: BUSINESS_ID,
        batchId: created.batchId,
        newStatus: "used",
      }),
      updateBatchStatus({
        businessId: BUSINESS_ID,
        batchId: created.batchId,
        newStatus: "discarded",
        discardReason: "אחר",
        quantity: 0,
      }),
    ]),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");
  assert.equal(succeeded.length, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].reason.code, "functions/failed-precondition");
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
      preparedByStaffId: STAFF_ID,
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
      discardReason: "בעיית איכות",
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

test("preparedQuantity: נשמר קבוע ביצירה, ומגן מפני דיווח כמות פחת גדולה ממה שהוכן בפועל", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const updateBatchStatus = httpsCallable(functions, "updateBatchStatus");

  const { data: created } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 10,
      preparedAtClient: new Date().toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );

  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/batches/${created.batchId}`)
      .get();
    assert.equal(snap.data().preparedQuantity, 10);
    assert.equal(snap.data().quantity, 10);
  });

  // אי אפשר לדווח שהושלכו יותר מ-10 ק"ג ממה שהוכן במקור.
  await assert.rejects(
    () =>
      callAsStaff(() =>
        updateBatchStatus({
          businessId: BUSINESS_ID,
          batchId: created.batchId,
          newStatus: "discarded",
          discardReason: "בעיית איכות",
          quantity: 15,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );

  // דיווח חלקי תקין (3 מתוך 10) מתקבל, ו-preparedQuantity נשאר קבוע.
  await callAsStaff(() =>
    updateBatchStatus({
      businessId: BUSINESS_ID,
      batchId: created.batchId,
      newStatus: "discarded",
      discardReason: "בעיית איכות",
      quantity: 3,
    }),
  );

  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/batches/${created.batchId}`)
      .get();
    assert.equal(snap.data().preparedQuantity, 10);
    assert.equal(snap.data().quantity, 3);
  });
});

test("updateBatchQuantity: מעדכן כמות נותרת על אצווה פעילה בלי לשנות preparedQuantity, ורושם Audit Log", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const updateBatchQuantity = httpsCallable(functions, "updateBatchQuantity");

  const { data: created } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 5,
      preparedAtClient: new Date().toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );

  await callAsStaff(() =>
    updateBatchQuantity({ businessId: BUSINESS_ID, batchId: created.batchId, quantity: 3 }),
  );

  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/batches/${created.batchId}`)
      .get();
    assert.equal(snap.data().preparedQuantity, 5); // לא זז
    assert.equal(snap.data().quantity, 3);
    assert.ok(snap.data().quantityLastUpdatedAt);

    const auditSnap = await ctx
      .firestore()
      .collection(`businesses/${BUSINESS_ID}/auditLog`)
      .where("targetId", "==", created.batchId)
      .where("action", "==", "batch.quantityUpdated")
      .get();
    assert.equal(auditSnap.size, 1);
    assert.equal(auditSnap.docs[0].data().metadata.quantity, 3);
  });

  // עדכון שני, רציף — "5 -> 3 -> 1" (שימוש חלקי מתמשך במהלך היום).
  await callAsStaff(() =>
    updateBatchQuantity({ businessId: BUSINESS_ID, batchId: created.batchId, quantity: 1 }),
  );
  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/batches/${created.batchId}`)
      .get();
    assert.equal(snap.data().preparedQuantity, 5);
    assert.equal(snap.data().quantity, 1);
  });
});

test("updateBatchQuantity: דוחה כמות שלילית, כמות גדולה מ-preparedQuantity, ועדכון על אצווה שאינה פעילה", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const updateBatchQuantity = httpsCallable(functions, "updateBatchQuantity");
  const updateBatchStatus = httpsCallable(functions, "updateBatchStatus");

  const { data: created } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 4,
      preparedAtClient: new Date().toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );

  await assert.rejects(
    () =>
      callAsStaff(() =>
        updateBatchQuantity({ businessId: BUSINESS_ID, batchId: created.batchId, quantity: -1 }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );

  await assert.rejects(
    () =>
      callAsStaff(() =>
        updateBatchQuantity({ businessId: BUSINESS_ID, batchId: created.batchId, quantity: 9 }),
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
      newStatus: "used",
    }),
  );

  await assert.rejects(
    () =>
      callAsStaff(() =>
        updateBatchQuantity({ businessId: BUSINESS_ID, batchId: created.batchId, quantity: 1 }),
      ),
    (err) => {
      assert.equal(err.code, "functions/failed-precondition");
      return true;
    },
  );
});

test("updateBatchQuantity ואז updateBatchStatus(discarded): דוח הפחת מבוסס על הכמות שנזרקה בפועל, לא ההפרש מהעדכון האחרון", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const updateBatchQuantity = httpsCallable(functions, "updateBatchQuantity");
  const updateBatchStatus = httpsCallable(functions, "updateBatchStatus");

  // מדמה את תרחיש הבדיקה הידנית בדפדפן: הכנת 5 ק"ג, עדכון ל-3,
  // עדכון ל-1, ואז השלכה של 1 ק"ג (לא 4, ולא ההפרש 5-1).
  const { data: created } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 5,
      preparedAtClient: new Date().toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );
  await callAsStaff(() =>
    updateBatchQuantity({ businessId: BUSINESS_ID, batchId: created.batchId, quantity: 3 }),
  );
  await callAsStaff(() =>
    updateBatchQuantity({ businessId: BUSINESS_ID, batchId: created.batchId, quantity: 1 }),
  );
  await callAsStaff(() =>
    updateBatchStatus({
      businessId: BUSINESS_ID,
      batchId: created.batchId,
      newStatus: "discarded",
      discardReason: "פג תוקף",
      quantity: 1,
    }),
  );

  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/batches/${created.batchId}`)
      .get();
    assert.equal(snap.data().preparedQuantity, 5);
    assert.equal(snap.data().quantity, 1);
    assert.equal(snap.data().status, "discarded");
    // wasteRatio (WasteReport.tsx) = quantity/preparedQuantity = 1/5,
    // לא (5-1)/5 — הפחת הוא "מה שבאמת נזרק בסוף", לא ההפרש מהעדכונים.
  });
});

test("updateBatchStatus מסמנת התראה pending כ-acknowledged אוטומטית כשמטפלים באצווה", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const updateBatchStatus = httpsCallable(functions, "updateBatchStatus");

  const { data: created } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 4,
      preparedAtClient: new Date().toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );

  // מדמים שה-Scheduled Function כבר יצרה התראה pending לאצווה הזו
  // (בלי להריץ בפועל את checkExpiringBatches — זה נבדק בנפרד).
  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/notifications/${created.batchId}`)
      .set({
        type: "batchExpiringSoon",
        batchId: created.batchId,
        status: "pending",
        createdAt: new Date(),
        lastRemindedAt: new Date(),
        acknowledgedAt: null,
        acknowledgedByStaffId: null,
      });
  });

  await callAsStaff(() =>
    updateBatchStatus({
      businessId: BUSINESS_ID,
      batchId: created.batchId,
      newStatus: "used",
    }),
  );

  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const notifSnap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/notifications/${created.batchId}`)
      .get();
    assert.equal(notifSnap.data().status, "acknowledged");
    assert.equal(notifSnap.data().acknowledgedByStaffId, STAFF_ID);
  });
});

test("processBusiness (checkExpiringBatches) יוצרת/משדרגת התראות נכון, ולא נוגעת באצוות רחוקות מתפוגה", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const now = new Date();

  // אצווה עם זמן הכנה שכבר גורם לתפוגה בעוד שעה — בתוך חלון "בקרוב"
  // (120 דקות), אמורה לקבל התראה batchExpiringSoon.
  const soonPreparedAt = new Date(now.getTime() - (PRODUCT_SHELF_LIFE_MINUTES - 60) * 60_000);
  const { data: soonBatch } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 1,
      preparedAtClient: soonPreparedAt.toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );

  // אצווה רחוקה מתפוגה (מוכנה עכשיו, חיי מדף של יממה שלמה) — לא
  // אמורה לקבל שום התראה.
  const { data: farBatch } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 1,
      preparedAtClient: now.toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );

  await processBusiness(adminFirestore, BUSINESS_ID, now);

  const soonNotifSnap = await adminFirestore
    .doc(`businesses/${BUSINESS_ID}/notifications/${soonBatch.batchId}`)
    .get();
  assert.equal(soonNotifSnap.exists, true);
  assert.equal(soonNotifSnap.data().type, "batchExpiringSoon");
  assert.equal(soonNotifSnap.data().status, "pending");

  const farNotifSnap = await adminFirestore
    .doc(`businesses/${BUSINESS_ID}/notifications/${farBatch.batchId}`)
    .get();
  assert.equal(farNotifSnap.exists, false);

  // הרצה שנייה "בעתיד" (אחרי שהתפוגה כבר עברה בפועל) — אותה התראה
  // אמורה להישדרג ל-batchExpired, לא להתווסף בכפילות.
  const later = new Date(
    soonPreparedAt.getTime() + PRODUCT_SHELF_LIFE_MINUTES * 60_000 + 5 * 60_000,
  );
  await processBusiness(adminFirestore, BUSINESS_ID, later);

  const upgradedSnap = await adminFirestore
    .doc(`businesses/${BUSINESS_ID}/notifications/${soonBatch.batchId}`)
    .get();
  assert.equal(upgradedSnap.data().type, "batchExpired");
  assert.equal(upgradedSnap.data().status, "pending");

  const allNotifsSnap = await adminFirestore
    .collection(`businesses/${BUSINESS_ID}/notifications`)
    .where("batchId", "==", soonBatch.batchId)
    .get();
  assert.equal(allNotifsSnap.size, 1); // בלי כפילות
});

test("processBusiness: מכבד notifyBeforeExpiryMinutes per-product, לא ערך גלובלי קבוע", async () => {
  const createProduct = httpsCallable(functions, "createProduct");
  const createBatch = httpsCallable(functions, "createBatch");
  const now = new Date();

  // מוצר עם חלון התראה מותאם אישית — הרבה יותר גדול מברירת המחדל
  // הגלובלית (120 דקות): 5 שעות (300 דקות).
  const { data: customProduct } = await callAsOwner(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: `מוצר חלון-התראה-מותאם ${Date.now()}`,
      unit: "kg",
      shelfLifeMinutes: PRODUCT_SHELF_LIFE_MINUTES,
      notifyBeforeExpiryMinutes: 300,
    }),
  );

  // שתי אצוות עם אותו זמן-עד-תפוגה בדיוק (200 דקות מעכשיו) — בין שני
  // הסיפים: מעל ברירת המחדל הגלובלית (120), אבל מתחת לחלון המותאם
  // של המוצר החדש (300). אם הקוד עדיין קורא ערך גלובלי קבוע, שתי
  // האצוות ייצאו זהות (או שתיהן עם התראה, או שתיהן בלי) — הבדיקה
  // מוודאת שהתוצאה שונה בין שני המוצרים.
  const preparedAt = new Date(now.getTime() - (PRODUCT_SHELF_LIFE_MINUTES - 200) * 60_000);

  const { data: defaultWindowBatch } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID, // notifyBeforeExpiryMinutes: null -> ברירת מחדל גלובלית (120)
      quantity: 1,
      preparedAtClient: preparedAt.toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );
  const { data: customWindowBatch } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: customProduct.productId, // notifyBeforeExpiryMinutes: 300
      quantity: 1,
      preparedAtClient: preparedAt.toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );

  await processBusiness(adminFirestore, BUSINESS_ID, now);

  const defaultWindowNotifSnap = await adminFirestore
    .doc(`businesses/${BUSINESS_ID}/notifications/${defaultWindowBatch.batchId}`)
    .get();
  assert.equal(
    defaultWindowNotifSnap.exists,
    false,
    "אצווה של מוצר עם ברירת מחדל (120 דק') לא אמורה לקבל התראה כשנותרו 200 דקות לתפוגה",
  );

  const customWindowNotifSnap = await adminFirestore
    .doc(`businesses/${BUSINESS_ID}/notifications/${customWindowBatch.batchId}`)
    .get();
  assert.equal(
    customWindowNotifSnap.exists,
    true,
    "אצווה של מוצר עם חלון מותאם (300 דק') כן אמורה לקבל התראה כשנותרו 200 דקות לתפוגה",
  );
  assert.equal(customWindowNotifSnap.data().type, "batchExpiringSoon");
});

test("updateBatchPrintStatus: מעדכן printed/failed לאצווה פעילה, ונדחה לאצווה שאינה פעילה", async () => {
  const createBatch = httpsCallable(functions, "createBatch");
  const updateBatchStatus = httpsCallable(functions, "updateBatchStatus");
  const updateBatchPrintStatus = httpsCallable(functions, "updateBatchPrintStatus");

  const { data: created } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 2,
      preparedAtClient: new Date().toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );

  await callAsStaff(() =>
    updateBatchPrintStatus({
      businessId: BUSINESS_ID,
      batchId: created.batchId,
      printStatus: "failed",
    }),
  );

  // אפשר לנסות שוב אחרי כשל (הדפסה חוזרת) כל עוד האצווה עדיין פעילה.
  await callAsStaff(() =>
    updateBatchPrintStatus({
      businessId: BUSINESS_ID,
      batchId: created.batchId,
      printStatus: "printed",
    }),
  );

  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/batches/${created.batchId}`)
      .get();
    assert.equal(snap.data().printStatus, "printed");
  });

  await callAsStaff(() =>
    updateBatchStatus({
      businessId: BUSINESS_ID,
      batchId: created.batchId,
      newStatus: "used",
    }),
  );

  await assert.rejects(
    () =>
      callAsStaff(() =>
        updateBatchPrintStatus({
          businessId: BUSINESS_ID,
          batchId: created.batchId,
          printStatus: "printed",
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/failed-precondition");
      return true;
    },
  );
});

test("createProduct: owner יוצר מוצר, ודוחה שם כפול (case-insensitive)", async () => {
  const createProduct = httpsCallable(functions, "createProduct");

  const { data } = await callAsOwner(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: "חמאת שום",
      unit: "kg",
      shelfLifeMinutes: 60 * 24 * 5,
    }),
  );
  assert.ok(data.productId);

  await assert.rejects(
    () =>
      callAsOwner(() =>
        createProduct({
          businessId: BUSINESS_ID,
          name: "חמאת שום",
          unit: "kg",
          shelfLifeMinutes: 60,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/already-exists");
      return true;
    },
  );

  await assert.rejects(
    () =>
      callAsOwner(() =>
        createProduct({
          businessId: BUSINESS_ID,
          name: "חמאת שום",
          unit: "kg",
          shelfLifeMinutes: 60,
        }),
      ),
    () => true,
  );

  // shiftManager כן יכול/ה ליצור מוצר (שלוש רמות הרשאה, ראו CLAUDE.md
  // ו-createProduct.ts) — אבל רק עם name/unit/shelfLifeMinutes.
  const { data: staffCreated } = await callAsStaff(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: "מוצר אחר",
      unit: "kg",
      shelfLifeMinutes: 60,
    }),
  );
  assert.ok(staffCreated.productId);

  // אבל שדות owner-only (התראה/תדירות עדכון) נדחים גם ביצירה, לא רק
  // בעדכון (owner-only, כמו חיי מדף ומחיר).
  await assert.rejects(
    () =>
      callAsStaff(() =>
        createProduct({
          businessId: BUSINESS_ID,
          name: "מוצר עם התראה ע\"י מנהל/ת משמרת",
          unit: "kg",
          shelfLifeMinutes: 60,
          notifyBeforeExpiryMinutes: 60,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/permission-denied");
      return true;
    },
  );
});

test("updateProduct: owner יכול לעדכן שם/חיי מדף/סטטוס פעילות, shiftManager לא יכול", async () => {
  const createProduct = httpsCallable(functions, "createProduct");
  const updateProduct = httpsCallable(functions, "updateProduct");

  const { data: created } = await callAsOwner(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: "מוצר לעדכון",
      unit: "unit",
      shelfLifeMinutes: 60,
    }),
  );

  await callAsOwner(() =>
    updateProduct({
      businessId: BUSINESS_ID,
      productId: created.productId,
      name: "מוצר אחרי עדכון",
      shelfLifeMinutes: 120,
      active: false,
    }),
  );

  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/products/${created.productId}`)
      .get();
    assert.equal(snap.data().name, "מוצר אחרי עדכון");
    assert.equal(snap.data().shelfLifeMinutes, 120);
    assert.equal(snap.data().active, false);
    assert.equal(snap.data().unit, "unit"); // unit לא ניתן לשינוי
  });

  await assert.rejects(
    () =>
      callAsStaff(() =>
        updateProduct({
          businessId: BUSINESS_ID,
          productId: created.productId,
          active: true,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/permission-denied");
      return true;
    },
  );
});

test("notifyBeforeExpiryMinutes: ניתן להגדיר per-product ב-createProduct/updateProduct, ונדחה ערך לא תקין", async () => {
  const createProduct = httpsCallable(functions, "createProduct");
  const updateProduct = httpsCallable(functions, "updateProduct");

  // ברירת מחדל: לא הוגדר -> null (המשמעות: להשתמש בברירת המחדל הגלובלית)
  const { data: withoutOverride } = await callAsOwner(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: "מוצר בלי override להתראה",
      unit: "kg",
      shelfLifeMinutes: 60,
    }),
  );
  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/products/${withoutOverride.productId}`)
      .get();
    assert.equal(snap.data().notifyBeforeExpiryMinutes, null);
  });

  // override תקין ביצירה
  const { data: created } = await callAsOwner(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: "מוצר עם התראה מותאמת",
      unit: "kg",
      shelfLifeMinutes: 60 * 24 * 5,
      notifyBeforeExpiryMinutes: 60 * 24 * 2, // יומיים לפני תפוגה
    }),
  );
  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/products/${created.productId}`)
      .get();
    assert.equal(snap.data().notifyBeforeExpiryMinutes, 60 * 24 * 2);
  });

  // ערך לא תקין (שלילי) נדחה ביצירה
  await assert.rejects(
    () =>
      callAsOwner(() =>
        createProduct({
          businessId: BUSINESS_ID,
          name: "מוצר עם התראה לא תקינה",
          unit: "kg",
          shelfLifeMinutes: 60,
          notifyBeforeExpiryMinutes: -10,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );

  // עדכון owner-only לערך חדש
  await callAsOwner(() =>
    updateProduct({
      businessId: BUSINESS_ID,
      productId: created.productId,
      notifyBeforeExpiryMinutes: 60 * 24, // יום אחד
    }),
  );
  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/products/${created.productId}`)
      .get();
    assert.equal(snap.data().notifyBeforeExpiryMinutes, 60 * 24);
  });

  // ערך לא תקין נדחה גם בעדכון
  await assert.rejects(
    () =>
      callAsOwner(() =>
        updateProduct({
          businessId: BUSINESS_ID,
          productId: created.productId,
          notifyBeforeExpiryMinutes: 0,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );

  // shiftManager לא יכול לעדכן (owner-only, כמו חיי מדף ומחיר)
  await assert.rejects(
    () =>
      callAsStaff(() =>
        updateProduct({
          businessId: BUSINESS_ID,
          productId: created.productId,
          notifyBeforeExpiryMinutes: 60,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/permission-denied");
      return true;
    },
  );
});

test("createIngredient + updateIngredientPrice: מחיר מרכיב מתעדכן, וגרסת מתכון שומרת snapshot היסטורי", async () => {
  const createIngredient = httpsCallable(functions, "createIngredient");
  const updateIngredientPrice = httpsCallable(functions, "updateIngredientPrice");
  const createProduct = httpsCallable(functions, "createProduct");
  const createRecipeVersion = httpsCallable(functions, "createRecipeVersion");

  const { data: ingredient } = await callAsOwner(() =>
    createIngredient({
      businessId: BUSINESS_ID,
      name: "עגבניות לבדיקה",
      unit: "kg",
      pricePerUnit: 5,
    }),
  );

  const { data: product } = await callAsOwner(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: "רוטב לבדיקת מתכון",
      unit: "kg",
      shelfLifeMinutes: 60 * 24,
    }),
  );

  const { data: v1 } = await callAsOwner(() =>
    createRecipeVersion({
      businessId: BUSINESS_ID,
      productId: product.productId,
      lines: [{ ingredientId: ingredient.ingredientId, quantity: 2 }],
      yieldQuantity: 2,
    }),
  );
  assert.equal(v1.versionNumber, 1);
  assert.equal(v1.totalCostSnapshot, 10); // 2kg * 5
  assert.equal(v1.costPerUnitSnapshot, 5); // 10 / yieldQuantity(2)

  // מעדכנים את המחיר — לא אמור לשנות למפרע את v1
  await callAsOwner(() =>
    updateIngredientPrice({
      businessId: BUSINESS_ID,
      ingredientId: ingredient.ingredientId,
      newPricePerUnit: 8,
    }),
  );

  // אותן שורות+תפוקה בדיוק כמו v1, אבל אחרי שהמחיר התעדכן — עדיין
  // אמורה ליצור גרסה חדשה (לא unchanged), כי pricePerUnitSnapshot
  // המחושב בפועל שונה מ-v1 גם אם ה-ingredientId/quantity/yield זהים.
  const { data: v2 } = await callAsOwner(() =>
    createRecipeVersion({
      businessId: BUSINESS_ID,
      productId: product.productId,
      lines: [{ ingredientId: ingredient.ingredientId, quantity: 2 }],
      yieldQuantity: 2,
    }),
  );
  assert.equal(v2.versionNumber, 2);
  assert.equal(v2.unchanged, undefined);
  assert.equal(v2.totalCostSnapshot, 16); // 2kg * 8 (המחיר החדש)
  assert.equal(v2.costPerUnitSnapshot, 8); // 16 / yieldQuantity(2)

  // שמירה שלישית עם *בדיוק* אותן שורות+תפוקה כמו v2 (בלי שינוי מחיר
  // הפעם) — לא אמורה ליצור גרסה חדשה בכלל.
  const { data: v3 } = await callAsOwner(() =>
    createRecipeVersion({
      businessId: BUSINESS_ID,
      productId: product.productId,
      lines: [{ ingredientId: ingredient.ingredientId, quantity: 2 }],
      yieldQuantity: 2,
    }),
  );
  assert.equal(v3.unchanged, true);
  assert.equal(v3.versionNumber, 2); // לא קפץ ל-3
  assert.equal(v3.recipeVersionId, v2.recipeVersionId);

  // shiftManager לא יכול ליצור מרכיב/גרסת מתכון
  await assert.rejects(
    () =>
      callAsStaff(() =>
        createIngredient({
          businessId: BUSINESS_ID,
          name: "מרכיב אסור",
          unit: "kg",
          pricePerUnit: 1,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/permission-denied");
      return true;
    },
  );
});

test("createRecipeVersion דוחה מרכיב לא קיים ומרכיב כפול באותה גרסה", async () => {
  const createProduct = httpsCallable(functions, "createProduct");
  const createIngredient = httpsCallable(functions, "createIngredient");
  const createRecipeVersion = httpsCallable(functions, "createRecipeVersion");

  const { data: product } = await callAsOwner(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: "מוצר לבדיקת שגיאות מתכון",
      unit: "kg",
      shelfLifeMinutes: 60,
    }),
  );

  await assert.rejects(
    () =>
      callAsOwner(() =>
        createRecipeVersion({
          businessId: BUSINESS_ID,
          productId: product.productId,
          lines: [{ ingredientId: "no-such-ingredient", quantity: 1 }],
          yieldQuantity: 1,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/not-found");
      return true;
    },
  );

  const { data: ingredient } = await callAsOwner(() =>
    createIngredient({
      businessId: BUSINESS_ID,
      name: "מרכיב לבדיקת כפילות",
      unit: "kg",
      pricePerUnit: 1,
    }),
  );

  await assert.rejects(
    () =>
      callAsOwner(() =>
        createRecipeVersion({
          businessId: BUSINESS_ID,
          productId: product.productId,
          lines: [
            { ingredientId: ingredient.ingredientId, quantity: 1 },
            { ingredientId: ingredient.ingredientId, quantity: 2 },
          ],
          yieldQuantity: 1,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );
});

test("createRecipeVersion דוחה yieldQuantity חסר/לא חיובי", async () => {
  const createProduct = httpsCallable(functions, "createProduct");
  const createIngredient = httpsCallable(functions, "createIngredient");
  const createRecipeVersion = httpsCallable(functions, "createRecipeVersion");

  const { data: product } = await callAsOwner(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: "מוצר לבדיקת תפוקה",
      unit: "kg",
      shelfLifeMinutes: 60,
    }),
  );
  const { data: ingredient } = await callAsOwner(() =>
    createIngredient({
      businessId: BUSINESS_ID,
      name: "מרכיב לבדיקת תפוקה",
      unit: "kg",
      pricePerUnit: 2,
    }),
  );

  await assert.rejects(
    () =>
      callAsOwner(() =>
        createRecipeVersion({
          businessId: BUSINESS_ID,
          productId: product.productId,
          lines: [{ ingredientId: ingredient.ingredientId, quantity: 1 }],
          yieldQuantity: 0,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );

  await assert.rejects(
    () =>
      callAsOwner(() =>
        createRecipeVersion({
          businessId: BUSINESS_ID,
          productId: product.productId,
          lines: [{ ingredientId: ingredient.ingredientId, quantity: 1 }],
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );
});

test("createBatch: preparedByStaffId — null כ-owner מצליח (\"בעל/ת העסק\"), נדחה כ-shiftManager, ונדחה עם staffId לא קיים", async () => {
  const createBatch = httpsCallable(functions, "createBatch");

  const { data: ownerBatch } = await callAsOwner(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 1,
      preparedAtClient: new Date().toISOString(),
      preparedByStaffId: null,
    }),
  );
  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/batches/${ownerBatch.batchId}`)
      .get();
    assert.equal(snap.data().preparedByStaffId, null);
    assert.equal(snap.data().preparedByNameSnapshot, "בעל/ת העסק");
  });

  // shiftManager חייב לבחור staffId מפורש — null (=בעל/ת העסק) אסור לו.
  await assert.rejects(
    () =>
      callAsStaff(() =>
        createBatch({
          businessId: BUSINESS_ID,
          productId: PRODUCT_ID,
          quantity: 1,
          preparedAtClient: new Date().toISOString(),
          preparedByStaffId: null,
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/invalid-argument");
      return true;
    },
  );

  // staffId שלא קיים בכלל — נדחה.
  await assert.rejects(
    () =>
      callAsStaff(() =>
        createBatch({
          businessId: BUSINESS_ID,
          productId: PRODUCT_ID,
          quantity: 1,
          preparedAtClient: new Date().toISOString(),
          preparedByStaffId: "no-such-staff",
        }),
      ),
    (err) => {
      assert.equal(err.code, "functions/not-found");
      return true;
    },
  );

  // מסלול רגיל (staffId קיים) — snapshot נכון של השם.
  const { data: staffBatch } = await callAsStaff(() =>
    createBatch({
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      quantity: 1,
      preparedAtClient: new Date().toISOString(),
      preparedByStaffId: STAFF_ID,
    }),
  );
  await rulesTestEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx
      .firestore()
      .doc(`businesses/${BUSINESS_ID}/batches/${staffBatch.batchId}`)
      .get();
    assert.equal(snap.data().preparedByStaffId, STAFF_ID);
    assert.equal(snap.data().preparedByNameSnapshot, "דנה");
  });
});

test("getRecipePreview: מחזירה כמויות-ליחידה בלי אף שדה כספי (גם ל-shiftManager); hasRecipe:false כשאין מתכון", async () => {
  const createIngredient = httpsCallable(functions, "createIngredient");
  const createProduct = httpsCallable(functions, "createProduct");
  const createRecipeVersion = httpsCallable(functions, "createRecipeVersion");
  const getRecipePreview = httpsCallable(functions, "getRecipePreview");

  const { data: ingredient } = await callAsOwner(() =>
    createIngredient({
      businessId: BUSINESS_ID,
      name: "מרכיב לתצוגה מקדימה",
      unit: "kg",
      pricePerUnit: 3,
    }),
  );
  const { data: product } = await callAsOwner(() =>
    createProduct({
      businessId: BUSINESS_ID,
      name: "מוצר לתצוגה מקדימה",
      unit: "liter",
      shelfLifeMinutes: 60,
    }),
  );

  // בלי מתכון בכלל — hasRecipe: false.
  const { data: noRecipe } = await callAsStaff(() =>
    getRecipePreview({ businessId: BUSINESS_ID, productId: product.productId }),
  );
  assert.equal(noRecipe.hasRecipe, false);

  await callAsOwner(() =>
    createRecipeVersion({
      businessId: BUSINESS_ID,
      productId: product.productId,
      lines: [{ ingredientId: ingredient.ingredientId, quantity: 4 }],
      yieldQuantity: 20, // 20 ליטר יוצא מהמתכון
    }),
  );

  const { data: preview } = await callAsStaff(() =>
    getRecipePreview({ businessId: BUSINESS_ID, productId: product.productId }),
  );
  assert.equal(preview.hasRecipe, true);
  assert.equal(preview.yieldQuantity, 20);
  assert.equal(preview.lines.length, 1);
  assert.equal(preview.lines[0].ingredientNameSnapshot, "מרכיב לתצוגה מקדימה");
  assert.equal(preview.lines[0].unit, "kg");
  assert.equal(preview.lines[0].perUnitQuantity, 4 / 20);
  assert.equal(
    Object.prototype.hasOwnProperty.call(preview.lines[0], "pricePerUnitSnapshot"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(preview.lines[0], "lineCostSnapshot"),
    false,
  );
  assert.equal("totalCostSnapshot" in preview, false);
  assert.equal("costPerUnitSnapshot" in preview, false);

  // owner מקבל בדיוק אותו דבר — הפונקציה הזו לא owner-only, שני
  // התפקידים צריכים לראות כמויות ביצירת אצווה.
  const { data: previewAsOwner } = await callAsOwner(() =>
    getRecipePreview({ businessId: BUSINESS_ID, productId: product.productId }),
  );
  assert.equal(previewAsOwner.lines[0].perUnitQuantity, 4 / 20);
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
