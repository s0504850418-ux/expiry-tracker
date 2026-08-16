import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Ingredient } from "../lib/types";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { describeError } from "../lib/describeError";
import { IngredientFormDialog } from "./IngredientFormDialog";
import { Spinner } from "./Spinner";

export interface LineDraft {
  ingredientId: string;
  quantity: string;
}

interface SavedResult {
  recipeVersionId: string;
  versionNumber: number;
  unchanged: boolean;
}

interface Props {
  productId: string;
  productUnit: string;
  ingredients: Ingredient[];
  // ריקים = מוצר חדש בלי מתכון. אחרת, השורות/תפוקה מאותחלות מהגרסה
  // הנוכחית — כך "הסרת שורה" הופכת שימושית לתיקון טעות אמיתי, במקום
  // להתחיל תמיד מאפס (ראו הערה בתיעוד השינוי).
  initialLines?: LineDraft[];
  initialYield?: string;
  submitLabel: string;
  secondaryActionLabel: string;
  onSecondaryAction: () => void;
  onSaved: (result: SavedResult) => void;
}

/**
 * עורך שורות מתכון (מרכיב+כמות) + שדה תפוקה — רכיב משותף שמשמש גם
 * את RecipeEditorDialog (עריכת מתכון קיים) וגם את שלב 2 של אשף יצירת
 * מוצר חדש (NewProductWizard), כדי שתיקוני הבהירות/ולידציה/מניעת
 * כפילות ייכתבו במקום אחד.
 */
