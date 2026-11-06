/**
 * ShopMate AI — PostgreSQL payment store (Phase 6B).
 *
 * Uses a direct, server-only `DATABASE_URL` connection. Every operation that
 * can race (idempotency reservation, capture claim, capture completion) runs in
 * a short transaction with row locks, so it stays correct across processes and
 * restarts.
 *
 * No secret, connection string, token, or raw PayPal payload is ever logged.
 */
import { Pool, type PoolClient } from "pg";
import {
  PaymentStoreConflictError,
  PaymentStoreUnavailableError,
} from "./errors";
import { canTransition } from "./state-machine";
import type {
  CaptureMutationResult,
  ClaimCaptureInput,
  ClaimCaptureResult,
  CompleteCaptureInput,
  CompleteCreateOrderInput,
  CompleteCreateOrderResult,
  ExpireOrderInput,
  FailCreateOrderInput,
  ListOpenReconciliationInput,
  MarkCaptureFailedInput,
  MarkCaptureInDoubtInput,
  MarkCapturePendingInput,
  MarkCaptureRequestSentInput,
  MarkReconciliationRequiredInput,
  NewPaymentOrder,
  PaymentCaptureStatus,
  PaymentStore,
  PaymentStatus,
  ReserveCreateOrderInput,
  ReserveCreateOrderResult,
  StoredAuditLog,
  StoredIdempotency,
  StoredPaymentCapture,
  StoredPaymentOrder,
  StoredReconciliationIssue,
} from "./types";

// Hard guard: a client bundle that somehow imports this module must fail loudly.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/payments/postgres-store is server-only; do not import it from client code",
  );
}

type PaymentOrderRow = {
  id: string;
  paypal_order_id: string;
  reference_id: string;
  amount_cents: string | number;
  currency: string;
  status: string;
  capture_token_hash: string;
  cart_fingerprint: string;
  guest_owner_hash: string | null;
  idempotency_key: string | null;
  approval_url: string | null;
  provider_order_status: string | null;
  capture_in_doubt_at: Date | string | null;
  capture_lease_owner: string | null;
  capture_lease_expires_at: Date | string | null;
  capture_request_sent_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string;
  captured_at: Date | string | null;
};

type PaymentCaptureRow = {
  id: string;
  paypal_capture_id: string;
  paypal_order_id: string;
  amount_cents: string | number;
  currency: string;
  status: string;
  seller_protection_status: string | null;
  captured_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type IdempotencyRow = {
  id: string;
  scope: string;
  idempotency_key: string;
  cart_fingerprint: string;
  guest_owner_hash: string | null;
  request_status: string;
  paypal_order_id: string | null;
  reference_id: string | null;
  amount_cents: string | number | null;
  currency: string | null;
  provider_order_status: string | null;
  approval_url: string | null;
  safe_error_code: string | null;
  attempts: number | string;
  processing_started_at: Date | string;
  processing_lease_expires_at: Date | string;
  last_attempted_at: Date | string;
  retry_not_before: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string;
};

type ReconciliationRow = {
  id: string;
  paypal_order_id: string;
  issue_type: string;
  reconciliation_status: string;
  attempts: number | string;
  last_checked_at: Date | string | null;
  next_check_at: Date | string | null;
  resolved_at: Date | string | null;
  safe_error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AuditRow = {
  id: string;
  paypal_order_id: string;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  safe_metadata: Record<string, unknown> | null;
  created_at: Date | string;
};

let pool: Pool | null = null;

function milliseconds(value: Date | string | null): number | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function requiredMilliseconds(value: Date | string): number {
  const time = milliseconds(value);
  if (time === null) {
    throw new PaymentStoreUnavailableError(
      "The payment store returned an unreadable timestamp.",
    );
  }
  return time;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function sslFor(connectionString: string): { rejectUnauthorized: boolean } | undefined {
  try {
    const url = new URL(connectionString);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return undefined;
    }
    // An explicit sslmode in the URL is handled by pg-connection-string.
    if (url.searchParams.has("sslmode")) return undefined;
    return { rejectUnauthorized: false };
  } catch {
    return { rejectUnauthorized: false };
  }
}

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new PaymentStoreUnavailableError("DATABASE_URL is not configured.");
  }
  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "shopmate-ai",
    ssl: sslFor(connectionString),
  });
  pool.on("error", (error) => {
    // Never log the message: pg can include connection details in it.
    console.error("[payments/postgres] idle client error:", error.name);
  });
  return pool;
}

async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The original error is more useful.
    }
    throw error;
  } finally {
    client.release();
  }
}

function mapOrder(row: PaymentOrderRow): StoredPaymentOrder {
  return {
    id: row.id,
    paypalOrderId: row.paypal_order_id,
    referenceId: row.reference_id,
    amountCents: Number(row.amount_cents),
    currency: "USD",
    status: row.status as PaymentStatus,
    captureTokenHash: row.capture_token_hash,
    cartFingerprint: row.cart_fingerprint,
    guestOwnerHash: row.guest_owner_hash ?? null,
    idempotencyKey: row.idempotency_key,
    approvalUrl: row.approval_url,
    providerOrderStatus: row.provider_order_status,
    captureInDoubtAtMs: milliseconds(row.capture_in_doubt_at),
    captureLeaseOwner: row.capture_lease_owner,
    captureLeaseExpiresAtMs: milliseconds(row.capture_lease_expires_at),
    captureRequestSentAtMs: milliseconds(row.capture_request_sent_at),
    createdAtMs: requiredMilliseconds(row.created_at),
    updatedAtMs: requiredMilliseconds(row.updated_at),
    expiresAtMs: requiredMilliseconds(row.expires_at),
    capturedAtMs: milliseconds(row.captured_at),
  };
}

