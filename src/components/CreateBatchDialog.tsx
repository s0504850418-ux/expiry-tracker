import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { useAuth } from "../auth/useAuth";
import type { Product } from "../lib/types";
import { printBatchLabel } from "../printing/printBatchLabel";
import type { PrintableBatch } from "../printing/printBatchLabel";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { describeError } from "../lib/describeError";
import { Spinner } from "./Spinner";

interface Props {
  products: Product[];
  onClose: () => void;
  onCreated: () => void;
}

type Phase = "form" | "printing" | "print-failed";

interface StaffOption {
  staffId: string;
  name: string;
}

interface PreviewLine {
  ingredientNameSnapshot: string;
  unit: string;
  perUnitQuantity: number;
}

// ערך סינתטי ל"בעל/ת העסק" באותו <select> של בחירת "מי הכין" — הבעלים
// לא מופיע ב-staff (staff הוא רק עובדי משמרת), אבל צריך אפשרות לבחור
// גם כשה-session המחובר הוא owner. ראו createBatch.ts: preparedByStaffId
// null מתפרש בשרת בדיוק כ"הוכן ע"י בעל/ת העסק".
const OWNER_OPTION = "__owner__";

function nowForDatetimeLocal(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

// crypto.randomUUID() קיים רק ב-secure context (HTTPS, או localhost/
// 127.0.0.1) — בפרודקשן זה תמיד המצב (Firebase Hosting = HTTPS), אבל
// בבדיקה מטאבלט אמיתי דרך http://<כתובת-IP-ברשת> (כמו כאן) זה נכשל
// עם שגיאה לא ברורה שמקריסה את כל האפליקציה, כי הדיאלוג לא נתפס
// ע"י error boundary. הערך עצמו הוא רק מפתח אידמפוטנטיות ללקוח (לא
// אבטחה/סוד — ראו ההערה למטה), אז fallback עם אקראיות חלשה יותר
// תקין לגמרי.
function generateClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function CreateBatchDialog({ products, onClose, onCreated }: Props) {
  const { claims } = useAuth();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [preparedAt, setPreparedAt] = useState(nowForDatetimeLocal());
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [preparedBy, setPreparedBy] = useState<string>("");
  const [preview, setPreview] = useState<{ hasRecipe: boolean; lines?: PreviewLine[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [createdBatch, setCreatedBatch] = useState<PrintableBatch | null>(null);

  // מזהה יציב לכל "ניסיון יצירה" אחד (כל עוד הדיאלוג הזה פתוח) —
  // אם קריאת createBatch נכשלת בגלל רשת ומנסים שוב, זה אותו מזהה,
  // כך שהשרת יזהה ניסיון חוזר ולא ייצור אצווה כפולה. ראו
  // functions/src/batches/createBatch.ts.
  const [clientRequestId] = useState(() => generateClientRequestId());
  const online = useOnlineStatus();

  // רשימת עובדים לבחירת "מי הכין" — לתיעוד בלבד, לא אימות (אין PIN
  // נוסף כאן). ברירת המחדל מתמלאת אוטומטית לפי מי שמחובר/ת כרגע (ראו
  // useEffect למטה) — אפשר לבחור שם אחר מהרשימה.
  useEffect(() => {
    let cancelled = false;
    const listActiveStaffNames = httpsCallable<
      { businessId: string },
      { staff: StaffOption[] }
    >(functions, "listActiveStaffNames");
    listActiveStaffNames({ businessId: getBusinessId() })
      .then(({ data }) => {
        if (!cancelled) setStaff(data.staff);
      })
      .catch(() => {
        // לא קריטי — אם ה-session הוא owner אפשר עדיין לבחור "בעל/ת העסק".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (claims?.role === "owner") {
      setPreparedBy(OWNER_OPTION);
    } else if (claims?.staffId) {
      setPreparedBy(claims.staffId);
    }
  }, [claims]);

  // תצוגת "לפי המתכון, לכמות הזו יידרש..." — כמויות בלבד, בלי מחיר
  // (getRecipePreview לא חושפת נתון כספי, ראו functions/src/recipes/
  // getRecipePreview.ts). נטען מחדש בכל בחירת מוצר; הכפל בכמות
  // שהוזנה נעשה מקומית כדי לא לשלוח בקשה על כל הקלדה.
  useEffect(() => {
    if (!productId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const getRecipePreview = httpsCallable<
      { businessId: string; productId: string },
      { hasRecipe: boolean; yieldQuantity?: number; lines?: PreviewLine[] }
    >(functions, "getRecipePreview");
    getRecipePreview({ businessId: getBusinessId(), productId })
      .then(({ data }) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

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
    if (!preparedBy) {
      setError("יש לבחור מי הכין את האצווה");
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
          preparedByStaffId: string | null;
        },
        { batchId: string; expiresAt: string }
      >(functions, "createBatch");
      const { data } = await createBatch({
        businessId: getBusinessId(),
        productId,
        quantity: quantityNumber,
        preparedAtClient: preparedAtClient.toISOString(),
        clientRequestId,
        preparedByStaffId: preparedBy === OWNER_OPTION ? null : preparedBy,
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
    } catch (err) {
      setError(
        describeError(err, {
          "not-found": "המוצר הזה כבר לא פעיל, או שהעובד/ת שנבחר/ה לא נמצא/ה — רענן/י ונסה/י שוב",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (phase === "printing") {
    return (
      <div className="dialog-backdrop" dir="rtl">
        <div className="dialog">
          <p>
            <Spinner /> מדפיסה מדבקה...
          </p>
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

  const quantityNumber = Number(quantity);
  const previewText =
    preview?.hasRecipe && preview.lines && preview.lines.length > 0 && quantityNumber > 0
      ? preview.lines
          .map((l) => `${(l.perUnitQuantity * quantityNumber).toFixed(2)} ${l.unit} ${l.ingredientNameSnapshot}`)
          .join(", ")
      : null;

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
        {previewText && (
          <p className="field-hint">לפי המתכון לכמות זו: {previewText}</p>
        )}

        <label htmlFor="prepared-at-input">מועד הכנה</label>
        <input
          id="prepared-at-input"
          type="datetime-local"
          value={preparedAt}
          onChange={(e) => setPreparedAt(e.target.value)}
        />

        <label htmlFor="prepared-by-select">מי הכין</label>
        <select
          id="prepared-by-select"
          value={preparedBy}
          onChange={(e) => setPreparedBy(e.target.value)}
        >
          <option value="">בחר/י...</option>
          {claims?.role === "owner" && <option value={OWNER_OPTION}>בעל/ת העסק (אני)</option>}
          {staff.map((s) => (
            <option key={s.staffId} value={s.staffId}>
              {s.name}
              {s.staffId === claims?.staffId ? " (אני)" : ""}
            </option>
          ))}
        </select>
        <p className="field-hint">לתיעוד בלבד — לא נדרש PIN נוסף לבחירה.</p>

        {!online && <p className="error-text">אין חיבור לאינטרנט — לא ניתן ליצור כרגע</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" disabled={busy || !online || products.length === 0}>
            {busy && <Spinner />} יצירה
          </button>
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
