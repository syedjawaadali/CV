# Smart Dukaan — Benchmarking, Pilot Design & Controlled Rollout (Phase 9)

**No pilot has been run and no participants exist.** This document is
pilot-ready tooling + procedures. Every real-world number below is marked
**[PENDING FIELD VALIDATION]**. The only accuracy numbers Smart Dukaan reports
today are the executed deterministic-engine benchmarks (below).

## Executed benchmark results (deterministic engines)
From `packages/shared/src/benchmark/benchmark.test.ts` (run in CI):
| Metric | Dataset | Result | Note |
|---|---|---|---|
| Intent classification accuracy | 16 labelled EN/Roman/Urdu/mixed | **93.8% (15/16)** | synthetic fixtures |
| Spoken-number parsing | 10 labelled | **100% (10/10)** | EN/Roman/Urdu/fractions |
| False high-confidence rate | 5 contradiction fixtures | **0/5** | top safety metric |
| Deterministic alert precision | 4 labelled snapshots | **100% (4/4)** | low/out/none/unstocked |

**Not measured here (need real media/devices/providers):** barcode-detection
rate on real photos, on-device OCR accuracy, Urdu OCR, image-match accuracy,
speech transcription (EN/Urdu/Roman/mixed/noise), real-cloud recognition
accuracy, forecast error vs real demand, alert-fatigue rates. All
**[PENDING FIELD VALIDATION]**.

## Benchmark datasets (to build with legal/synthetic media)
Barcode, OCR, Urdu OCR, mixed packaging, brand/name/pack-size/price extraction,
image matching (redesign/color/similar/size), cloud fallback, voice (EN/Urdu/
Roman/mixed/noise), intent, entity, product/customer resolution, forecasting,
low-stock, reorder, offline sync, memory correction, alert fatigue. Use synthetic
fixtures where real product media cannot be used legally.

## Safety priorities (rollout gates, in order)
1. No incorrect financial action · 2. No cross-tenant access · 3. No duplicate
sale/payment · 4. No silent inventory overwrite · 5. No false high-confidence
product selection · 6. No sensitive spoken-data exposure · 7. Manual fallback
always available. (1–4 and 7 are enforced + test-covered today; 5 is
benchmark-0 on fixtures; 6 is enforced by privacy mode.)

## Pilot cohorts (representative — none recruited yet)
Small kiryana shop, digitally-comfortable retailer, low-literacy retailer,
elderly retailer, shared-device shop, weak-network shop, rural retailer, small
wholesaler, home-based seller, retail employee. **[PENDING RECRUITMENT]**

## Pilot stages
Internal testing → staff dogfooding → small supervised cohort → limited
unsupervised → expanded controlled → production-rollout decision.

## Feature cohorts & canary (implemented via feature flags)
Rollout order (each already a flag): barcode/OCR → local visual matching →
cloud fallback (off by default) → voice read-only → voice record-changing →
inventory alerts → forecasts → spoken alerts (off by default) → memory/
personalization. Canary = enable a flag for a cohort/percentage; **automatic
pause** on any Safety-priority breach. High-risk features are never enabled for
everyone at once.

## Go / No-Go criteria
- **Continue/Expand:** safety priorities intact, error/crash within target,
  cost within budget, positive correction trend.
- **Immediate pause + flag-off (do NOT abandon the product):** cross-tenant
  exposure, duplicate financial record, unauthorized business action, provider-
  secret exposure, severe privacy breach, unacceptable false high-confidence
  recognition, uncontrolled AI cost, data-loss risk.

## Feedback taxonomy (privacy-safe, no unnecessary PII)
recognition-correction, voice-correction, product-not-found, alert-incorrect,
alert-useful, reorder-qty-incorrect, privacy-concern, performance-issue, crash,
sync-issue, confusing-UI, Urdu-translation-issue, accessibility-issue.
`recognition_feedback` (Phase 7) already captures confirm/reject corrections.

## Pilot dashboard (metrics spec — build against existing tables)
Active users, feature adoption, product scans, local resolutions, cloud
fallbacks (`ai_usage_events`), recognition corrections (`recognition_feedback`),
voice sessions/failures (`voice_sessions`), incorrect-actions-prevented
(confirmation rejections), alerts generated/acted (`inventory_alerts` +
`alert_actions`), sync failures, crash-free sessions, security events
(`audit_logs`), estimated AI cost (`ai_usage_events.estimated_cost_minor`),
support tickets, satisfaction, retention hypotheses. Data sources exist; the
visualization layer is a deployment step **[NOT BUILT HERE]**.

## Evidence classification (use on every finding)
Verified · Observed · Directional · Hypothesis · Partner-claimed · Missing ·
Requires-larger-sample · Requires-field-validation. **Do not present assumptions
as results.**

## Onboarding & operations (to produce before a real pilot)
Retailer onboarding guide, field-agent guide, consent explanation, training
mode/demo data, support workflow, consented screenshot/log collection, device +
connectivity checklists, daily review, incident escalation, usability scripts.
Consent + privacy-mode + memory-reset controls exist in-app.