function mapCapture(row: PaymentCaptureRow): StoredPaymentCapture {
  return {
    id: row.id,
    paypalCaptureId: row.paypal_capture_id,
    paypalOrderId: row.paypal_order_id,
    amountCents: Number(row.amount_cents),
    currency: "USD",
    status: row.status as PaymentCaptureStatus,
    sellerProtectionStatus: row.seller_protection_status,
    capturedAtMs: milliseconds(row.captured_at),
    createdAtMs: requiredMilliseconds(row.created_at),
    updatedAtMs: requiredMilliseconds(row.updated_at),
  };
}

function mapIdempotency(row: IdempotencyRow): StoredIdempotency {
  return {
    id: row.id,
    scope: "create_order",
    idempotencyKey: row.idempotency_key,
    cartFingerprint: row.cart_fingerprint,
    guestOwnerHash: row.guest_owner_hash ?? null,
    requestStatus: row.request_status as StoredIdempotency["requestStatus"],
    paypalOrderId: row.paypal_order_id,
    referenceId: row.reference_id,
    amountCents:
      row.amount_cents === null ? null : Number(row.amount_cents),
    currency: row.currency === null ? null : "USD",
    providerOrderStatus: row.provider_order_status,
    approvalUrl: row.approval_url,
    safeErrorCode: row.safe_error_code,
    attempts: Number(row.attempts),
    processingStartedAtMs: requiredMilliseconds(row.processing_started_at),
    processingLeaseExpiresAtMs: requiredMilliseconds(
      row.processing_lease_expires_at,
    ),
    lastAttemptedAtMs: requiredMilliseconds(row.last_attempted_at),
    retryNotBeforeMs: milliseconds(row.retry_not_before),
    completedAtMs: milliseconds(row.completed_at),
    createdAtMs: requiredMilliseconds(row.created_at),
    updatedAtMs: requiredMilliseconds(row.updated_at),
    expiresAtMs: requiredMilliseconds(row.expires_at),
  };
}

function mapIssue(row: ReconciliationRow): StoredReconciliationIssue {
  return {
    id: row.id,
    paypalOrderId: row.paypal_order_id,
    issueType: row.issue_type,
    reconciliationStatus:
      row.reconciliation_status as StoredReconciliationIssue["reconciliationStatus"],
    attempts: Number(row.attempts),
    lastCheckedAtMs: milliseconds(row.last_checked_at),
    nextCheckAtMs: milliseconds(row.next_check_at),
    resolvedAtMs: milliseconds(row.resolved_at),
    safeErrorCode: row.safe_error_code,
    createdAtMs: requiredMilliseconds(row.created_at),
    updatedAtMs: requiredMilliseconds(row.updated_at),
  };
}

function mapAudit(row: AuditRow): StoredAuditLog {
  return {
    id: row.id,
    paypalOrderId: row.paypal_order_id,
    eventType: row.event_type,
    previousStatus: row.previous_status as PaymentStatus | null,
    newStatus: row.new_status as PaymentStatus | null,
    safeMetadata: row.safe_metadata ?? {},
    createdAtMs: requiredMilliseconds(row.created_at),
  };
}

async function selectOrder(
  client: PoolClient,
  paypalOrderId: string,
  lock = false,
): Promise<StoredPaymentOrder | null> {
  const { rows } = await client.query(
    `SELECT * FROM payment_orders WHERE paypal_order_id = $1${
      lock ? " FOR UPDATE" : ""
    }`,
    [paypalOrderId],
  );
  const row = rows[0] as PaymentOrderRow | undefined;
  return row ? mapOrder(row) : null;
}

async function selectCapture(
  client: PoolClient,
  paypalOrderId: string,
): Promise<StoredPaymentCapture | null> {
  const { rows } = await client.query(
    "SELECT * FROM payment_captures WHERE paypal_order_id = $1",
    [paypalOrderId],
  );
  const row = rows[0] as PaymentCaptureRow | undefined;
  return row ? mapCapture(row) : null;
}

async function selectReservation(
  client: PoolClient,
  scope: string,
  idempotencyKey: string,
  guestOwnerHash?: string | null,
  lock = false,
): Promise<IdempotencyRow | undefined> {
  const lockSuffix = lock ? " FOR UPDATE" : "";
  if (guestOwnerHash) {
    const { rows } = await client.query(
      `SELECT * FROM payment_idempotency
        WHERE scope = $1 AND guest_owner_hash = $2 AND idempotency_key = $3${lockSuffix}`,
      [scope, guestOwnerHash, idempotencyKey],
    );
    return rows[0] as IdempotencyRow | undefined;
  }

  const { rows } = await client.query(
    `SELECT * FROM payment_idempotency
      WHERE scope = $1 AND guest_owner_hash IS NULL AND idempotency_key = $2${lockSuffix}`,
    [scope, idempotencyKey],
  );
  return rows[0] as IdempotencyRow | undefined;
}

async function insertAudit(
  client: PoolClient,
  paypalOrderId: string,
  eventType: string,
  previousStatus: PaymentStatus | null,
  newStatus: PaymentStatus | null,
  nowMs: number,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO payment_audit_logs
       (paypal_order_id, event_type, previous_status, new_status, safe_metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      paypalOrderId,
      eventType,
      previousStatus,
      newStatus,
      JSON.stringify(metadata),
      iso(nowMs),
    ],
  );
}

