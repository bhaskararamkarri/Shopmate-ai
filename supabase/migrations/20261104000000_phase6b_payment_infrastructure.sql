-- ShopMate AI — Phase 6B durable payment infrastructure.
--
-- Additive only. This migration creates five new tables and does not remove
-- or rewrite an existing object. It is safe to review and apply to a project
-- that already has other tables.
--
-- Tables:
--   payment_orders          server-owned order authority (amounts, tokens)
--   payment_captures        verified or unverified capture records
--   payment_idempotency     transactional create-order reservations
--   payment_reconciliation  durable issues requiring read-only follow-up
--   payment_audit_logs      append-only safe event history
--
-- Webhook events are intentionally out of scope for this phase.
--
-- Security model:
--   * RLS is enabled on every table.
--   * anon and authenticated receive no table grants and an explicit deny-all
--     policy (USING false / WITH CHECK false).
--   * service_role receives only SELECT, INSERT, UPDATE — never DELETE.
--   * The application itself connects through DATABASE_URL as the database
--     owner, which bypasses RLS; RLS is defence-in-depth for the Data API.

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  paypal_order_id text not null unique,
  reference_id text not null unique,
  amount_cents bigint not null,
  currency text not null default 'USD',
  status text not null,
  capture_token_hash text not null,
  cart_fingerprint text not null,
  idempotency_key text,
  approval_url text,
  provider_order_status text,
  capture_in_doubt_at timestamptz,
  capture_lease_owner text,
  capture_lease_expires_at timestamptz,
  capture_request_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  captured_at timestamptz,

  constraint payment_orders_amount_positive check (amount_cents > 0),
  constraint payment_orders_currency_usd check (currency = 'USD'),
  constraint payment_orders_status_valid check (
    status in (
      'CREATED',
      'APPROVED',
      'CAPTURE_IN_PROGRESS',
      'CAPTURE_IN_DOUBT',
      'PENDING',
      'COMPLETED',
      'FAILED',
      'RECONCILIATION_REQUIRED',
      'EXPIRED'
    )
  ),
  constraint payment_orders_token_hash_format check (
    capture_token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint payment_orders_expiry_after_creation check (expires_at > created_at),
  constraint payment_orders_lease_pair check (
    (capture_lease_owner is null) = (capture_lease_expires_at is null)
  ),
  constraint payment_orders_capture_in_progress_has_lease check (
    status <> 'CAPTURE_IN_PROGRESS' or capture_lease_owner is not null
  ),
  constraint payment_orders_doubt_has_timestamp check (
    status <> 'CAPTURE_IN_DOUBT' or capture_in_doubt_at is not null
  ),
  constraint payment_orders_captured_at_matches_status check (
    (captured_at is not null) = (status = 'COMPLETED')
  )
);

create index if not exists payment_orders_status_expires_idx
  on public.payment_orders (status, expires_at);

create index if not exists payment_orders_idempotency_key_idx
  on public.payment_orders (idempotency_key)
  where idempotency_key is not null;

create index if not exists payment_orders_capture_lease_idx
  on public.payment_orders (capture_lease_expires_at)
  where status = 'CAPTURE_IN_PROGRESS';

create table if not exists public.payment_captures (
  id uuid primary key default gen_random_uuid(),
  paypal_capture_id text not null unique,
  paypal_order_id text not null unique
    references public.payment_orders (paypal_order_id)
    on update restrict on delete restrict,
  amount_cents bigint not null,
  currency text not null default 'USD',
  status text not null,
  seller_protection_status text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_captures_amount_positive check (amount_cents > 0),
  constraint payment_captures_currency_usd check (currency = 'USD'),
  constraint payment_captures_status_valid check (
    status in (
      'COMPLETED',
      'PENDING',
      'DENIED',
      'FAILED',
      'UNVERIFIED_COMPLETED',
      'REFUNDED',
      'PARTIALLY_REFUNDED'
    )
  ),
  constraint payment_captures_completed_has_timestamp check (
    status <> 'COMPLETED' or captured_at is not null
  )
);

create index if not exists payment_captures_status_idx
  on public.payment_captures (status);

