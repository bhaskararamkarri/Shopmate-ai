/**
 * Phase 7 — Payment Ownership, Idempotency Scoping, and Migration Tests.
 *
 * Tests the domain model extensions, in-memory reference store guest-ownership
 * binding, guest-scoped idempotency reservation isolation, same-guest replay,
 * cart conflict detection, legacy order backwards compatibility, and static
 * validation of the forward-only SQL migration.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryPaymentStore } from "@/lib/payments/in-memory-store";
import type { NewPaymentOrder } from "@/lib/payments/types";

const NOW = Date.parse("2026-02-01T12:00:00.000Z");
const TTL = 30 * 60_000;
const LEASE_MS = 20_000;
const IDEMP_KEY = "idemp-key-test-12345678";
const CART_FINGERPRINT = '["headphones-1",1]';

const GUEST_A = "a".repeat(64);
const GUEST_B = "b".repeat(64);

function createTestOrder(
  overrides: Partial<NewPaymentOrder> = {},
): NewPaymentOrder {
  return {
    paypalOrderId: "PAYPAL-ORDER-0001",
    referenceId: "ref-order-0001",
    amountCents: 19999,
    currency: "USD",
    status: "CREATED",
    captureTokenHash: "c".repeat(64),
    cartFingerprint: CART_FINGERPRINT,
    guestOwnerHash: GUEST_A,
    idempotencyKey: IDEMP_KEY,
    approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-0001",
    providerOrderStatus: "CREATED",
    createdAtMs: NOW,
    expiresAtMs: NOW + TTL,
    ...overrides,
  };
}

describe("Payment Domain Models & In-Memory Store Ownership", () => {
  let store: InMemoryPaymentStore;

  beforeEach(() => {
    store = new InMemoryPaymentStore();
  });

  describe("Order Creation & Persistence", () => {
    it("persists and retrieves guestOwnerHash for an order", async () => {
      const newOrder = createTestOrder({ guestOwnerHash: GUEST_A });
      const stored = await store.createOrder(newOrder);

      expect(stored.paypalOrderId).toBe("PAYPAL-ORDER-0001");
      expect(stored.guestOwnerHash).toBe(GUEST_A);

      const retrieved = await store.getOrderByPayPalId("PAYPAL-ORDER-0001");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.guestOwnerHash).toBe(GUEST_A);
    });

    it("safely handles legacy orders with null or undefined guestOwnerHash", async () => {
      const legacyOrder = createTestOrder({
        paypalOrderId: "PAYPAL-ORDER-LEGACY",
        guestOwnerHash: null,
      });
      const stored = await store.createOrder(legacyOrder);

      expect(stored.paypalOrderId).toBe("PAYPAL-ORDER-LEGACY");
      expect(stored.guestOwnerHash).toBeNull();

      const retrieved = await store.getOrderByPayPalId("PAYPAL-ORDER-LEGACY");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.guestOwnerHash).toBeNull();
    });

    it("handles order completion without guestOwnerHash defaulting to null", async () => {
      const res = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: "legacy-key-999",
        cartFingerprint: CART_FINGERPRINT,
        nowMs: NOW,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });

      expect(res.kind).toBe("reserved");
      if (res.kind !== "reserved") return;
      expect(res.reservation.guestOwnerHash).toBeNull();

      const orderInput = createTestOrder({
        paypalOrderId: "PAYPAL-ORDER-COMPLETED-LEGACY",
        guestOwnerHash: undefined,
      });

      const completed = await store.completeCreateOrder({
        reservationId: res.reservation.id,
        order: orderInput,
        nowMs: NOW + 100,
      });

      expect(completed.kind).toBe("completed");
      if (completed.kind !== "completed") return;
      expect(completed.order.guestOwnerHash).toBeNull();
    });
  });

  describe("Idempotency Scoping & Guest Isolation", () => {
    it("allows reservation, completion, and same-guest replay with matching guestOwnerHash", async () => {
      // Step 1: Guest A reserves the idempotency key
      const reserved = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });

      expect(reserved.kind).toBe("reserved");
      if (reserved.kind !== "reserved") return;
      expect(reserved.reservation.guestOwnerHash).toBe(GUEST_A);

      // Step 2: Complete the order
      const completed = await store.completeCreateOrder({
        reservationId: reserved.reservation.id,
        order: createTestOrder({ guestOwnerHash: GUEST_A }),
        nowMs: NOW + 500,
      });

      expect(completed.kind).toBe("completed");
      if (completed.kind !== "completed") return;
      expect(completed.order.guestOwnerHash).toBe(GUEST_A);

      // Step 3: Same guest replays with matching guestOwnerHash -> returns cached order
      const replay = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW + 1_000,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });

      expect(replay.kind).toBe("replay");
      if (replay.kind !== "replay") return;
      expect(replay.order.paypalOrderId).toBe("PAYPAL-ORDER-0001");
      expect(replay.order.guestOwnerHash).toBe(GUEST_A);
    });

    it("scopes idempotency reservations to guestOwnerHash, isolating distinct guests using the same key", async () => {
      // Step 1: Guest A completes an order with IDEMP_KEY
      const resA = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });
      expect(resA.kind).toBe("reserved");
      if (resA.kind !== "reserved") return;

      await store.completeCreateOrder({
        reservationId: resA.reservation.id,
        order: createTestOrder({
          paypalOrderId: "PAYPAL-ORDER-GUEST-A",
          guestOwnerHash: GUEST_A,
        }),
        nowMs: NOW + 500,
      });

      // Step 2: Guest B reserves the same idempotency key with the same cart
      // Because idempotency is scoped to guestOwnerHash, Guest B receives their own distinct reservation
      const resB = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_B,
        nowMs: NOW + 1_000,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });

      expect(resB.kind).toBe("reserved");
      if (resB.kind !== "reserved") return;
      expect(resB.reservation.id).not.toBe(resA.reservation.id);
      expect(resB.reservation.guestOwnerHash).toBe(GUEST_B);

      // Step 3: Guest B completes their own order
      const compB = await store.completeCreateOrder({
        reservationId: resB.reservation.id,
        order: createTestOrder({
          paypalOrderId: "PAYPAL-ORDER-GUEST-B",
          guestOwnerHash: GUEST_B,
        }),
        nowMs: NOW + 1_500,
      });
      expect(compB.kind).toBe("completed");
      if (compB.kind !== "completed") return;
      expect(compB.order.paypalOrderId).toBe("PAYPAL-ORDER-GUEST-B");

      // Step 4: Replay for Guest A still yields Guest A's order, and Replay for Guest B yields Guest B's order
      const replayA = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW + 2_000,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });
      expect(replayA.kind).toBe("replay");
      if (replayA.kind === "replay") {
        expect(replayA.order.paypalOrderId).toBe("PAYPAL-ORDER-GUEST-A");
      }

      const replayB = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_B,
        nowMs: NOW + 2_000,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });
      expect(replayB.kind).toBe("replay");
      if (replayB.kind === "replay") {
        expect(replayB.order.paypalOrderId).toBe("PAYPAL-ORDER-GUEST-B");
      }
    });

    it("isolates in-flight processing leases across distinct guest sessions", async () => {
      // Step 1: Guest A starts an order (reservation in PROCESSING)
      const resA = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: 10_000,
      });
      expect(resA.kind).toBe("reserved");

      // Step 2: Same guest retries within lease -> in_progress
      const sameGuestRetry = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW + 2_000,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: 10_000,
      });
      expect(sameGuestRetry.kind).toBe("in_progress");

      // Step 3: Different guest using the same key is not blocked by Guest A's lease
      const guestBAttempt = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_B,
        nowMs: NOW + 2_000,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: 10_000,
      });
      expect(guestBAttempt.kind).toBe("reserved");
    });

    it("serializes concurrent reserveCreateOrder requests for the same guest and key", async () => {
      const concurrentKey = "concurrent-idemp-key";
      const [resA, resB] = await Promise.all([
        store.reserveCreateOrder({
          scope: "create_order",
          idempotencyKey: concurrentKey,
          cartFingerprint: CART_FINGERPRINT,
          guestOwnerHash: GUEST_A,
          nowMs: NOW,
          expiresAtMs: NOW + TTL,
          processingLeaseMs: 10_000,
        }),
        store.reserveCreateOrder({
          scope: "create_order",
          idempotencyKey: concurrentKey,
          cartFingerprint: CART_FINGERPRINT,
          guestOwnerHash: GUEST_A,
          nowMs: NOW,
          expiresAtMs: NOW + TTL,
          processingLeaseMs: 10_000,
        }),
      ]);

      const kinds = [resA.kind, resB.kind].sort();
      expect(kinds).toEqual(["in_progress", "reserved"]);
    });

    it("allows a guest to retry and take over their own failed reservation", async () => {
      // Step 1: Guest A starts and fails an order
      const reserved = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });
      expect(reserved.kind).toBe("reserved");
      if (reserved.kind !== "reserved") return;

      await store.failCreateOrder({
        reservationId: reserved.reservation.id,
        errorCode: "paypal_order_failed",
        retryable: false,
        retryAfterMs: 0,
        nowMs: NOW + 1_000,
      });

      // Step 2: Guest A can retry and take over their own failed reservation
      const sameGuestTakeover = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW + 2_000,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });
      expect(sameGuestTakeover.kind).toBe("reserved");
    });

    it("allows key reuse after full 30-minute expiration window elapses", async () => {
      // Step 1: Guest A creates an order
      const reserved = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });
      expect(reserved.kind).toBe("reserved");

      // Step 2: 31 minutes later (after expiresAtMs), Guest B uses the same key
      const expiredWindow = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_B,
        nowMs: NOW + TTL + 1_000,
        expiresAtMs: NOW + TTL + TTL,
        processingLeaseMs: LEASE_MS,
      });

      // The previous record has completely expired, so it starts fresh under the new guest
      expect(expiredWindow.kind).toBe("reserved");
      if (expiredWindow.kind !== "reserved") return;
      expect(expiredWindow.reservation.guestOwnerHash).toBe(GUEST_B);
    });

    it("rejects same-guest replay when cart fingerprint changes", async () => {
      const reserved = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: CART_FINGERPRINT,
        guestOwnerHash: GUEST_A,
        nowMs: NOW,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });
      expect(reserved.kind).toBe("reserved");
      if (reserved.kind !== "reserved") return;

      await store.completeCreateOrder({
        reservationId: reserved.reservation.id,
        order: createTestOrder({ guestOwnerHash: GUEST_A }),
        nowMs: NOW + 500,
      });

      // Same guest, different cart
      const cartMismatch = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: IDEMP_KEY,
        cartFingerprint: '["headphones-1",2]',
        guestOwnerHash: GUEST_A,
        nowMs: NOW + 1_000,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });

      expect(cartMismatch.kind).toBe("conflict");
    });

    it("safely supports legacy idempotency reservations without guestOwnerHash", async () => {
      const legacyRes = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: "legacy-only-key",
        cartFingerprint: CART_FINGERPRINT,
        nowMs: NOW,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });
      expect(legacyRes.kind).toBe("reserved");
      if (legacyRes.kind !== "reserved") return;

      await store.completeCreateOrder({
        reservationId: legacyRes.reservation.id,
        order: createTestOrder({
          paypalOrderId: "PAYPAL-LEGACY-001",
          guestOwnerHash: null,
          idempotencyKey: "legacy-only-key",
        }),
        nowMs: NOW + 500,
      });

      // Replay by legacy caller returns the cached order
      const legacyReplay = await store.reserveCreateOrder({
        scope: "create_order",
        idempotencyKey: "legacy-only-key",
        cartFingerprint: CART_FINGERPRINT,
        nowMs: NOW + 1_000,
        expiresAtMs: NOW + TTL,
        processingLeaseMs: LEASE_MS,
      });
      expect(legacyReplay.kind).toBe("replay");
      if (legacyReplay.kind === "replay") {
        expect(legacyReplay.order.paypalOrderId).toBe("PAYPAL-LEGACY-001");
        expect(legacyReplay.order.guestOwnerHash).toBeNull();
      }
    });
  });
});

describe("Forward-Only Migration Static Verification", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20261104010000_phase6c_guest_checkout_ownership.sql",
  );
  const migrationContent = readFileSync(migrationPath, "utf8");

  it("sets lock_timeout to prevent query queue starvation", () => {
    expect(migrationContent).toContain("set lock_timeout = '3s';");
  });

  it("adds guest_owner_hash additively to payment_orders and payment_idempotency", () => {
    expect(migrationContent).toContain("alter table public.payment_orders");
    expect(migrationContent).toContain(
      "add column if not exists guest_owner_hash text",
    );
    expect(migrationContent).toContain("alter table public.payment_idempotency");
  });

  it("enforces 64-hex-character format constraint or null for guest_owner_hash", () => {
    expect(migrationContent).toContain(
      "check (guest_owner_hash is null or guest_owner_hash ~ '^[0-9a-f]{64}$')",
    );
    expect(migrationContent).toContain(
      "payment_orders_guest_owner_hash_format",
    );
    expect(migrationContent).toContain(
      "payment_idempotency_guest_owner_hash_format",
    );
  });

  it("transitions from global unique constraint to guest-scoped and legacy partial unique indexes", () => {
    expect(migrationContent).toContain(
      "alter table public.payment_idempotency",
    );
    expect(migrationContent).toContain(
      "drop constraint if exists payment_idempotency_unique_key",
    );

    expect(migrationContent).toContain(
      "create index if not exists payment_orders_guest_owner_idx",
    );
    expect(migrationContent).toContain(
      "on public.payment_orders (guest_owner_hash)",
    );
    expect(migrationContent).toContain("where guest_owner_hash is not null");

    expect(migrationContent).toContain(
      "create unique index if not exists payment_idempotency_guest_unique_idx",
    );
    expect(migrationContent).toContain(
      "on public.payment_idempotency (scope, guest_owner_hash, idempotency_key)",
    );
    expect(migrationContent).toContain("where guest_owner_hash is not null");

    expect(migrationContent).toContain(
      "create unique index if not exists payment_idempotency_legacy_unique_idx",
    );
    expect(migrationContent).toContain(
      "on public.payment_idempotency (scope, idempotency_key)",
    );
    expect(migrationContent).toContain("where guest_owner_hash is null");
  });

  it("updates transition trigger to enforce guest ownership immutability", () => {
    expect(migrationContent).toContain(
      "create or replace function public.enforce_payment_order_transition()",
    );
    expect(migrationContent).toContain(
      "old.guest_owner_hash is not null and new.guest_owner_hash is distinct from old.guest_owner_hash",
    );
    expect(migrationContent).toContain(
      "raise exception 'payment order ownership is immutable'",
    );
  });

  it("strictly preserves security invariants (zero destructive statements, zero DELETE grants)", () => {
    const normalized = migrationContent.toLowerCase();
    expect(normalized).not.toContain("drop table");
    expect(normalized).not.toContain("drop schema");
    expect(normalized).not.toContain("truncate");
    expect(normalized).not.toContain("delete from");
    expect(normalized).not.toContain("disable row level security");
    expect(normalized).not.toMatch(/grant[^\n]*\bdelete\b/i);
    expect(normalized).not.toContain("supabase_migrations.schema_migrations");
  });

  it("leaves Phase 6B migration untouched", () => {
    const phase6bPath = path.join(
      process.cwd(),
      "supabase/migrations/20261104000000_phase6b_payment_infrastructure.sql",
    );
    const phase6b = readFileSync(phase6bPath, "utf8");
    expect(phase6b).toContain("payment_orders");
    expect(phase6b).not.toContain("phase7");
    expect(phase6b).not.toContain("phase6c");
  });
});

describe("Postgres Store Query Alignment", () => {
  const storePath = path.join(
    process.cwd(),
    "src/lib/payments/postgres-store.ts",
  );
  const storeContent = readFileSync(storePath, "utf8");

  it("persists guest_owner_hash in createOrder and completeCreateOrder SQL queries", () => {
    const occurrences = storeContent.match(/INSERT INTO payment_orders[\s\S]*?RETURNING \*/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    for (const occurrence of occurrences) {
      expect(occurrence).toContain("guest_owner_hash");
    }
  });

  it("aligns ON CONFLICT inference clauses with partial unique index predicates", () => {
    expect(storeContent).toContain(
      "ON CONFLICT (scope, guest_owner_hash, idempotency_key)",
    );
    expect(storeContent).toContain("WHERE guest_owner_hash IS NOT NULL");

    expect(storeContent).toContain(
      "ON CONFLICT (scope, idempotency_key)",
    );
    expect(storeContent).toContain("WHERE guest_owner_hash IS NULL");
  });

  it("scopes SELECT FOR UPDATE queries to guestOwnerHash or IS NULL", () => {
    expect(storeContent).toContain(
      "WHERE scope = $1 AND guest_owner_hash = $2 AND idempotency_key = $3",
    );
    expect(storeContent).toContain(
      "WHERE scope = $1 AND guest_owner_hash IS NULL AND idempotency_key = $2",
    );
  });
});
