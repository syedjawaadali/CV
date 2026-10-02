import { useMemo, useState } from 'react';
import {
  Link, Navigate, Route, Routes, useNavigate, useParams,
} from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Store, ShoppingCart, ClipboardList, LogOut, ArrowRight, Plus, Minus, Package, Languages, ArrowLeft,
} from 'lucide-react';
import type { Order, StoreProduct, StoreShop } from '@smartdukaan/shared';
import { storeApi } from '../lib/storeApi';
import { ApiError } from '../lib/api';
import { money, formatDateTime } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { CustomerAuthProvider, useCustomerAuth } from './CustomerAuthContext';
import {
  Badge, Button, EmptyState, Field, Input, Loading, useToast,
} from '../components/ui';

/** Buyer-facing storefront. Self-contained: its own auth, header and routes. */
export function StoreApp() {
  return (
    <CustomerAuthProvider>
      <StoreShell />
    </CustomerAuthProvider>
  );
}

function useL() {
  const { lang } = useI18n();
  return (en: string, ur: string) => (lang === 'ur' ? ur : en);
}

function StoreShell() {
  const { ready } = useCustomerAuth();
  if (!ready) return <div className="flex h-full items-center justify-center"><Loading /></div>;
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <StoreHeader />
      <main className="flex-1 p-4">
        <Routes>
          <Route path="/" element={<StoreHomePage />} />
          <Route path="/auth" element={<StoreAuthPage />} />
          <Route path="/shop/:shopId" element={<StoreShopPage />} />
          <Route path="/orders" element={<StoreOrdersPage />} />
          <Route path="*" element={<Navigate to="/store" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function StoreHeader() {
  const L = useL();
  const { toggle, lang } = useI18n();
  const { customer, logout } = useCustomerAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <Link to="/store" className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-white"><Store className="h-4 w-4" /></div>
        <span className="font-bold text-slate-900">{L('Shops', 'دکانیں')}</span>
      </Link>
      <div className="ms-auto flex items-center gap-1">
        <button onClick={toggle} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Language">
          <Languages className="h-5 w-5" />
          <span className="sr-only">{lang}</span>
        </button>
        <Link to="/store/orders" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" title={L('My orders', 'میرے آرڈر')}>
          <ClipboardList className="h-5 w-5" />
        </Link>
        {customer ? (
          <button onClick={() => { logout(); navigate('/store'); }} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" title={L('Log out', 'لاگ آؤٹ')}>
            <LogOut className="h-5 w-5" />
          </button>
        ) : (
          <Link to="/store/auth" className="btn-primary px-3 py-1.5 text-sm">{L('Sign in', 'سائن اِن')}</Link>
        )}
      </div>
    </header>
  );
}

function StoreHomePage() {
  const L = useL();
  const { lang } = useI18n();
  const q = useQuery({ queryKey: ['store', 'shops'], queryFn: () => storeApi.get<{ data: StoreShop[] }>('/shops') });
  if (q.isLoading) return <Loading />;
  const shops = q.data?.data ?? [];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{L('Order from shops near you', 'اپنے قریب کی دکانوں سے آرڈر کریں')}</h1>
        <p className="text-sm text-slate-500">{L('Reserve in advance, pay 30% to confirm.', 'پہلے سے بُک کریں، تصدیق کے لیے ۳۰٪ ادا کریں۔')}</p>
      </div>
      {shops.length === 0 ? <EmptyState /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shops.map((s) => (
            <Link key={s.id} to={`/store/shop/${s.id}`} className="card transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand-100 text-brand-700"><Store className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{s.name}</p>
                  <p className="truncate text-xs text-slate-500">{[s.category, s.address].filter(Boolean).join(' · ') || (lang === 'ur' ? 'دکان' : 'Shop')}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 rtl:rotate-180" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreShopPage() {
  const L = useL();
  const { lang } = useI18n();
  const { shopId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { customer } = useCustomerAuth();
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [placing, setPlacing] = useState(false);

  const q = useQuery({
    queryKey: ['store', 'products', shopId],
    queryFn: () => storeApi.get<{ data: StoreProduct[] }>(`/shops/${shopId}/products`),
    enabled: !!shopId,
  });
  const products = q.data?.data ?? [];

  function setQty(id: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(id); else next.set(id, qty);
      return next;
    });
  }

  const totalMinor = useMemo(
    () => products.reduce((sum, p) => sum + (cart.get(p.id) ?? 0) * p.sellingPriceMinor, 0),
    [products, cart],
  );
  const hasPerishable = products.some((p) => (cart.get(p.id) ?? 0) > 0 && p.perishable);
  const advanceRate = hasPerishable ? 0.5 : 0.3;
  const advanceMinor = Math.round(totalMinor * advanceRate);
  const itemCount = [...cart.values()].reduce((a, b) => a + b, 0);

  async function placeOrder() {
    if (!customer) { navigate('/store/auth'); return; }
    setPlacing(true);
    try {
      const items = [...cart.entries()].map(([productId, quantity]) => ({ productId, quantity }));
      await storeApi.post<Order>('/orders', { shopId, items });
      toast.push(L('Order placed — pay the advance to confirm', 'آرڈر ہو گیا — تصدیق کے لیے ایڈوانس ادا کریں'));
      navigate('/store/orders');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Error', 'error');
    } finally { setPlacing(false); }
  }

  if (q.isLoading) return <Loading />;

  return (
    <div className="space-y-3 pb-24">
      <Link to="/store" className="inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {L('All shops', 'تمام دکانیں')}</Link>
      {products.length === 0 ? <EmptyState title={L('No items yet', 'ابھی کوئی چیز نہیں')} /> : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          {products.map((p) => {
            const qtyInCart = cart.get(p.id) ?? 0;
            return (
              <div key={p.id} className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-0">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-11 w-11 object-cover" /> : <Package className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {lang === 'ur' && p.nameUr ? p.nameUr : p.name}
                    {p.perishable && <span className="ms-2 align-middle"><Badge tone="red">{L('Perishable', 'جلد خراب')}</Badge></span>}
                  </p>
                  <p className="text-sm text-brand-700">{money(p.sellingPriceMinor, lang)} <span className="text-xs text-slate-400">/ {p.unit}</span></p>
                </div>
                {qtyInCart === 0 ? (
                  <Button variant="secondary" onClick={() => setQty(p.id, 1)} className="px-3 py-1.5 text-sm"><Plus className="h-4 w-4" /> {L('Add', 'شامل')}</Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQty(p.id, qtyInCart - 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-700"><Minus className="h-4 w-4" /></button>
                    <span className="w-6 text-center font-semibold">{qtyInCart}</span>
                    <button onClick={() => setQty(p.id, qtyInCart + 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-white"><Plus className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-4">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex-1">
              <p className="text-sm text-slate-500">{itemCount} {L('items', 'اشیاء')} · {L('Total', 'کل')} {money(totalMinor, lang)}</p>
              <p className="text-xs font-medium text-amber-700">
                {L('Advance', 'ایڈوانس')} {Math.round(advanceRate * 100)}%: {money(advanceMinor, lang)}
              </p>
              {hasPerishable && (
                <p className="text-[11px] text-red-600">
                  {L('Perishable — pick up within 4h, deposit non-refundable', 'جلد خراب — ۴ گھنٹے میں وصول کریں، ایڈوانس واپس نہیں')}
                </p>
              )}
            </div>
            <Button loading={placing} onClick={() => void placeOrder()}>
              <ShoppingCart className="h-4 w-4" /> {L('Place order', 'آرڈر کریں')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StoreAuthPage() {
  const L = useL();
  const navigate = useNavigate();
  const { login, register } = useCustomerAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null); setBusy(true);
    try {
      if (mode === 'login') await login({ phone, password });
      else await register({ phone, name, password });
      navigate('/store');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 pt-6">
      <h1 className="text-xl font-bold text-slate-900">{mode === 'login' ? L('Sign in', 'سائن اِن') : L('Create account', 'اکاؤنٹ بنائیں')}</h1>
      <div className="card space-y-4">
        {mode === 'register' && (
          <Field label={L('Your name', 'آپ کا نام')} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label={L('Phone number', 'فون نمبر')} required>
          <Input inputMode="tel" placeholder="03xxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={L('Password', 'پاس ورڈ')} required>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button className="w-full" loading={busy} onClick={() => void submit()}>
          {mode === 'login' ? L('Sign in', 'سائن اِن') : L('Create account', 'اکاؤنٹ بنائیں')}
        </Button>
        <button
          className="w-full text-center text-sm text-brand-700"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
        >
          {mode === 'login' ? L("New here? Create an account", 'نئے ہیں؟ اکاؤنٹ بنائیں') : L('Already have an account? Sign in', 'پہلے سے اکاؤنٹ ہے؟ سائن اِن')}
        </button>
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'brand'> = {
  pending_payment: 'amber', confirmed: 'brand', accepted: 'brand',
  ready: 'green', fulfilled: 'green', rejected: 'red', cancelled: 'slate', expired: 'red',
};

function StoreOrdersPage() {
  const L = useL();
  const { lang } = useI18n();
  const { customer } = useCustomerAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [paying, setPaying] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['store', 'orders'],
    queryFn: () => storeApi.get<{ data: Order[] }>('/orders'),
    enabled: !!customer,
  });

  if (!customer) return <Navigate to="/store/auth" replace />;
  if (q.isLoading) return <Loading />;
  const orders = q.data?.data ?? [];

  const statusLabel = (s: string) => {
    const en: Record<string, string> = {
      pending_payment: 'Awaiting advance', confirmed: 'Confirmed', accepted: 'Accepted',
      ready: 'Ready for pickup', fulfilled: 'Completed', rejected: 'Rejected',
      cancelled: 'Cancelled', expired: 'Reservation expired',
    };
    const ur: Record<string, string> = {
      pending_payment: 'ایڈوانس باقی', confirmed: 'تصدیق شدہ', accepted: 'قبول شدہ',
      ready: 'تیار ہے', fulfilled: 'مکمل', rejected: 'مسترد',
      cancelled: 'منسوخ', expired: 'ریزرویشن ختم',
    };
    return (lang === 'ur' ? ur : en)[s] ?? s;
  };

  async function payAdvance(id: string) {
    setPaying(id);
    try {
      await storeApi.post(`/orders/${id}/pay-advance`);
      toast.push(L('Advance paid — order confirmed', 'ایڈوانس ادا — آرڈر تصدیق شدہ'));
      void qc.invalidateQueries({ queryKey: ['store', 'orders'] });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Error', 'error');
    } finally { setPaying(null); }
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-slate-900">{L('My orders', 'میرے آرڈر')}</h1>
      {orders.length === 0 ? <EmptyState title={L('No orders yet', 'ابھی کوئی آرڈر نہیں')} /> : orders.map((o) => (
        <div key={o.id} className="card space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-900">{o.shopName}</p>
            <Badge tone={STATUS_TONE[o.status] ?? 'slate'}>{statusLabel(o.status)}</Badge>
          </div>
          <div className="text-sm text-slate-600">
            {o.items.map((it) => (
              <div key={it.id} className="flex justify-between">
                <span>{it.name} × {Number(it.quantity)}</span>
                <span>{money(it.lineTotalMinor, lang)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
            <span className="text-slate-500">{L('Total', 'کل')}</span>
            <span className="font-semibold">{money(o.subtotalMinor, lang)}</span>
          </div>
          {o.hasPerishable && (
            <p className="text-[11px] font-medium text-red-600">{L('Perishable — deposit non-refundable', 'جلد خراب — ایڈوانس واپس نہیں')}</p>
          )}
          {o.pickupBy && ['pending_payment', 'confirmed', 'accepted', 'ready'].includes(o.status) && (
            <p className="text-xs text-slate-500">{L('Reserve until', 'وصولی کی مہلت')}: {formatDateTime(o.pickupBy)}</p>
          )}
          {o.status === 'pending_payment' ? (
            <Button className="w-full" loading={paying === o.id} onClick={() => void payAdvance(o.id)}>
              {L('Pay', 'ادا کریں')} {Math.round(o.advanceRate * 100)}% {L('advance', 'ایڈوانس')} · {money(o.advanceMinor, lang)}
            </Button>
          ) : (
            <p className="text-xs text-slate-500">
              {L('Advance', 'ایڈوانس')}: {money(o.advanceMinor, lang)} · {o.advancePaid ? L('paid', 'ادا شدہ') : L('unpaid', 'غیر ادا شدہ')}
            </p>
          )}
        </div>
      ))}
      <p className="pt-2 text-center text-xs text-slate-400">{L('Payments are simulated in this demo.', 'اس ڈیمو میں ادائیگی فرضی ہے۔')}</p>
    </div>
  );
}