async function openIssue(
  client: PoolClient,
  paypalOrderId: string,
  issueType: string,
  nowMs: number,
  errorCode: string,
  nextCheckAtMs: number | null,
): Promise<void> {
  await client.query(
    `INSERT INTO payment_reconciliation
       (paypal_order_id, issue_type, reconciliation_status, attempts,
        last_checked_at, next_check_at, safe_error_code, created_at, updated_at)
     VALUES ($1, $2, 'OPEN', 0, $3, $4, $5, $3, $3)
     ON CONFLICT (paypal_order_id, issue_type)
       WHERE reconciliation_status IN ('OPEN', 'IN_PROGRESS')
     DO UPDATE SET
       last_checked_at = EXCLUDED.last_checked_at,
       next_check_at = EXCLUDED.next_check_at,
       safe_error_code = EXCLUDED.safe_error_code,
       updated_at = EXCLUDED.updated_at`,
    [
      paypalOrderId,
      issueType,
      iso(nowMs),
      nextCheckAtMs === null ? null : iso(nextCheckAtMs),
      errorCode,
    ],
  );
}

async function resolveIssues(
  client: PoolClient,
  paypalOrderId: string,
  nowMs: number,
): Promise<void> {
  await client.query(
    `UPDATE payment_reconciliation
        SET reconciliation_status = 'RESOLVED', resolved_at = $2, updated_at = $2
      WHERE paypal_order_id = $1
        AND reconciliation_status IN ('OPEN', 'IN_PROGRESS')`,
    [paypalOrderId, iso(nowMs)],
  );
}

interface UpsertCaptureInput {
  captureId: string;
  amountCents: number;
  status: PaymentCaptureStatus;
  sellerProtectionStatus?: string | null;
  capturedAtMs: number | null;
  nowMs: number;
}

async function upsertCapture(
  client: PoolClient,
  order: StoredPaymentOrder,
  input: UpsertCaptureInput,
): Promise<StoredPaymentCapture | null> {
  const { rows } = await client.query(
    `INSERT INTO payment_captures
       (paypal_capture_id, paypal_order_id, amount_cents, currency, status,
        seller_protection_status, captured_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'USD', $4, $5, $6, $7, $7)
     ON CONFLICT (paypal_order_id) DO UPDATE SET
       status = EXCLUDED.status,
       amount_cents = EXCLUDED.amount_cents,
       currency = EXCLUDED.currency,
       seller_protection_status = COALESCE(
         EXCLUDED.seller_protection_status,
         payment_captures.seller_protection_status
       ),
       captured_at = COALESCE(EXCLUDED.captured_at, payment_captures.captured_at),
       updated_at = EXCLUDED.updated_at
     WHERE payment_captures.paypal_capture_id = EXCLUDED.paypal_capture_id
     RETURNING *`,
    [
      input.captureId,
      order.paypalOrderId,
      input.amountCents,
      input.status,
      input.sellerProtectionStatus ?? null,
      input.capturedAtMs === null ? null : iso(input.capturedAtMs),
      iso(input.nowMs),
    ],
  );
  const row = rows[0] as PaymentCaptureRow | undefined;
  return row ? mapCapture(row) : null;
}

export class PostgresPaymentStore implements PaymentStore {
  readonly kind = "postgres" as const;