create table if not exists public.payment_idempotency (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  idempotency_key text not null,
  cart_fingerprint text not null,
  request_status text not null,
  paypal_order_id text,
  reference_id text,
  amount_cents bigint,
  currency text,
  provider_order_status text,
  approval_url text,
  safe_error_code text,
  attempts integer not null default 1,
  processing_started_at timestamptz not null,
  processing_lease_expires_at timestamptz not null,
  last_attempted_at timestamptz not null,
  retry_not_before timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint payment_idempotency_scope_valid check (scope = 'create_order'),
  constraint payment_idempotency_status_valid check (
    request_status in ('PROCESSING', 'COMPLETED', 'FAILED')
  ),
  constraint payment_idempotency_attempts_positive check (attempts > 0),
  constraint payment_idempotency_amount_positive check (
    amount_cents is null or amount_cents > 0
  ),
  constraint payment_idempotency_currency_usd check (
    currency is null or currency = 'USD'
  ),
  constraint payment_idempotency_expiry_after_creation check (
    expires_at > created_at
  ),
  constraint payment_idempotency_completed_fields check (
    request_status <> 'COMPLETED'
    or (paypal_order_id is not null and completed_at is not null)
  ),
  constraint payment_idempotency_failed_fields check (
    request_status <> 'FAILED' or completed_at is not null
  ),
  constraint payment_idempotency_unique_key unique (scope, idempotency_key)
);

create index if not exists payment_idempotency_expires_idx
  on public.payment_idempotency (expires_at);

create index if not exists payment_idempotency_processing_idx
  on public.payment_idempotency (processing_lease_expires_at)
  where request_status = 'PROCESSING';

create table if not exists public.payment_reconciliation (
  id uuid primary key default gen_random_uuid(),
  paypal_order_id text not null
    references public.payment_orders (paypal_order_id)
    on update restrict on delete restrict,
  issue_type text not null,
  reconciliation_status text not null default 'OPEN',
  attempts integer not null default 0,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  resolved_at timestamptz,
  safe_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_reconciliation_status_valid check (
    reconciliation_status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED')
  ),
  constraint payment_reconciliation_attempts_non_negative check (attempts >= 0),
  constraint payment_reconciliation_resolved_fields check (
    reconciliation_status not in ('RESOLVED', 'IGNORED') or resolved_at is not null
  )
);

create unique index if not exists payment_reconciliation_open_unique
  on public.payment_reconciliation (paypal_order_id, issue_type)
  where reconciliation_status in ('OPEN', 'IN_PROGRESS');

create index if not exists payment_reconciliation_queue_idx
  on public.payment_reconciliation (reconciliation_status, next_check_at);

create table if not exists public.payment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  paypal_order_id text not null
    references public.payment_orders (paypal_order_id)
    on update restrict on delete restrict,
  event_type text not null,
  previous_status text,
  new_status text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint payment_audit_logs_previous_status_valid check (
    previous_status is null
    or previous_status in (
      'CREATED',
      'APPROVED',
      'CAPTURE_IN_PROGRESS',
      'CAPTURE_IN_DOUBT',
      'PENDING',
      'COMPLETED',
      'FAILED',
      'RECONCILIATION_REQUIRED',
      'EXPIRED'
    )
  ),
  constraint payment_audit_logs_new_status_valid check (
    new_status is null
    or new_status in (
      'CREATED',
      'APPROVED',
      'CAPTURE_IN_PROGRESS',
      'CAPTURE_IN_DOUBT',
      'PENDING',
      'COMPLETED',
      'FAILED',
      'RECONCILIATION_REQUIRED',
      'EXPIRED'
    )
  )
);

create index if not exists payment_audit_logs_order_created_idx
  on public.payment_audit_logs (paypal_order_id, created_at);

-- Keep updated_at honest even when a direct SQL update forgets it.
create or replace function public.payment_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger payment_orders_set_updated_at
  before update on public.payment_orders
  for each row execute function public.payment_set_updated_at();

create trigger payment_captures_set_updated_at
  before update on public.payment_captures
  for each row execute function public.payment_set_updated_at();

create trigger payment_idempotency_set_updated_at
  before update on public.payment_idempotency
  for each row execute function public.payment_set_updated_at();

