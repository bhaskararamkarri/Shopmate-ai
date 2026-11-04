/**
 * ShopMate AI — in-memory pending PayPal order registry (Phase 5.4).
 *
 * Server-only. The Phase 5.2 create-order service already keeps an in-memory
 * idempotency cache; this registry is the matching, explicitly demo-scoped
 * record of the server-created order that capture is allowed to trust:
 *
 *   orderId       PayPal order id returned by PayPal
 *   referenceId   purchase-unit reference_id this server generated
 *   amountCents   authoritative total calculated from the catalog
 *   amountValue   canonical USD string sent to PayPal
 *   captureToken  opaque capability returned to the browser that created it
 *
 * LIMITATIONS (deliberate for the hackathon Sandbox):
 *   - The registry lives in one Node.js process. A server restart loses every
 *     pending order, so its capture is rejected with `order_not_found`.
 *   - Multiple app instances do not share it. A capture routed to a different
 *     instance will not find the order.
 *   - It is not a durable order store, audit log, or source of truth for real
 *     money. Production requires a database (or equivalent durable store)
 *     keyed by order id, with the expected amount/reference written in the
 *     same transaction that creates the order.
 *
 * Even with this limitation, capture never trusts a browser-supplied amount,
 * currency, reference, or bare order id: the record must exist and the opaque
 * capture token must match.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/paypal/order-registry is server-only; do not import it from client code",
  );
}

const ORDER_TTL_MS = 30 * 60_000;
const MAX_PENDING_ORDERS = 500;

export interface VerifiedPayPalCaptureRecord {
  captureId: string;
  status: "COMPLETED";
  amount: { currency: "USD"; value: string };
  referenceId: string;
}

export interface PendingPayPalOrderRecord {
  orderId: string;
  referenceId: string;
  amountCents: number;
  amountValue: string;
  currency: "USD";
  captureToken: string;
  createdAtMs: number;
  expiresAtMs: number;
  verifiedCapture?: VerifiedPayPalCaptureRecord;
}

const pendingOrders = new Map<string, PendingPayPalOrderRecord>();

function pruneExpired(now: number): void {
  for (const [orderId, record] of pendingOrders) {
    if (record.expiresAtMs <= now) {
      pendingOrders.delete(orderId);
    }
  }
}

/** Clears the registry — test isolation only. */
export function resetPayPalOrderRegistry(): void {
  pendingOrders.clear();
}

export function registerPendingPayPalOrder(
  record: Omit<
    PendingPayPalOrderRecord,
    "createdAtMs" | "expiresAtMs" | "verifiedCapture"
  >,
): void {
  const now = Date.now();
  pruneExpired(now);
  if (pendingOrders.has(record.orderId)) return;

  if (pendingOrders.size >= MAX_PENDING_ORDERS) {
    const oldest = pendingOrders.keys().next().value;
    if (oldest !== undefined) pendingOrders.delete(oldest);
  }

  pendingOrders.set(record.orderId, {
    ...record,
    createdAtMs: now,
    expiresAtMs: now + ORDER_TTL_MS,
  });
}

export function getPendingPayPalOrder(
  orderId: string,
): PendingPayPalOrderRecord | undefined {
  pruneExpired(Date.now());
  return pendingOrders.get(orderId);
}

export function markPayPalOrderCaptured(
  orderId: string,
  capture: VerifiedPayPalCaptureRecord,
): void {
  const record = pendingOrders.get(orderId);
  if (record) record.verifiedCapture = capture;
}
