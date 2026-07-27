import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Clock } from 'lucide-react';
import type { Order, OrderStatus } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { money } from '../lib/format';
import { formatDateTime } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { Badge, Button, EmptyState, ErrorState, Loading, useToast } from '../components/ui';

const TONE: Record<OrderStatus, 'slate' | 'green' | 'amber' | 'red' | 'brand'> = {
  pending_payment: 'amber', confirmed: 'brand', accepted: 'brand',
  ready: 'green', fulfilled: 'green', rejected: 'red', cancelled: 'slate',
};

export function OrdersPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get<{ data: Order[] }>('/orders'),
    refetchInterval: 30_000,
  });

  async function setStatus(id: string, status: OrderStatus) {
    try {
      await api.patch(`/orders/${id}/status`, { status });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('something_wrong'), 'error');
    }
  }

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const orders = q.data?.data ?? [];

  const label = (s: OrderStatus) => {
    const en: Record<OrderStatus, string> = {
      pending_payment: 'Awaiting advance', confirmed: 'New — confirmed', accepted: 'Accepted',
      ready: 'Ready', fulfilled: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled',
    };
    const ur: Record<OrderStatus, string> = {
      pending_payment: 'ایڈوانس باقی', confirmed: 'نیا — تصدیق شدہ', accepted: 'قبول شدہ',
      ready: 'تیار', fulfilled: 'مکمل', rejected: 'مسترد', cancelled: 'منسوخ',
    };
    return (lang === 'ur' ? ur : en)[s];
  };

  return (
    <div className="space-y-3">
      {orders.length === 0 ? <EmptyState title={lang === 'ur' ? 'ابھی کوئی آرڈر نہیں' : 'No online orders yet'} /> : orders.map((o) => (
        <div key={o.id} className="card space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">{o.customerName}</p>
              <a href={`tel:${o.customerPhone}`} className="inline-flex items-center gap-1 text-xs text-brand-700">
                <Phone className="h-3 w-3" /> {o.customerPhone}
              </a>
            </div>
            <Badge tone={TONE[o.status]}>{label(o.status)}</Badge>
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
            <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3 w-3" /> {formatDateTime(o.createdAt)}</span>
            <span className="font-semibold">{money(o.subtotalMinor, lang)}</span>
          </div>
          <p className="text-xs text-slate-500">
            {lang === 'ur' ? 'ایڈوانس' : 'Advance'} {money(o.advanceMinor, lang)} · {o.advancePaid ? (lang === 'ur' ? 'ادا شدہ' : 'paid') : (lang === 'ur' ? 'غیر ادا' : 'unpaid')}
          </p>

          {/* Retailer actions by state */}
          {o.status === 'confirmed' && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void setStatus(o.id, 'accepted')}>{lang === 'ur' ? 'قبول کریں' : 'Accept'}</Button>
              <Button variant="danger" onClick={() => void setStatus(o.id, 'rejected')}>{lang === 'ur' ? 'مسترد' : 'Reject'}</Button>
            </div>
          )}
          {o.status === 'accepted' && (
            <Button className="w-full" onClick={() => void setStatus(o.id, 'ready')}>{lang === 'ur' ? 'تیار ہو گیا' : 'Mark ready'}</Button>
          )}
          {o.status === 'ready' && (
            <Button className="w-full" onClick={() => void setStatus(o.id, 'fulfilled')}>{lang === 'ur' ? 'مکمل ہو گیا' : 'Mark completed'}</Button>
          )}
        </div>
      ))}
    </div>
  );
}