  async createOrder(order: NewPaymentOrder): Promise<StoredPaymentOrder> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO payment_orders
           (paypal_order_id, reference_id, amount_cents, currency, status,
            capture_token_hash, cart_fingerprint, guest_owner_hash, idempotency_key, approval_url,
            provider_order_status, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, 'USD', $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)
         ON CONFLICT (paypal_order_id) DO NOTHING
         RETURNING *`,
        [
          order.paypalOrderId,
          order.referenceId,
          order.amountCents,
          order.status,
          order.captureTokenHash,
          order.cartFingerprint,
          order.guestOwnerHash ?? null,
          order.idempotencyKey,
          order.approvalUrl,
          order.providerOrderStatus,
          iso(order.createdAtMs),
          iso(order.expiresAtMs),
        ],
      );

      const inserted = rows[0] as PaymentOrderRow | undefined;
      if (inserted) {
        await insertAudit(
          client,
          order.paypalOrderId,
          "ORDER_CREATED",
          null,
          "CREATED",
          order.createdAtMs,
          { amountCents: order.amountCents, currency: "USD" },
        );
        return mapOrder(inserted);
      }

      const existing = await selectOrder(client, order.paypalOrderId);
      if (!existing) {
        throw new PaymentStoreConflictError(
          "The payment order could not be inserted or read back.",
        );
      }
      if (existing.referenceId !== order.referenceId) {
        await insertAudit(
          client,
          existing.paypalOrderId,
          "ORDER_ID_REUSED",
          existing.status,
          existing.status,
          order.createdAtMs,
          { amountCents: existing.amountCents, currency: "USD" },
        );
        await openIssue(
          client,
          existing.paypalOrderId,
          "DUPLICATE_PAYPAL_ORDER_ID",
          order.createdAtMs,
          "paypal_order_id_reused",
          null,
        );
      }
      // Never rebind an existing PayPal order to a different cart/amount.
      return existing;
    });
  }

  async reserveCreateOrder(
    input: ReserveCreateOrderInput,
  ): Promise<ReserveCreateOrderResult> {
    return withTransaction(async (client) => {
      const leaseExpiresAtMs = input.nowMs + input.processingLeaseMs;

      let row = await selectReservation(
        client,
        input.scope,
        input.idempotencyKey,
        input.guestOwnerHash,
        true,
      );

      if (!row) {
        const inserted = input.guestOwnerHash
          ? await client.query(
              `INSERT INTO payment_idempotency
                 (scope, idempotency_key, cart_fingerprint, guest_owner_hash, request_status,
                  attempts, processing_started_at, processing_lease_expires_at,
                  last_attempted_at, created_at, updated_at, expires_at)
               VALUES ($1, $2, $3, $4, 'PROCESSING', 1, $5, $6, $5, $5, $5, $7)
               ON CONFLICT (scope, guest_owner_hash, idempotency_key)
                 WHERE guest_owner_hash IS NOT NULL
               DO NOTHING
               RETURNING *`,
              [
                input.scope,
                input.idempotencyKey,
                input.cartFingerprint,
                input.guestOwnerHash,
                iso(input.nowMs),
                iso(leaseExpiresAtMs),
                iso(input.expiresAtMs),
              ],
            )
          : await client.query(
              `INSERT INTO payment_idempotency
                 (scope, idempotency_key, cart_fingerprint, guest_owner_hash, request_status,
                  attempts, processing_started_at, processing_lease_expires_at,
                  last_attempted_at, created_at, updated_at, expires_at)
               VALUES ($1, $2, $3, $4, 'PROCESSING', 1, $5, $6, $5, $5, $5, $7)
               ON CONFLICT (scope, idempotency_key)
                 WHERE guest_owner_hash IS NULL
               DO NOTHING
               RETURNING *`,
              [
                input.scope,
                input.idempotencyKey,
                input.cartFingerprint,
                null,
                iso(input.nowMs),
                iso(leaseExpiresAtMs),
                iso(input.expiresAtMs),
              ],
            );
        row = inserted.rows[0] as IdempotencyRow | undefined;

        if (!row) {
          row = await selectReservation(
            client,
            input.scope,
            input.idempotencyKey,
            input.guestOwnerHash,
            true,
          );
        }

        if (!row) {
          throw new PaymentStoreConflictError(
            "The idempotency reservation could not be created or read back.",
          );
        }
        return {
          kind: "reserved",
          reservation: mapIdempotency(row),
        };
      }

      const record = mapIdempotency(row);
      const expired = record.expiresAtMs <= input.nowMs;

      if (expired) {
        const reset = await client.query(
          `UPDATE payment_idempotency SET
             cart_fingerprint = $2,
             guest_owner_hash = $6,
             request_status = 'PROCESSING',
             paypal_order_id = NULL,
             reference_id = NULL,
             amount_cents = NULL,
             currency = NULL,
             provider_order_status = NULL,
             approval_url = NULL,
             safe_error_code = NULL,
             attempts = 1,
             processing_started_at = $3,
             processing_lease_expires_at = $4,
             last_attempted_at = $3,
             retry_not_before = NULL,
             completed_at = NULL,
             created_at = $3,
             updated_at = $3,
             expires_at = $5
           WHERE id = $1
           RETURNING *`,
          [
            record.id,
            input.cartFingerprint,
            iso(input.nowMs),
            iso(leaseExpiresAtMs),
            iso(input.expiresAtMs),
            input.guestOwnerHash ?? null,
          ],
        );
        return {
          kind: "reserved",
          reservation: mapIdempotency(reset.rows[0] as IdempotencyRow),
        };
      }

      // Prevent one guest from replaying or reusing another guest's idempotency key.
      if (
        record.guestOwnerHash &&
        input.guestOwnerHash &&
        record.guestOwnerHash !== input.guestOwnerHash
      ) {
        return { kind: "conflict" };
      }
      if (record.guestOwnerHash && !input.guestOwnerHash) {
        return { kind: "conflict" };
      }
      if (!record.guestOwnerHash && input.guestOwnerHash) {
        return { kind: "conflict" };
      }

      if (record.cartFingerprint !== input.cartFingerprint) {
        return { kind: "conflict" };
      }

      if (record.requestStatus === "COMPLETED") {
        if (!record.paypalOrderId) return { kind: "conflict" };
        const order = await selectOrder(client, record.paypalOrderId);
        if (!order) return { kind: "conflict" };
        return { kind: "replay", order };
      }

      const takeover = async (): Promise<ReserveCreateOrderResult> => {
        const updated = await client.query(
          `UPDATE payment_idempotency SET
             cart_fingerprint = $2,
             guest_owner_hash = $6,
             request_status = 'PROCESSING',
             paypal_order_id = NULL,
             reference_id = NULL,
             amount_cents = NULL,
             currency = NULL,
             provider_order_status = NULL,
             approval_url = NULL,
             safe_error_code = NULL,
             attempts = attempts + 1,
             processing_started_at = $3,
             processing_lease_expires_at = $4,
             last_attempted_at = $3,
             retry_not_before = NULL,
             completed_at = NULL,
             updated_at = $3,
             expires_at = $5
           WHERE id = $1
           RETURNING *`,
          [
            record.id,
            input.cartFingerprint,
            iso(input.nowMs),
            iso(leaseExpiresAtMs),
            iso(input.expiresAtMs),
            input.guestOwnerHash ?? null,
          ],
        );
        return {
          kind: "reserved",
          reservation: mapIdempotency(updated.rows[0] as IdempotencyRow),
        };
      };

      if (record.requestStatus === "FAILED") {
        return takeover();
      }

      if (input.nowMs < record.processingLeaseExpiresAtMs) {
        return {
          kind: "in_progress",
          retryAfterMs: Math.max(
            1,
            record.processingLeaseExpiresAtMs - input.nowMs,
          ),
        };
      }

      return takeover();
    });
  }

  async completeCreateOrder(
    input: CompleteCreateOrderInput,
  ): Promise<CompleteCreateOrderResult> {
    return withTransaction(async (client) => {
      const selected = await client.query(
        "SELECT * FROM payment_idempotency WHERE id = $1 FOR UPDATE",
        [input.reservationId],
      );
      const row = selected.rows[0] as IdempotencyRow | undefined;
      if (!row) {
        throw new PaymentStoreConflictError(
          "Unknown idempotency reservation.",
        );
      }
      const record = mapIdempotency(row);
      if (record.cartFingerprint !== input.order.cartFingerprint) {
        return { kind: "conflict" };
      }

      if (record.requestStatus === "COMPLETED") {
        if (!record.paypalOrderId) return { kind: "conflict" };
        const order = await selectOrder(client, record.paypalOrderId);
        if (!order) return { kind: "conflict" };
        return { kind: "replayed", order };
      }
      if (record.requestStatus !== "PROCESSING") {
        return { kind: "conflict" };
      }

      const inserted = await client.query(
        `INSERT INTO payment_orders
           (paypal_order_id, reference_id, amount_cents, currency, status,
            capture_token_hash, cart_fingerprint, guest_owner_hash, idempotency_key, approval_url,
            provider_order_status, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, 'USD', $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)
         ON CONFLICT (paypal_order_id) DO NOTHING
         RETURNING *`,
        [
          input.order.paypalOrderId,
          input.order.referenceId,
          input.order.amountCents,
          input.order.status,
          input.order.captureTokenHash,
          input.order.cartFingerprint,
          input.order.guestOwnerHash ?? null,
          input.order.idempotencyKey,
          input.order.approvalUrl,
          input.order.providerOrderStatus,
          iso(input.order.createdAtMs),
          iso(input.order.expiresAtMs),
        ],
      );

      const order = inserted.rows[0] as PaymentOrderRow | undefined;
      if (!order) {
        const existing = await selectOrder(client, input.order.paypalOrderId);
        if (!existing) {
          return { kind: "conflict" };
        }
        if (existing.referenceId !== input.order.referenceId) {
          // PayPal returned an order id this server already owns. Replay the
          // authoritative record instead of rebinding it to a different cart.
          await insertAudit(
            client,
            existing.paypalOrderId,
            "ORDER_ID_REUSED",
            existing.status,
            existing.status,
            input.nowMs,
            { amountCents: existing.amountCents, currency: "USD" },
          );
          await openIssue(
            client,
            existing.paypalOrderId,
            "DUPLICATE_PAYPAL_ORDER_ID",
            input.nowMs,
            "paypal_order_id_reused",
            null,
          );
        }
        await client.query(
          `UPDATE payment_idempotency SET
             request_status = 'COMPLETED',
             paypal_order_id = $2,
             reference_id = $3,
             amount_cents = $4,
             currency = 'USD',
             provider_order_status = $5,
             approval_url = $6,
             safe_error_code = NULL,
             retry_not_before = NULL,
             completed_at = $7,
             updated_at = $7,
             processing_lease_expires_at = $7
           WHERE id = $1`,
          [
            record.id,
            existing.paypalOrderId,
            existing.referenceId,
            existing.amountCents,
            existing.providerOrderStatus,
            existing.approvalUrl,
            iso(input.nowMs),
          ],
        );
        return { kind: "replayed", order: existing };
      }

      await client.query(
        `UPDATE payment_idempotency SET
           request_status = 'COMPLETED',
           paypal_order_id = $2,
           reference_id = $3,
           amount_cents = $4,
           currency = 'USD',
           provider_order_status = $5,
           approval_url = $6,
           safe_error_code = NULL,
           retry_not_before = NULL,
           completed_at = $7,
           updated_at = $7,
           processing_lease_expires_at = $7
         WHERE id = $1`,
        [
          record.id,
          order.paypal_order_id,
          order.reference_id,
          Number(order.amount_cents),
          order.provider_order_status,
          order.approval_url,
          iso(input.nowMs),
        ],
      );

      await insertAudit(
        client,
        order.paypal_order_id,
        "ORDER_CREATED",
        null,
        "CREATED",
        input.nowMs,
        { amountCents: Number(order.amount_cents), currency: "USD" },
      );

      return { kind: "completed", order: mapOrder(order) };
    });
  }

  async failCreateOrder(input: FailCreateOrderInput): Promise<void> {
    await withTransaction(async (client) => {
      if (input.retryable) {
        await client.query(
          `UPDATE payment_idempotency SET
             safe_error_code = $2,
             retry_not_before = $3,
             processing_lease_expires_at = $3,
             last_attempted_at = $4,
             updated_at = $4
           WHERE id = $1 AND request_status = 'PROCESSING'`,
          [
            input.reservationId,
            input.errorCode,
            iso(input.nowMs + input.retryAfterMs),
            iso(input.nowMs),
          ],
        );
        return;
      }

      await client.query(
        `UPDATE payment_idempotency SET
           request_status = 'FAILED',
           safe_error_code = $2,
           retry_not_before = NULL,
           completed_at = $3,
           processing_lease_expires_at = $3,
           last_attempted_at = $3,
           updated_at = $3
         WHERE id = $1 AND request_status = 'PROCESSING'`,
        [input.reservationId, input.errorCode, iso(input.nowMs)],
      );
    });
  }

  async getOrderByPayPalId(
    orderId: string,
  ): Promise<StoredPaymentOrder | null> {
    return withTransaction((client) => selectOrder(client, orderId));
  }

  async getCaptureByOrderId(
    orderId: string,
  ): Promise<StoredPaymentCapture | null> {
    return withTransaction((client) => selectCapture(client, orderId));
  }

  async claimCapture(input: ClaimCaptureInput): Promise<ClaimCaptureResult> {
    return withTransaction(async (client) => {
      const order = await selectOrder(client, input.orderId, true);
      if (!order) return { kind: "not_found" };

      if (order.status === "COMPLETED") {
        const capture = await selectCapture(client, order.paypalOrderId);
        if (capture) {
          return { kind: "already_completed", order, capture };
        }
        await openIssue(
          client,
          order.paypalOrderId,
          "COMPLETED_ORDER_WITHOUT_CAPTURE",
          input.nowMs,
          "capture_record_missing",
          null,
        );
        return { kind: "not_allowed", order };
      }

      const expirable =
        order.status === "CREATED" || order.status === "APPROVED";
      if (expirable && order.expiresAtMs <= input.nowMs) {
        const { rows } = await client.query(
          `UPDATE payment_orders SET status = 'EXPIRED', updated_at = $2
            WHERE paypal_order_id = $1
            RETURNING *`,
          [order.paypalOrderId, iso(input.nowMs)],
        );
        await insertAudit(
          client,
          order.paypalOrderId,
          "ORDER_EXPIRED",
          order.status,
          "EXPIRED",
          input.nowMs,
        );
        return {
          kind: "expired",
          order: mapOrder(rows[0] as PaymentOrderRow),
        };
      }

      if (
        order.status === "CAPTURE_IN_DOUBT" ||
        order.status === "PENDING" ||
        order.status === "RECONCILIATION_REQUIRED"
      ) {
        return { kind: "reconcile_only", order };
      }

      if (order.status === "CAPTURE_IN_PROGRESS") {
        const leaseLive =
          order.captureLeaseExpiresAtMs !== null &&
          order.captureLeaseExpiresAtMs > input.nowMs;
        if (leaseLive) {
          return {
            kind: "in_progress",
            order,
            retryAfterMs: Math.max(
              1,
              (order.captureLeaseExpiresAtMs ?? input.nowMs) - input.nowMs,
            ),
          };
        }

        if (order.captureRequestSentAtMs !== null) {
          const { rows } = await client.query(
            `UPDATE payment_orders SET
               status = 'CAPTURE_IN_DOUBT',
               capture_in_doubt_at = $2,
               capture_lease_owner = NULL,
               capture_lease_expires_at = NULL,
               updated_at = $2
             WHERE paypal_order_id = $1
             RETURNING *`,
            [order.paypalOrderId, iso(input.nowMs)],
          );
          await openIssue(
            client,
            order.paypalOrderId,
            "CAPTURE_LEASE_EXPIRED",
            input.nowMs,
            "capture_outcome_unknown",
            null,
          );
          await insertAudit(
            client,
            order.paypalOrderId,
            "CAPTURE_LEASE_EXPIRED",
            "CAPTURE_IN_PROGRESS",
            "CAPTURE_IN_DOUBT",
            input.nowMs,
          );
          return {
            kind: "in_doubt",
            order: mapOrder(rows[0] as PaymentOrderRow),
          };
        }

        const { rows } = await client.query(
          `UPDATE payment_orders SET
             capture_lease_owner = $2,
             capture_lease_expires_at = $3,
             updated_at = $4
           WHERE paypal_order_id = $1
           RETURNING *`,
          [
            order.paypalOrderId,
            input.leaseOwner,
            iso(input.nowMs + input.leaseMs),
            iso(input.nowMs),
          ],
        );
        await insertAudit(
          client,
          order.paypalOrderId,
          "CAPTURE_CLAIM_RECLAIMED",
          "CAPTURE_IN_PROGRESS",
          "CAPTURE_IN_PROGRESS",
          input.nowMs,
        );
        return {
          kind: "claimed",
          order: mapOrder(rows[0] as PaymentOrderRow),
          leaseOwner: input.leaseOwner,
        };
      }

      if (order.status === "CREATED" || order.status === "APPROVED") {
        const { rows } = await client.query(
          `UPDATE payment_orders SET
             status = 'CAPTURE_IN_PROGRESS',
             capture_lease_owner = $2,
             capture_lease_expires_at = $3,
             capture_request_sent_at = NULL,
             capture_in_doubt_at = NULL,
             updated_at = $4
           WHERE paypal_order_id = $1
           RETURNING *`,
          [
            order.paypalOrderId,
            input.leaseOwner,
            iso(input.nowMs + input.leaseMs),
            iso(input.nowMs),
          ],
        );
        await insertAudit(
          client,
          order.paypalOrderId,
          "CAPTURE_CLAIMED",
          order.status,
          "CAPTURE_IN_PROGRESS",
          input.nowMs,
        );
        return {
          kind: "claimed",
          order: mapOrder(rows[0] as PaymentOrderRow),
          leaseOwner: input.leaseOwner,
        };
      }

      return { kind: "not_allowed", order };
    });
  }

  async markCaptureRequestSent(
    input: MarkCaptureRequestSentInput,
  ): Promise<boolean> {
    return withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE payment_orders SET
           capture_request_sent_at = $3,
           updated_at = $3
         WHERE paypal_order_id = $1
           AND status = 'CAPTURE_IN_PROGRESS'
           AND capture_lease_owner = $2`,
        [input.orderId, input.leaseOwner, iso(input.nowMs)],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async completeCapture(
    input: CompleteCaptureInput,
  ): Promise<CaptureMutationResult> {
    return withTransaction(async (client) => {
      const order = await selectOrder(client, input.orderId, true);
      if (!order) {
        throw new PaymentStoreConflictError("Unknown payment order.");
      }

      const existing = await selectCapture(client, order.paypalOrderId);
      if (order.status === "COMPLETED") {
        if (existing && existing.paypalCaptureId === input.capture.captureId) {
          return { order, capture: existing };
        }
        await openIssue(
          client,
          order.paypalOrderId,
          "CAPTURE_VERIFICATION_MISMATCH",
          input.nowMs,
          "completed_order_capture_conflict",
          null,
        );
        return {
          order,
          ...(existing ? { capture: existing } : {}),
          conflictReason: "completed_order_capture_conflict",
        };
      }

      if (!canTransition(order.status, "COMPLETED")) {
        return { order, conflictReason: "capture_not_completable" };
      }
      if (
        input.leaseOwner !== undefined &&
        order.captureLeaseOwner !== input.leaseOwner
      ) {
        return { order, conflictReason: "capture_lease_lost" };
      }

      const capture = await upsertCapture(client, order, {
        captureId: input.capture.captureId,
        amountCents: input.capture.amountCents,
        status: "COMPLETED",
        sellerProtectionStatus: input.capture.sellerProtectionStatus,
        capturedAtMs: input.capture.capturedAtMs ?? input.nowMs,
        nowMs: input.nowMs,
      });
      if (!capture) {
        await openIssue(
          client,
          order.paypalOrderId,
          "CAPTURE_VERIFICATION_MISMATCH",
          input.nowMs,
          "capture_identity_conflict",
          null,
        );
        return { order, conflictReason: "capture_identity_conflict" };
      }

      const { rows } = await client.query(
        `UPDATE payment_orders SET
           status = 'COMPLETED',
           captured_at = $2,
           capture_in_doubt_at = NULL,
           capture_lease_owner = NULL,
           capture_lease_expires_at = NULL,
           capture_request_sent_at = NULL,
           updated_at = $2
         WHERE paypal_order_id = $1
         RETURNING *`,
        [order.paypalOrderId, iso(input.nowMs)],
      );
      await resolveIssues(client, order.paypalOrderId, input.nowMs);
      await insertAudit(
        client,
        order.paypalOrderId,
        "CAPTURE_COMPLETED",
        "CAPTURE_IN_PROGRESS",
        "COMPLETED",
        input.nowMs,
        {
          amountCents: input.capture.amountCents,
          currency: "USD",
        },
      );

      return {
        order: mapOrder(rows[0] as PaymentOrderRow),
        capture,
      };
    });
  }

