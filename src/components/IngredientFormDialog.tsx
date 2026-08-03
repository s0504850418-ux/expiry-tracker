import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Ingredient } from "../lib/types";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { Spinner } from "./Spinner";

interface Props {
  ingredient: Ingredient | null; // null = יצירה חדשה, אחרת = עדכון מחיר בלבד
  onClose: () => void;
  onSaved: () => void;
}

export function IngredientFormDialog({ ingredient, onClose, onSaved }: Props) {
  const [name, setName] = useState(ingredient?.name ?? "");
  const [unit, setUnit] = useState(ingredient?.unit ?? "kg");
  const [price, setPrice] = useState(
    ingredient ? String(ingredient.currentPricePerUnit) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceNumber = Number(price);
    if (!(priceNumber >= 0) || (!ingredient && !name.trim())) {
      setError("יש להזין שם ומחיר לא שלילי");
      return;
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
      } else {
        const createIngredient = httpsCallable(functions, "createIngredient");
        await createIngredient({
          businessId: getBusinessId(),
          name: name.trim(),
          unit,
          pricePerUnit: priceNumber,
        });
      }
      onSaved();
    } catch {
      setError("השמירה נכשלה — נסה/י שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" dir="rtl">
      <form onSubmit={handleSubmit} className="dialog">
        <h2>{ingredient ? `עדכון מחיר: ${ingredient.name}` : "מרכיב חדש"}</h2>

        {!ingredient && (
          <>
            <label htmlFor="ingredient-name">שם</label>
            <input
              id="ingredient-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <label htmlFor="ingredient-unit">יחידת מידה</label>
            <input
              id="ingredient-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </>
        )}

        <label htmlFor="ingredient-price">
          מחיר ל-{ingredient?.unit ?? unit}
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
    </div>
  );
}
