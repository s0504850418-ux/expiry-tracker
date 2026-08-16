import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { useAuth } from "../auth/useAuth";
import type { Ingredient, Product } from "../lib/types";
import { ProductFormDialog } from "../components/ProductFormDialog";
import { IngredientFormDialog } from "../components/IngredientFormDialog";
import { RecipeEditorDialog } from "../components/RecipeEditorDialog";
import { NewProductWizard } from "../components/NewProductWizard";
import { describeError } from "../lib/describeError";

type Tab = "products" | "ingredients";

interface Props {
  // פותח ישר על תת-לשונית "מרכיבים" — משמש את באנר "ממתין למחיר"
  // ב-AdminDashboard כדי לקפוץ ישר לשם.
  focusIngredients?: boolean;
}

/**
 * ניהול מוצרים/מרכיבים/מתכונים — משותף בין מסך הניהול (/admin,
 * owner) לבין דיאלוג "מוצרים ומרכיבים" בטאבלט (shiftManager/owner,
 * ראו TabletDashboard.tsx). שלוש רמות הרשאה (CLAUDE.md): מנהל/ת
 * משמרת יכול/ה להוסיף מוצר/מרכיב/מתכון בלי להיחשף לעלויות; owner
 * מקבל/ת גם מחירים. רשימת המרכיבים נטענת דרך listIngredients (לא
 * onSnapshot ישיר — ingredients חסום ב-Rules למי שאינו owner, כי
 * המסמך מכיל מחיר) שכבר מצנזרת לפי role בצד השרת.
 */
export function ProductsManagement({ focusIngredients }: Props) {
  const businessId = getBusinessId();
  const { claims } = useAuth();
  const isOwner = claims?.role === "owner";
  const [tab, setTab] = useState<Tab>(focusIngredients ? "ingredients" : "products");
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientsError, setIngredientsError] = useState<string | null>(null);

  const [showNewProductWizard, setShowNewProductWizard] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | "new" | null>(
    null,
  );
  const [recipeProductId, setRecipeProductId] = useState<string | null>(null);
  const recipeProduct = products.find((p) => p.id === recipeProductId) ?? null;

  const loadIngredients = useCallback(async () => {
    try {
      const listIngredients = httpsCallable<
        { businessId: string },
        { ingredients: Ingredient[] }
      >(functions, "listIngredients");
      const { data } = await listIngredients({ businessId });
      setIngredients(data.ingredients);
      setIngredientsError(null);
    } catch (err) {
      setIngredientsError(describeError(err));
    }
  }, [businessId]);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "businesses", businessId, "products")),
      (snap) => {
        setProducts(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name,
            unit: d.data().unit,
            shelfLifeMinutes: d.data().shelfLifeMinutes,
            active: d.data().active,
            currentRecipeVersionId: d.data().currentRecipeVersionId ?? null,
            partialUsageUpdateFrequency: d.data().partialUsageUpdateFrequency ?? null,
            notifyBeforeExpiryMinutes: d.data().notifyBeforeExpiryMinutes ?? null,
          })),
        );
      },
    );
  }, [businessId]);

  return (
    <div>
      <div className="dashboard-toolbar">
        <button
          type="button"
          onClick={() => setTab("products")}
          aria-pressed={tab === "products"}
        >
          מוצרים
        </button>
        <button
          type="button"
          onClick={() => setTab("ingredients")}
          aria-pressed={tab === "ingredients"}
        >
          מרכיבים
        </button>
      </div>

      {tab === "products" && (
        <div>
          <button type="button" onClick={() => setShowNewProductWizard(true)}>
            מוצר חדש
          </button>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>יחידה</th>
                  <th>חיי מדף (ימים)</th>
                  <th>התראה לפני תפוגה</th>
                  <th>תדירות עדכון כמות</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={7}>אין עדיין מוצרים רשומים</td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.unit}</td>
                      <td>{Math.round(p.shelfLifeMinutes / (60 * 24))}</td>
                      <td>
                        {p.notifyBeforeExpiryMinutes
                          ? `${Math.round(p.notifyBeforeExpiryMinutes / (60 * 24))} ימים לפני`
                          : "ברירת מחדל"}
                      </td>
                      <td>
                        {p.partialUsageUpdateFrequency === "endOfDay"
                          ? "כל סוף יום"
                          : "בסוף חיי האצווה"}
                      </td>
                      <td>{p.active ? "פעיל" : "לא פעיל"}</td>
                      <td>
                        <div className="batch-actions">
                          <button type="button" onClick={() => setEditingProduct(p)}>
                            עריכה
                          </button>
                          <button type="button" onClick={() => setRecipeProductId(p.id)}>
                            מתכון
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "ingredients" && (
        <div>
          <button type="button" onClick={() => setEditingIngredient("new")}>
            מרכיב חדש
          </button>
          {ingredientsError && <p className="error-text">{ingredientsError}</p>}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>יחידה</th>
                  <th>{isOwner ? "מחיר נוכחי" : "סטטוס מחיר"}</th>
                  <th>סטטוס</th>
                  {isOwner && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {ingredients.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 5 : 4}>אין עדיין מרכיבים רשומים</td>
                  </tr>
                ) : (
                  ingredients.map((ing) => (
                    <tr key={ing.id}>
                      <td>{ing.name}</td>
                      <td>{ing.unit}</td>
                      <td>
                        {isOwner ? (
                          ing.currentPricePerUnit === null ? (
                            <span className="reminder-badge">ממתין למחיר</span>
                          ) : (
                            `${ing.currentPricePerUnit} ל-${ing.unit}`
                          )
                        ) : ing.priceStatus === "pending" ? (
                          <span className="reminder-badge">ממתין למחיר</span>
                        ) : (
                          "הוגדר"
                        )}
                      </td>
                      <td>{ing.active ? "פעיל" : "לא פעיל"}</td>
                      {isOwner && (
                        <td>
                          <button type="button" onClick={() => setEditingIngredient(ing)}>
                            עדכון מחיר
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewProductWizard && (
        <NewProductWizard
          ingredients={ingredients.filter((i) => i.active)}
          onClose={() => setShowNewProductWizard(false)}
          onFinished={() => setShowNewProductWizard(false)}
        />
      )}

      {editingProduct && (
        <ProductFormDialog
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={() => setEditingProduct(null)}
        />
      )}

      {editingIngredient && (
        <IngredientFormDialog
          ingredient={editingIngredient === "new" ? null : editingIngredient}
          onClose={() => setEditingIngredient(null)}
          onSaved={() => {
            setEditingIngredient(null);
            loadIngredients();
          }}
        />
      )}

      {recipeProduct && (
        <RecipeEditorDialog
          product={recipeProduct}
          ingredients={ingredients.filter((i) => i.active)}
          onClose={() => setRecipeProductId(null)}
        />
      )}
    </div>
  );
}
