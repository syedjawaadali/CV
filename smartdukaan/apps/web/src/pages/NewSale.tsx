import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ShoppingCart, ScanLine, Mic } from 'lucide-react';
import type { CatalogEntry, Customer, Paginated, Product, Sale } from '@smartdukaan/shared';
import { toMinor } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { money, qty } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import {
  Badge, Button, EmptyState, Field, Input, Loading, Modal, Select, useToast,
} from '../components/ui';
import { PERMISSIONS } from '@smartdukaan/shared';
import { scanBarcode, listenOnce, isNative } from '../lib/native';
import { parseVoiceOrder } from '../lib/voiceParse';

interface Line { productId: string; name: string; unitPrice: number; quantity: number; stock: number }

interface QuickAdd {
  barcode: string; name: string; nameUr: string; category: string; unit: string;
  sellingPrice: string; openingStock: string; fromCatalog: boolean;
}

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
  const [scanning, setScanning] = useState(false);
  const [listening, setListening] = useState(false);
  const [quickAdd, setQuickAdd] = useState<QuickAdd | null>(null);

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

  function addOrIncrement(product: Product, quantity: number) {
    setLines((prev) => {
      const found = prev.find((l) => l.productId === product.id);
      if (found) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + quantity } : l);
      }
      return [...prev, {
        productId: product.id, name: product.name,
        unitPrice: product.sellingPriceMinor / 100, quantity, stock: Number(product.stockQty),
      }];
    });
  }

  // --- Supermarket-style scanning: each scan drops the item into the bill and
  //     immediately reopens the scanner. Known barcodes (looked up on the
  //     server, not just the cached page) add instantly; an unknown one stops
  //     the loop and offers a one-time quick-add.
  async function handleScan() {
    if (!isNative()) { toast.push(t('scan_not_supported'), 'error'); return; }
    setScanning(true);
    try {
      for (;;) {
        const code = await scanBarcode();
        if (!code) break; // scanner closed by the user
        let product: Product | null =
          (products.data?.data ?? []).find((p) => p.barcode === code) ?? null;
        if (!product) {
          try { product = await api.get<Product>(`/products/barcode/${encodeURIComponent(code)}`); }
          catch { product = null; }
        }
        if (product) {
          addOrIncrement(product, 1);
          toast.push(`${product.name} ${t('item_added')}`);
          continue; // keep scanning
        }
        // Unknown barcode → quick-add (prefilled from the shared catalog).
        let entry: CatalogEntry | null = null;
        try { entry = await api.get<CatalogEntry>(`/catalog/${encodeURIComponent(code)}`); } catch { entry = null; }
        setQuickAdd({
          barcode: code, name: entry?.name ?? '', nameUr: entry?.nameUr ?? '',
          category: entry?.category ?? '', unit: entry?.defaultUnit ?? 'piece',
          sellingPrice: '', openingStock: '', fromCatalog: !!entry,
        });
        break;
      }
    } finally { setScanning(false); }
  }

  // --- Voice order: speak items, match against the shop's products.
  async function handleVoice() {
    setListening(true);
    try {
      const r = await listenOnce(lang === 'ur' ? 'ur-PK' : 'en-US');
      if ('error' in r) {
        const msg = r.error === 'permission' ? t('voice_permission')
          : r.error === 'unsupported' ? t('voice_not_supported')
          : t('voice_unavailable');
        toast.push(msg, 'error');
        return;
      }
      const parsed = parseVoiceOrder(r.transcript, products.data?.data ?? []);
      if (parsed.length === 0) {
        toast.push(`${t('heard')}: “${r.transcript}” — ${t('nothing_recognized')}`, 'error');
        return;
      }
      for (const { product, quantity } of parsed) addOrIncrement(product, quantity);
      toast.push(`${t('added_items')}: ${parsed.map((p) => p.product.name).join(', ')}`);
    } finally { setListening(false); }
  }

  async function submitQuickAdd() {
    if (!quickAdd) return;
    const price = Number(quickAdd.sellingPrice);
    if (!quickAdd.name.trim()) { toast.push(t('required'), 'error'); return; }
    if (!(price > 0)) { toast.push(t('set_price_to_add'), 'error'); return; }
    try {
      const opening = Number(quickAdd.openingStock);
      const product = await api.post<Product>('/products', {
        name: quickAdd.name.trim(), nameUr: quickAdd.nameUr || null, barcode: quickAdd.barcode,
        category: quickAdd.category || null, unit: quickAdd.unit || 'piece',
        sellingPrice: price, costPrice: 0, lowStockThreshold: 0,
        ...(opening > 0 ? { openingStock: opening } : {}),
      });
      // Contribute the barcode to the shared catalog for every other shop.
      void api.post('/catalog', {
        barcode: quickAdd.barcode, name: quickAdd.name.trim(), nameUr: quickAdd.nameUr || null,
        category: quickAdd.category || null, unit: quickAdd.unit || 'piece',
      }).catch(() => undefined);
      addOrIncrement(product, 1);
      setQuickAdd(null);
      toast.push(t('saved_to_catalog'));
      void qc.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('something_wrong'), 'error');
    }
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
            {/* Fast capture — scan a barcode or speak the order */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" loading={scanning} onClick={() => void handleScan()}>
                <ScanLine className="h-5 w-5" /> {t('scan_items')}
              </Button>
              <Button variant="secondary" loading={listening} onClick={() => void handleVoice()}>
                <Mic className="h-5 w-5" /> {listening ? t('listening') : t('voice_add')}
              </Button>
            </div>

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

      {/* Quick-add product from a scanned barcode (+ shared-catalog autofill) */}
      {quickAdd && (
        <Modal open onClose={() => setQuickAdd(null)} title={t('add_to_products')}>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p className="text-slate-500">{t('barcode')}: <span className="font-mono text-slate-800">{quickAdd.barcode}</span></p>
              <p className={quickAdd.fromCatalog ? 'mt-1 text-green-700' : 'mt-1 text-amber-700'}>
                {quickAdd.fromCatalog ? `✓ ${t('found_in_catalog')}` : t('new_barcode_hint')}
              </p>
            </div>
            <Field label={t('name')} required>
              <Input value={quickAdd.name} onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('urdu_name')}>
                <Input className="font-urdu" dir="rtl" value={quickAdd.nameUr} onChange={(e) => setQuickAdd({ ...quickAdd, nameUr: e.target.value })} />
              </Field>
              <Field label={t('unit')}>
                <Input value={quickAdd.unit} onChange={(e) => setQuickAdd({ ...quickAdd, unit: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('selling_price')} required>
                <Input inputMode="decimal" type="number" min="0" step="0.01" value={quickAdd.sellingPrice} onChange={(e) => setQuickAdd({ ...quickAdd, sellingPrice: e.target.value })} placeholder="0" />
              </Field>
              <Field label={t('opening_stock')}>
                <Input inputMode="decimal" type="number" min="0" step="1" value={quickAdd.openingStock} onChange={(e) => setQuickAdd({ ...quickAdd, openingStock: e.target.value })} placeholder="0" />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setQuickAdd(null)}>{t('cancel')}</Button>
              <Button onClick={() => void submitQuickAdd()}>{t('add')}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-slate-600"><span>{label}</span><span>{value}</span></div>;
}
