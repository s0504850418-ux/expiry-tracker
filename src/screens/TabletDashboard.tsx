import { useEffect, useMemo, useState, useRef } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";
import { useAuth } from "../auth/useAuth";
import type { Batch, Product } from "../lib/types";
import { BatchRow } from "../components/BatchRow";
import { CreateBatchDialog } from "../components/CreateBatchDialog";
import { DiscardReasonDialog } from "../components/DiscardReasonDialog";
import { QrScannerDialog } from "../scanning/QrScannerDialog";
import { NotificationsPanel } from "../components/NotificationsPanel";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { EnvBadge } from "../components/EnvBadge";
import { needsDailyQuantityUpdate } from "../lib/quantityReminder";
import { describeError } from "../lib/describeError";
import { TeamManagement } from "../admin/TeamManagement";
import { ProductsManagement } from "../admin/ProductsManagement";
import { StaffLoginDialog } from "./StaffLoginDialog";
import { OwnerLoginDialog } from "./OwnerLoginDialog";

const ROLE_LABEL: Record<string, string> = {
  owner: "בעל/ת העסק",
  shiftManager: "מנהל/ת משמרת",
  worker: "עובד/ת",
};

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date(0);
  return value instanceof Timestamp ? value.toDate() : value;
}

const STATUS_TOAST_LABEL: Record<"used" | "discarded", string> = {
  used: "הסטטוס עודכן ל'נוצל במלואו'",
  discarded: "האצווה סומנה כהושלכה",
};

