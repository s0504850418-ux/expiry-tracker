import { initializeApp, getApps } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

export { verifyOwnerCode } from "./auth/verifyOwnerCode";
export { verifyStaffPin } from "./auth/verifyStaffPin";
export { setOwnerCode } from "./auth/setOwnerCode";
export { setStaffPin } from "./auth/setStaffPin";
export { claimOwnerAccessViaGoogle } from "./auth/claimOwnerAccessViaGoogle";
export { addAuthorizedOwnerEmail } from "./auth/addAuthorizedOwnerEmail";
export { listActiveStaffNames } from "./staff/listActiveStaffNames";
export { createBatch } from "./batches/createBatch";
export { updateBatchStatus } from "./batches/updateBatchStatus";
export { updateBatchPrintStatus } from "./batches/updateBatchPrintStatus";
export { createProduct } from "./products/createProduct";
export { updateProduct } from "./products/updateProduct";
export { createIngredient } from "./ingredients/createIngredient";
export { updateIngredientPrice } from "./ingredients/updateIngredientPrice";
export { createRecipeVersion } from "./recipes/createRecipeVersion";
export { checkExpiringBatches } from "./notifications/checkExpiringBatches";
