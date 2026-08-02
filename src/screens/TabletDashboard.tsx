import { useEffect, useMemo, useState } from "react";
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
import { ManagementScreen } from "./ManagementScreen";

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date(0);
  return value instanceof Timestamp ? value.toDate() : value;
}

export function TabletDashboard() {
  const { claims, signOut } = useAuth();
  const businessId = getBusinessId();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<Batch | null>(null);
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null);
  const [showManagement, setShowManagement] = useState(false);

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
            expiresAt: toDate(data.expiresAt),
            preparedAtClient: toDate(data.preparedAtClient),
            status: data.status,
            discardReason: data.discardReason ?? null,
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
    const term = search.trim().toLowerCase();
    if (!term) return batches;
    return batches.filter((b) =>
      b.productNameSnapshot.toLowerCase().includes(term),
    );
  }, [batches, search]);

  async function updateStatus(
    batchId: string,
    newStatus: "used" | "expired" | "discarded",
    extra?: { quantity?: number; discardReason?: string },
  ) {
    setBusyBatchId(batchId);
    try {
      const updateBatchStatus = httpsCallable<
        {
          businessId: string;
          batchId: string;
          newStatus: "used" | "expired" | "discarded";
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

  if (showManagement) {
    return <ManagementScreen onClose={() => setShowManagement(false)} />;
  }

  return (
    <main dir="rtl" className="dashboard">
      <header className="dashboard-header">
        <h1>אצוות פעילות (לפי FEFO)</h1>
        <div>
          <span>{claims?.role === "owner" ? "בעל/ת העסק" : "מנהל/ת משמרת"}</span>
          {claims?.role === "owner" && (
            <button type="button" onClick={() => setShowManagement(true)}>
              ניהול מוצרים ומתכונים
            </button>
          )}
          <button type="button" onClick={() => signOut()}>
            יציאה
          </button>
        </div>
      </header>

      <div className="dashboard-toolbar">
        <input
          type="search"
          placeholder="חיפוש לפי שם מוצר..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          disabled={products.length === 0}
        >
          אצווה חדשה
        </button>
      </div>

      {filteredBatches.length === 0 ? (
        <p>אין אצוות פעילות להצגה</p>
      ) : (
        <ul className="batch-list">
          {filteredBatches.map((batch) => (
            <BatchRow
              key={batch.id}
              batch={batch}
              busy={busyBatchId === batch.id}
              onMarkUsed={() => updateStatus(batch.id, "used")}
              onMarkExpired={() => updateStatus(batch.id, "expired")}
              onMarkDiscarded={() => setDiscardTarget(batch)}
            />
          ))}
        </ul>
      )}

      {showCreateDialog && (
        <CreateBatchDialog
          products={products}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => setShowCreateDialog(false)}
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
          }}
        />
      )}
    </main>
  );
}