  async markCapturePending(
    input: MarkCapturePendingInput,
  ): Promise<CaptureMutationResult> {
    return withTransaction(async (client) => {
      const order = await selectOrder(client, input.orderId, true);
      if (!order) {
        throw new PaymentStoreConflictError("Unknown payment order.");
      }
      if (order.status === "COMPLETED") {
        const existing = await selectCapture(client, order.paypalOrderId);
        return {
          order,
          ...(existing ? { capture: existing } : {}),
          conflictReason: "capture_already_completed",
        };
      }
      if (!canTransition(order.status, "PENDING")) {
        return { order, conflictReason: "capture_not_markable_pending" };
      }

      const { rows } = await client.query(
        `UPDATE payment_orders SET
           status = 'PENDING',
           provider_order_status = $2,
           capture_in_doubt_at = NULL,
           capture_lease_owner = NULL,
           capture_lease_expires_at = NULL,
           capture_request_sent_at = NULL,
           updated_at = $3
         WHERE paypal_order_id = $1
         RETURNING *`,
        [order.paypalOrderId, input.summary.captureStatus, iso(input.nowMs)],
      );

      let capture: StoredPaymentCapture | null = null;
      if (input.summary.captureId) {
        capture = await upsertCapture(client, order, {
          captureId: input.summary.captureId,
          amountCents: input.summary.amountCents ?? order.amountCents,
          status: "PENDING",
          capturedAtMs: null,
          nowMs: input.nowMs,
        });
      }

      await openIssue(
        client,
        order.paypalOrderId,
        "CAPTURE_PENDING",
        input.nowMs,
        input.errorCode,
        input.nowMs + 5 * 60_000,
      );
      await insertAudit(
        client,
        order.paypalOrderId,
        "CAPTURE_PENDING",
        order.status,
        "PENDING",
        input.nowMs,
        { errorCode: input.errorCode, captureStatus: input.summary.captureStatus },
      );

      return {
        order: mapOrder(rows[0] as PaymentOrderRow),
        ...(capture ? { capture } : {}),
      };
    });
  }

