/**
 * ShopMate AI — payment store selection (Phase 6B).
 *
 * Production is Postgres-only. Tests default to the in-memory adapter unless
 * they explicitly opt into Postgres. Local development may use memory but logs
 * a warning once, because a restart then loses every pending order.
 *
 * Missing configuration produces an "unavailable" store rather than a module
 * crash: every operation then rejects with a typed error that the routes map to
 * a sanitized 503, so the app can still serve non-payment pages.
 */
import { PaymentStoreUnavailableError } from "./errors";
import { inMemoryPaymentStore } from "./in-memory-store";
import { PostgresPaymentStore } from "./postgres-store";
import type {
  CaptureMutationResult,
  ClaimCaptureResult,
  CompleteCreateOrderResult,
  PaymentStore,
  ReserveCreateOrderResult,
  StoredAuditLog,
  StoredPaymentCapture,
  StoredPaymentOrder,
  StoredReconciliationIssue,
} from "./types";

let current: PaymentStore | null = null;
let warnedAboutMemory = false;
let warnedAboutUnavailable = false;

class UnavailablePaymentStore implements PaymentStore {
  readonly kind = "unavailable" as const;

  private fail(): never {
    throw new PaymentStoreUnavailableError(
      "The durable payment store is not configured.",
    );
  }

  async createOrder(): Promise<StoredPaymentOrder> {
    this.fail();
  }
  async reserveCreateOrder(): Promise<ReserveCreateOrderResult> {
    this.fail();
  }
  async completeCreateOrder(): Promise<CompleteCreateOrderResult> {
    this.fail();
  }
  async failCreateOrder(): Promise<void> {
    this.fail();
  }
  async getOrderByPayPalId(): Promise<StoredPaymentOrder | null> {
    this.fail();
  }
  async getCaptureByOrderId(): Promise<StoredPaymentCapture | null> {
    this.fail();
  }
  async claimCapture(): Promise<ClaimCaptureResult> {
    this.fail();
  }
  async markCaptureRequestSent(): Promise<boolean> {
    this.fail();
  }
  async completeCapture(): Promise<CaptureMutationResult> {
    this.fail();
  }
  async markCapturePending(): Promise<CaptureMutationResult> {
    this.fail();
  }
  async markCaptureFailed(): Promise<CaptureMutationResult> {
    this.fail();
  }
  async markCaptureInDoubt(): Promise<CaptureMutationResult> {
    this.fail();
  }
  async markReconciliationRequired(): Promise<CaptureMutationResult> {
    this.fail();
  }
  async expireOrder(): Promise<StoredPaymentOrder | null> {
    this.fail();
  }
  async listOpenReconciliation(): Promise<StoredReconciliationIssue[]> {
    this.fail();
  }
  async getAuditLogs(): Promise<StoredAuditLog[]> {
    this.fail();
  }
  resetForTests(): void {
    // Nothing to reset: the store is never usable.
  }
}

function isTestRuntime(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.VITEST === "1"
  );
}

function logMemoryWarning(): void {
  if (warnedAboutMemory) return;
  warnedAboutMemory = true;
  console.warn(
    "[payments] Using the in-memory payment store. Pending orders will be lost on restart and are not shared between instances. Set DATABASE_URL and SHOPMATE_PAYMENT_STORE=postgres for durable payments.",
  );
}

function unavailable(reason: string): PaymentStore {
  if (!warnedAboutUnavailable) {
    warnedAboutUnavailable = true;
    console.error(`[payments] Durable payment store unavailable: ${reason}`);
  }
  return new UnavailablePaymentStore();
}

export function getPaymentStore(): PaymentStore {
  if (current) return current;

  const configured = process.env.SHOPMATE_PAYMENT_STORE?.trim().toLowerCase();
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const production = process.env.NODE_ENV === "production";
  const allowDemoMemory =
    process.env.SHOPMATE_ALLOW_IN_MEMORY_DEMO === "true" ||
    process.env.SHOPMATE_ALLOW_IN_MEMORY_DEMO === "1";

  if (
    configured !== undefined &&
    configured !== "postgres" &&
    configured !== "memory"
  ) {
    current = unavailable(
      "SHOPMATE_PAYMENT_STORE must be either 'postgres' or 'memory'.",
    );
    return current;
  }

  if (production && !allowDemoMemory) {
    if (configured === "memory") {
      current = unavailable(
        "SHOPMATE_PAYMENT_STORE=memory is not allowed in production.",
      );
      return current;
    }
    if (!hasDatabaseUrl) {
      current = unavailable("DATABASE_URL is required in production.");
      return current;
    }
    current = new PostgresPaymentStore();
    return current;
  }

  if (configured === "postgres") {
    current = new PostgresPaymentStore();
    return current;
  }

  if (configured === "memory" || isTestRuntime()) {
    if (!configured && !isTestRuntime()) logMemoryWarning();
    current = inMemoryPaymentStore;
    return current;
  }

  if (hasDatabaseUrl) {
    current = new PostgresPaymentStore();
    return current;
  }

  logMemoryWarning();
  current = inMemoryPaymentStore;
  return current;
}

/** Test isolation only. */
export function resetPaymentStoreForTests(): void {
  inMemoryPaymentStore.resetForTests();
  if (current?.kind === "memory") {
    current.resetForTests();
  }
  current = null;
}
