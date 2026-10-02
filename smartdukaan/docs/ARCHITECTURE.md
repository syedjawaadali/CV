# Architecture

This document explains how Smart Dukaan (Retailer Core MVP) is put together and
the reasoning behind the load-bearing decisions.

## 1. Shape of the system

```
Browser (React SPA)  ──HTTPS──▶  Express API  ──▶  PostgreSQL
   in-memory access token          stateless          append-only
   httpOnly refresh cookie         JWT auth            ledgers + cached balances
```

Three workspaces in one npm monorepo:

- **`packages/shared`** — the single source of truth for things both sides must
  agree on: money math (integer paisa), the role/permission matrix, zod
  validation schemas, and DTO types. Importing the *same* zod schema on the
  server (for security) and in the browser (for UX) means validation can never
  drift between them.
- **`apps/server`** — a stateless Express API. Feature-first module layout: each
  domain (`sales`, `khata`, `inventory`, …) owns its `*.routes.ts` (HTTP + authz)
  and `*.service.ts` (business logic + SQL).
- **`apps/web`** — a React SPA. Pages call the API through a thin fetch client;
  server state is cached with TanStack Query.

## 2. Money

All monetary values are **integer minor units (paisa)**, stored as `BIGINT`.
Floating-point money is never used anywhere. Conversions and arithmetic live in
`@smartdukaan/shared/money` (`toMinor`, `toMajor`, `addMinor`, …). Users type
rupees in forms; the server converts to paisa on the boundary. `pg` is
configured to parse `BIGINT` as a JavaScript number, and amounts stay well
within `Number.MAX_SAFE_INTEGER`.

## 3. Ledgers and integrity

Two domains are modelled as **append-only ledgers**:

- **Khata** — `khata_transactions` records every credit, payment, and reversal
  with a signed `amount_minor` and the resulting `balance_after_minor`.
- **Inventory** — `inventory_movements` records every stock change (opening,
  sale, adjustment, sale_reversal) with a signed `quantity_delta` and
  `balance_after`.

`customers.balance_minor` and `products.stock_qty` are **cached** columns for
fast reads. They are invariants, not sources of truth: the tests assert that each
cached value equals the sum of its ledger. Corrections are made by appending a
compensating entry (reversal), never by editing or deleting history.

### Why sales are safe under concurrency
`createSale` runs inside a single transaction and locks each product row with
`SELECT … FOR UPDATE` before checking stock and deducting it. Two cashiers
selling the last unit at the same moment cannot both succeed — the second waits,
then sees the depleted stock and gets a business-rule error.

### Idempotency
Unsafe, non-retry-safe operations (sale creation) accept an `Idempotency-Key`
header. The key + request is claimed atomically; a replay returns the original
result instead of performing the action twice. This defends against
double-taps and network retries.

## 4. Auth & sessions

- **Access token**: short-lived (15m) JWT (HS256), signed with `JWT_SECRET`.
  The browser keeps it **in memory only** — not localStorage — so it is not
  readable after reload or by persistent XSS.
- **Refresh token**: long-lived (30d) opaque random string, stored **hashed
  (SHA-256)** in `refresh_tokens`, delivered as an `httpOnly`, `SameSite`
  cookie scoped to `/api/auth`. It rotates on every refresh.
- On boot the SPA calls `/api/auth/refresh`; a valid cookie silently restores
  the session. On a 401 the fetch client transparently refreshes once and retries.

## 5. Authorization (RBAC)

Roles and fine-grained permissions are defined **once** in
`@smartdukaan/shared/roles` as a `ROLE_PERMISSIONS` matrix. Every protected
route declares the permission it needs via `requirePermission(...)`, enforced
server-side. The web app imports the same matrix only to decide what to render —
it is never the security boundary. Example: a cashier can create sales but the
`reverse` route and the employees API return `403`, and the dashboard redacts
estimated profit because the cashier lacks `profit:view`.

## 6. Multi-tenancy

Every business table carries `tenant_id` and `shop_id`. Every query is scoped to
the caller's shop. There is no code path that reads across shops; a request for
another shop's record returns `404`, which the integration tests assert.

## 7. Time & locale

Timestamps are stored in UTC (`timestamptz`). Business-day aggregation
(dashboard, day-close) converts to **Asia/Karachi** in SQL
(`created_at AT TIME ZONE 'Asia/Karachi'`) so "today" means the shopkeeper's
today. The web app formats dates in the same zone.

## 8. Pagination

Lists use **keyset (cursor) pagination** on `(created_at, id)` rather than
`OFFSET`, so pages stay correct and fast as data grows. The cursor is an opaque
encoded string; the web app follows `nextCursor` with an infinite-scroll
"load more".

## 9. Error handling

A central error middleware maps `AppError` subclasses, zod validation errors, and
known Postgres error codes to a stable JSON envelope
`{ error: { code, message, fieldErrors?, requestId } }`. Stack traces, SQL, and
secrets are never included. A structured JSON logger redacts known-sensitive keys.

## 10. Database schema (overview)

`tenants`, `shops`, `users`, `refresh_tokens`, `shop_counters`, `customers`,
`products`, `sales`, `sale_items`, `khata_transactions`, `inventory_movements`,
`suppliers`, `purchases`, `purchase_items`, `expenses`, `daily_closings`,
`audit_logs`, `idempotency_keys`, `notifications`.

Migrations are forward-only and idempotent, tracked in a `_migrations` table by a
small runner (`apps/server/src/db/migrate.ts`).

## 11. Extension points (future phases)

- **Purchases/suppliers**: services and tables exist; add a UI and receiving flow.
- **AI**: the ledgers give clean time-series inputs for demand forecasting;
  add a separate service that reads (never writes) the ledgers.
- **Payments/messaging**: sales already model a `digital` method and receipts;
  integrate a gateway and WhatsApp/SMS at the module boundary.
- **Offline-first**: the idempotency + ledger design is compatible with a sync
  queue that replays operations with stable keys.
