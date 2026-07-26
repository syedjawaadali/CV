import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { Expense } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { money, formatDateTime } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import {
  Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, Select, useToast,
} from '../components/ui';

const CATEGORIES = ['rent', 'electricity', 'salary', 'transport', 'supplies', 'personal', 'repair', 'other'] as const;

export function ExpensesPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.get<{ data: Expense[] }>('/expenses'),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {t('new_expense')}</Button>
      </div>

      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        q.data!.data.length === 0 ? <EmptyState /> : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            {q.data!.data.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <div>
                  <Badge tone="slate">{e.category}</Badge>
                  {e.note && <span className="ms-2 text-sm text-slate-600">{e.note}</span>}
                  <p className="text-xs text-slate-400">{formatDateTime(e.createdAt)} · {e.createdByName}</p>
                </div>
                <p className="font-semibold text-red-600">{money(e.amountMinor, lang)}</p>
              </div>
            ))}
          </div>
        )
      )}

      {open && (
        <ExpenseForm
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); toast.push(t('save')); void qc.invalidateQueries({ queryKey: ['expenses'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); }}
        />
      )}
    </div>
  );
}

function ExpenseForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [category, setCategory] = useState<string>('supplies');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const value = Number(amount);
    if (!(value > 0)) { setError(t('required')); return; }
    setBusy(true);
    try {
      await api.post('/expenses', { category, amount: value, note: note || null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('something_wrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('new_expense')}>
      <div className="space-y-3">
        <Field label={t('category')} required>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={t('amount')} required>
          <Input inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label={t('note')}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button loading={busy} onClick={() => void submit()}>{t('save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
