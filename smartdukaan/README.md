# Smart Dukaan — Retailer Core MVP

A production-minded starting point for **Smart Dukaan**, an AI-powered commerce
operating system for Pakistani shops. This repository implements the
**Retailer Core** — the day-to-day operations a kiryana / general store owner
actually relies on — as a complete, tested, full-stack TypeScript application.

> **Scope note (honest).** This is the Retailer Core MVP, not all 22 phases of
> the original vision. It is a real, working system with financial integrity,
> multi-tenancy, role-based access, and a mobile-first bilingual UI — built so
> the remaining phases can be layered on without re-architecting. See
> [What's included / not yet](#whats-included--not-yet-included).

---

## What it does

- **Point of sale** — cash / credit / digital sales, multi-line or quick
  lump-sum amount, server-computed totals, live stock checks, printable receipt
  numbers, and one-tap **reversal** (never silent deletion).
- **Khata (udhaar / credit ledger)** — per-customer running balance backed by an
  **append-only** transaction ledger; record payments and new credit; the cached
  balance is always reconstructable from the ledger.
- **Inventory** — stock tracked as an append-only movement ledger (sale, opening,
  adjustment, reversal); low-stock alerts; overselling is blocked at the database
  level with row locking.
- **Customers & products** — searchable, keyset-paginated lists with create/edit.
- **Expenses** — categorized daily expense capture.
- **Day close** — end-of-day cash reconciliation: expected vs counted, with a
  computed difference, idempotent per business date.
- **Dashboard** — today's sales by method, khata collected, expenses, outstanding
  credit, estimated profit (redacted for roles without permission), low-stock count.
- **Staff & roles** — owner / manager / cashier / inventory / viewer, enforced
  **server-side** via a central permission matrix.
- **Bilingual** — English + Urdu with full **RTL** layout switching.

## Tech stack

| Layer     | Choices |
|-----------|---------|
| Language  | TypeScript (strict, `noUncheckedIndexedAccess`) |
| Backend   | Node 20+, Express 4, `pg` (node-postgres), zod, JWT (HS256), bcrypt, helmet |
| Database  | PostgreSQL 16 (works with local Postgres or Supabase — code reads `DATABASE_URL`) |
| Frontend  | React 18, Vite 6, Tailwind 3, TanStack Query, react-router, react-hook-form |
| Shared    | A `@smartdukaan/shared` package for money math, roles, and zod schemas used by **both** server and web |
| Tests     | Vitest + Supertest (unit + integration against a real Postgres) |

## Monorepo layout

```
packages/shared     Money (integer paisa), roles/permissions, zod validation, DTO types
apps/server         Express API: auth, sales, khata, inventory, customers, products,
                    expenses, closing, dashboard, employees, shop
apps/web            React SPA wired to the API (mobile-first, bilingual, RTL)
```

---

## Getting started

### Prerequisites
- Node.js **20+**
- PostgreSQL **16** running locally (or a Supabase connection string)

### 1. Install
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Then edit `.env` and set at minimum:
- `DATABASE_URL` — your Postgres/Supabase connection string
- `JWT_SECRET` — a long random string (≥ 32 chars). Generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

> **Secrets never leave the server.** `DATABASE_URL` and `JWT_SECRET` are read
> only through the validated `env` module, never logged, never returned by the
> API, never shipped to the browser. The browser holds only a short-lived
> access token **in memory**; the refresh token is an `httpOnly` cookie.

### 3. Create the schema + demo data
```bash
npm run migrate    # apply migrations (forward-only, idempotent)
npm run seed       # optional: demo shop with Pakistani products, sales, khata
```

The test suite uses a **separate** database (`TEST_DATABASE_URL`). Create it and
migrate before running tests:
```bash
npm run migrate:test
```

### 4. Run everything
```bash
npm run dev        # server on :4000 and web on :3000 (concurrently)
```
Open **http://localhost:3000**. In dev, the web server proxies `/api` and
`/health` to the API so the refresh cookie stays first-party.

**Demo login** (after `npm run seed`):
- Owner: `owner@demo.pk` / `demo12345`
- Cashier: `cashier@demo.pk` / `demo12345`

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run API + web together |
| `npm run build` | Type-safe production build of server and web |
| `npm run typecheck` | Strict typecheck across all workspaces |
| `npm test` | Run the server unit + integration test suite |
| `npm run migrate` / `migrate:test` | Apply migrations to dev / test DB |
| `npm run seed` | Load demo data |
| `npm run db:reset` | Truncate all tables (dev only; blocked in production) |

---

## Financial integrity (why the numbers can be trusted)

- **Money is stored as integer minor units (paisa)** — never floats. All
  arithmetic goes through `@smartdukaan/shared/money`.
- **Append-only ledgers** for khata and inventory. Cached balances
  (`customers.balance_minor`, `products.stock_qty`) are convenience columns and
  are always equal to the sum of their ledger — verified by tests.
- **Server computes every total.** Client-sent totals are ignored.
- **Atomic + locked.** Sales run in a transaction with `SELECT … FOR UPDATE` on
  product rows, so concurrent sales cannot oversell.
- **Idempotency.** Sale creation accepts an `Idempotency-Key`; a double-submit
  returns the original sale instead of creating a duplicate.
- **Reversal, not deletion.** Mistakes are corrected with compensating ledger
  entries that restore stock and khata, leaving a full audit trail.

## Security

- JWT access token (15m) in memory + rotating opaque refresh token (30d,
  SHA-256 hashed at rest) in an `httpOnly` cookie.
- Passwords hashed with bcrypt.
- `helmet`, strict CORS with credentials, zod-validated request bodies.
- Authorization enforced server-side on every route via a permission matrix;
  the web app uses the same constants only to decide what to *show*.
- Multi-tenant isolation: every business row carries `tenant_id` + `shop_id` and
  every query is shop-scoped (cross-tenant access returns 404, verified by tests).
- Error responses never leak stack traces, SQL, or secrets.

## Testing

```bash
npm run migrate:test   # once
npm test
```
Covers: money math, the role matrix, auth + tenant isolation, and the full
sales/khata/inventory integrity path (cash & credit sales, stock deduction,
ledger reconstruction, idempotency, oversell blocking, reversal, and RBAC).

---

## What's included / not yet included

**Included (working, tested):** auth + sessions, shops, staff & roles, customers,
products, inventory movements & adjustments, cash/credit/digital sales, sale
reversal, khata ledger & payments, expenses, daily closing, dashboard, bilingual
RTL web UI.

**Not yet included (deliberately out of MVP scope):** AI features (demand
forecasting, chat assistant), supplier purchase-order workflow UI (the API
exists; no dedicated screen yet), digital-payment gateway integration,
WhatsApp/SMS, offline-first sync, and reporting exports. These are the natural
next phases and the schema + module boundaries were designed to accommodate them.

## Cross-platform (Android & iOS)

The same React app is packaged into native Android and iOS apps with
[Capacitor](https://capacitorjs.com) — one codebase for web + Android + iOS.
Native projects live in `apps/web/android` and `apps/web/ios`. See
[docs/MOBILE.md](docs/MOBILE.md) for building the APK/AAB and the iOS app, and
note that a packaged app must be pointed at a **deployed** API via
`VITE_API_BASE_URL` (the webview has no dev proxy).

```bash
cd apps/web
VITE_API_BASE_URL="https://api.your-domain.pk" npm run build
npx cap sync
cd android && ./gradlew :app:assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

## Deploying with Supabase

No code changes are required — set `DATABASE_URL` to your Supabase connection
string, run `npm run migrate`, and deploy the API. Serve the built web app
(`apps/web/dist`) behind the same origin as the API (or set a reverse proxy) so
`/api` and the refresh cookie remain first-party.

## License

Private / unpublished. All rights reserved.
