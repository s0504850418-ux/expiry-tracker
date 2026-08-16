import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { useAuth } from "../auth/useAuth";
import type { Ingredient, PartialUsageUpdateFrequency } from "../lib/types";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { describeError } from "../lib/describeError";
import { Spinner } from "./Spinner";
import { RecipeLinesEditor } from "./RecipeLinesEditor";

interface Props {
  ingredients: Ingredient[];
  onClose: () => void;
  onFinished: () => void;
}

const UNITS = ["kg", "liter", "unit"] as const;

/**
 * יצירת מוצר חדש, בדיאלוג אחד עם שני שלבים — לא דיאלוג יצירה ואז
 * דיאלוג מתכון נפרד: שלב 1 (פרטי מוצר) ← createProduct ← שלב 2
 * (RecipeLinesEditor, אותו רכיב שמשמש גם את RecipeEditorDialog) באותו
 * חלון, עם אפשרות דילוג אם רוצים להוסיף מתכון מאוחר יותר.
 */
export function NewProductWizard({ ingredients, onClose, onFinished }: Props) {
  const { claims } = useAuth();
  const isOwner = claims?.role === "owner";
  const [createdProduct, setCreatedProduct] = useState<{ id: string; unit: string; name: string } | null>(
    null,
  );

  const [name, setName] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>("kg");
  const [shelfLifeDays, setShelfLifeDays] = useState("");
  const [partialUsageUpdateFrequency, setPartialUsageUpdateFrequency] = useState<
    PartialUsageUpdateFrequency | ""
  >("");
  const [notifyBeforeExpiryDays, setNotifyBeforeExpiryDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  async function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    const shelfLifeMinutes = Number(shelfLifeDays) * 60 * 24;
    if (!name.trim() || !(shelfLifeMinutes > 0)) {
      setError("יש להזין שם וחיי מדף חיוביים (בימים)");
      return;
    }
    if (
      isOwner &&
      notifyBeforeExpiryDays !== "" &&
      !(Number(notifyBeforeExpiryDays) > 0)
    ) {
      setError("זמן התראה לפני תפוגה חייב להיות מספר ימים חיובי, או ריק לברירת מחדל");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // תדירות עדכון כמות וזמן התראה לפני תפוגה הם owner-only (שלוש
      // רמות הרשאה, ראו CLAUDE.md) — מנהל/ת משמרת לא רואה/ת את
      // השדות האלה בכלל, ותמיד נשלח null (ברירת המחדל) עבורם.
      const frequency =
        isOwner && partialUsageUpdateFrequency !== "" ? partialUsageUpdateFrequency : null;
      const notifyBeforeExpiryMinutes =
        isOwner && notifyBeforeExpiryDays !== ""
          ? Number(notifyBeforeExpiryDays) * 60 * 24
          : null;
      const createProduct = httpsCallable<unknown, { productId: string }>(
        functions,
        "createProduct",
      );
      const { data } = await createProduct({
        businessId: getBusinessId(),
        name: name.trim(),
        unit,
        shelfLifeMinutes,
        partialUsageUpdateFrequency: frequency,
        notifyBeforeExpiryMinutes,
      });
      setCreatedProduct({ id: data.productId, unit, name: name.trim() });
    } catch (err) {
      setError(
        describeError(err, {
          "already-exists": "שם המוצר הזה כבר קיים במערכת — יש לבחור שם אחר",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (createdProduct) {
    return (
      <div className="dialog-backdrop" dir="rtl">
        <div className="dialog">
          <h2>מתכון עבור "{createdProduct.name}"</h2>
          <p className="warning-text">
            המוצר "{createdProduct.name}" נוצר בהצלחה. עכשיו אפשר להגדיר את
            המתכון שלו — בלי מתכון, שווי הפחת שלו <strong>לא יחושב</strong> בדוח
            הפחת ורווחיות. אפשר גם לדלג ולהוסיף מתכון מאוחר יותר דרך כפתור
            "מתכון" בטבלת המוצרים.
          </p>
          <RecipeLinesEditor
            productId={createdProduct.id}
            productUnit={createdProduct.unit}
            ingredients={ingredients}
            submitLabel="שמירת מתכון וסיום"
            secondaryActionLabel="דילוג — אוסיף מתכון מאוחר יותר"
            onSecondaryAction={onFinished}
            onSaved={() => onFinished()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-backdrop" dir="rtl">
      <form onSubmit={handleDetailsSubmit} className="dialog">
        <h2>מוצר חדש</h2>

        <label htmlFor="new-product-name">שם</label>
        <input
          id="new-product-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label htmlFor="new-product-unit">יחידת מידה</label>
        <select
          id="new-product-unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value as (typeof UNITS)[number])}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <p className="field-hint">
          קבועה למוצר לתמיד — אין המרה בין ק"ג/ליטר/יחידה במערכת.
        </p>

        <label htmlFor="new-product-shelf-life">חיי מדף (ימים)</label>
        <input
          id="new-product-shelf-life"
          type="number"
          min="0"
          step="any"
          value={shelfLifeDays}
          onChange={(e) => setShelfLifeDays(e.target.value)}
        />

        {isOwner && (
          <>
            <label htmlFor="new-product-update-frequency">תדירות עדכון כמות בשימוש חלקי</label>
            <select
              id="new-product-update-frequency"
              value={partialUsageUpdateFrequency ?? ""}
              onChange={(e) =>
                setPartialUsageUpdateFrequency(
                  e.target.value as PartialUsageUpdateFrequency | "",
                )
              }
            >
              <option value="">ברירת מחדל (בסוף חיי האצווה)</option>
              <option value="endOfBatchLife">בסוף חיי האצווה — תמיד</option>
              <option value="endOfDay">כל סוף יום</option>
            </select>

            <label htmlFor="new-product-notify-before-expiry">
              זמן התראה לפני תפוגה (ימים) — ריק לברירת מחדל
            </label>
            <input
              id="new-product-notify-before-expiry"
              type="number"
              min="0"
              step="any"
              value={notifyBeforeExpiryDays}
              onChange={(e) => setNotifyBeforeExpiryDays(e.target.value)}
            />
          </>
        )}

        {!online && <p className="error-text">אין חיבור לאינטרנט — לא ניתן לשמור כרגע</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" disabled={busy || !online}>
            {busy && <Spinner />} המשך להגדרת מתכון
          </button>
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
