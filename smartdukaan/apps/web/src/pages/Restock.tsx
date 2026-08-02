import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Megaphone, Phone, Truck, MessageCircle, PackageSearch } from 'lucide-react';
import type { Distributor, Paginated, Suggestions } from '@smartdukaan/shared';
import { api } from '../lib/api';
import { qty } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { Badge, EmptyState, ErrorState, Loading } from '../components/ui';

function telHref(n?: string | null) {
  return n ? `tel:${n.replace(/\s+/g, '')}` : undefined;
}
function waHref(n?: string | null) {
  if (!n) return undefined;
  const digits = n.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : undefined;
}

export function RestockPage() {
  const { t, lang } = useI18n();

  const sug = useQuery({
    queryKey: ['suggestions'],
    queryFn: () => api.get<Suggestions>('/suggestions'),
  });
  const dist = useQuery({
    queryKey: ['distributors'],
    queryFn: () => api.get<Paginated<Distributor>>('/distributors'),
  });

  const distributors = dist.data?.data ?? [];
  const s = sug.data;

  // Distributors that match the shop's top-selling category, surfaced first.
  const suggestedDistributors = useMemo(() => {
    if (!s?.topCategory) return distributors;
    const cat = s.topCategory.toLowerCase();
    return [...distributors].sort((a, b) => {
      const am = a.category?.toLowerCase() === cat ? 1 : 0;
      const bm = b.category?.toLowerCase() === cat ? 1 : 0;
      return bm - am;
    });
  }, [distributors, s?.topCategory]);

  if (sug.isLoading) return <Loading />;
  if (sug.isError) return <ErrorState error={sug.error} onRetry={() => sug.refetch()} />;

  const nm = (en: string, ur: string | null) => (lang === 'ur' && ur ? ur : en);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t('smart_suggestions')}</h2>
        <p className="text-sm text-slate-500">{t('restock_subtitle')}</p>
      </div>

      {/* Sponsored FMCG slot — the paid suggestion. */}
      {s?.sponsored && (
        <div className="card border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-200 text-amber-800">
              <Megaphone className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-900">
                  {nm(s.sponsored.name, s.sponsored.nameUr)}
                </p>
                <Badge tone="amber">{t('sponsored')}</Badge>
              </div>
              <p className="text-xs text-slate-500">{s.sponsored.brand}</p>
              <p className="mt-1 text-sm text-slate-700">
                {nm(s.sponsored.message ?? '', s.sponsored.messageUr)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Low-stock reorder list */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-slate-700">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-semibold">{t('low_stock')}</h3>
        </div>
        {s && s.reorder.length > 0 ? (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            {s.reorder.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400">
                  {r.imageUrl ? (
                    <img src={r.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <PackageSearch className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {r.name}{r.nameUr && <span className="ms-2 font-urdu text-slate-500">{r.nameUr}</span>}
                  </p>
                  <p className="text-xs text-slate-500">{r.category ?? '—'}</p>
                </div>
                <div className="text-end">
                  <p className="text-sm font-semibold text-red-600">{qty(r.stockQty)} {r.unit}</p>
                  <Badge tone="red">{t('low_stock')}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card"><EmptyState title={t('no_low_stock')} /></div>
        )}
      </div>

      {/* Distributor directory — one-tap restock */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-slate-700">
          <Truck className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold">{t('suggested_distributors')}</h3>
        </div>
        {dist.isLoading ? (
          <Loading />
        ) : suggestedDistributors.length === 0 ? (
          <div className="card"><EmptyState /></div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {suggestedDistributors.map((d) => (
              <div key={d.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{nm(d.name, d.nameUr)}</p>
                    <p className="text-xs text-slate-500">
                      {[d.category, d.city].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  {d.sponsored && <Badge tone="amber">{t('sponsored')}</Badge>}
                </div>
                <div className="mt-3 flex gap-2">
                  <a
                    href={telHref(d.phone)}
                    className="btn-secondary flex-1 justify-center text-sm"
                    aria-disabled={!d.phone}
                  >
                    <Phone className="h-4 w-4" /> {t('call')}
                  </a>
                  <a
                    href={waHref(d.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary flex-1 justify-center text-sm"
                    aria-disabled={!d.whatsapp}
                  >
                    <MessageCircle className="h-4 w-4" /> {t('whatsapp')}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
