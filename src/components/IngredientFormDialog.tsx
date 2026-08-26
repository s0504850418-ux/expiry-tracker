import { useState } from "react";
import { createPortal } from "react-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { useAuth } from "../auth/useAuth";
import type { Ingredient } from "../lib/types";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { describeError } from "../lib/describeError";
import { Spinner } from "./Spinner";

interface Props {
  ingredient: Ingredient | null; // null = יצירה חדשה, אחרת = עדכון מחיר בלבד (owner בלבד מגיע/ה לכאן)
  onClose: () => void;
  // בעת יצירת מרכיב חדש (ingredient === null), מקבל גם את פרטי המרכיב
  // שנוצר (לא רק ה-id) — כדי שעורך המתכון (RecipeLinesEditor) יוכל
  // להוסיף אותו מיד לרשימת האפשרויות המקומית שלו ולבחור אותו בשורה,
  // בלי לחכות שהרכיב ההורה (ProductsManagement) יטען מחדש את כל
  // רשימת המרכיבים מהשרת ברקע.
  onSaved: (created?: { id: string; name: string; unit: string }) => void;
}

export function IngredientFormDialog({ ingredient, onClose, onSaved }: Props) {
  const { claims } = useAuth();
  const isOwner = claims?.role === "owner";
  const [name, setName] = useState(ingredient?.name ?? "");
  const [unit, setUnit] = useState(ingredient?.unit ?? "kg");
  const [price, setPrice] = useState(
    ingredient?.currentPricePerUnit !== null && ingredient?.currentPricePerUnit !== undefined
      ? String(ingredient.currentPricePerUnit)
      : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  // ביצירת מרכיב חדש, שדה המחיר מוצג רק ל-owner — מנהל/ת משמרת לא
  // רואה/ת מחיר בכלל (שלוש רמות הרשאה, ראו CLAUDE.md). ב"עדכון מחיר"
  // (ingredient !== null) תמיד owner, כי רק owner מגיע/ה למסך הזה.
  const showPriceField = !!ingredient || isOwner;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // גם עם ה-Portal (למטה): React מבעבע אירועים דרך עץ ה-React
    // ה"לוגי" (איפה שהרכיב מוצג ב-JSX), לא דרך עץ ה-DOM בפועל —
    // בלי stopPropagation כאן, ה-onSubmit של ה-<form> החיצוני
    // (RecipeLinesEditor) עדיין ירוץ בעקבות ה-click הזה, וישמור
    // גרסת מתכון מוקדם מדי/חלקית. ה-Portal לבד פותר רק את הבעיה
    // ברמת ה-DOM (הדפדפן מנווט מחדש כשיש <form> מקונן פיזית) —
    // שתי הבעיות שונות, שני התיקונים נדרשים יחד.
    e.stopPropagation();
    if (!ingredient && !name.trim()) {
      setError("יש להזין שם");
      return;
    }
    let priceNumber: number | undefined;
    if (showPriceField && price.trim() !== "") {
      priceNumber = Number(price);
      if (!(priceNumber >= 0)) {
        setError("מחיר חייב להיות מספר לא שלילי, או ריק אם עדיין לא ידוע");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      if (ingredient) {
        const updateIngredientPrice = httpsCallable(functions, "updateIngredientPrice");
        await updateIngredientPrice({
          businessId: getBusinessId(),
          ingredientId: ingredient.id,
          newPricePerUnit: priceNumber,
        });
        onSaved();
      } else {
        const createIngredient = httpsCallable<unknown, { ingredientId: string }>(
          functions,
          "createIngredient",
        );
        const { data } = await createIngredient({
          businessId: getBusinessId(),
          name: name.trim(),
          unit,
          ...(priceNumber !== undefined ? { pricePerUnit: priceNumber } : {}),
        });
        onSaved({ id: data.ingredientId, name: name.trim(), unit });
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  // הדיאלוג הזה יכול להיפתח מקונן בתוך <form> אחר (RecipeLinesEditor,
  // זרימת "מרכיב חדש" מתוך עורך המתכון/אשף מוצר חדש) — <form> בתוך
  // <form> הוא HTML לא תקין. ניסינו בהתחלה רק e.stopPropagation()
  // (עדיין נדרש, ראו handleSubmit למעלה) כדי למנוע מה-onSubmit של
  // ה-form החיצוני לרוץ, אבל בדיקה אמיתית בדפדפן (Playwright, לא רק
  // קריאת קוד) גילתה שזה לא מספיק לבד: הדפדפן עצמו (לא React) עדיין
  // ביצע הגשה (submit) מקורית של ה-<form> המקונן פיזית ב-DOM וניווט
  // מחדש לעמוד (איפוס מלא של המצב, כולל כל מה שלא נשמר) — תוצר לוואי
  // של מבנה DOM לא תקני שהדפדפן לא מתמודד איתו כמצופה, בלי קשר בכלל
  // ל-e.preventDefault()/stopPropagation() ברמת React. הפתרון לבעיה
  // הזו: להוציא את ה-DOM של הדיאלוג הזה physically מחוץ ל-<form>
  // החיצוני באמצעות Portal (מוצג עדיין ויזואלית באותו מקום,
  // dialog-backdrop מכסה הכל). שני התיקונים נדרשים יחד — ה-Portal
  // פותר את בעיית ה-DOM/ניווט, ה-stopPropagation פותר בנפרד את
  // בעיית ה-bubbling הלוגי של React (שממשיך לעבוד גם דרך Portal, כי
  // React מבעבע אירועים לפי מבנה ה-JSX ולא לפי מבנה ה-DOM בפועל).
  return createPortal(
    <div className="dialog-backdrop" dir="rtl">
      <form onSubmit={handleSubmit} className="dialog">
        <h2>{ingredient ? `עדכון מחיר: ${ingredient.name}` : "מרכיב חדש"}</h2>
        {!ingredient && (
          <p className="field-hint">
            "מרכיב" הוא חומר גלם שנקנה ליחידה (למשל ק"ג עגבניות, ליטר שמן) —
            משמש בהמשך כשורה במתכון של מוצר.
            {showPriceField
              ? " המחיר ליחידה כאן הוא הבסיס לחישוב עלות המתכון ושווי הפחת בדוחות."
              : " אפשר להשתמש בו במתכון מיד — בעל/ת העסק ישלים/תשלים את המחיר מאוחר יותר."}
          </p>
        )}

        {!ingredient && (
          <>
            <label htmlFor="ingredient-name">שם המרכיב</label>
            <input
              id="ingredient-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <label htmlFor="ingredient-unit">יחידת מידה לרכישה (למשל kg, liter)</label>
            <input
              id="ingredient-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </>
        )}

        {showPriceField && (
          <>
            <label htmlFor="ingredient-price">
              מחיר ל-{ingredient?.unit ?? unit} אחד/ת (₪)
            </label>
            <input
              id="ingredient-price"
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              autoFocus={!!ingredient}
            />
          </>
        )}

        {!online && <p className="error-text">אין חיבור לאינטרנט — לא ניתן לשמור כרגע</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" disabled={busy || !online}>
            {busy && <Spinner />} שמירה
          </button>
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
