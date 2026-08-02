import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import type { Product } from "../lib/types";
import { printBatchLabel } from "../printing/printBatchLabel";
import type { PrintableBatch } from "../printing/printBatchLabel";
import { useOnlineStatus } from "../lib/useOnlineStatus";

interface Props {
  products: Product[];
  onClose: () => void;
  onCreated: () => void;
}

type Phase = "form" | "printing" | "print-failed";

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
  const [phase, setPhase] = useState<Phase>("form");
  const [createdBatch, setCreatedBatch] = useState<PrintableBatch | null>(null);

  // מזהה יציב לכל "ניסיון יצירה" אחד (כל עוד הדיאלוג הזה פתוח) —
  // אם קריאת createBatch נכשלת בגלל רשת ומנסים שוב, זה אותו מזהה,
  // כך שהשרת יזהה ניסיון חוזר ולא ייצור אצווה כפולה. ראו
  // functions/src/batches/createBatch.ts.
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const online = useOnlineStatus();

  async function attemptPrint(batch: PrintableBatch) {
    setPhase("printing");
    const result = await printBatchLabel(batch);
    if (result.ok) {
      onCreated();
    } else {
      setPhase("print-failed");
    }
  }

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
      const product = products.find((p) => p.id === productId)!;
      const preparedAtClient = new Date(preparedAt);
      const createBatch = httpsCallable<
        {
          businessId: string;
          productId: string;
          quantity: number;
          preparedAtClient: string;
          clientRequestId: string;
        },
        { batchId: string; expiresAt: string }
      >(functions, "createBatch");
      const { data } = await createBatch({
        businessId: getBusinessId(),
        productId,
        quantity: quantityNumber,
        preparedAtClient: preparedAtClient.toISOString(),
        clientRequestId,
      });

      const batch: PrintableBatch = {
        id: data.batchId,
        productNameSnapshot: product.name,
        quantity: quantityNumber,
        unit: product.unit,
        preparedAtClient,
        expiresAt: new Date(data.expiresAt),
      };
      setCreatedBatch(batch);
      await attemptPrint(batch);
    } catch {
      setError("יצירת האצווה נכשלה — נסה/י שוב");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "printing") {
    return (
      <div className="dialog-backdrop" dir="rtl">
        <div className="dialog">
          <p>מדפיסה מדבקה...</p>
        </div>
      </div>
    );
  }

  if (phase === "print-failed" && createdBatch) {
    return (
      <div className="dialog-backdrop" dir="rtl">
        <div className="dialog">
          <h2>ההדפסה נכשלה</h2>
          <p className="error-text">
            האצווה נוצרה ופעילה, אבל לא הודפסה מדבקה. אפשר לנסות שוב עכשיו, או
            להדפיס מאוחר יותר מרשימת האצוות ("הדפסה חוזרת").
          </p>
          <div className="dialog-actions">
            <button type="button" onClick={() => attemptPrint(createdBatch)}>
              נסה שוב
            </button>
            <button type="button" onClick={onCreated}>
              המשך בלי הדפסה עכשיו
            </button>
          </div>
        </div>
      </div>
    );
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

        {!online && <p className="error-text">אין חיבור לאינטרנט — לא ניתן ליצור כרגע</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" disabled={busy || !online || products.length === 0}>
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
