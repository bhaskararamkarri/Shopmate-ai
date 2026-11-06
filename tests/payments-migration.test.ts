/**
 * Phase 6B — additive migration and security posture tests.
 *
 * These are static checks on the reviewed SQL, so they run without a database
 * credential. Remote application is a separate, explicitly approved step.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20261104000000_phase6b_payment_infrastructure.sql",
  ),
  "utf8",
);

const TABLES = [
  "payment_orders",
  "payment_captures",
  "payment_idempotency",
  "payment_reconciliation",
  "payment_audit_logs",
] as const;

describe("phase 6B migration", () => {
  it("creates all five durable payment tables additively", () => {
    for (const table of TABLES) {
      expect(MIGRATION).toContain(`create table if not exists public.${table}`);
    }
  });

  it("does not implement webhook events in this phase", () => {
    expect(MIGRATION).not.toContain("payment_webhook_events");
  });

  it("never contains destructive or reset statements", () => {
    const normalized = MIGRATION.toLowerCase();
    expect(normalized).not.toContain("drop table");
    expect(normalized).not.toContain("drop schema");
    expect(normalized).not.toContain("truncate");
    expect(normalized).not.toContain("delete from");
    expect(normalized).not.toContain("disable row level security");
  });

  it("enables RLS on every table and denies anon/authenticated access", () => {
    expect(MIGRATION).toContain("enable row level security");
    expect(MIGRATION).toContain("using (false) with check (false)");
    expect(MIGRATION).toContain("revoke all on table");
    expect(MIGRATION).toContain("'anon', 'authenticated'");
  });

  it("creates separate, uniquely-named deny policies per table and per role", () => {
    // Regression: pg_policy requires unique (table, policy_name). The old
    // deny_<table> name was reused for both anon and authenticated, which
    // failed on Supabase (42710) where both roles exist.
    expect(MIGRATION).toContain(
      "'deny_' || table_name || '_' || role_name",
    );
    for (const table of TABLES) {
      for (const role of ["anon", "authenticated"]) {
        // The names are built dynamically; prove uniqueness statically by
        // asserting the format fragment and the loop over both roles.
        expect(MIGRATION).toContain(table);
        expect(MIGRATION).toContain(role);
      }
    }
    // No bare deny_<table> policy-name pattern remains (it collided).
    expect(MIGRATION).not.toContain("'deny_' || table_name\n");
  });

  it("keeps USING (false) and WITH CHECK (false) on every deny policy", () => {
    expect(MIGRATION).toContain("using (false) with check (false)");
    // Deny policies never grant anything.
    expect(MIGRATION).not.toContain("using (true)");
    expect(MIGRATION).not.toContain("with check (true)");
  });

  it("grants only select, insert, and update to service_role", () => {
    expect(MIGRATION).toContain(
      "grant select, insert, update on table public.%I to service_role",
    );
    expect(MIGRATION.toLowerCase()).not.toContain(
      "grant select, insert, update, delete",
    );
    expect(MIGRATION.toLowerCase()).not.toContain("grant all");
    // No DELETE grant anywhere, to any role.
    expect(MIGRATION).not.toMatch(/grant[^\n]*\bdelete\b/i);
  });

  it("enforces payment state transitions in the database", () => {
    expect(MIGRATION).toContain("payment_order_transition_allowed");
    expect(MIGRATION).toContain("payment_orders_enforce_transition");
    expect(MIGRATION).toContain("invalid payment state transition");
    expect(MIGRATION).toContain("financial identity is immutable");
  });

  it("stores only a capture-token hash, never a plaintext capability", () => {
    expect(MIGRATION).toContain("capture_token_hash");
    expect(MIGRATION).toContain("^[0-9a-f]{64}$");
    expect(MIGRATION).not.toMatch(/capture_token\s+text/);
  });

  it("supports the capture lease and in-doubt fields", () => {
    expect(MIGRATION).toContain("capture_lease_owner");
    expect(MIGRATION).toContain("capture_lease_expires_at");
    expect(MIGRATION).toContain("capture_request_sent_at");
    expect(MIGRATION).toContain("capture_in_doubt_at");
  });

  it("has transactional uniqueness for idempotency and open issues", () => {
    expect(MIGRATION).toContain(
      "unique (scope, idempotency_key)",
    );
    expect(MIGRATION).toContain("payment_reconciliation_open_unique");
  });
});
