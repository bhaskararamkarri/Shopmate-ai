/**
 * Phase 6B — Postgres adapter integration test (gated).
 *
 * This test NEVER runs against DATABASE_URL implicitly. It runs only when the
 * dedicated `PAYMENTS_TEST_DATABASE_URL` variable points at a disposable test
 * database that already has the Phase 6B migration applied.
 *
 * It intentionally leaves its uniquely-keyed rows in place: no DELETE or
 * TRUNCATE is issued, so an accidental production URL cannot be wiped.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresPaymentStore } from "@/lib/payments/postgres-store";
import type { NewPaymentOrder, VerifiedCapture } from "@/lib/payments/types";

const TEST_DATABASE_URL = process.env.PAYMENTS_TEST_DATABASE_URL;
const RUN = Boolean(TEST_DATABASE_URL);

function uniqueOrderId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase();
}

function order(overrides: Partial<NewPaymentOrder> = {}): NewPaymentOrder {
  const now = Date.now();
  return {
    paypalOrderId: uniqueOrderId(),
    referenceId: `shopmate-demo-${randomUUID()}`,
    amountCents: 12345,
    currency: "USD",
    status: "CREATED",
    captureTokenHash: "b".repeat(64),
    cartFingerprint: '["demo-headphones",1]',
    idempotencyKey: `key-${randomUUID()}`,
    approvalUrl: null,
    providerOrderStatus: "CREATED",
    createdAtMs: now,
    expiresAtMs: now + 30 * 60_000,
    ...overrides,
  };
}

describe.skipIf(!RUN)("PostgresPaymentStore integration", () => {
  let previousDatabaseUrl: string | undefined;
  let store: PostgresPaymentStore;

  beforeAll(() => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    store = new PostgresPaymentStore();
  });

  afterAll(() => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("persists, replays, claims, and completes across instances", async () => {
    const secondInstance = new PostgresPaymentStore();
    const newOrder = order();
    const reservation = await store.reserveCreateOrder({
      scope: "create_order",
      idempotencyKey: newOrder.idempotencyKey!,
      cartFingerprint: newOrder.cartFingerprint,
      nowMs: newOrder.createdAtMs,
      expiresAtMs: newOrder.expiresAtMs,
      processingLeaseMs: 20_000,
    });
    expect(reservation.kind).toBe("reserved");
    if (reservation.kind !== "reserved") return;

    const completed = await store.completeCreateOrder({
      reservationId: reservation.reservation.id,
      order: newOrder,
      nowMs: newOrder.createdAtMs + 100,
    });
    expect(completed.kind).toBe("completed");
    if (completed.kind !== "completed") return;
    expect(completed.order.captureTokenHash).toBe(newOrder.captureTokenHash);

    const replay = await secondInstance.reserveCreateOrder({
      scope: "create_order",
      idempotencyKey: newOrder.idempotencyKey!,
      cartFingerprint: newOrder.cartFingerprint,
      nowMs: newOrder.createdAtMs + 200,
      expiresAtMs: newOrder.expiresAtMs,
      processingLeaseMs: 20_000,
    });
    expect(replay.kind).toBe("replay");
    if (replay.kind === "replay") {
      expect(replay.order.paypalOrderId).toBe(newOrder.paypalOrderId);
    }

    const claim = await secondInstance.claimCapture({
      orderId: newOrder.paypalOrderId,
      leaseOwner: "integration-owner",
      nowMs: newOrder.createdAtMs + 300,
      leaseMs: 60_000,
    });
    expect(claim.kind).toBe("claimed");

    const secondClaim = await store.claimCapture({
      orderId: newOrder.paypalOrderId,
      leaseOwner: "integration-other",
      nowMs: newOrder.createdAtMs + 400,
      leaseMs: 60_000,
    });
    expect(secondClaim.kind).toBe("in_progress");

    const sent = await secondInstance.markCaptureRequestSent({
      orderId: newOrder.paypalOrderId,
      leaseOwner: "integration-owner",
      nowMs: newOrder.createdAtMs + 500,
    });
    expect(sent).toBe(true);

    const capture: VerifiedCapture = {
      captureId: `CAP${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`,
      status: "COMPLETED",
      amountCents: newOrder.amountCents,
      currency: "USD",
      referenceId: newOrder.referenceId,
      sellerProtectionStatus: "ELIGIBLE",
      capturedAtMs: newOrder.createdAtMs + 600,
    };

    const finished = await secondInstance.completeCapture({
      orderId: newOrder.paypalOrderId,
      leaseOwner: "integration-owner",
      capture,
      nowMs: newOrder.createdAtMs + 700,
    });
    expect(finished.order.status).toBe("COMPLETED");
    expect(finished.capture?.paypalCaptureId).toBe(capture.captureId);

    const replayed = await store.claimCapture({
      orderId: newOrder.paypalOrderId,
      leaseOwner: "integration-third",
      nowMs: newOrder.createdAtMs + 800,
      leaseMs: 60_000,
    });
    expect(replayed.kind).toBe("already_completed");

    const logs = await store.getAuditLogs(newOrder.paypalOrderId);
    expect(logs.map((log) => log.eventType)).toContain("CAPTURE_COMPLETED");
  });

  describe("Phase 6C Guest Checkout & Partial Unique Index Scenarios", () => {
    const GUEST_1 = "1".repeat(64);
    const GUEST_2 = "2".repeat(64);

    it("a. Same guest + same key + same cart = replay", async () => {
      const key = `key-replay-${randomUUID()}`;
      const now = Date.now();
      const testOrder = order({
        idempotencyKey: key,
        guestOwnerHash: GUEST_1,
        cartFingerprint: '["headphones-1",1]',
      });

      const res = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: key,
        cartFingerprint: testOrder.cartFingerprint,
        guestOwnerHash: GUEST_1,
        nowMs: now,
        expiresAtMs: now + 30 * 60_000,
        processingLeaseMs: 20_000,
      });
      expect(res.kind).toBe("reserved");
      if (res.kind !== "reserved") return;

      const comp = await store.completeCreateOrder({
        reservationId: res.reservation.id,
        order: testOrder,
        nowMs: now + 100,
      });
      expect(comp.kind).toBe("completed");

      const replay = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: key,
        cartFingerprint: testOrder.cartFingerprint,
        guestOwnerHash: GUEST_1,
        nowMs: now + 200,
        expiresAtMs: now + 30 * 60_000,
        processingLeaseMs: 20_000,
      });
      expect(replay.kind).toBe("replay");
      if (replay.kind === "replay") {
        expect(replay.order.paypalOrderId).toBe(testOrder.paypalOrderId);
        expect(replay.order.guestOwnerHash).toBe(GUEST_1);
      }
    });

    it("b. Same guest + same key + different cart = conflict", async () => {
      const key = `key-conflict-${randomUUID()}`;
      const now = Date.now();
      const testOrder = order({
        idempotencyKey: key,
        guestOwnerHash: GUEST_1,
        cartFingerprint: '["headphones-1",1]',
      });

      const res = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: key,
        cartFingerprint: testOrder.cartFingerprint,
        guestOwnerHash: GUEST_1,
        nowMs: now,
        expiresAtMs: now + 30 * 60_000,
        processingLeaseMs: 20_000,
      });
      expect(res.kind).toBe("reserved");
      if (res.kind !== "reserved") return;

      await store.completeCreateOrder({
        reservationId: res.reservation.id,
        order: testOrder,
        nowMs: now + 100,
      });

      const conflict = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: key,
        cartFingerprint: '["headphones-2",1]',
        guestOwnerHash: GUEST_1,
        nowMs: now + 200,
        expiresAtMs: now + 30 * 60_000,
        processingLeaseMs: 20_000,
      });
      expect(conflict.kind).toBe("conflict");
    });

    it("c. Different guests + same key = independent reservations", async () => {
      const sharedKey = `shared-key-${randomUUID()}`;
      const now = Date.now();

      const res1 = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: sharedKey,
        cartFingerprint: '["headphones-1",1]',
        guestOwnerHash: GUEST_1,
        nowMs: now,
        expiresAtMs: now + 30 * 60_000,
        processingLeaseMs: 20_000,
      });
      expect(res1.kind).toBe("reserved");
      if (res1.kind !== "reserved") return;

      const res2 = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: sharedKey,
        cartFingerprint: '["headphones-1",1]',
        guestOwnerHash: GUEST_2,
        nowMs: now + 50,
        expiresAtMs: now + 30 * 60_000,
        processingLeaseMs: 20_000,
      });
      expect(res2.kind).toBe("reserved");
      if (res2.kind !== "reserved") return;

      expect(res1.reservation.id).not.toBe(res2.reservation.id);
      expect(res1.reservation.guestOwnerHash).toBe(GUEST_1);
      expect(res2.reservation.guestOwnerHash).toBe(GUEST_2);
    });

    it("d. Legacy NULL-owner duplicate key = conflict/replay as designed", async () => {
      const legacyKey = `legacy-key-${randomUUID()}`;
      const now = Date.now();
      const legacyOrder = order({
        idempotencyKey: legacyKey,
        guestOwnerHash: null,
        cartFingerprint: '["legacy-item",1]',
      });

      const res = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: legacyKey,
        cartFingerprint: legacyOrder.cartFingerprint,
        guestOwnerHash: null,
        nowMs: now,
        expiresAtMs: now + 30 * 60_000,
        processingLeaseMs: 20_000,
      });
      expect(res.kind).toBe("reserved");
      if (res.kind !== "reserved") return;

      await store.completeCreateOrder({
        reservationId: res.reservation.id,
        order: legacyOrder,
        nowMs: now + 100,
      });

      const replay = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: legacyKey,
        cartFingerprint: legacyOrder.cartFingerprint,
        guestOwnerHash: null,
        nowMs: now + 200,
        expiresAtMs: now + 30 * 60_000,
        processingLeaseMs: 20_000,
      });
      expect(replay.kind).toBe("replay");

      const conflict = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: legacyKey,
        cartFingerprint: '["different-item",1]',
        guestOwnerHash: null,
        nowMs: now + 300,
        expiresAtMs: now + 30 * 60_000,
        processingLeaseMs: 20_000,
      });
      expect(conflict.kind).toBe("conflict");
    });

    it("e. Concurrent requests using same guest and key serialize cleanly", async () => {
      const concurrentKey = `concurrent-key-${randomUUID()}`;
      const now = Date.now();

      const [resA, resB] = await Promise.all([
        store.reserveCreateOrder({
          scope: "create_order",
          idempotencyKey: concurrentKey,
          cartFingerprint: '["item",1]',
          guestOwnerHash: GUEST_1,
          nowMs: now,
          expiresAtMs: now + 30 * 60_000,
          processingLeaseMs: 20_000,
        }),
        store.reserveCreateOrder({
          scope: "create_order",
          idempotencyKey: concurrentKey,
          cartFingerprint: '["item",1]',
          guestOwnerHash: GUEST_1,
          nowMs: now,
          expiresAtMs: now + 30 * 60_000,
          processingLeaseMs: 20_000,
        }),
      ]);

      const kinds = [resA.kind, resB.kind].sort();
      expect(kinds).toEqual(["in_progress", "reserved"]);
    });
  });
});
