import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Product } from "../lib/types";

interface Props {
  products: Product[];
  onClose: () => void;
  onCreated: () => void;
}

function nowForDatetimeLocal(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function CreateBatchDialog({ products, onClose, onCreated }: Props) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [preparedAt, setPreparedAt] = useState(nowForDatetimeLocal());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const quantityNumber = Number(quantity);
    if (!productId || !(quantityNumber > 0)) {
      setError("יש לבחור מוצר ולהזין כמות חיובית");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const createBatch = httpsCallable<
        {
          businessId: string;
          productId: string;
          quantity: number;
          preparedAtClient: string;
        },
        { batchId: string; expiresAt: string }
      >(functions, "createBatch");
      await createBatch({
        businessId: getBusinessId(),
        productId,
        quantity: quantityNumber,
        preparedAtClient: new Date(preparedAt).toISOString(),
      });
      onCreated();
    } catch {
      setError("יצירת האצווה נכשלה — נסה/י שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" dir="rtl">
      <form onSubmit={handleSubmit} className="dialog">
        <h2>אצווה חדשה</h2>

        <label htmlFor="product-select">מוצר</label>
        <select
          id="product-select"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <label htmlFor="quantity-input">כמות ({products.find((p) => p.id === productId)?.unit})</label>
        <input
          id="quantity-input"
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />

        <label htmlFor="prepared-at-input">מועד הכנה</label>
        <input
          id="prepared-at-input"
          type="datetime-local"
          value={preparedAt}
          onChange={(e) => setPreparedAt(e.target.value)}
        />

        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" disabled={busy || products.length === 0}>
            יצירה
          </button>
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
