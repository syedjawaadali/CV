# Smart Dukaan — Model, Prompt & Provider Governance (Phase 10)

Versioned registry of every model/algorithm/prompt/provider, the change process,
drift signals, cost governance and SLO hypotheses. Every recognition/forecast/
scoring component is version-tagged in code so historical decisions stay
explainable.

## Model & Algorithm Registry
| Component | Version | Source | Evaluation | Status |
|---|---|---|---|---|
| Perceptual hash (dHash 8×8) | `PHASH_CONFIG.version=1` | `shared/imagefp.ts` | unit tests | active |
| Candidate scoring weights | `RECOGNITION_CONFIG` | `shared/scoring.ts` | unit + benchmark (0 false-high-conf) | active |
| Confidence thresholds | exact95/high70/medium40 | `shared/scoring.ts` | unit tests | active |
| Intent classifier | `intentVersion=1` | `shared/voice/intent.ts` | benchmark 93.8% | active |
| Deterministic alert rules | `RULES_VERSION=1` | `shared/intelligence/rules.ts` | benchmark 100% precision | active |
| Demand/forecast | `FORECAST_VERSION=1` | `shared/intelligence/forecast.ts` | unit (skip/estimate) | active |
| Reorder algorithm | in `DEFAULT_REORDER` | `shared/intelligence/reorder.ts` | unit tests | active |
| Learning/ranking signals | Phase 7 | `shared/memory/learning.ts` | unit + integration | active |
| On-device OCR provider | `none/0` | `web/lib/ocr.ts` | manual fallback | disabled (no Cap-6 plugin) |
| Local visual embedding | model-versioned | `image_embeddings` table | — | disabled by flag |

## Prompt Registry
Versioned in code (`server/modules/cloud/promptRegistry.ts`) + mirrored in
`cloud_prompt_versions` (migration 0009). Active: `product_recognition@1`
(provider-agnostic; treats package text as data; structured JSON only; requires
human confirmation). Production prompts are never overwritten — a change is a NEW
version, and every cloud observation stores the prompt version used.
| Prompt | Version | Provider | Output | Status |
|---|---|---|---|---|
| product_recognition | 1 | mock / gemini | strict CloudRecognitionResult schema | active |

## Provider Registry
| Provider | Purpose | Data sent | Data policy | Cost control | Status |
|---|---|---|---|---|---|
| mock-vision | recognition (dev/tests) | none leaves process | n/a | n/a | active default |
| gemini-2.0-flash | cloud recognition fallback | cropped image + OCR + bounded candidates | key backend-only; minimized; no customer/financial data | budgets + cache + breaker + rate limit | **disabled by default** |
| device-native STT/TTS | voice | audio stays on device | on-device | n/a | active |

**Provider activation requires** privacy + security review, a documented data
policy, a cost profile, and a disable procedure (env flag) — do not activate a
provider without these.

## Model change process (before activating any change)
1. Define expected benefit → 2. Run `benchmark.test.ts` + full suite →
3. Compare vs current version → 4. Check **false high-confidence rate** →
5. Check incorrect-action rate → 6. Latency → 7. Cost → 8. Urdu/mixed-language →
9. Security → 10. Privacy → 11. Approve → 12. Canary (flag/cohort) → 13. Monitor
→ 14. Expand or roll back. **Never auto-retrain or change production behavior
without this review.** Raw retailer data never flows into uncontrolled training.

## Drift monitoring (signals to watch)
OCR/voice correction rate, packaging-change rate, product-not-found rate, image/
cloud-candidate correction rate, intent-failure, product-resolution failure,
forecast error, alert dismissal/fatigue, cost per recognition, provider latency/
failures. Sources: `recognition_feedback`, `ai_usage_events`, `inventory_alerts`+
`alert_actions`, `voice_sessions`, `forecast_evaluations`. **[Alerting on these
signals is a monitoring-backend deployment step — NOT wired to a dashboard here.]**

## Cost governance (implemented)
Per-provider/model/tenant/shop cost from `ai_usage_events`; versioned
`ai_cost_config` (integer paisa, estimate not invoice); per-shop daily budget
(`ai_budgets`) with reserve→consume→release, warning threshold + hard stop; cache
+ content-hash dedup avoid duplicate spend; circuit breaker + rate limits bound
runaway cost; **budget kill switch** via `AI_DAILY_REQUEST_LIMIT` /
`AI_DAILY_COST_LIMIT_MINOR`. `GET /api/cloud/usage` returns a tenant-safe summary.
Estimated cost is labelled an estimate, not billing.

## SLO hypotheses (targets, not guarantees — measure before promising)
| Operation | Target hypothesis | Basis |
|---|---|---|
| Auth / core API | p95 < 400 ms | test-env round-trips |
| Sale recording | p95 < 600 ms | integration timings |
| Product recognition (local) | p95 < 700 ms | integration timings |
| Voice interpret/confirm | p95 < 600 ms | integration timings |
| Alert list (shop) | p95 < 800 ms | integration timings |
Treat all as hypotheses until measured on production infrastructure under load.
**[Load/SLO measurement NOT EXECUTED HERE.]**

## Kill switches (env flags → immediate rollback to prior-phase behavior)
`FEATURE_CLOUD_PRODUCT_RECOGNITION`, `FEATURE_VOICE_ASSISTANT`,
`FEATURE_INVENTORY_INTELLIGENCE`, `FEATURE_REORDER_SUGGESTIONS`,
`FEATURE_PROACTIVE_SPOKEN_ALERTS`, `FEATURE_LOCAL_IMAGE_EMBEDDING`,
`FEATURE_SPONSORED_SUPPLIER_OFFERS`, AI budget limits. Disabling any one
preserves safe core workflows and manual entry.
