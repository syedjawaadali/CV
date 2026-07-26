import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Banknote, CreditCard, Smartphone,
  TrendingUp, Wallet, Receipt, Volume2, VolumeX,
} from 'lucide-react';
import type { DashboardSummary } from '@smartdukaan/shared';
import { PERMISSIONS } from '@smartdukaan/shared';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { speak, stopSpeaking } from '../lib/native';
import { Badge, ErrorState, Loading } from '../components/ui';
import type { StringKey } from '../i18n/strings';

const VOICE_KEY = 'sd_voice_alerts';

export function DashboardPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem(VOICE_KEY) !== '0');
  const spokenRef = useRef(false);
  const q = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
  });

  const summary = q.data;
  // Gentle Urdu voice reminder — spoken ONCE per visit, never repeated/looped.
  useEffect(() => {
    if (!summary || !voiceOn || spokenRef.current) return;
    const parts: string[] = [];
    if (summary.lowStockCount > 0) parts.push(`${summary.lowStockCount} چیزیں کم ہو رہی ہیں`);
    if (summary.outstandingKhataMinor > 0) parts.push('اور اُدھار وصول کرنا باقی ہے');
    if (parts.length === 0) return;
    spokenRef.current = true;
    const id = setTimeout(() => void speak(`${parts.join(' ')}۔`, 'ur-PK'), 600);
    return () => clearTimeout(id);
  }, [summary, voiceOn]);

  function toggleVoice() {
    setVoiceOn((on) => {
      const next = !on;
      localStorage.setItem(VOICE_KEY, next ? '1' : '0');
      if (!next) stopSpeaking();
      return next;
    });
  }

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data!;

  const TONES: Record<string, string> = {
    brand: 'bg-brand-100 text-brand-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  };

  const Stat = ({ label, value, icon: Icon, tone = 'brand' }: {
    label: StringKey; value: string; icon: typeof Banknote; tone?: string;
  }) => (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{t(label)}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-lg ${TONES[tone] ?? TONES.brand}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{s.date}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleVoice}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset ${
              voiceOn ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-slate-50 text-slate-500 ring-slate-200'
            }`}
            title={t('voice_alerts')}
          >
            {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {voiceOn ? t('alerts_on') : t('alerts_off')}
          </button>
          <Badge tone={s.closingDoneToday ? 'green' : 'amber'}>
            {s.closingDoneToday ? t('day_closed') : t('day_open')}
          </Badge>
        </div>
      </div>

      {s.lowStockCount > 0 && (
        <Link to="/restock" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition-shadow hover:shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm text-amber-900">
            <span className="font-semibold">{s.lowStockCount}</span> {t('low_stock_banner')}
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
            {t('reorder_now')} <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="card col-span-2 bg-brand-700 text-white lg:col-span-1">
          <p className="text-sm text-brand-100">{t('todays_sales')}</p>
          <p className="mt-1 text-3xl font-bold">{money(s.todaySalesMinor, lang)}</p>
          <p className="mt-1 text-sm text-brand-100">{s.saleCountToday} {t('sales_count').toLowerCase()}</p>
        </div>
        <Stat label="cash" value={money(s.cashSalesMinor, lang)} icon={Banknote} tone="green" />
        <Stat label="credit" value={money(s.creditSalesMinor, lang)} icon={CreditCard} tone="amber" />
        <Stat label="digital" value={money(s.digitalSalesMinor, lang)} icon={Smartphone} tone="brand" />
        <Stat label="khata_collected" value={money(s.khataCollectedTodayMinor, lang)} icon={Wallet} tone="brand" />
        <Stat label="expenses_today" value={money(s.expensesTodayMinor, lang)} icon={Receipt} tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {can(PERMISSIONS.PROFIT_VIEW) && (
          <div className="card">
            <div className="flex items-center gap-2 text-slate-500">
              <TrendingUp className="h-5 w-5" />
              <p className="text-sm">{t('est_profit')}</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-900">{money(s.estimatedProfitMinor, lang)}</p>
            {s.profitIsEstimated && <p className="mt-1 text-xs text-slate-400">{t('profit_estimated')}</p>}
          </div>
        )}
        <Link to="/khata" className="card transition-shadow hover:shadow-md">
          <div className="flex items-center gap-2 text-slate-500">
            <Wallet className="h-5 w-5" />
            <p className="text-sm">{t('outstanding_khata')}</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{money(s.outstandingKhataMinor, lang)}</p>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700">
            {t('nav_khata')} <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </span>
        </Link>
        <Link to="/inventory" className="card transition-shadow hover:shadow-md">
          <div className="flex items-center gap-2 text-slate-500">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm">{t('low_stock')}</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{s.lowStockCount}</p>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700">
            {t('nav_inventory')} <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </span>
        </Link>
      </div>
    </div>
  );
}
