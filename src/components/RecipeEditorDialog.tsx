import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Ingredient, Product } from "../lib/types";
import { RecipeLinesEditor } from "./RecipeLinesEditor";
import type { LineDraft } from "./RecipeLinesEditor";
import { describeError } from "../lib/describeError";
import { Spinner } from "./Spinner";

interface Props {
  product: Product;
  ingredients: Ingredient[];
  onClose: () => void;
}

interface RecipeLineData {
  ingredientId: string;
  ingredientNameSnapshot: string;
  quantity: number;
  unit: string;
  // נעדרים לגמרי מהתשובה כש-caller אינו owner — ראו
  // functions/src/recipes/getRecipeVersionForEdit.ts.
  pricePerUnitSnapshot?: number | null;
  lineCostSnapshot?: number | null;
}

interface CurrentVersionData {
  hasRecipe: boolean;
  versionNumber?: number;
  yieldQuantity?: number;
  lines?: RecipeLineData[];
  totalCostSnapshot?: number | null;
  costPerUnitSnapshot?: number | null;
}

/**
 * עורך מתכון — נטען דרך getRecipeVersionForEdit (לא onSnapshot ישיר
 * על recipeVersions, שחסום ב-Rules למי שאינו owner) כדי שגם מנהל/ת
 * משמרת יוכל/תוכל לערוך מתכון בלי להיחשף לעלויות (שלוש רמות הרשאה,
 * ראו CLAUDE.md). נוכחות totalCostSnapshot בתשובה היא הסימן היחיד
 * שצריך לתצוגת עלות — אם השרת לא שלח אותו (shiftManager), לא
 * מציגים שום מספר.
 */
export function RecipeEditorDialog({ product, ingredients, onClose }: Props) {
  const [current, setCurrent] = useState<CurrentVersionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadCurrentVersion = useCallback(async () => {
    try {
      const getRecipeVersionForEdit = httpsCallable<
        { businessId: string; productId: string },
        CurrentVersionData
      >(functions, "getRecipeVersionForEdit");
      const { data } = await getRecipeVersionForEdit({
        businessId: getBusinessId(),
        productId: product.id,
      });
      setCurrent(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }, [product.id]);

  useEffect(() => {
    loadCurrentVersion();
    // reloadKey בכוונה בתלויות: מכריח רענון אחרי שמירה מוצלחת, גם
    // אם product.id לא השתנה.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCurrentVersion, reloadKey]);

  const hasCostData = current?.totalCostSnapshot !== undefined;

  // הגרסה החדשה מאותחלת מתוך הגרסה הנוכחית (לא ריקה) — כך "הסרת שורה"
  // ותיקון כמות הופכים שימושיים בפועל, במקום לדרוש הקלדה מחדש של כל
  // המתכון בכל פעם. ה-key למטה מכריח רימאונט (ולכן אתחול מחדש) בכל
  // פעם שהגרסה הנוכחית משתנה — למשל מיד אחרי שמירה מוצלחת (אחרי
  // הרענון מ-reloadKey).
  const initialLines: LineDraft[] | undefined = current?.hasRecipe
    ? current.lines?.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: String(line.quantity),
      }))
    : undefined;
  const initialYield = current?.hasRecipe ? String(current.yieldQuantity) : undefined;

  return (
    <div className="dialog-backdrop" dir="rtl">
      <div className="dialog">
        <h2>מתכון: {product.name}</h2>

        {loadError && <p className="error-text">{loadError}</p>}

        {!current && !loadError && (
          <p>
            <Spinner /> טוען...
          </p>
        )}

        {current?.hasRecipe && (
          <div>
            <p>
              גרסה נוכחית: {current.versionNumber}
              {hasCostData && (
                <>
                  {" "}
                  — עלות כוללת להכנה אחת:{" "}
                  {current.totalCostSnapshot === null
                    ? "לא ידועה (מרכיב ממתין למחיר)"
                    : current.totalCostSnapshot!.toFixed(2)}{" "}
                  · עלות ל-{product.unit} בודד/ת:{" "}
                  {current.costPerUnitSnapshot === null
                    ? "—"
                    : current.costPerUnitSnapshot!.toFixed(2)}
                </>
              )}
            </p>
            <ul>
              {current.lines?.map((line) => (
                <li key={line.ingredientId}>
                  {line.ingredientNameSnapshot}: {line.quantity} {line.unit}
                  {hasCostData && (
                    <>
                      {" "}
                      ×{" "}
                      {line.pricePerUnitSnapshot === null
                        ? "ממתין למחיר"
                        : line.pricePerUnitSnapshot}
                      {line.lineCostSnapshot !== null && line.lineCostSnapshot !== undefined
                        ? ` = ${line.lineCostSnapshot.toFixed(2)}`
                        : ""}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {current && !current.hasRecipe && (
          <p className="warning-text">
            אין עדיין מתכון למוצר זה
            {hasCostData
              ? " — עד שתוגדר גרסת מתכון, שווי הפחת שלו לא יחושב בדוח הפחת ורווחיות (אין עלות ידועה לייחס אליה)."
              : "."}
          </p>
        )}

        {current && (
          <>
            <h3>{current.hasRecipe ? "עדכון המתכון" : "יצירת מתכון"}</h3>
            {message && <p className="warning-text">{message}</p>}
            <RecipeLinesEditor
              key={current.hasRecipe ? String(current.versionNumber) : "new"}
              productId={product.id}
              productUnit={product.unit}
              ingredients={ingredients}
              initialLines={initialLines}
              initialYield={initialYield}
              submitLabel="שמירת גרסה חדשה"
              secondaryActionLabel="סגירה"
              onSecondaryAction={onClose}
              onSaved={(result) => {
                setMessage(
                  result.unchanged
                    ? "אין שינוי מהגרסה הנוכחית — לא נוצרה גרסה חדשה"
                    : `גרסה ${result.versionNumber} נשמרה בהצלחה`,
                );
                setReloadKey((k) => k + 1);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