  async markCaptureFailed(
    input: MarkCaptureFailedInput,
  ): Promise<CaptureMutationResult> {
    return withTransaction(async (client) => {
      const order = await selectOrder(client, input.orderId, true);
      if (!order) {
        throw new PaymentStoreConflictError("Unknown payment order.");
      }
      if (order.status === "COMPLETED") {
        const existing = await selectCapture(client, order.paypalOrderId);
        return {
          order,
          ...(existing ? { capture: existing } : {}),
          conflictReason: "capture_already_completed",
        };
      }
      if (!canTransition(order.status, "FAILED")) {
        return { order, conflictReason: "capture_not_failable" };
      }

      const { rows } = await client.query(
        `UPDATE payment_orders SET
           status = 'FAILED',
           provider_order_status = $2,
           capture_in_doubt_at = NULL,
           capture_lease_owner = NULL,
           capture_lease_expires_at = NULL,
           capture_request_sent_at = NULL,
           updated_at = $3
         WHERE paypal_order_id = $1
         RETURNING *`,
        [order.paypalOrderId, input.providerStatus, iso(input.nowMs)],
      );

      let capture: StoredPaymentCapture | null = null;
      if (input.summary.captureId) {
        capture = await upsertCapture(client, order, {
          captureId: input.summary.captureId,
          amountCents: input.summary.amountCents ?? order.amountCents,
          status: input.providerStatus === "DENIED" ? "DENIED" : "FAILED",
          capturedAtMs: null,
          nowMs: input.nowMs,
        });
      }

      await resolveIssues(client, order.paypalOrderId, input.nowMs);
      await insertAudit(
        client,
        order.paypalOrderId,
        "CAPTURE_FAILED",
        order.status,
        "FAILED",
        input.nowMs,
        { errorCode: input.errorCode, captureStatus: input.providerStatus },
      );

      return {
        order: mapOrder(rows[0] as PaymentOrderRow),
        ...(capture ? { capture } : {}),
      };
    });
  }

