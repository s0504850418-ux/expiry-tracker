import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { PartialUsageUpdateFrequency, Product } from "../lib/types";
import { useOnlineStatus } from "../lib/useOnlineStatus";

interface Props {
  product: Product | null; // null = יצירה חדשה
  onClose: () => void;
  onSaved: () => void;
}

const UNITS = ["kg", "liter", "unit"] as const;

export function ProductFormDialog({ product, onClose, onSaved }: Props) {
  const [name, setName] = useState(product?.name ?? "");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>(
    (product?.unit as (typeof UNITS)[number]) ?? "kg",
  );
  const [shelfLifeDays, setShelfLifeDays] = useState(
    product ? String(product.shelfLifeMinutes / (60 * 24)) : "",
  );
  const [active, setActive] = useState(product?.active ?? true);
  const [partialUsageUpdateFrequency, setPartialUsageUpdateFrequency] = useState<
    PartialUsageUpdateFrequency | ""
  >(product?.partialUsageUpdateFrequency ?? "");
  const [notifyBeforeExpiryDays, setNotifyBeforeExpiryDays] = useState(
    product?.notifyBeforeExpiryMinutes
      ? String(product.notifyBeforeExpiryMinutes / (60 * 24))
      : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const shelfLifeMinutes = Number(shelfLifeDays) * 60 * 24;
    if (!name.trim() || !(shelfLifeMinutes > 0)) {
      setError("יש להזין שם וחיי מדף חיוביים (בימים)");
      return;
    }
    if (notifyBeforeExpiryDays !== "" && !(Number(notifyBeforeExpiryDays) > 0)) {
      setError("זמן התראה לפני תפוגה חייב להיות מספר ימים חיובי, או ריק לברירת מחדל");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const frequency = partialUsageUpdateFrequency === "" ? null : partialUsageUpdateFrequency;
      const notifyBeforeExpiryMinutes =
        notifyBeforeExpiryDays === "" ? null : Number(notifyBeforeExpiryDays) * 60 * 24;
      if (product) {
        const updateProduct = httpsCallable(functions, "updateProduct");
        await updateProduct({
          businessId: getBusinessId(),
          productId: product.id,
          name: name.trim(),
          shelfLifeMinutes,
          partialUsageUpdateFrequency: frequency,
          notifyBeforeExpiryMinutes,
          active,
        });
      } else {
        const createProduct = httpsCallable(functions, "createProduct");
        await createProduct({
          businessId: getBusinessId(),
          name: name.trim(),
          unit,
          shelfLifeMinutes,
          partialUsageUpdateFrequency: frequency,
          notifyBeforeExpiryMinutes,
        });
      }
      onSaved();
    } catch {
      setError("השמירה נכשלה — ייתכן ששם המוצר כבר קיים");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" dir="rtl">
      <form onSubmit={handleSubmit} className="dialog">
        <h2>{product ? "עריכת מוצר" : "מוצר חדש"}</h2>

        <label htmlFor="product-name">שם</label>
        <input
          id="product-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label htmlFor="product-unit">יחידת מידה</label>
        <select
          id="product-unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value as (typeof UNITS)[number])}
          disabled={!!product}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        {product && <p>לא ניתן לשנות יחידת מידה למוצר קיים</p>}

        <label htmlFor="product-shelf-life">חיי מדף (ימים)</label>
        <input
          id="product-shelf-life"
          type="number"
          min="0"
          step="any"
          value={shelfLifeDays}
          onChange={(e) => setShelfLifeDays(e.target.value)}
        />

        <label htmlFor="product-update-frequency">תדירות עדכון כמות בשימוש חלקי</label>
        <select
          id="product-update-frequency"
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

        <label htmlFor="product-notify-before-expiry">
          זמן התראה לפני תפוגה (ימים) — ריק לברירת מחדל
        </label>
        <input
          id="product-notify-before-expiry"
          type="number"
          min="0"
          step="any"
          value={notifyBeforeExpiryDays}
          onChange={(e) => setNotifyBeforeExpiryDays(e.target.value)}
        />

        {product && (
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            {" "}מוצר פעיל
          </label>
        )}

        {!online && <p className="error-text">אין חיבור לאינטרנט — לא ניתן לשמור כרגע</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" disabled={busy || !online}>
            שמירה
          </button>
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
