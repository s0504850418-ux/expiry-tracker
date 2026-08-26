import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Ingredient } from "../lib/types";

interface Props {
  onGoToIngredients: () => void;
}

/**
 * מתריע לבעל/ת העסק על מרכיבים שנוצרו (בד"כ ע"י מנהל/ת משמרת) בלי
 * מחיר — כל עוד המחיר לא הושלם, כל מתכון שמשתמש בהם לא נכלל בחישוב
 * דוח הפחת (ראו WasteReport.tsx). גלוי מכל לשונית ב-AdminDashboard,
 * לא רק "מוצרים" — כמו NotificationsPanel בטאבלט.
 */
export function PendingPriceBanner({ onGoToIngredients }: Props) {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const listIngredients = httpsCallable<
          { businessId: string },
          { ingredients: Ingredient[] }
        >(functions, "listIngredients");
        const { data } = await listIngredients({ businessId: getBusinessId() });
        if (!cancelled) {
          setPendingCount(data.ingredients.filter((i) => i.priceStatus === "pending").length);
        }
      } catch {
        // כשל שקט בכוונה — זה באנר משני, לא חוסם שום זרימה עיקרית.
        if (!cancelled) setPendingCount(0);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pendingCount) return null;

  return (
    <div className="notifications-panel">
      <p>
        {pendingCount} מרכיבים ממתינים למחיר — עד שיושלם, מתכונים שמשתמשים
        בהם לא נכללים בחישוב דוח הפחת.
      </p>
      <button type="button" onClick={onGoToIngredients}>
        השלמת מחירים
      </button>
    </div>
  );
}
