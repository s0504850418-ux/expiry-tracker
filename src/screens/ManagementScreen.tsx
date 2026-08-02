import { useEffect, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Ingredient, Product } from "../lib/types";
import { ProductFormDialog } from "../components/ProductFormDialog";
import { IngredientFormDialog } from "../components/IngredientFormDialog";
import { RecipeEditorDialog } from "../components/RecipeEditorDialog";

type Tab = "products" | "ingredients";

interface Props {
  onClose: () => void;
}

export function ManagementScreen({ onClose }: Props) {
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
    <main dir="rtl" className="dashboard">
      <header className="dashboard-header">
        <h1>ניהול מוצרים ומתכונים</h1>
        <button type="button" onClick={onClose}>
          חזרה לאצוות
        </button>
      </header>

      <div className="button-stack" style={{ flexDirection: "row", marginBottom: "1rem" }}>
        <button type="button" onClick={() => setTab("products")}>
          מוצרים
        </button>
        <button type="button" onClick={() => setTab("ingredients")}>
          מרכיבים
        </button>
      </div>

      {tab === "products" && (
        <div>
          <button type="button" onClick={() => setEditingProduct("new")}>
            מוצר חדש
          </button>
          <ul className="batch-list">
            {products.map((p) => (
              <li key={p.id} className="batch-row">
                <div className="batch-info">
                  <strong>{p.name}</strong>
                  <span>
                    {p.unit} · חיי מדף: {Math.round(p.shelfLifeMinutes / (60 * 24))} ימים
                  </span>
                  <span>{p.active ? "פעיל" : "לא פעיל"}</span>
                </div>
                <div className="batch-actions">
                  <button type="button" onClick={() => setEditingProduct(p)}>
                    עריכה
                  </button>
                  <button type="button" onClick={() => setRecipeProductId(p.id)}>
                    מתכון
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "ingredients" && (
        <div>
          <button type="button" onClick={() => setEditingIngredient("new")}>
            מרכיב חדש
          </button>
          <ul className="batch-list">
            {ingredients.map((ing) => (
              <li key={ing.id} className="batch-row">
                <div className="batch-info">
                  <strong>{ing.name}</strong>
                  <span>
                    {ing.currentPricePerUnit} ל-{ing.unit}
                  </span>
                </div>
                <div className="batch-actions">
                  <button type="button" onClick={() => setEditingIngredient(ing)}>
                    עדכון מחיר
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
    </main>
  );
}
