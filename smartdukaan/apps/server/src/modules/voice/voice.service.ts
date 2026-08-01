/**
 * Voice Session Coordinator (Phase 5). Two steps:
 *
 *  1) interpret(transcript) — deterministic intent+entity parsing (shared/voice),
 *     resolve products/customers (tenant-scoped), check permission, decide the
 *     confirmation level, build a human preview, and persist a PENDING voice
 *     action with a confirmation token + idempotency key. NOTHING is executed.
 *
 *  2) confirm(actionId, token) — re-validate the session/user/permission, then
 *     execute the action by calling the SAME business services the UI uses
 *     (adjustStock, createSaleStandalone, addCredit, recordPayment, createExpense,
 *     updateProduct). Idempotency prevents duplicate execution on repeat/retry.
 *
 * The voice assistant NEVER writes business tables directly, never bypasses
 * authorization, validation, transactions, inventory movements or audit.
 */
import {
  interpretTranscript, roleHasPermission, buildSpokenResponse, detectConfirmation,
  type Role, type Permission, type IntentResult,
} from '@smartdukaan/shared';
import { query, withTransaction } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { forbidden, notFound, businessRule, conflict } from '../../lib/errors.js';
import { adjustStock, listLowStock } from '../inventory/inventory.service.js';
import { createSaleStandalone } from '../sales/sales.service.js';
import { addCredit, recordPayment } from '../khata/khata.service.js';
import { createExpense } from '../expenses/expenses.service.js';
import { updateProduct } from '../products/products.service.js';
import { getSummary } from '../dashboard/dashboard.service.js';
import { resolveProduct, resolveCustomer } from './resolve.service.js';

export interface VoiceCtx { tenantId: string; shopId: string; userId: string; role: Role }

type BaseResult = Pick<InterpretResult, 'sessionId' | 'intent' | 'confidence' | 'confirmationLevel' | 'privacyMode'>;

const CONFIRM_TTL_MS = 3 * 60 * 1000; // a pending action expires after 3 minutes

export interface InterpretInput {
  transcript: string;
  language?: string | null;
  deviceId?: string | null;
  privacyMode?: boolean;
  offline?: boolean;
  clientActionId?: string | null; // client-generated id for idempotency across retries
}

export type VoiceOutcome =
  | 'answer'          // read-only result, spoken immediately
  | 'need_confirm'    // action preview built, awaiting confirmation
  | 'need_clarify'    // missing/ambiguous info, question asked
  | 'not_allowed'     // permission denied
  | 'not_understood'  // no intent
  | 'navigate';       // open a screen

export interface InterpretResult {
  sessionId: string;
  outcome: VoiceOutcome;
  intent: string;
  confidence: number;
  preview: string | null;
  actionId: string | null;
  confirmationToken: string | null;
  confirmationLevel: string;
  clarifyQuestion: string | null;
  candidates?: Array<{ id: string; label: string }>;
  screen?: string | null;
  answer?: string | null;
  speech: string;
  privacyMode: boolean;
}

function newId(prefix: string, ctx: VoiceCtx, seed: string): string {
  // Deterministic-ish token from session inputs (no Math.random needed).
  return `${prefix}_${ctx.shopId.slice(0, 8)}_${seed}`;
}

