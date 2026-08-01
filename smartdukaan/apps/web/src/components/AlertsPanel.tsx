import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, Check, Clock, X } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';

interface Alert {
  id: string; productId: string | null; alertType: string; severity: string;
  explanation: string; status: string;
}
const SEV_TONE: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 text-red-900',
  urgent: 'border-orange-200 bg-orange-50 text-orange-900',
  important: 'border-amber-200 bg-amber-50 text-amber-900',
  helpful: 'border-slate-200 bg-slate-50 text-slate-700',
};

/** Inventory-intelligence alerts card. Deterministic, explainable; actions
 *  (acknowledge/snooze/dismiss) never change inventory. Falls back silently if
 *  the feature is disabled (404). */
export function AlertsPanel() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (en: string, ur: string) => (lang === 'ur' ? ur : en);
  const q = useQuery({
    queryKey: ['intelligence-alerts'],
    queryFn: () => api.get<{ data: Alert[] }>('/intelligence/alerts').then((r) => r.data).catch(() => [] as Alert[]),
    refetchInterval: 60_000,
  });
  const act = useMutation({
    mutationFn: (v: { id: string; action: string }) => api.post(`/intelligence/alerts/${v.id}/action`, { action: v.action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intelligence-alerts'] }),
  });

  const alerts = q.data ?? [];
  if (alerts.length === 0) return null;
  const shown = alerts.slice(0, 6);

  return (
    <div className="card" dir="auto">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-900">{L('Needs attention', 'توجہ درکار')}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{alerts.length}</span>
      </div>
      <div className="space-y-2">
        {shown.map((a) => (
          <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${SEV_TONE[a.severity] ?? SEV_TONE.helpful}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1">{a.explanation}</p>
            <div className="flex shrink-0 gap-1">
              <button type="button" aria-label={L('Acknowledge', 'سمجھ گیا')} title={L('Acknowledge', 'سمجھ گیا')}
                onClick={() => act.mutate({ id: a.id, action: 'acknowledge' })} className="rounded p-1 hover:bg-black/5"><Check className="h-4 w-4" /></button>
              <button type="button" aria-label={L('Snooze', 'بعد میں')} title={L('Snooze', 'بعد میں')}
                onClick={() => act.mutate({ id: a.id, action: 'snooze' })} className="rounded p-1 hover:bg-black/5"><Clock className="h-4 w-4" /></button>
              <button type="button" aria-label={L('Dismiss', 'ہٹائیں')} title={L('Dismiss', 'ہٹائیں')}
                onClick={() => act.mutate({ id: a.id, action: 'dismiss' })} className="rounded p-1 hover:bg-black/5"><X className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      {alerts.length > shown.length && (
        <p className="mt-2 text-xs text-slate-500">{L(`+${alerts.length - shown.length} more`, `مزید ${alerts.length - shown.length}`)}</p>
      )}
    </div>
  );
}