export function RecipeLinesEditor({
  productId,
  productUnit,
  ingredients,
  initialLines,
  initialYield,
  submitLabel,
  secondaryActionLabel,
  onSecondaryAction,
  onSaved,
}: Props) {
  const [lines, setLines] = useState<LineDraft[]>(
    initialLines && initialLines.length > 0
      ? initialLines
      : [{ ingredientId: "", quantity: "" }],
  );
  const [yieldQuantity, setYieldQuantity] = useState(initialYield ?? "");
  const [error, setError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const online = useOnlineStatus();

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ingredientId: "", quantity: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  // אחרי יצירת מרכיב חדש דרך הכפתור בתוך העורך הזה: אם יש שורה ריקה
  // (בלי מרכיב נבחר), ממלאים אותה עם המרכיב החדש; אחרת מוסיפים שורה
  // חדשה שכבר בוחרת אותו — כדי שלא צריך יהיה לחפש אותו ברשימה בנפרד.
  function handleIngredientCreated(createdIngredientId?: string) {
    setShowAddIngredient(false);
    if (!createdIngredientId) return;
    setLines((prev) => {
      const emptyIndex = prev.findIndex((l) => !l.ingredientId);
      if (emptyIndex !== -1) {
        return prev.map((l, i) =>
          i === emptyIndex ? { ...l, ingredientId: createdIngredientId } : l,
        );
      }
      return [...prev, { ingredientId: createdIngredientId, quantity: "" }];
    });
  }

  // מרכיבים שכבר נבחרו בשורה *אחרת* — מוסתרים מה-select של השורה הזו,
  // כדי שלא ניתן יהיה לבחור אותו מרכיב פעמיים דרך הממשק בכלל.
  function usedElsewhere(index: number): Set<string> {
    return new Set(
      lines
        .filter((_, i) => i !== index)
        .map((l) => l.ingredientId)
        .filter(Boolean),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLineErrors({});

    const yieldNumber = Number(yieldQuantity);
    if (!(yieldNumber > 0)) {
      setError("יש להזין תפוקה חיובית — כמה יוצא מהמתכון בסך הכל");
      return;
    }

    const selected = lines.map((l, index) => ({ ...l, index })).filter((l) => l.ingredientId);

    if (selected.length === 0) {
      setError("יש לבחור לפחות מרכיב אחד");
      return;
    }

    const newLineErrors: Record<number, string> = {};
    for (const l of selected) {
      if (!(Number(l.quantity) > 0)) {
        newLineErrors[l.index] = "יש להזין כמות חיובית";
      }
    }
    if (Object.keys(newLineErrors).length > 0) {
      setLineErrors(newLineErrors);
      return;
    }

    const parsedLines = selected.map((l) => ({
      ingredientId: l.ingredientId,
      quantity: Number(l.quantity),
    }));

    setBusy(true);
    try {
      const createRecipeVersion = httpsCallable<
        unknown,
        { recipeVersionId: string; versionNumber: number; unchanged?: boolean }
      >(functions, "createRecipeVersion");
      const { data } = await createRecipeVersion({
        businessId: getBusinessId(),
        productId,
        lines: parsedLines,
        yieldQuantity: yieldNumber,
      });
      onSaved({
        recipeVersionId: data.recipeVersionId,
        versionNumber: data.versionNumber,
        unchanged: data.unchanged ?? false,
      });
    } catch (err) {
      setError(
        describeError(err, {
          "not-found": "אחד המרכיבים שנבחרו לא נמצא — ייתכן שהוסר",
          "invalid-argument": "יש לוודא שכל שורה כוללת כמות חיובית ושאין מרכיב כפול",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="recipe-yield">תפוקת המתכון ({productUnit})</label>
      <input
        id="recipe-yield"
        type="number"
        min="0"
        step="any"
        placeholder="למשל 20"
        value={yieldQuantity}
        onChange={(e) => setYieldQuantity(e.target.value)}
      />
      <p className="field-hint">
        כמה {productUnit} יוצאים מהכנה אחת של המתכון הזה. המערכת תחשב לבד עלות
        ליחידה אחת ({productUnit} בודד/ת), ותשתמש בה לפי הכמות שתוכן בפועל בכל אצווה.
      </p>

      <h4>מרכיבים</h4>
      {lines.map((line, index) => {
        const excluded = usedElsewhere(index);
        return (
          <div key={index} className="recipe-line">
            <div className="recipe-line-field ingredient">
              <label htmlFor={`recipe-line-ingredient-${index}`}>מרכיב</label>
              <select
                id={`recipe-line-ingredient-${index}`}
                value={line.ingredientId}
                onChange={(e) => updateLine(index, { ingredientId: e.target.value })}
              >
                <option value="">בחר/י מרכיב...</option>
                {ingredients
                  .filter((ing) => !excluded.has(ing.id))
                  .map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
              </select>
            </div>
            <div className="recipe-line-field quantity">
              <label htmlFor={`recipe-line-quantity-${index}`}>כמות ({line.ingredientId ? ingredients.find((i) => i.id === line.ingredientId)?.unit : "יחידת המרכיב"})</label>
              <input
                id={`recipe-line-quantity-${index}`}
                type="number"
                min="0"
                step="any"
                value={line.quantity}
                onChange={(e) => updateLine(index, { quantity: e.target.value })}
              />
            </div>
            {lines.length > 1 && (
              <button type="button" onClick={() => removeLine(index)}>
                הסר שורה
              </button>
            )}
            {lineErrors[index] && <p className="error-text">{lineErrors[index]}</p>}
          </div>
        );
      })}
      <button type="button" onClick={addLine} disabled={ingredients.length === 0}>
        הוספת שורה
      </button>
      <button type="button" onClick={() => setShowAddIngredient(true)}>
        מרכיב חדש
      </button>

      {ingredients.length === 0 && (
        <p className="warning-text">
          אין עדיין מרכיבים רשומים בעסק — לחצ/י על "מרכיב חדש" כדי ליצור אחד
          ולהמשיך ישירות מכאן.
        </p>
      )}
      {!online && <p className="error-text">אין חיבור לאינטרנט — לא ניתן לשמור כרגע</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="dialog-actions">
        <button type="submit" disabled={busy || !online || ingredients.length === 0}>
          {busy && <Spinner />} {submitLabel}
        </button>
        <button type="button" onClick={onSecondaryAction}>
          {secondaryActionLabel}
        </button>
      </div>

      {showAddIngredient && (
        <IngredientFormDialog
          ingredient={null}
          onClose={() => setShowAddIngredient(false)}
          onSaved={handleIngredientCreated}
        />
      )}
    </form>
  );
}
