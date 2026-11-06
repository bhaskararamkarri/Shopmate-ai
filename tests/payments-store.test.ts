/**
 * Phase 6B — durable payment store contract tests.
 *
 * These exercise the in-memory reference adapter with the same transactional
 * rules as the Postgres adapter: idempotency leases, retry windows, capture
 * claims, capture-in-doubt, and reconciliation issues. No PayPal call is made.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryPaymentStore } from "@/lib/payments/in-memory-store";
import { PaymentStoreUnavailableError } from "@/lib/payments/errors";
import { canTransition, isTerminalStatus } from "@/lib/payments/state-machine";
import { resetPaymentStoreForTests } from "@/lib/payments/store";
import type {
  NewPaymentOrder,
  PaymentStatus,
  VerifiedCapture,
} from "@/lib/payments/types";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");
const TTL = 30 * 60_000;
const KEY = "order-key-12345678";

function order(overrides: Partial<NewPaymentOrder> = {}): NewPaymentOrder {
  return {
    paypalOrderId: "ORDER1234567890",
    referenceId: "shopmate-demo-reference",
    amountCents: 19999,
    currency: "USD",
    status: "CREATED",
    captureTokenHash: "a".repeat(64),
    cartFingerprint: '["demo-headphones",1]',
    idempotencyKey: KEY,
    approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1234567890",
    providerOrderStatus: "CREATED",
    createdAtMs: NOW,
    expiresAtMs: NOW + TTL,
    ...overrides,
  };
}

function verifiedCapture(overrides: Partial<VerifiedCapture> = {}): VerifiedCapture {
  return {
    captureId: "CAPTURE1234567890",
    status: "COMPLETED",
    amountCents: 19999,
    currency: "USD",
    referenceId: "shopmate-demo-reference",
    sellerProtectionStatus: "ELIGIBLE",
    capturedAtMs: NOW + 5_000,
    ...overrides,
  };
}

async function reserve(
  store: InMemoryPaymentStore,
  overrides: {
    cartFingerprint?: string;
    nowMs?: number;
    expiresAtMs?: number;
    processingLeaseMs?: number;
    idempotencyKey?: string;
  } = {},
) {
  return store.reserveCreateOrder({
    scope: "create_order",
    idempotencyKey: overrides.idempotencyKey ?? KEY,
    cartFingerprint: overrides.cartFingerprint ?? '["demo-headphones",1]',
    nowMs: overrides.nowMs ?? NOW,
    expiresAtMs: overrides.expiresAtMs ?? NOW + TTL,
    processingLeaseMs: overrides.processingLeaseMs ?? 20_000,
  });
}

async function createAndComplete(
  store: InMemoryPaymentStore,
): Promise<string> {
  const reservation = await reserve(store);
  if (reservation.kind !== "reserved") throw new Error("expected reservation");
  const completed = await store.completeCreateOrder({
    reservationId: reservation.reservation.id,
    order: order(),
    nowMs: NOW + 100,
  });
  expect(completed.kind).toBe("completed");
  return "ORDER1234567890";
}

describe("create-order idempotency", () => {
  let store: InMemoryPaymentStore;

  beforeEach(() => {
    store = new InMemoryPaymentStore();
  });

  it("reserves, completes, replays, and rejects a different cart", async () => {
    const first = await reserve(store);
    expect(first.kind).toBe("reserved");
    if (first.kind !== "reserved") return;

    const completed = await store.completeCreateOrder({
      reservationId: first.reservation.id,
      order: order(),
      nowMs: NOW + 1_000,
    });
    expect(completed.kind).toBe("completed");

    const replay = await reserve(store, { nowMs: NOW + 2_000 });
    expect(replay.kind).toBe("replay");
    if (replay.kind === "replay") {
      expect(replay.order.paypalOrderId).toBe("ORDER1234567890");
      expect(replay.order.amountCents).toBe(19999);
    }

    const conflict = await reserve(store, {
      nowMs: NOW + 2_000,
      cartFingerprint: '["demo-cable",1]',
    });
    expect(conflict.kind).toBe("conflict");
  });

  it("holds a live processing lease and reports a retry delay", async () => {
    const first = await reserve(store, { processingLeaseMs: 20_000 });
    expect(first.kind).toBe("reserved");

    const second = await reserve(store, { nowMs: NOW + 5_000 });
    expect(second.kind).toBe("in_progress");
    if (second.kind === "in_progress") {
      expect(second.retryAfterMs).toBe(15_000);
    }
  });

  it("takes over an expired processing lease", async () => {
    const first = await reserve(store, { processingLeaseMs: 1_000 });
    expect(first.kind).toBe("reserved");

    const second = await reserve(store, { nowMs: NOW + 2_000 });
    expect(second.kind).toBe("reserved");
    if (second.kind === "reserved") {
      expect(second.reservation.attempts).toBe(2);
    }
  });

  it("keeps an ambiguous failure PROCESSING until its retry window", async () => {
    const first = await reserve(store);
    if (first.kind !== "reserved") throw new Error("expected reservation");

    await store.failCreateOrder({
      reservationId: first.reservation.id,
      errorCode: "paypal_timeout",
      retryable: true,
      retryAfterMs: 15_000,
      nowMs: NOW + 1_000,
    });

    const during = await reserve(store, { nowMs: NOW + 2_000 });
    expect(during.kind).toBe("in_progress");

    const after = await reserve(store, { nowMs: NOW + 17_000 });
    expect(after.kind).toBe("reserved");
  });

  it("allows a same-cart retry after a definitive failure", async () => {
    const first = await reserve(store);
    if (first.kind !== "reserved") throw new Error("expected reservation");

    await store.failCreateOrder({
      reservationId: first.reservation.id,
      errorCode: "paypal_auth_failed",
      retryable: false,
      retryAfterMs: 15_000,
      nowMs: NOW + 1_000,
    });

    const retry = await reserve(store, { nowMs: NOW + 2_000 });
    expect(retry.kind).toBe("reserved");
    if (retry.kind === "reserved") {
      expect(retry.reservation.attempts).toBe(2);
    }
  });

  it("starts a fresh logical request once the 30-minute window expires", async () => {
    await createAndComplete(store);

    const fresh = await reserve(store, {
      nowMs: NOW + TTL + 1,
      expiresAtMs: NOW + TTL + 1 + TTL,
    });
    expect(fresh.kind).toBe("reserved");
  });

  it("reuses the authoritative order if PayPal returns a known order id", async () => {
    await store.createOrder(order());
    const replay = await store.createOrder(
      order({
        referenceId: "shopmate-demo-different",
        cartFingerprint: '["demo-cable",1]',
      }),
    );

    expect(replay.referenceId).toBe("shopmate-demo-reference");
    const issues = await store.listOpenReconciliation({
      nowMs: NOW + 1,
      limit: 10,
    });
    expect(issues.map((issue) => issue.issueType)).toContain(
      "DUPLICATE_PAYPAL_ORDER_ID",
    );
  });
});

describe("capture claim and completion", () => {
  let store: InMemoryPaymentStore;

  beforeEach(() => {
    store = new InMemoryPaymentStore();
  });

  it("claims once and reports a live lease to a second owner", async () => {
    await store.createOrder(order());

    const first = await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-1",
      nowMs: NOW + 1_000,
      leaseMs: 60_000,
    });
    expect(first.kind).toBe("claimed");

    const second = await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-2",
      nowMs: NOW + 2_000,
      leaseMs: 60_000,
    });
    expect(second.kind).toBe("in_progress");
  });

  it("reclaims an expired lease only when no request was sent", async () => {
    await store.createOrder(order());
    await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-1",
      nowMs: NOW + 1_000,
      leaseMs: 5_000,
    });

    const reclaim = await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-2",
      nowMs: NOW + 7_000,
      leaseMs: 5_000,
    });
    expect(reclaim.kind).toBe("claimed");
    if (reclaim.kind === "claimed") {
      expect(reclaim.leaseOwner).toBe("owner-2");
    }
  });

  it("moves a sent-but-expired capture to CAPTURE_IN_DOUBT, never recapturing", async () => {
    await store.createOrder(order());
    await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-1",
      nowMs: NOW + 1_000,
      leaseMs: 5_000,
    });
    const marked = await store.markCaptureRequestSent({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-1",
      nowMs: NOW + 2_000,
    });
    expect(marked).toBe(true);

    const expired = await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-2",
      nowMs: NOW + 7_000,
      leaseMs: 5_000,
    });
    expect(expired.kind).toBe("in_doubt");
    if (expired.kind === "in_doubt") {
      expect(expired.order.status).toBe("CAPTURE_IN_DOUBT");
    }

    const again = await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-3",
      nowMs: NOW + 8_000,
      leaseMs: 5_000,
    });
    expect(again.kind).toBe("reconcile_only");

    const issues = await store.listOpenReconciliation({
      nowMs: NOW + 9_000,
      limit: 10,
    });
    expect(issues.map((issue) => issue.issueType)).toContain(
      "CAPTURE_LEASE_EXPIRED",
    );
  });

  it("persists a verified capture and replays it without another claim", async () => {
    await store.createOrder(order());
    await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-1",
      nowMs: NOW + 1_000,
      leaseMs: 60_000,
    });
    const completed = await store.completeCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-1",
      capture: verifiedCapture(),
      nowMs: NOW + 2_000,
    });

    expect(completed.order.status).toBe("COMPLETED");
    expect(completed.capture?.paypalCaptureId).toBe("CAPTURE1234567890");
    expect(completed.order.capturedAtMs).toBe(NOW + 2_000);

    const replay = await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-2",
      nowMs: NOW + 3_000,
      leaseMs: 60_000,
    });
    expect(replay.kind).toBe("already_completed");
  });

  it("records a completed-but-unverified capture as reconciliation required", async () => {
    await store.createOrder(order());
    await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-1",
      nowMs: NOW + 1_000,
      leaseMs: 60_000,
    });

    const result = await store.markReconciliationRequired({
      orderId: "ORDER1234567890",
      issueType: "COMPLETED_CAPTURE_UNVERIFIED",
      errorCode: "amount_mismatch",
      summary: {
        captureId: "CAPTURE1234567890",
        captureStatus: "COMPLETED",
        amountCents: 1,
        currency: "USD",
        referenceId: "shopmate-demo-reference",
      },
      nowMs: NOW + 2_000,
    });

    expect(result.order.status).toBe("RECONCILIATION_REQUIRED");
    expect(result.capture?.status).toBe("UNVERIFIED_COMPLETED");

    // markReconciliationRequired schedules the next check one minute out.
    const issues = await store.listOpenReconciliation({
      nowMs: NOW + 62_000,
      limit: 10,
    });
    expect(issues.map((issue) => issue.issueType)).toContain(
      "COMPLETED_CAPTURE_UNVERIFIED",
    );
  });

  it("audits only safe metadata", async () => {
    await createAndComplete(store);
    await store.claimCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-1",
      nowMs: NOW + 1_000,
      leaseMs: 60_000,
    });
    await store.completeCapture({
      orderId: "ORDER1234567890",
      leaseOwner: "owner-1",
      capture: verifiedCapture(),
      nowMs: NOW + 2_000,
    });

    const logs = await store.getAuditLogs("ORDER1234567890");
    expect(logs.length).toBeGreaterThanOrEqual(3);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("checkoutnow");
    expect(serialized).not.toContain("a".repeat(64));
    expect(serialized).not.toContain("captureToken");
  });
});

describe("state machine", () => {
  it("permits only explicit transitions", () => {
    expect(canTransition("CREATED", "CAPTURE_IN_PROGRESS")).toBe(true);
    expect(canTransition("APPROVED", "CAPTURE_IN_PROGRESS")).toBe(true);
    expect(canTransition("CAPTURE_IN_PROGRESS", "CAPTURE_IN_DOUBT")).toBe(true);
    expect(canTransition("CAPTURE_IN_DOUBT", "COMPLETED")).toBe(true);
    expect(canTransition("PENDING", "COMPLETED")).toBe(true);
    expect(canTransition("CAPTURE_IN_PROGRESS", "EXPIRED")).toBe(false);
    expect(canTransition("COMPLETED", "FAILED")).toBe(false);
    expect(canTransition("EXPIRED", "CREATED")).toBe(false);
  });

  it("treats COMPLETED, FAILED, and EXPIRED as terminal", () => {
    const terminal: PaymentStatus[] = ["COMPLETED", "FAILED", "EXPIRED"];
    for (const status of terminal) {
      expect(isTerminalStatus(status)).toBe(true);
    }
    expect(isTerminalStatus("CAPTURE_IN_DOUBT")).toBe(false);
    expect(isTerminalStatus("RECONCILIATION_REQUIRED")).toBe(false);
  });
});

describe("store selection", () => {
  it("refuses the memory store in production", async () => {
    try {
      resetPaymentStoreForTests();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SHOPMATE_PAYMENT_STORE", "memory");
      vi.stubEnv("DATABASE_URL", undefined);

      const { getPaymentStore } = await import("@/lib/payments/store");
      const store = getPaymentStore();
      expect(store.kind).toBe("unavailable");
      await expect(store.createOrder(order())).rejects.toBeInstanceOf(
        PaymentStoreUnavailableError,
      );
    } finally {
      vi.unstubAllEnvs();
      resetPaymentStoreForTests();
    }
  });

  it("requires DATABASE_URL in production", async () => {
    try {
      resetPaymentStoreForTests();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SHOPMATE_PAYMENT_STORE", undefined);
      vi.stubEnv("DATABASE_URL", undefined);

      const { getPaymentStore } = await import("@/lib/payments/store");
      expect(getPaymentStore().kind).toBe("unavailable");
    } finally {
      vi.unstubAllEnvs();
      resetPaymentStoreForTests();
    }
  });
});
