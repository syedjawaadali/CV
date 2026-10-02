import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import type { Paginated, Sale } from '@smartdukaan/shared';
import { PERMISSIONS } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { money, formatDateTime } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, EmptyState, ErrorState, Loading, Modal, useToast } from '../components/ui';

export function SalesPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [toReverse, setToReverse] = useState<Sale | null>(null);
  const [reversing, setReversing] = useState(false);

  const q = useInfiniteQuery({
    queryKey: ['sales'],
    queryFn: ({ pageParam }) =>
      api.get<Paginated<Sale>>(`/sales?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  async function doReverse() {
    if (!toReverse) return;
    setReversing(true);
    try {
      await api.post(`/sales/${toReverse.id}/reverse`, {});
      toast.push(t('reversed'));
      setToReverse(null);
      void qc.invalidateQueries({ queryKey: ['sales'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['khata'] });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('something_wrong'), 'error');
    } finally {
      setReversing(false);
    }
  }

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const sales = q.data!.pages.flatMap((p) => p.data);
  if (sales.length === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="hidden grid-cols-12 gap-2 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase text-slate-500 sm:grid">
          <span className="col-span-3">{t('receipt')}</span>
          <span className="col-span-3">{t('customer')}</span>
          <span className="col-span-2">{t('payment_method')}</span>
          <span className="col-span-2 text-end">{t('total')}</span>
          <span className="col-span-2 text-end">{t('actions')}</span>
        </div>
        {sales.map((s) => (
          <div key={s.id} className="grid grid-cols-2 gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-0 sm:grid-cols-12 sm:items-center">
            <div className="col-span-1 sm:col-span-3">
              <p className="font-medium text-slate-900">{s.receiptNumber}</p>
              <p className="text-xs text-slate-500">{formatDateTime(s.createdAt)}</p>
            </div>
            <div className="col-span-1 sm:col-span-3 text-slate-600">{s.customerName ?? t('walk_in')}</div>
            <div className="col-span-1 sm:col-span-2"><Badge tone={s.paymentMethod === 'credit' ? 'amber' : 'slate'}>{t(s.paymentMethod)}</Badge></div>
            <div className="col-span-1 text-end font-semibold sm:col-span-2">
              {money(s.totalMinor, lang)}
              {s.status === 'reversed' && <div><Badge tone="red">{t('reversed')}</Badge></div>}
            </div>
            <div className="col-span-2 flex justify-end sm:col-span-2">
              {can(PERMISSIONS.SALE_REVERSE) && s.status === 'completed' && (
                <button onClick={() => setToReverse(s)} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline">
                  <RotateCcw className="h-3.5 w-3.5" /> {t('reverse')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {q.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {t('loading')}
          </Button>
        </div>
      )}

      <Modal open={!!toReverse} onClose={() => setToReverse(null)} title={t('reverse')}>
        <p className="text-sm text-slate-600">
          {t('receipt')}: <span className="font-medium">{toReverse?.receiptNumber}</span> — {money(toReverse?.totalMinor ?? 0, lang)}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          This restores stock and reverses any khata entry. This action is recorded and cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setToReverse(null)}>{t('cancel')}</Button>
          <Button variant="danger" loading={reversing} onClick={() => void doReverse()}>{t('reverse')}</Button>
        </div>
      </Modal>
    </div>
  );
}
