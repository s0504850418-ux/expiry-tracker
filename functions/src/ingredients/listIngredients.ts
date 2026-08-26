import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireShiftManagerOrOwner } from "../lib/authz";

interface Data {
  businessId: string;
}

function validate(data: unknown): Data {
  const d = data as Partial<Data> | undefined;
  if (!d || typeof d.businessId !== "string" || d.businessId.length === 0) {
    throw new HttpsError("invalid-argument", "businessId נדרש");
  }
  return { businessId: d.businessId };
}

/**
 * מחזירה את רשימת המרכיבים בעסק — נדרשת כי `ingredients` חסום
 * לקריאה ישירה מה-Rules לכל מי שאינו owner (מחיר = נתון כספי), אבל
 * מנהל/ת משמרת צריכ/ה לראות שמות/יחידות כדי לבנות מתכון (ראו
 * CLAUDE.md, "שלוש רמות הרשאה"). **רק owner** מקבל/ת גם
 * currentPricePerUnit; שני התפקידים מקבלים priceStatus ("set"/
 * "pending") — זה *לא* נתון כספי (לא חושף כמה), רק שדגל השלמה
 * שמאפשר גם למנהל/ת משמרת להבין שמתכון לא ייכלל בדוח.
 */
export const listIngredients = onCall(async (request) => {
  const { businessId } = validate(request.data);
  const member = requireShiftManagerOrOwner(request, businessId);

  const snap = await getFirestore()
    .collection(`businesses/${businessId}/ingredients`)
    .get();

  const ingredients = snap.docs.map((doc) => {
    const data = doc.data();
    const currentPricePerUnit = (data.currentPricePerUnit as number | null | undefined) ?? null;
    const base = {
      id: doc.id,
      name: data.name as string,
      unit: data.unit as string,
      active: data.active as boolean,
      priceStatus: currentPricePerUnit === null ? ("pending" as const) : ("set" as const),
    };
    return member.role === "owner" ? { ...base, currentPricePerUnit } : base;
  });

  return { ingredients };
});
