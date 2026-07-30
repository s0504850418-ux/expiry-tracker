import { initializeApp, getApps } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

export { verifyOwnerCode } from "./auth/verifyOwnerCode";
export { verifyStaffPin } from "./auth/verifyStaffPin";
export { setOwnerCode } from "./auth/setOwnerCode";
export { setStaffPin } from "./auth/setStaffPin";