export function TabletDashboard() {
  const { claims, signOut } = useAuth();
  const businessId = getBusinessId();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<Batch | null>(null);
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [focusedBatchId, setFocusedBatchId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showProductsManagement, setShowProductsManagement] = useState(false);
  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const [showOwnerLogin, setShowOwnerLogin] = useState(false);
  const online = useOnlineStatus();

  function flashToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  // סוגר את דיאלוג "כניסה כמנהל/ת משמרת/בעל/ת העסק" אוטומטית ברגע
  // שההתחברות הצליחה בפועל (claims כבר לא worker) — לא צריך כפתור
  // "סגירה" נוסף אחרי login מוצלח.
  const prevRoleRef = useRef(claims?.role);
  useEffect(() => {
    if (prevRoleRef.current === "worker" && claims?.role && claims.role !== "worker") {
      setShowStaffLogin(false);
      setShowOwnerLogin(false);
    }
    prevRoleRef.current = claims?.role;
  }, [claims?.role]);

  useEffect(() => {
    const batchesQuery = query(
      collection(db, "businesses", businessId, "batches"),
      where("status", "==", "active"),
      orderBy("expiresAt", "asc"),
    );
    return onSnapshot(batchesQuery, (snap) => {
      setBatches(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            productId: data.productId,
            productNameSnapshot: data.productNameSnapshot,
            unit: data.unit,
            quantity: data.quantity,
            quantityLastUpdatedAt: toDate(data.quantityLastUpdatedAt ?? data.preparedAtClient),
            expiresAt: toDate(data.expiresAt),
            preparedAtClient: toDate(data.preparedAtClient),
            status: data.status,
            discardReason: data.discardReason ?? null,
            printStatus: data.printStatus,
          };
        }),
      );
    });
  }, [businessId]);

  useEffect(() => {
    const productsQuery = query(
      collection(db, "businesses", businessId, "products"),
      where("active", "==", true),
    );
    return onSnapshot(productsQuery, (snap) => {
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
    });
  }, [businessId]);

  const filteredBatches = useMemo(() => {
    if (focusedBatchId) {
      return batches.filter((b) => b.id === focusedBatchId);
    }
    const term = search.trim().toLowerCase();
    if (!term) return batches;
    return batches.filter((b) =>
      b.productNameSnapshot.toLowerCase().includes(term),
    );
  }, [batches, search, focusedBatchId]);

  async function updateStatus(
    batchId: string,
    // הקליינט כבר לא שולח "expired" (ראו BatchRow.tsx) — הסטטוס עדיין
    // נתמך ב-updateBatchStatus בשרת, לא נגענו שם.
    newStatus: "used" | "discarded",
    extra?: { quantity?: number; discardReason?: string },
  ) {
    setBusyBatchId(batchId);
    setActionError(null);
    try {
      const updateBatchStatus = httpsCallable<
        {
          businessId: string;
          batchId: string;
          newStatus: "used" | "discarded";
          quantity?: number;
          discardReason?: string;
        },
        { success: boolean }
      >(functions, "updateBatchStatus");
      await updateBatchStatus({ businessId, batchId, newStatus, ...extra });
    } finally {
      setBusyBatchId(null);
    }
  }

  async function updateQuantity(batchId: string, quantity: number) {
    setBusyBatchId(batchId);
    setActionError(null);
    try {
      const updateBatchQuantity = httpsCallable<
        { businessId: string; batchId: string; quantity: number },
        { success: boolean }
      >(functions, "updateBatchQuantity");
      await updateBatchQuantity({ businessId, batchId, quantity });
      flashToast("הכמות עודכנה");
    } finally {
      setBusyBatchId(null);
    }
  }

  return (
    <main dir="rtl" className="dashboard">
      {toast && (
        <div className="toast-stack">
          <div className="toast toast-success">{toast}</div>
        </div>
      )}

      <header className="dashboard-header">
        <h1>אצוות פעילות (לפי FEFO)</h1>
        <div>
          <EnvBadge />
          <span>{ROLE_LABEL[claims?.role ?? "worker"]}</span>
          {(claims?.role === "shiftManager" || claims?.role === "owner") && (
            <button type="button" onClick={() => setShowProductsManagement(true)}>
              מוצרים ומרכיבים
            </button>
          )}
          {claims?.role === "owner" && (
            <button type="button" onClick={() => setShowTeamManagement(true)}>
              ניהול צוות
            </button>
          )}
          {claims?.role === "worker" && (
            <>
              <button type="button" onClick={() => setShowStaffLogin(true)}>
                כניסה כמנהל/ת משמרת
              </button>
              <button type="button" onClick={() => setShowOwnerLogin(true)}>
                כניסה כבעל/ת העסק
              </button>
            </>
          )}
          {(claims?.role === "shiftManager" || claims?.role === "owner") && (
            <button type="button" onClick={() => signOut()}>
              יציאה
            </button>
          )}
        </div>
      </header>

      {showStaffLogin && (
        <StaffLoginDialog
          onClose={() => setShowStaffLogin(false)}
          onSwitchToOwnerLogin={() => {
            setShowStaffLogin(false);
            setShowOwnerLogin(true);
          }}
        />
      )}
      {showOwnerLogin && <OwnerLoginDialog onClose={() => setShowOwnerLogin(false)} />}

      {showTeamManagement && (
        <div className="dialog-backdrop" dir="rtl">
          <div className="dialog">
            <TeamManagement />
            <div className="dialog-actions">
              <button type="button" onClick={() => setShowTeamManagement(false)}>
                סגירה
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductsManagement && (
        <div className="dialog-backdrop" dir="rtl">
          <div className="dialog dialog-wide">
            <ProductsManagement />
            <div className="dialog-actions">
              <button type="button" onClick={() => setShowProductsManagement(false)}>
                סגירה
              </button>
            </div>
          </div>
        </div>
      )}

      {!online && (
        <p className="error-text">
          אין חיבור לאינטרנט — הרשימה מוצגת מהעותק המקומי האחרון ועשויה
          שלא להיות מעודכנת. יצירת אצווה ועדכון סטטוס חסומים עד שהחיבור יחזור.
        </p>
      )}

      {actionError && <p className="error-text">{actionError}</p>}

      {products.length === 0 && online && (
        <p className="warning-text">
          עדיין אין מוצרים מוגדרים בעסק, ולכן אי אפשר ליצור אצווה.{" "}
          {claims?.role === "owner" || claims?.role === "shiftManager"
            ? 'יש להוסיף מוצר דרך כפתור "מוצרים ומרכיבים" למעלה.'
            : "יש לפנות למנהל/ת משמרת או לבעל/ת העסק כדי שיוסיפו מוצר."}
        </p>
      )}

      <div className="dashboard-toolbar">
        <input
          type="search"
          placeholder="חיפוש לפי שם מוצר..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!!focusedBatchId}
        />
        <button type="button" onClick={() => setShowScanner(true)}>
          סריקת QR
        </button>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          disabled={products.length === 0 || !online}
        >
          אצווה חדשה
        </button>
      </div>

      {focusedBatchId && (
        <div className="dashboard-toolbar">
          <p>מציג/ה אצווה נבחרת בלבד.</p>
          <button type="button" onClick={() => setFocusedBatchId(null)}>
            נקה סינון וחזרה לרשימה המלאה
          </button>
        </div>
      )}

      {!focusedBatchId && (
        <NotificationsPanel batches={batches} onFocusBatch={setFocusedBatchId} />
      )}

      {filteredBatches.length === 0 ? (
        <p>
          {focusedBatchId
            ? "האצווה המבוקשת לא נמצאה או שאינה פעילה יותר"
            : "אין אצוות פעילות להצגה"}
        </p>
      ) : (
        <ul className="batch-list">
          {filteredBatches.map((batch) => (
            <BatchRow
              key={batch.id}
              batch={batch}
              busy={busyBatchId === batch.id}
              disabled={!online}
              needsQuantityUpdateReminder={needsDailyQuantityUpdate(
                batch,
                products.find((p) => p.id === batch.productId),
              )}
              onMarkUsed={() =>
                updateStatus(batch.id, "used")
                  .then(() => flashToast(STATUS_TOAST_LABEL.used))
                  .catch((err) =>
                    setActionError(
                      describeError(err, {
                        "failed-precondition": "האצווה כבר טופלה — רענן/י את הרשימה",
                      }),
                    ),
                  )
              }
              onMarkDiscarded={() => setDiscardTarget(batch)}
              onUpdateQuantity={(quantity) => updateQuantity(batch.id, quantity)}
            />
          ))}
        </ul>
      )}

      {showCreateDialog && (
        <CreateBatchDialog
          products={products}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => {
            setShowCreateDialog(false);
            flashToast("האצווה נוצרה בהצלחה");
          }}
        />
      )}

      {discardTarget && (
        <DiscardReasonDialog
          batch={discardTarget}
          onClose={() => setDiscardTarget(null)}
          onConfirm={async (reason, quantity) => {
            await updateStatus(discardTarget.id, "discarded", {
              discardReason: reason,
              quantity,
            });
            setDiscardTarget(null);
            flashToast(STATUS_TOAST_LABEL.discarded);
          }}
        />
      )}

      {showScanner && (
        <QrScannerDialog
          onClose={() => setShowScanner(false)}
          onScan={(batchId) => {
            setFocusedBatchId(batchId);
            setShowScanner(false);
          }}
        />
      )}
    </main>
  );
}
