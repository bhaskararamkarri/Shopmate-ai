-- Phase 6C: Guest Checkout Ownership & Idempotency Scoping
-- Forward-only migration adding cryptographic guest ownership to payment orders and idempotency.
-- Preserves all Phase 6B tables, constraints, triggers, and table-level RLS deny policies.

-- Set lock timeout to prevent queue blocking
set lock_timeout = '3s';

-- 1. Add guest_owner_hash to payment_orders
alter table public.payment_orders
  add column if not exists guest_owner_hash text;

alter table public.payment_orders
  drop constraint if exists payment_orders_guest_owner_hash_format;

alter table public.payment_orders
  add constraint payment_orders_guest_owner_hash_format
  check (guest_owner_hash is null or guest_owner_hash ~ '^[0-9a-f]{64}$');

create index if not exists payment_orders_guest_owner_idx
  on public.payment_orders (guest_owner_hash)
  where guest_owner_hash is not null;

-- 2. Add guest_owner_hash to payment_idempotency
alter table public.payment_idempotency
  add column if not exists guest_owner_hash text;

alter table public.payment_idempotency
  drop constraint if exists payment_idempotency_guest_owner_hash_format;

alter table public.payment_idempotency
  add constraint payment_idempotency_guest_owner_hash_format
  check (guest_owner_hash is null or guest_owner_hash ~ '^[0-9a-f]{64}$');

-- 3. Transition from global idempotency uniqueness to guest-scoped partial unique indexes
alter table public.payment_idempotency
  drop constraint if exists payment_idempotency_unique_key;

create unique index if not exists payment_idempotency_guest_unique_idx
  on public.payment_idempotency (scope, guest_owner_hash, idempotency_key)
  where guest_owner_hash is not null;

create unique index if not exists payment_idempotency_legacy_unique_idx
  on public.payment_idempotency (scope, idempotency_key)
  where guest_owner_hash is null;

-- 4. Update transition trigger function to enforce guest ownership immutability
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

  if old.guest_owner_hash is not null and new.guest_owner_hash is distinct from old.guest_owner_hash then
    raise exception 'payment order ownership is immutable';
  end if;

  if new.status is distinct from old.status
     and not public.payment_order_transition_allowed(old.status, new.status) then
    raise exception 'invalid payment state transition: % -> %',
      old.status, new.status;
  end if;

  return new;
end;
$$;

