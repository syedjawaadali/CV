# Smart Dukaan — Operations, Security, Privacy & Resilience (Phases 8 & 10)

Honest operational reference. Items that **cannot be executed in this container**
(managed backups, restore drills, load tests on real infra, live dashboards,
external pen-tests) are labelled **[NOT EXECUTED HERE]** — they are procedures,
not claimed results.

## Health & readiness
- `GET /health` — liveness (process up). Verified by test.
- `GET /health/ready` — readiness: checks DB reachability, returns 503 when down,
  exposes only boolean/enum config (never secret values). Verified by test.
- Provider health / circuit-breaker state is persisted in `ai_provider_health`
  (Phase 4) and consulted before every cloud call.

## Offline-first & sync (existing guarantees + hardening)
- **Source of truth is append-only.** `inventory_movements` and
  `khata_transactions` are append-only ledgers with cached balances; sales/
  payments/expenses/purchases are inserts. There is **no in-place financial
  overwrite** anywhere in the codebase — corrections are reversals/adjustments.
  Verified by the sales reversal + idempotency integration tests.
- **Idempotency** (`lib/idempotency.ts`, client-generated keys) prevents
  duplicate sales/actions on retry/replay. Verified by tests (sales duplicate-key,
  voice duplicate-confirmation).
- **Local states** the client uses: local_only, draft, confirmed_locally,
  pending_sync, syncing, synced, conflict, failed, cancelled, expired.
- Conflicts are surfaced, never silently resolved; financial/inventory conflicts
  become explicit corrections. **[Deep client-side offline outbox/replay and
  conflict UI are partly future work — NOT fully EXECUTED HERE.]**

## Secure storage & secrets
- Provider keys (Gemini) and DB credentials are **backend-only**, loaded via the
  validated env module; never in the APK, web bundle, logs, or tracked source.
  Verified: `git grep` finds no hardcoded provider/DB secrets; `.env.*` is
  gitignored; readiness endpoint exposes only booleans; logger redacts
  password/token/secret/authorization/databaseurl keys.
- Client tokens: JWT access token in memory + rotating httpOnly refresh cookie
  (web); customer JWT in localStorage. Capacitor secure-storage is the
  recommended device store for pending actions. **[Device encryption at rest is a
  platform responsibility — NOT verified in this container.]**

## Authentication & authorization
- Short-lived access token (15m) + rotating refresh (30d) + revocation via
  refresh_tokens; RBAC enforced server-side on every route (`requirePermission`)
  regardless of client UI.
- BOLA/BFLA covered by `hardening.integration.test.ts`: cross-shop product read/
  inventory-adjust denied; cashier cannot manage employees; unauthenticated/
  tampered-token requests → 401; cross-tenant data access denied.
- **[Brute-force/OTP/PIN rate limiting and biometric fallback are partly
  device/gateway concerns — the in-app rate limiter covers cloud/voice endpoints;
  auth-endpoint brute-force throttling is a recommended follow-up, NOT EXECUTED.]**

## AI security
- Package/voice text is treated as DATA, never instructions (prompt-injection
  defense in prompts + mandatory backend validation). Verified by cloud + voice
  injection tests.
- Cloud responses pass strict schema validation; provider candidate IDs are
  validated against the backend-supplied allowed set (verified). Malformed JSON
  rejected. Cost attacks bounded by budgets + rate limits + cache + circuit
  breaker + content-hash dedup (all verified in cloud tests).
- Memory poisoning: self-learning is retailer-scoped, confirmed/rejected only
  affects LOCAL ranking, community candidates need independent tenants + a
  suspicious-concentration guard before human review (verified in unit tests).

## Reliability & degradation
- Timeouts + one bounded retry + circuit breaker on cloud calls; on any failure
  the app falls back to local recognition / manual entry. Budget exhaustion never
  blocks manual product entry (verified). Voice/OCR/cloud all have manual paths.

## Backup & recovery **[NOT EXECUTED HERE]**
- Production DB is Supabase Postgres — managed daily backups + point-in-time
  recovery per plan. A restore drill, RTO/RPO measurement and object-storage
  recovery must be performed in the real environment before relying on them.
- Migrations are forward-only, one transaction per file, tracked in `_migrations`;
  additive (`IF NOT EXISTS`) so re-apply is safe. Rollback = feature flags +
  (if needed) a new forward migration; destructive down-migrations are avoided.

## Observability **[SPEC + hooks; live dashboards NOT EXECUTED HERE]**
- Structured JSON logs with redaction + request IDs (`req.id`). AI usage +
  provider health + alert lifecycle + voice sessions are persisted and queryable.
- Recommended metrics: API/DB errors, sync failures, conflict rate, queue depth,
  provider failures/latency, recognition/voice failure rates, cost anomalies,
  crash-free sessions, slow queries, storage growth. Wiring to a metrics backend
  (e.g. Grafana/Datadog) is a deployment step, not done in this container.

## Incident response (severity → action)
- **SEV1** (cross-tenant exposure, duplicate financial record, provider-secret
  exposure, data-loss risk): trip the relevant kill switch (feature flag), rotate
  affected secrets, preserve audit evidence, communicate, post-incident review.
- **SEV2** (provider outage, cost spike): circuit breaker + budget cap already
  degrade gracefully; disable cloud fallback flag if needed.
- **SEV3** (elevated correction/alert-fatigue rates): tune config/flags via a
  controlled release; never auto-retrain.
- Kill switches (env flags): `FEATURE_CLOUD_PRODUCT_RECOGNITION`,
  `FEATURE_VOICE_ASSISTANT`, `FEATURE_INVENTORY_INTELLIGENCE`,
  `FEATURE_PROACTIVE_SPOKEN_ALERTS`, `AI_DAILY_*_LIMIT` (budget), plus per-domain
  flags — each returns the prior-phase behavior.

## Privacy
- Consent surfaces: cloud-recognition consent (Phase 4), cloud-voice (flagged),
  personalization/memory (Phase 7 delete/reset), alert privacy mode + quiet hours
  (Phase 6). Optional memory is deletable/resettable (verified).
- Data minimization to cloud AI: only cropped image + OCR text + bounded
  candidates + country. Never customer/khata/profit/inventory-value/tokens
  (verified by the cloud request contract + tests).
- Raw audio is not retained by the backend (device-native STT); no OTP/password/
  payment credentials stored in memory tables.
