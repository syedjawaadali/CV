import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, SlidersHorizontal } from 'lucide-react';
import type { InventoryMovement, Paginated, Product } from '@smartdukaan/shared';
import { PERMISSIONS } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { qty, formatDateTime } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import {
  Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, Select, useToast,
} from '../components/ui';

interface LowStockRow { id: string; name: string; nameUr: string | null; unit: string; stockQty: string; lowStockThreshold: string }

const REASONS = ['count_correction', 'damage', 'expiry', 'theft', 'personal_use', 'other'] as const;

export function InventoryPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.INVENTORY_MANAGE);
  const [adjust, setAdjust] = useState<{ id: string; name: string } | null>(null);

  const low = useQuery({
    queryKey: ['inventory', 'low-stock'],
    queryFn: () => api.get<{ data: LowStockRow[] }>('/inventory/low-stock'),
  });
  const all = useQuery({
    queryKey: ['products', 'inventory-all'],
    queryFn: () => api.get<Paginated<Product>>('/products?limit=100'),
    enabled: canManage,
  });

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center gap-2 text-slate-700">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="font-semibold">{t('low_stock')}</h2>
        </div>
        {low.isLoading ? <Loading /> : low.isError ? <ErrorState error={low.error} onRetry={() => low.refetch()} /> : (
          low.data!.data.length === 0 ? (
            <div className="card"><EmptyState title={t('settled')} /></div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              {low.data!.data.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                  <div>
                    <p className="font-medium text-slate-900">{p.name}{p.nameUr && <span className="ms-2 font-urdu text-slate-500">{p.nameUr}</span>}</p>
                    <p className="text-xs text-slate-500">{t('low_stock_at')} {qty(p.lowStockThreshold)} {p.unit}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="red">{qty(p.stockQty)} {p.unit}</Badge>
                    {canManage && <Button variant="secondary" onClick={() => setAdjust({ id: p.id, name: p.name })}><SlidersHorizontal className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {canManage && (
        <section>
          <h2 className="mb-2 font-semibold text-slate-700">{t('nav_products')}</h2>
          {all.isLoading ? <Loading /> : all.isError ? <ErrorState error={all.error} /> : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              {(all.data?.data ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                  <p className="font-medium text-slate-900">{p.name}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">{qty(p.stockQty)} {p.unit}</span>
                    <Button variant="secondary" onClick={() => setAdjust({ id: p.id, name: p.name })}><SlidersHorizontal className="h-4 w-4" /> {t('adjust_stock')}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {adjust && <AdjustModal product={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
}

function AdjustModal({ product, onClose }: { product: { id: string; name: string }; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<string>('count_correction');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const movements = useQuery({
    queryKey: ['inventory', 'movements', product.id],
    queryFn: () => api.get<{ product: unknown; movements: InventoryMovement[] }>(`/inventory/${product.id}/movements`),
  });

  async function submit() {
    setError(null);
    const value = Number(delta);
    if (!Number.isFinite(value) || value === 0) { setError(t('required')); return; }
    setBusy(true);
    try {
      await api.post('/inventory/adjust', { productId: product.id, quantityDelta: value, reason, note: note || null });
      toast.push(t('adjust_stock'));
      setDelta(''); setNote('');
      void movements.refetch();
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('something_wrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${t('adjust_stock')} — ${product.name}`}>
      <div className="space-y-3">
        <Field label={t('movement')} hint="Use a negative number to reduce, positive to add." required>
          <Input inputMode="decimal" type="number" step="1" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-1" autoFocus />
        </Field>
        <Field label={t('reason')} required>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </Select>
        </Field>
        <Field label={t('note')}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('close')}</Button>
          <Button loading={busy} onClick={() => void submit()}>{t('save')}</Button>
        </div>
      </div>

      <p className="mb-2 mt-5 text-sm font-medium text-slate-700">{t('movements')}</p>
      {movements.isLoading ? <Loading /> : movements.isError ? <ErrorState error={movements.error} /> : (
        movements.data!.movements.length === 0 ? <EmptyState /> : (
          <div className="max-h-56 space-y-2 overflow-y-auto text-sm">
            {movements.data!.movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                <div>
                  <Badge tone="slate">{m.type.replace(/_/g, ' ')}</Badge>
                  {m.reason && <span className="ms-2 text-xs text-slate-400">{m.reason.replace(/_/g, ' ')}</span>}
                  <p className="text-xs text-slate-400">{formatDateTime(m.createdAt)}</p>
                </div>
                <div className="text-end">
                  <p className={`font-semibold ${Number(m.quantityDelta) < 0 ? 'text-red-600' : 'text-green-600'}`}>{qty(m.quantityDelta)}</p>
                  <p className="text-xs text-slate-400">= {qty(m.balanceAfter)}</p>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </Modal>
  );
}
