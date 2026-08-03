import { useEffect, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Ingredient, Product } from "../lib/types";
import { ProductFormDialog } from "../components/ProductFormDialog";
import { IngredientFormDialog } from "../components/IngredientFormDialog";
import { RecipeEditorDialog } from "../components/RecipeEditorDialog";

type Tab = "products" | "ingredients";

/**
 * ניהול מוצרים/מרכיבים/מתכונים (owner-only) — עבר לכאן מהטאבלט (היה
 * מסך נפרד שנפתח מתוך TabletDashboard) כדי שכל עריכת נתוני-בסיס
 * (מחיר, חיי מדף, מתכון) תתבצע דרך מסך הניהול המבוסס Google login,
 * ולא תתחרה על מקום עם המסך התפעולי המהיר של המטבח.
 */
export function ProductsManagement() {
  const businessId = getBusinessId();
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  const [editingProduct, setEditingProduct] = useState<Product | "new" | null>(null);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | "new" | null>(
    null,
  );
  const [recipeProductId, setRecipeProductId] = useState<string | null>(null);
  const recipeProduct = products.find((p) => p.id === recipeProductId) ?? null;

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

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "businesses", businessId, "ingredients")),
      (snap) => {
        setIngredients(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name,
            unit: d.data().unit,
            currentPricePerUnit: d.data().currentPricePerUnit,
            active: d.data().active,
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
          <button type="button" onClick={() => setEditingProduct("new")}>
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
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>יחידה</th>
                  <th>מחיר נוכחי</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.length === 0 ? (
                  <tr>
                    <td colSpan={5}>אין עדיין מרכיבים רשומים</td>
                  </tr>
                ) : (
                  ingredients.map((ing) => (
                    <tr key={ing.id}>
                      <td>{ing.name}</td>
                      <td>{ing.unit}</td>
                      <td>
                        {ing.currentPricePerUnit} ל-{ing.unit}
                      </td>
                      <td>{ing.active ? "פעיל" : "לא פעיל"}</td>
                      <td>
                        <button type="button" onClick={() => setEditingIngredient(ing)}>
                          עדכון מחיר
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingProduct && (
        <ProductFormDialog
          product={editingProduct === "new" ? null : editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={() => setEditingProduct(null)}
        />
      )}

      {editingIngredient && (
        <IngredientFormDialog
          ingredient={editingIngredient === "new" ? null : editingIngredient}
          onClose={() => setEditingIngredient(null)}
          onSaved={() => setEditingIngredient(null)}
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
