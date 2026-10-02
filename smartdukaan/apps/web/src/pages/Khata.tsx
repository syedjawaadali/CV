import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import type { KhataTransaction } from '@smartdukaan/shared';
import { PERMISSIONS } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { money, formatDateTime } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import {
  Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, useToast,
} from '../components/ui';

interface OutstandingRow { id: string; name: string; phone: string | null; locality: string | null; balanceMinor: number }
interface Statement {
  customer: { id: string; name: string; phone: string | null; locality: string | null; balanceMinor: number };
  transactions: KhataTransaction[];
}

export function KhataPage() {
  const { t, lang } = useI18n();
  const [selected, setSelected] = useState<OutstandingRow | null>(null);

  const q = useQuery({
    queryKey: ['khata', 'outstanding'],
    queryFn: () => api.get<{ data: OutstandingRow[] }>('/khata/outstanding'),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data!.data;

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <EmptyState title={t('settled')}>{t('outstanding_khata')}: {money(0, lang)}</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-start last:border-0 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{c.name}</p>
                {c.phone && <p className="text-xs text-slate-500">{c.phone}</p>}
              </div>
              <div className="text-end">
                <p className="font-semibold text-amber-700">{money(c.balanceMinor, lang)}</p>
                <p className="text-xs text-slate-400">{t('owes_you')}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <KhataDetail customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function KhataDetail({ customer, onClose }: { customer: OutstandingRow; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can(PERMISSIONS.KHATA_MANAGE);
  const [mode, setMode] = useState<'payment' | 'credit' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statement = useQuery({
    queryKey: ['khata', 'statement', customer.id],
    queryFn: () => api.get<Statement>(`/khata/${customer.id}`),
  });

  async function submit() {
    setError(null);
    const value = Number(amount);
    if (!(value > 0)) { setError(t('required')); return; }
    setBusy(true);
    try {
      const path = mode === 'payment' ? '/khata/payment' : '/khata/credit';
      const body = mode === 'payment'
        ? { customerId: customer.id, amount: value, method: 'cash', note: note || null }
        : { customerId: customer.id, amount: value, note: note || null };
      await api.post(path, body);
      toast.push(mode === 'payment' ? t('record_payment') : t('add_credit'));
      setMode(null); setAmount(''); setNote('');
      void statement.refetch();
      void qc.invalidateQueries({ queryKey: ['khata'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('something_wrong'));
    } finally {
      setBusy(false);
    }
  }

  const balance = statement.data?.customer.balanceMinor ?? customer.balanceMinor;

  return (
    <Modal open onClose={onClose} title={customer.name}>
      <div className="mb-4 rounded-lg bg-slate-50 p-4 text-center">
        <p className="text-sm text-slate-500">{t('balance')}</p>
        <p className={`text-2xl font-bold ${balance > 0 ? 'text-amber-700' : 'text-green-700'}`}>{money(balance, lang)}</p>
      </div>

      {canManage && (
        mode ? (
          <div className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="font-medium">{mode === 'payment' ? t('record_payment') : t('add_credit')}</p>
            <Field label={t('amount')} required>
              <Input inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </Field>
            <Field label={t('note')}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setMode(null); setError(null); }}>{t('cancel')}</Button>
              <Button loading={busy} onClick={() => void submit()}>{t('save')}</Button>
            </div>
          </div>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setMode('payment')}><ArrowDownCircle className="h-4 w-4 text-green-600" /> {t('record_payment')}</Button>
            <Button variant="secondary" onClick={() => setMode('credit')}><ArrowUpCircle className="h-4 w-4 text-amber-600" /> {t('add_credit')}</Button>
          </div>
        )
      )}

      <p className="mb-2 text-sm font-medium text-slate-700">{t('statement')}</p>
      {statement.isLoading ? <Loading /> : statement.isError ? <ErrorState error={statement.error} /> : (
        statement.data!.transactions.length === 0 ? <EmptyState /> : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {statement.data!.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0">
                <div>
                  <Badge tone={tx.amountMinor > 0 ? 'amber' : 'green'}>
                    {tx.type === 'payment' ? t('record_payment') : tx.type === 'credit' ? t('credit') : tx.type}
                  </Badge>
                  <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(tx.createdAt)}</p>
                </div>
                <div className="text-end">
                  <p className={`font-semibold ${tx.amountMinor > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    {tx.amountMinor > 0 ? '+' : ''}{money(tx.amountMinor, lang)}
                  </p>
                  <p className="text-xs text-slate-400">{money(tx.balanceAfterMinor, lang)}</p>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </Modal>
  );
}
