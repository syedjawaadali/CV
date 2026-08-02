import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DailyClosing } from '@smartdukaan/shared';
import { toMinor } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { money, formatDate, karachiToday } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import {
  Badge, Button, EmptyState, ErrorState, Field, Input, Loading, useToast,
} from '../components/ui';

interface Preview {
  businessDate: string;
  cashSalesMinor: number; digitalSalesMinor: number; creditSalesMinor: number;
  khataCollectedMinor: number; expensesMinor: number; expectedCashMinor: number;
  alreadyClosed: boolean;
}

export function ClosingPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [date, setDate] = useState(karachiToday());
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['closing', 'preview', date],
    queryFn: () => api.get<Preview>(`/closing/preview?businessDate=${date}`),
  });
  const history = useQuery({
    queryKey: ['closing', 'list'],
    queryFn: () => api.get<{ data: DailyClosing[] }>('/closing'),
  });

  const difference = useMemo(() => {
    if (!preview.data || counted === '') return null;
    return toMinor(Number(counted)) - preview.data.expectedCashMinor;
  }, [preview.data, counted]);

  async function submit() {
    setError(null);
    if (counted === '') { setError(t('required')); return; }
    setBusy(true);
    try {
      await api.post('/closing', { businessDate: date, countedCash: Number(counted), note: note || null });
      toast.push(t('submit_closing'));
      setCounted(''); setNote('');
      void preview.refetch();
      void qc.invalidateQueries({ queryKey: ['closing'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('something_wrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="card space-y-4">
        <Field label={t('business_date')}>
          <Input type="date" max={karachiToday()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        {preview.isLoading ? <Loading /> : preview.isError ? <ErrorState error={preview.error} onRetry={() => preview.refetch()} /> : (
          <>
            <div className="space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm">
              <Row label={t('cash')} value={money(preview.data!.cashSalesMinor, lang)} />
              <Row label={t('digital')} value={money(preview.data!.digitalSalesMinor, lang)} />
              <Row label={t('credit')} value={money(preview.data!.creditSalesMinor, lang)} />
              <Row label={t('khata_collected')} value={money(preview.data!.khataCollectedMinor, lang)} />
              <Row label={t('expenses_today')} value={`- ${money(preview.data!.expensesMinor, lang)}`} />
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                <span>{t('expected_cash')}</span><span>{money(preview.data!.expectedCashMinor, lang)}</span>
              </div>
            </div>

            {preview.data!.alreadyClosed ? (
              <div className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-800">{t('closing_done')}</div>
            ) : (
              <>
                <Field label={t('counted_cash')} required>
                  <Input inputMode="decimal" type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" />
                </Field>
                {difference !== null && (
                  <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium ${
                    difference === 0 ? 'bg-green-50 text-green-800' : difference > 0 ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800'
                  }`}>
                    <span>{t('difference')}</span>
                    <span>{difference > 0 ? '+' : ''}{money(difference, lang)}</span>
                  </div>
                )}
                <Field label={t('note')}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <Button className="w-full" loading={busy} onClick={() => void submit()}>{t('submit_closing')}</Button>
              </>
            )}
          </>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-slate-700">{t('nav_closing')}</h2>
        {history.isLoading ? <Loading /> : history.isError ? <ErrorState error={history.error} /> : (
          history.data!.data.length === 0 ? <div className="card"><EmptyState /></div> : (
            <div className="space-y-2">
              {history.data!.data.map((d) => (
                <div key={d.id} className="card flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{formatDate(d.businessDate)}</p>
                    <p className="text-xs text-slate-500">{t('expected_cash')}: {money(d.expectedCashMinor, lang)}</p>
                  </div>
                  <Badge tone={d.differenceMinor === 0 ? 'green' : d.differenceMinor > 0 ? 'brand' : 'red'}>
                    {d.differenceMinor > 0 ? '+' : ''}{money(d.differenceMinor, lang)}
                  </Badge>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-slate-600"><span>{label}</span><span>{value}</span></div>;
}