  async markCaptureInDoubt(
    input: MarkCaptureInDoubtInput,
  ): Promise<CaptureMutationResult> {
    return withTransaction(async (client) => {
      const order = await selectOrder(client, input.orderId, true);
      if (!order) {
        throw new PaymentStoreConflictError("Unknown payment order.");
      }
      if (order.status === "COMPLETED") {
        const existing = await selectCapture(client, order.paypalOrderId);
        return {
          order,
          ...(existing ? { capture: existing } : {}),
          conflictReason: "capture_already_completed",
        };
      }

      const nextStatus = canTransition(order.status, "CAPTURE_IN_DOUBT")
        ? "CAPTURE_IN_DOUBT"
        : order.status;
      const { rows } = await client.query(
        `UPDATE payment_orders SET
           status = $2,
           capture_in_doubt_at = COALESCE(capture_in_doubt_at, $3),
           capture_lease_owner = NULL,
           capture_lease_expires_at = NULL,
           updated_at = $3
         WHERE paypal_order_id = $1
         RETURNING *`,
        [order.paypalOrderId, nextStatus, iso(input.nowMs)],
      );

      await openIssue(
        client,
        order.paypalOrderId,
        input.issueType,
        input.nowMs,
        input.errorCode,
        input.nowMs + 30_000,
      );
      await insertAudit(
        client,
        order.paypalOrderId,
        "CAPTURE_IN_DOUBT",
        order.status,
        nextStatus,
        input.nowMs,
        { issueType: input.issueType, errorCode: input.errorCode },
      );

      return { order: mapOrder(rows[0] as PaymentOrderRow) };
    });
  }