create trigger payment_reconciliation_set_updated_at
  before update on public.payment_reconciliation
  for each row execute function public.payment_set_updated_at();

-- The same transition table as src/lib/payments/state-machine.ts. An
-- application bug or a direct SQL update cannot write an impossible state.
create or replace function public.payment_order_transition_allowed(
  previous_status text,
  next_status text
)
returns boolean
language sql
immutable
as $$
  select case
    when previous_status = next_status then true
    when previous_status = 'CREATED' then next_status in ('APPROVED', 'CAPTURE_IN_PROGRESS', 'EXPIRED', 'FAILED')
    when previous_status = 'APPROVED' then next_status in ('CAPTURE_IN_PROGRESS', 'EXPIRED', 'FAILED')
    when previous_status = 'CAPTURE_IN_PROGRESS' then next_status in ('CAPTURE_IN_DOUBT', 'PENDING', 'COMPLETED', 'FAILED', 'RECONCILIATION_REQUIRED')
    when previous_status = 'CAPTURE_IN_DOUBT' then next_status in ('PENDING', 'COMPLETED', 'FAILED', 'RECONCILIATION_REQUIRED')
    when previous_status = 'PENDING' then next_status in ('COMPLETED', 'FAILED', 'RECONCILIATION_REQUIRED')
    when previous_status = 'RECONCILIATION_REQUIRED' then next_status in ('CAPTURE_IN_DOUBT', 'PENDING', 'COMPLETED', 'FAILED')
    when previous_status in ('COMPLETED', 'FAILED', 'EXPIRED') then false
    else false
  end;
$$;

create or replace function public.enforce_payment_order_transition()
returns trigger
language plpgsql
as $$
begin
  if new.paypal_order_id is distinct from old.paypal_order_id
     or new.reference_id is distinct from old.reference_id
     or new.amount_cents is distinct from old.amount_cents
     or new.currency is distinct from old.currency
     or new.capture_token_hash is distinct from old.capture_token_hash
     or new.cart_fingerprint is distinct from old.cart_fingerprint
     or new.created_at is distinct from old.created_at then
    raise exception 'payment order financial identity is immutable';
  end if;

  if new.status is distinct from old.status
     and not public.payment_order_transition_allowed(old.status, new.status) then
    raise exception 'invalid payment state transition: % -> %',
      old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger payment_orders_enforce_transition
  before update on public.payment_orders
  for each row execute function public.enforce_payment_order_transition();

-- RLS is mandatory on every exposed table. The deny policies are explicit even
-- though the grants below already remove all anon/authenticated privileges.
do $$
declare
  table_name text;
  role_name text;
  table_names text[] := array[
    'payment_orders',
    'payment_captures',
    'payment_idempotency',
    'payment_reconciliation',
    'payment_audit_logs'
  ];
begin
  foreach table_name in array table_names loop
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );

    -- Remove any implicit PUBLIC access, then every anon/authenticated grant.
    execute format(
      'revoke all on table public.%I from public',
      table_name
    );

    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format(
          'revoke all on table public.%I from %I',
          table_name,
          role_name
        );
        execute format(
          'create policy %I on public.%I for all to %I using (false) with check (false)',
          'deny_' || table_name || '_' || role_name,
          table_name,
          role_name
        );
      end if;
    end loop;

    -- Least privilege for the Data API service role: read and mutate, never
    -- delete. The application's direct connection is the table owner.
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format(
        'grant select, insert, update on table public.%I to service_role',
        table_name
      );
    end if;
  end loop;
end $$;

comment on table public.payment_orders is
  'ShopMate server-owned PayPal order authority. Amounts are integer cents; capture tokens are stored only as SHA-256 hashes.';
comment on table public.payment_captures is
  'ShopMate verified or unverified PayPal capture records. One capture row per PayPal order.';
comment on table public.payment_idempotency is
  'Transactional create-order reservations keyed by (scope, idempotency_key).';
comment on table public.payment_reconciliation is
  'Durable issues that require read-only PayPal reconciliation. Never auto-refund.';
comment on table public.payment_audit_logs is
  'Append-only safe event history. No tokens, credentials, or raw upstream payloads.';
