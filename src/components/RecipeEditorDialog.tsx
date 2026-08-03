import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Ingredient, Product, RecipeVersion } from "../lib/types";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { Spinner } from "./Spinner";

interface Props {
  product: Product;
  ingredients: Ingredient[];
  onClose: () => void;
}

interface LineDraft {
  ingredientId: string;
  quantity: string;
}

export function RecipeEditorDialog({ product, ingredients, onClose }: Props) {
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([
    { ingredientId: ingredients[0]?.id ?? "", quantity: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  useEffect(() => {
    const businessId = getBusinessId();
    const versionsQuery = query(
      collection(
        db,
        "businesses",
        businessId,
        "products",
        product.id,
        "recipeVersions",
      ),
      orderBy("versionNumber", "desc"),
    );
    return onSnapshot(versionsQuery, (snap) => {
      setVersions(
        snap.docs.map((d) => ({
          id: d.id,
          versionNumber: d.data().versionNumber,
          ingredients: d.data().ingredients,
          totalCostSnapshot: d.data().totalCostSnapshot,
        })),
      );
    });
  }, [product.id]);

  const currentVersion = versions.find((v) => v.id === product.currentRecipeVersionId);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ingredientId: ingredients[0]?.id ?? "", quantity: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedLines = lines
      .filter((l) => l.ingredientId)
      .map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity) }));

    if (parsedLines.length === 0 || parsedLines.some((l) => !(l.quantity > 0))) {
      setError("יש להוסיף לפחות שורה אחת עם כמות חיובית");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const createRecipeVersion = httpsCallable(functions, "createRecipeVersion");
      await createRecipeVersion({
        businessId: getBusinessId(),
        productId: product.id,
        lines: parsedLines,
      });
      setLines([{ ingredientId: ingredients[0]?.id ?? "", quantity: "" }]);
    } catch {
      setError("יצירת גרסת המתכון נכשלה — נסה/י שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" dir="rtl">
      <div className="dialog">
        <h2>מתכון: {product.name}</h2>

        {currentVersion ? (
          <div>
            <p>
              גרסה נוכחית: {currentVersion.versionNumber} — עלות כוללת:{" "}
              {currentVersion.totalCostSnapshot.toFixed(2)}
            </p>
            <ul>
              {currentVersion.ingredients.map((line) => (
                <li key={line.ingredientId}>
                  {line.ingredientNameSnapshot}: {line.quantity} {line.unit} ×{" "}
                  {line.pricePerUnitSnapshot} = {line.lineCostSnapshot.toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>אין עדיין מתכון למוצר זה</p>
        )}

        <h3>גרסה חדשה</h3>
        <form onSubmit={handleSubmit}>
          {lines.map((line, index) => (
            <div key={index} className="recipe-line">
              <select
                value={line.ingredientId}
                onChange={(e) => updateLine(index, { ingredientId: e.target.value })}
              >
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} ({ing.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="כמות"
                value={line.quantity}
                onChange={(e) => updateLine(index, { quantity: e.target.value })}
              />
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(index)}>
                  הסר
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addLine} disabled={ingredients.length === 0}>
            הוספת שורה
          </button>

          {ingredients.length === 0 && <p>יש ליצור מרכיבים לפני יצירת מתכון</p>}
          {!online && <p className="error-text">אין חיבור לאינטרנט — לא ניתן לשמור כרגע</p>}
          {error && <p className="error-text">{error}</p>}

          <div className="dialog-actions">
            <button type="submit" disabled={busy || !online || ingredients.length === 0}>
              {busy && <Spinner />} שמירת גרסה חדשה
            </button>
            <button type="button" onClick={onClose}>
              סגירה
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