export async function interpret(ctx: VoiceCtx, input: InterpretInput): Promise<InterpretResult> {
  const result = interpretTranscript(input.transcript);
  const privacyMode = !!input.privacyMode;

  // Persist a session + transcript + intent for audit/history.
  const session = await query<{ id: string }>(
    `INSERT INTO voice_sessions (tenant_id, shop_id, user_id, device_id, language, provider, mode, privacy_mode, offline)
     VALUES ($1,$2,$3,$4,$5,'device','standard',$6,$7) RETURNING id`,
    [ctx.tenantId, ctx.shopId, ctx.userId, input.deviceId ?? null, result.language, privacyMode, !!input.offline],
  );
  const sessionId = session.rows[0]!.id;
  await query(
    `INSERT INTO voice_transcripts (session_id, original_text, normalized_text, language, confidence)
     VALUES ($1,$2,$3,$4,$5)`,
    [sessionId, input.transcript, result.normalizedTranscript, result.language, result.confidence],
  );
  const intentRow = await query<{ id: string }>(
    `INSERT INTO voice_intents (session_id, intent_name, intent_version, domain, confidence, required_permission, confirmation_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [sessionId, result.intent, result.intentVersion, result.domain, result.confidence,
      result.requiredPermission, result.confirmationLevel],
  );
  const intentId = intentRow.rows[0]!.id;

  const base: Pick<InterpretResult, 'sessionId' | 'intent' | 'confidence' | 'confirmationLevel' | 'privacyMode'> = {
    sessionId, intent: result.intent, confidence: result.confidence, confirmationLevel: result.confirmationLevel, privacyMode,
  };

  // No intent understood.
  if (result.intent === 'unknown' || result.confidence === 0) {
    const r = buildSpokenResponse({ kind: 'not_found', language: result.language });
    return { ...base, outcome: 'not_understood', preview: null, actionId: null, confirmationToken: null, clarifyQuestion: null, speech: r.speech, answer: null };
  }

  // Assistant-control + navigation are handled by the client; report them.
  if (result.domain === 'assistant') {
    return { ...base, outcome: 'answer', preview: null, actionId: null, confirmationToken: null, clarifyQuestion: null, screen: null, speech: '', answer: result.intent };
  }
  if (result.intent === 'open_screen') {
    return { ...base, outcome: 'navigate', preview: null, actionId: null, confirmationToken: null, clarifyQuestion: null, screen: result.entities.screen ?? null, speech: '', answer: null };
  }

  // Permission check (server-side; voice never bypasses RBAC).
  if (result.requiredPermission && !roleHasPermission(ctx.role, result.requiredPermission as Permission)) {
    const r = buildSpokenResponse({ kind: 'not_allowed', language: result.language });
    return { ...base, outcome: 'not_allowed', preview: null, actionId: null, confirmationToken: null, clarifyQuestion: null, speech: r.speech, answer: null };
  }

  // Read-only intents answer immediately from real data.
  if (result.confirmationLevel === 'none') {
    return await answerReadOnly(ctx, result, base, privacyMode);
  }

  // Record-changing intents: resolve entities, clarify or build a preview.
  return await planAction(ctx, result, intentId, base);
}

// ---- read-only answers -----------------------------------------------------

async function answerReadOnly(
  ctx: VoiceCtx, result: IntentResult, base: BaseResult, privacy: boolean,
): Promise<InterpretResult> {
  const lang = result.language;
  const done = (speech: string, answer: string): InterpretResult => ({
    ...base, outcome: 'answer', preview: null, actionId: null,
    confirmationToken: null, clarifyQuestion: null, speech, answer,
  });

  switch (result.intent) {
    case 'check_stock': {
      const cands = result.entities.productPhrase ? await resolveProduct(ctx, result.entities.productPhrase) : [];
      if (cands.length === 0) return done(buildSpokenResponse({ kind: 'not_found', language: lang }).speech, 'not_found');
      if (cands.length > 1) {
        const q = buildSpokenResponse({ kind: 'need_clarify', clarifyQuestion: clarifyProducts(cands), language: lang }).speech;
        return { ...base, outcome: 'need_clarify', preview: null, actionId: null, confirmationToken: null,
          clarifyQuestion: q, candidates: cands.map((c) => ({ id: c.id, label: `${c.name} (${c.stockQty} ${c.unit})` })), speech: q };
      }
      const p = cands[0]!;
      const r = buildSpokenResponse({ kind: 'stock_qty', productName: p.name, quantity: p.stockQty, unit: p.unit, language: lang });
      return done(r.speech, JSON.stringify({ productId: p.id, stock: p.stockQty }));
    }
    case 'ask_low_stock': {
      const { data: low } = await listLowStock({ tenantId: ctx.tenantId, shopId: ctx.shopId, userId: ctx.userId }, 20) as { data: Array<{ name: string }> };
      const r = buildSpokenResponse({ kind: 'low_stock', count: low.length, items: low.map((x) => x.name), language: lang });
      return done(r.speech, JSON.stringify({ count: low.length }));
    }
    case 'ask_today_sales': {
      const s = await getSummary(ctx) as { todaySalesMinor?: number };
      const r = buildSpokenResponse({ kind: 'today_sales', amountMajor: minorToMajor(s.todaySalesMinor), language: lang }, { privacyMode: privacy });
      return done(r.speech, JSON.stringify({ todaySalesMinor: s.todaySalesMinor ?? 0 }));
    }
    case 'ask_today_expenses': {
      const s = await getSummary(ctx) as { expensesTodayMinor?: number };
      const r = buildSpokenResponse({ kind: 'today_expenses', amountMajor: minorToMajor(s.expensesTodayMinor), language: lang }, { privacyMode: privacy });
      return done(r.speech, JSON.stringify({ expensesTodayMinor: s.expensesTodayMinor ?? 0 }));
    }
    case 'ask_outstanding': {
      const s = await getSummary(ctx) as { outstandingKhataMinor?: number };
      const cust = await query<{ n: number }>(
        `SELECT count(*)::int n FROM customers WHERE shop_id = $1 AND balance_minor > 0`, [ctx.shopId]);
      const count = cust.rows[0]?.n ?? 0;
      const r = buildSpokenResponse({ kind: 'outstanding', amountMajor: minorToMajor(s.outstandingKhataMinor), count, language: lang }, { privacyMode: privacy });
      return done(r.speech, JSON.stringify({ outstandingKhataMinor: s.outstandingKhataMinor ?? 0, count }));
    }
    case 'ask_recent_added': {
      const { rows } = await query<{ name: string }>(
        `SELECT name FROM products WHERE shop_id = $1 AND active ORDER BY created_at DESC LIMIT 5`, [ctx.shopId]);
      const r = buildSpokenResponse({ kind: 'recent_added', items: rows.map((x) => x.name), language: lang });
      return done(r.speech, JSON.stringify({ items: rows.map((x) => x.name) }));
    }
    case 'read_summary': {
      const s = await getSummary(ctx) as { todaySalesMinor?: number; expensesTodayMinor?: number };
      const speech = privacy
        ? 'Your business summary is ready. Open the dashboard to view details.'
        : `Today's sales are ${minorToMajor(s.todaySalesMinor) ?? 0} rupees and expenses are ${minorToMajor(s.expensesTodayMinor) ?? 0} rupees.`;
      return done(speech, JSON.stringify(s));
    }
    default:
      return done(buildSpokenResponse({ kind: 'not_found', language: lang }).speech, 'unsupported_read');
  }
}

