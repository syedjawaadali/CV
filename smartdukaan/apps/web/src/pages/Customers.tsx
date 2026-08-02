import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Phone, MapPin } from 'lucide-react';
import type { Customer, Paginated } from '@smartdukaan/shared';
import { createCustomerSchema, PERMISSIONS } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { money } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import {
  Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, useToast,
} from '../components/ui';

type FormValues = { name: string; phone?: string | null; locality?: string | null; note?: string | null };

export function CustomersPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can(PERMISSIONS.CUSTOMER_MANAGE);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null | 'new'>(null);

  const q = useInfiniteQuery({
    queryKey: ['customers', search],
    queryFn: ({ pageParam }) =>
      api.get<Paginated<Customer>>(
        `/customers?limit=20${search ? `&q=${encodeURIComponent(search)}` : ''}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const customers = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs" placeholder={t('search')} value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canManage && (
          <Button onClick={() => setEditing('new')} className="ms-auto">
            <Plus className="h-4 w-4" /> {t('add')}
          </Button>
        )}
      </div>

      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        customers.length === 0 ? <EmptyState /> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customers.map((c) => (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{c.name}</p>
                    {c.phone && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" />{c.phone}</p>}
                    {c.locality && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{c.locality}</p>}
                  </div>
                  {canManage && (
                    <button onClick={() => setEditing(c)} className="p-1 text-slate-400 hover:text-brand-700" aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="mt-3">
                  {c.balanceMinor > 0
                    ? <Badge tone="amber">{money(c.balanceMinor, lang)} {t('outstanding').toLowerCase()}</Badge>
                    : <Badge tone="green">{t('settled')}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {q.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{t('loading')}</Button>
        </div>
      )}

      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.push(t('save'));
            void qc.invalidateQueries({ queryKey: ['customers'] });
          }}
        />
      )}
    </div>
  );
}

function CustomerForm({ customer, onClose, onSaved }: {
  customer: Customer | null; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      name: customer?.name ?? '',
      phone: customer?.phone ?? '',
      locality: customer?.locality ?? '',
      note: customer?.note ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const body = {
      name: values.name,
      phone: values.phone || null,
      locality: values.locality || null,
      note: values.note || null,
    };
    try {
      if (customer) await api.patch(`/customers/${customer.id}`, body);
      else await api.post('/customers', body);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        for (const [k, v] of Object.entries(err.fieldErrors)) setError(k as keyof FormValues, { message: v });
      }
      setFormError(err instanceof ApiError ? err.message : t('something_wrong'));
    }
  });

  return (
    <Modal open onClose={onClose} title={customer ? t('customer') : t('add')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('name')} error={errors.name?.message} required>
          <Input {...register('name')} />
        </Field>
        <Field label={t('phone')} error={errors.phone?.message} hint="03XXXXXXXXX">
          <Input inputMode="numeric" {...register('phone')} />
        </Field>
        <Field label={t('nav_customers')} error={errors.locality?.message}>
          <Input {...register('locality')} placeholder="Locality" />
        </Field>
        <Field label={t('note')} error={errors.note?.message}>
          <Input {...register('note')} />
        </Field>
        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('save')}</Button>
        </div>
      </form>
    </Modal>
  );
}