  async markReconciliationRequired(
    input: MarkReconciliationRequiredInput,
  ): Promise<CaptureMutationResult> {
    return withTransaction(async (client) => {
      const order = await selectOrder(client, input.orderId, true);
      if (!order) {
        throw new PaymentStoreConflictError("Unknown payment order.");
      }

      const nextStatus = canTransition(order.status, "RECONCILIATION_REQUIRED")
        ? "RECONCILIATION_REQUIRED"
        : order.status;
      const { rows } = await client.query(
        `UPDATE payment_orders SET
           status = $2,
           capture_in_doubt_at = COALESCE(capture_in_doubt_at, $3),
           capture_lease_owner = NULL,
           capture_lease_expires_at = NULL,
           updated_at = $3
         WHERE paypal_order_id = $1
         RETURNING *`,
        [order.paypalOrderId, nextStatus, iso(input.nowMs)],
      );

      let capture: StoredPaymentCapture | null = null;
      if (input.summary.captureId) {
        capture = await upsertCapture(client, order, {
          captureId: input.summary.captureId,
          amountCents: input.summary.amountCents ?? order.amountCents,
          status: "UNVERIFIED_COMPLETED",
          capturedAtMs: input.nowMs,
          nowMs: input.nowMs,
        });
      }

      await openIssue(
        client,
        order.paypalOrderId,
        input.issueType,
        input.nowMs,
        input.errorCode,
        input.nowMs + 60_000,
      );
      await insertAudit(
        client,
        order.paypalOrderId,
        "RECONCILIATION_REQUIRED",
        order.status,
        nextStatus,
        input.nowMs,
        {
          issueType: input.issueType,
          errorCode: input.errorCode,
          hasCapture: input.summary.captureId !== null,
        },
      );

      return {
        order: mapOrder(rows[0] as PaymentOrderRow),
        ...(capture ? { capture } : {}),
      };
    });
  }

  async expireOrder(
    input: ExpireOrderInput,
  ): Promise<StoredPaymentOrder | null> {
    return withTransaction(async (client) => {
      const order = await selectOrder(client, input.orderId, true);
      if (!order) return null;
      if (order.status === "EXPIRED") return order;
      const expirable =
        order.status === "CREATED" || order.status === "APPROVED";
      if (!expirable || order.expiresAtMs > input.nowMs) return null;

      const { rows } = await client.query(
        `UPDATE payment_orders SET status = 'EXPIRED', updated_at = $2
          WHERE paypal_order_id = $1
          RETURNING *`,
        [order.paypalOrderId, iso(input.nowMs)],
      );
      await insertAudit(
        client,
        order.paypalOrderId,
        "ORDER_EXPIRED",
        order.status,
        "EXPIRED",
        input.nowMs,
      );
      return mapOrder(rows[0] as PaymentOrderRow);
    });
  }

  async listOpenReconciliation(
    input: ListOpenReconciliationInput,
  ): Promise<StoredReconciliationIssue[]> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM payment_reconciliation
          WHERE reconciliation_status IN ('OPEN', 'IN_PROGRESS')
            AND (next_check_at IS NULL OR next_check_at <= $1)
          ORDER BY created_at ASC
          LIMIT $2`,
        [iso(input.nowMs), input.limit],
      );
      return (rows as ReconciliationRow[]).map(mapIssue);
    });
  }

  async getAuditLogs(orderId: string): Promise<StoredAuditLog[]> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM payment_audit_logs
          WHERE paypal_order_id = $1
          ORDER BY created_at ASC`,
        [orderId],
      );
      return (rows as AuditRow[]).map(mapAudit);
    });
  }

  resetForTests(): void {
    throw new PaymentStoreConflictError(
      "The Postgres payment store refuses test resets; use an isolated database.",
    );
  }
}
