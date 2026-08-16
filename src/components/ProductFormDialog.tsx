import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { useAuth } from "../auth/useAuth";
import type { PartialUsageUpdateFrequency, Product } from "../lib/types";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { describeError } from "../lib/describeError";
import { Spinner } from "./Spinner";

interface Props {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * עריכת מוצר קיים בלבד — יצירת מוצר חדש עברה ל-NewProductWizard (כדי
 * שהגדרת המתכון תהיה חלק מאותה זרימה, לא דיאלוג נפרד אחרי חיפוש
 * המוצר בטבלה).
 *
 * מנהל/ת משמרת יכול/ה לערוך name/shelfLifeMinutes בלבד (שלוש רמות
 * הרשאה, ראו CLAUDE.md) — partialUsageUpdateFrequency/notifyBefore-
 * ExpiryMinutes/active נשארים owner-only, לא רק מוסתרים אלא גם לא
 * נשלחים בכלל בבקשה (updateProduct דוחה אותם במפורש אם הם נשלחים
 * ע"י מנהל/ת משמרת, ראו functions/src/products/updateProduct.ts).
 */
export function ProductFormDialog({ product, onClose, onSaved }: Props) {
  const { claims } = useAuth();
  const isOwner = claims?.role === "owner";
  const [name, setName] = useState(product.name);
  const [shelfLifeDays, setShelfLifeDays] = useState(
    String(product.shelfLifeMinutes / (60 * 24)),
  );
  const [active, setActive] = useState(product.active);
  const [partialUsageUpdateFrequency, setPartialUsageUpdateFrequency] = useState<
    PartialUsageUpdateFrequency | ""
  >(product.partialUsageUpdateFrequency ?? "");
  const [notifyBeforeExpiryDays, setNotifyBeforeExpiryDays] = useState(
    product.notifyBeforeExpiryMinutes ? String(product.notifyBeforeExpiryMinutes / (60 * 24)) : "",
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
    if (
      isOwner &&
      notifyBeforeExpiryDays !== "" &&
      !(Number(notifyBeforeExpiryDays) > 0)
    ) {
      setError("זמן התראה לפני תפוגה חייב להיות מספר ימים חיובי, או ריק לברירת מחדל");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updateProduct = httpsCallable(functions, "updateProduct");
      await updateProduct({
        businessId: getBusinessId(),
        productId: product.id,
        name: name.trim(),
        shelfLifeMinutes,
        ...(isOwner
          ? {
              partialUsageUpdateFrequency:
                partialUsageUpdateFrequency === "" ? null : partialUsageUpdateFrequency,
              notifyBeforeExpiryMinutes:
                notifyBeforeExpiryDays === "" ? null : Number(notifyBeforeExpiryDays) * 60 * 24,
              active,
            }
          : {}),
      });
      onSaved();
    } catch (err) {
      setError(
        describeError(err, {
          "already-exists": "שם המוצר הזה כבר קיים במערכת — יש לבחור שם אחר",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" dir="rtl">
      <form onSubmit={handleSubmit} className="dialog">
        <h2>עריכת מוצר</h2>

        <label htmlFor="product-name">שם</label>
        <input
          id="product-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <p>
          יחידת מידה: <strong>{product.unit}</strong> (לא ניתן לשנות למוצר קיים)
        </p>

        <label htmlFor="product-shelf-life">חיי מדף (ימים)</label>
        <input
          id="product-shelf-life"
          type="number"
          min="0"
          step="any"
          value={shelfLifeDays}
          onChange={(e) => setShelfLifeDays(e.target.value)}
        />

        {isOwner && (
          <>
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

            <label>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              {" "}מוצר פעיל
            </label>
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
    </div>
  );
}