// ---- record-changing plan --------------------------------------------------

async function planAction(
  ctx: VoiceCtx, result: IntentResult, intentId: string, base: BaseResult,
): Promise<InterpretResult> {
  const lang = result.language;
  const clarify = (q: string, candidates?: Array<{ id: string; label: string }>): InterpretResult => ({
    ...base, outcome: 'need_clarify', preview: null, actionId: null,
    confirmationToken: null, clarifyQuestion: q, candidates, speech: q,
  });

  // Missing required entities → ask one focused question.
  if (result.missing.length > 0) {
    return clarify(clarifyMissing(result.missing[0]!, lang));
  }

  const e = result.entities;
  let payload: Record<string, unknown> | null = null;
  let actionType = result.intent;
  let previewText = '';

  switch (result.intent) {
    case 'add_stock': {
      const cands = await resolveProduct(ctx, e.productPhrase!);
      if (cands.length === 0) return clarify(buildSpokenResponse({ kind: 'not_found', language: lang }).speech);
      if (cands.length > 1) return clarify(clarifyProducts(cands), cands.map((c) => ({ id: c.id, label: `${c.name} (${c.unit})` })));
      const p = cands[0]!;
      payload = { productId: p.id, quantityDelta: e.quantity, reason: 'voice_stock_add' };
      previewText = `Add ${e.quantity} ${e.unit ?? p.unit} of ${p.name} to stock?`;
      break;
    }
    case 'update_price': {
      const cands = await resolveProduct(ctx, e.productPhrase!);
      if (cands.length === 0) return clarify(buildSpokenResponse({ kind: 'not_found', language: lang }).speech);
      if (cands.length > 1) return clarify(clarifyProducts(cands), cands.map((c) => ({ id: c.id, label: c.name })));
      const p = cands[0]!;
      payload = { productId: p.id, sellingPrice: e.newPrice };
      previewText = `Change ${p.name} selling price to ${e.newPrice} rupees? Existing sales keep their price.`;
      break;
    }
    case 'record_expense': {
      payload = { category: e.expenseCategory, amount: e.amountMajor };
      previewText = `Record ${e.expenseCategory} expense of ${e.amountMajor} rupees?`;
      break;
    }
    case 'record_sale': {
      const method = e.paymentMethod === 'credit' ? 'credit' : e.paymentMethod === 'digital' ? 'digital' : 'cash';
      if (method === 'credit') {
        // Credit sale needs a customer → route through khata credit semantics.
        if (!e.customerPhrase) return clarify(clarifyMissing('customerPhrase', lang));
        const cc = await resolveCustomer(ctx, e.customerPhrase);
        if (cc.length === 0) return clarify(buildSpokenResponse({ kind: 'not_found', language: lang }).speech);
        if (cc.length > 1) return clarify(clarifyCustomers(cc), cc.map((c) => ({ id: c.id, label: c.name })));
        payload = { customerId: cc[0]!.id, paymentMethod: 'credit', amountOnly: e.amountMajor };
        previewText = `Record a credit sale of ${e.amountMajor} rupees for ${cc[0]!.name}?`;
      } else {
        payload = { paymentMethod: method, amountOnly: e.amountMajor };
        previewText = `Record a ${method} sale of ${e.amountMajor} rupees?`;
      }
      break;
    }
    case 'khata_credit': {
      const cc = await resolveCustomer(ctx, e.customerPhrase!);
      if (cc.length === 0) return clarify(buildSpokenResponse({ kind: 'not_found', language: lang }).speech);
      if (cc.length > 1) return clarify(clarifyCustomers(cc), cc.map((c) => ({ id: c.id, label: c.name })));
      payload = { customerId: cc[0]!.id, amount: e.amountMajor };
      previewText = `Add ${e.amountMajor} rupees to ${cc[0]!.name}'s khata (they will owe more)?`;
      break;
    }
    case 'khata_payment': {
      const cc = await resolveCustomer(ctx, e.customerPhrase!);
      if (cc.length === 0) return clarify(buildSpokenResponse({ kind: 'not_found', language: lang }).speech);
      if (cc.length > 1) return clarify(clarifyCustomers(cc), cc.map((c) => ({ id: c.id, label: c.name })));
      payload = { customerId: cc[0]!.id, amount: e.amountMajor, method: e.paymentMethod === 'digital' ? 'digital' : 'cash' };
      previewText = `Record a payment of ${e.amountMajor} rupees from ${cc[0]!.name}?`;
      break;
    }
    case 'add_product':
    case 'search_product':
      // These open the guided UI form rather than executing server-side.
      return { ...base, outcome: 'navigate', preview: null, actionId: null,
        confirmationToken: null, clarifyQuestion: null, screen: 'products', speech: '', answer: result.intent };
    default:
      return clarify(buildSpokenResponse({ kind: 'not_found', language: lang }).speech);
  }

  if (!payload) return clarify(buildSpokenResponse({ kind: 'need_clarify', clarifyQuestion: 'Please provide the missing details.', language: lang }).speech);

  // Persist the PENDING action with a confirmation token + idempotency key.
  const seed = `${intentId.slice(0, 8)}`;
  const actionId = newId('va', ctx, seed);
  const token = newId('tok', ctx, `${seed}_${result.intent}`);
  const idempotencyKey = `voice_${intentId}`;
  const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS).toISOString();

  const row = await query<{ id: string }>(
    `INSERT INTO voice_actions
       (tenant_id, shop_id, user_id, session_id, intent_name, action_type, action_payload,
        action_preview, confirmation_token, idempotency_key, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [ctx.tenantId, ctx.shopId, ctx.userId, base.sessionId, result.intent, actionType,
      JSON.stringify(payload), previewText, token, idempotencyKey, expiresAt],
  );

  return {
    ...base, outcome: 'need_confirm', preview: previewText,
    actionId: row.rows[0]!.id, confirmationToken: token, clarifyQuestion: null,
    speech: previewText,
  };
}

// ---- confirmation + execution ---------------------------------------------

export interface ConfirmInput { actionId: string; confirmationToken: string; spokenConfirmation?: string | null; offline?: boolean }

export interface ConfirmResult {
  status: 'completed' | 'cancelled' | 'pending_sync' | 'already_done' | 'expired' | 'failed';
  speech: string;
  executedReference?: string | null;
}

export async function confirmAction(ctx: VoiceCtx, input: ConfirmInput): Promise<ConfirmResult> {
  // If the user spoke a cancellation, cancel instead of executing.
  if (input.spokenConfirmation && detectConfirmation(input.spokenConfirmation) === 'cancel') {
    await query(`UPDATE voice_actions SET confirmation_status='cancelled' WHERE id=$1 AND shop_id=$2 AND confirmation_status='pending'`,
      [input.actionId, ctx.shopId]);
    return { status: 'cancelled', speech: 'Cancelled.' };
  }

  const found = await query<{
    id: string; intent_name: string; action_type: string; action_payload: Record<string, unknown>;
    action_preview: string; confirmation_token: string; confirmation_status: string; execution_status: string;
    executed_reference: string | null; expires_at: string | null; user_id: string;
  }>(
    `SELECT id, intent_name, action_type, action_payload, action_preview, confirmation_token,
            confirmation_status, execution_status, executed_reference, expires_at, user_id
       FROM voice_actions WHERE id = $1 AND shop_id = $2`,
    [input.actionId, ctx.shopId],
  );
  const action = found.rows[0];
  if (!action) throw notFound('Voice action not found');

  // Tenant/user + token binding: only the initiating user may confirm.
  if (action.user_id !== ctx.userId) throw forbidden('This action was started by another user');
  if (action.confirmation_token !== input.confirmationToken) throw forbidden('Invalid confirmation');

  // Idempotency: a repeated confirmation returns the same result, never re-executes.
  if (action.execution_status === 'completed') {
    return { status: 'already_done', speech: 'That was already done.', executedReference: action.executed_reference };
  }
  if (action.confirmation_status === 'cancelled') return { status: 'cancelled', speech: 'That was cancelled.' };
  if (action.confirmation_status === 'expired' || (action.expires_at && new Date(action.expires_at) < new Date())) {
    await query(`UPDATE voice_actions SET confirmation_status='expired' WHERE id=$1`, [action.id]);
    return { status: 'expired', speech: 'That request expired. Please say the command again.' };
  }

  // Claim the action for execution atomically (guards against double-tap races).
  const claim = await query(
    `UPDATE voice_actions SET confirmation_status='confirmed', execution_status='executing'
      WHERE id=$1 AND confirmation_status='pending' AND execution_status='not_started'`,
    [action.id],
  );
  if ((claim.rowCount ?? 0) === 0) {
    return { status: 'already_done', speech: 'That is already being processed.' };
  }

  try {
    const ref = await execute(ctx, action.intent_name, action.action_payload);
    await query(
      `UPDATE voice_actions SET execution_status='completed', executed_reference=$2, executed_at=now() WHERE id=$1`,
      [action.id, ref],
    );
    await writeAudit({
      tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
      action: `voice.${action.intent_name}`, resourceType: 'voice_action', resourceId: action.id,
      metadata: { executedReference: ref },
    });
    return { status: 'completed', speech: `Done. ${action.action_preview.replace(/\?$/, '')}`.trim(), executedReference: ref };
  } catch (err) {
    await query(`UPDATE voice_actions SET execution_status='failed' WHERE id=$1`, [action.id]);
    throw err;
  }
}

/** Execute by delegating to the SAME services the UI uses. Returns a reference id. */
async function execute(ctx: VoiceCtx, intent: string, payload: Record<string, unknown>): Promise<string> {
  switch (intent) {
    case 'add_stock': {
      const row = await adjustStock(ctx, {
        productId: String(payload.productId), quantityDelta: Number(payload.quantityDelta), reason: 'voice_stock_add',
      }) as { id: string };
      return row.id;
    }
    case 'update_price': {
      const row = await updateProduct(ctx, String(payload.productId), { sellingPrice: Number(payload.sellingPrice) }) as { id: string };
      return row.id;
    }
    case 'record_expense': {
      const row = await createExpense(ctx, { category: String(payload.category), amount: Number(payload.amount) }) as { id: string };
      return row.id;
    }
    case 'record_sale': {
      const sale = await createSaleStandalone(ctx, {
        customerId: (payload.customerId as string) ?? null,
        paymentMethod: payload.paymentMethod as 'cash' | 'credit' | 'digital',
        amountOnly: Number(payload.amountOnly),
        discount: 0,
      }) as { id: string };
      return sale.id;
    }
    case 'khata_credit': {
      const row = await addCredit(ctx, { customerId: String(payload.customerId), amount: Number(payload.amount) }) as { transaction: { id: string } };
      return row.transaction.id;
    }
    case 'khata_payment': {
      const row = await recordPayment(ctx, {
        customerId: String(payload.customerId), amount: Number(payload.amount), method: payload.method as 'cash' | 'digital',
      }) as { transaction: { id: string } };
      return row.transaction.id;
    }
    default:
      throw businessRule('This voice action is not supported');
  }
}

// ---- helpers ---------------------------------------------------------------

function minorToMajor(minor?: number | null): number | undefined {
  return minor == null ? undefined : Math.round(minor) / 100;
}
function clarifyProducts(cands: Array<{ name: string }>): string {
  return `Which one: ${cands.slice(0, 3).map((c) => c.name).join(', or ')}?`;
}
function clarifyCustomers(cands: Array<{ name: string; phoneTail: string | null }>): string {
  return `Which customer: ${cands.slice(0, 3).map((c) => c.phoneTail ? `${c.name} (…${c.phoneTail})` : c.name).join(', or ')}?`;
}
function clarifyMissing(field: string, _lang: string): string {
  const map: Record<string, string> = {
    quantity: 'How many?', amountMajor: 'What is the amount?', productPhrase: 'Which product?',
    customerPhrase: 'Which customer?', expenseCategory: 'What is the expense for?', newPrice: 'What is the new price?',
  };
  return map[field] ?? 'Please provide the missing detail.';
}

export { withTransaction };
