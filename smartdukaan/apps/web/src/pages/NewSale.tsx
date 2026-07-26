import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ShoppingCart } from 'lucide-react';
import type { Customer, Paginated, Product, Sale } from '@smartdukaan/shared';
import { toMinor } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { money, qty } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import {
  Badge, Button, EmptyState, Field, Input, Loading, Select, useToast,
} from '../components/ui';
import { PERMISSIONS } from '@smartdukaan/shared';

interface Line { productId: string; name: string; unitPrice: number; quantity: number; stock: number }

export function NewSalePage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [lines, setLines] = useState<Line[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'digital'>('cash');
  const [customerId, setCustomerId] = useState<string>('');
  const [discount, setDiscount] = useState<string>('');
  const [amountOnly, setAmountOnly] = useState<string>('');
  const [quickMode, setQuickMode] = useState(false);
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  const products = useQuery({
    queryKey: ['products', 'for-sale'],
    queryFn: () => api.get<Paginated<Product>>('/products?limit=100'),
  });
  const customers = useQuery({
    queryKey: ['customers', 'for-sale'],
    queryFn: () => api.get<Paginated<Customer>>('/customers?limit=100'),
    enabled: can(PERMISSIONS.CUSTOMER_VIEW),
  });

  const available = useMemo(
    () => (products.data?.data ?? []).filter((p) => p.active && !lines.some((l) => l.productId === p.id)),
    [products.data, lines],
  );

  const subtotalMinor = lines.reduce((sum, l) => sum + toMinor(l.unitPrice) * l.quantity, 0);
  const discountMinor = discount ? toMinor(Number(discount)) : 0;
  const totalMinor = quickMode
    ? (amountOnly ? toMinor(Number(amountOnly)) : 0)
    : Math.max(0, subtotalMinor - discountMinor);

  function addLine(product: Product) {
    setLines((prev) => [...prev, {
      productId: product.id,
      name: product.name,
      unitPrice: product.sellingPriceMinor / 100,
      quantity: 1,
      stock: Number(product.stockQty),
    }]);
  }
  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.productId === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.productId !== id));
  }

  function resetForm() {
    setLines([]); setDiscount(''); setAmountOnly(''); setCustomerId('');
    setPaymentMethod('cash'); setQuickMode(false);
    setIdemKey(crypto.randomUUID());
  }

  const canSubmit = quickMode ? Number(amountOnly) > 0 : lines.length > 0;
  const needsCustomer = paymentMethod === 'credit';

  async function submit() {
    setError(null);
    if (needsCustomer && !customerId) { setError(t('select_customer_credit')); return; }
    setSubmitting(true);
    try {
      const body = quickMode
        ? {
            paymentMethod, discount: 0,
            amountOnly: Number(amountOnly),
            customerId: needsCustomer ? customerId : undefined,
          }
        : {
            paymentMethod,
            discount: discountMinor ? Number(discount) : 0,
            customerId: needsCustomer ? customerId : undefined,
            items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
          };
      const sale = await api.post<Sale>('/sales', body, idemKey);
      setLastSale(sale);
      toast.push(`${t('sale_recorded')} — ${sale.receiptNumber}`);
      resetForm();
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['sales'] });
      void qc.invalidateQueries({ queryKey: ['khata'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('something_wrong'));
    } finally {
      setSubmitting(false);
    }
  }

  if (products.isLoading) return <Loading />;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Cart */}
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div className="inline-flex rounded-lg bg-slate-200 p-0.5 text-sm">
            <button
              className={`rounded-md px-3 py-1.5 font-medium ${!quickMode ? 'bg-white shadow-sm' : 'text-slate-600'}`}
              onClick={() => setQuickMode(false)}
            >{t('add_product')}</button>
            <button
              className={`rounded-md px-3 py-1.5 font-medium ${quickMode ? 'bg-white shadow-sm' : 'text-slate-600'}`}
              onClick={() => setQuickMode(true)}
            >{t('quick_amount')}</button>
          </div>
        </div>

        {quickMode ? (
          <div className="card">
            <p className="mb-3 text-sm text-slate-500">{t('quick_amount_hint')}</p>
            <Field label={t('amount')} required>
              <Input
                inputMode="decimal" type="number" min="0" step="0.01" value={amountOnly}
                onChange={(e) => setAmountOnly(e.target.value)} placeholder="0"
              />
            </Field>
          </div>
        ) : (
          <>
            <div className="card">
              <Field label={t('add_product')}>
                <Select
                  value=""
                  onChange={(e) => {
                    const p = available.find((x) => x.id === e.target.value);
                    if (p) addLine(p);
                  }}
                  disabled={available.length === 0}
                >
                  <option value="">{available.length ? `— ${t('add_product')} —` : t('none_yet')}</option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(p.sellingPriceMinor, lang)} · {qty(p.stockQty)} {p.unit}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {lines.length === 0 ? (
              <div className="card"><EmptyState title={t('none_yet')}><ShoppingCart className="mx-auto" /></EmptyState></div>
            ) : (
              <div className="card space-y-3">
                {lines.map((l) => {
                  const over = l.quantity > l.stock;
                  return (
                    <div key={l.productId} className="flex flex-wrap items-end gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{l.name}</p>
                        <p className="text-xs text-slate-500">{qty(l.stock)} {t('in_stock')}</p>
                      </div>
                      <div className="w-20">
                        <label className="mb-0.5 block text-xs text-slate-500">{t('quantity')}</label>
                        <Input
                          inputMode="decimal" type="number" min="0" step="1" value={l.quantity}
                          onChange={(e) => updateLine(l.productId, { quantity: Number(e.target.value) })}
                          className={over ? 'ring-red-400' : ''}
                        />
                      </div>
                      <div className="w-28">
                        <label className="mb-0.5 block text-xs text-slate-500">{t('unit_price')}</label>
                        <Input
                          inputMode="decimal" type="number" min="0" step="0.01" value={l.unitPrice}
                          onChange={(e) => updateLine(l.productId, { unitPrice: Number(e.target.value) })}
                        />
                      </div>
                      <div className="w-24 text-end">
                        <label className="mb-0.5 block text-xs text-slate-500">{t('line_total')}</label>
                        <p className="py-2 font-semibold">{money(toMinor(l.unitPrice) * l.quantity, lang)}</p>
                      </div>
                      <button onClick={() => removeLine(l.productId)} className="p-2 text-slate-400 hover:text-red-600" aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {over && <p className="w-full text-xs text-red-600">Only {qty(l.stock)} in stock</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment panel */}
      <div className="space-y-4">
        <div className="card space-y-4">
          <Field label={t('payment_method')}>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'credit', 'digital'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-lg px-2 py-2.5 text-sm font-medium ring-1 ring-inset ${
                    paymentMethod === m ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300'
                  }`}
                >{t(m)}</button>
              ))}
            </div>
          </Field>

          {(needsCustomer || (can(PERMISSIONS.CUSTOMER_VIEW) && !quickMode)) && (
            <Field label={t('customer')} required={needsCustomer}>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">{t('walk_in')}</option>
                {(customers.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.balanceMinor > 0 ? ` · ${money(c.balanceMinor, lang)} ${t('outstanding').toLowerCase()}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {!quickMode && (
            <Field label={t('discount')}>
              <Input inputMode="decimal" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </Field>
          )}

          <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
            {!quickMode && (
              <>
                <Row label={t('total')} value={money(subtotalMinor, lang)} />
                {discountMinor > 0 && <Row label={t('discount')} value={`- ${money(discountMinor, lang)}`} />}
              </>
            )}
            <div className="flex items-center justify-between pt-1 text-lg font-bold text-slate-900">
              <span>{t('total')}</span><span>{money(totalMinor, lang)}</span>
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <Button className="w-full" loading={submitting} disabled={!canSubmit} onClick={() => void submit()}>
            <ShoppingCart className="h-4 w-4" /> {t('complete_sale')}
          </Button>
        </div>

        {lastSale && (
          <div className="card border-green-200 bg-green-50">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-green-800">{t('sale_recorded')}</p>
              <Badge tone="green">{lastSale.receiptNumber}</Badge>
            </div>
            <p className="mt-1 text-sm text-green-700">{money(lastSale.totalMinor, lang)} · {t(lastSale.paymentMethod)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-slate-600"><span>{label}</span><span>{value}</span></div>;
}
