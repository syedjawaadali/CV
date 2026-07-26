import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil } from 'lucide-react';
import type { Paginated, Product } from '@smartdukaan/shared';
import { createProductSchema, updateProductSchema, PERMISSIONS } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { money, qty, toRupees } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import {
  Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, useToast,
} from '../components/ui';

export function ProductsPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can(PERMISSIONS.PRODUCT_MANAGE);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null | 'new'>(null);

  const q = useInfiniteQuery({
    queryKey: ['products', 'list', search],
    queryFn: ({ pageParam }) =>
      api.get<Paginated<Product>>(
        `/products?limit=20${search ? `&q=${encodeURIComponent(search)}` : ''}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const products = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        {canManage && <Button onClick={() => setEditing('new')} className="ms-auto"><Plus className="h-4 w-4" /> {t('new_product')}</Button>}
      </div>

      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        products.length === 0 ? <EmptyState /> : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            {products.map((p) => {
              const low = Number(p.stockQty) <= Number(p.lowStockThreshold);
              return (
                <div key={p.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {p.name}{p.nameUr && <span className="ms-2 font-urdu text-slate-500">{p.nameUr}</span>}
                    </p>
                    <p className="text-xs text-slate-500">{money(p.sellingPriceMinor, lang)} · {p.unit}</p>
                  </div>
                  <div className="text-end">
                    <p className={`text-sm font-semibold ${low ? 'text-red-600' : 'text-slate-700'}`}>{qty(p.stockQty)}</p>
                    {low && <Badge tone="red">{t('low_stock')}</Badge>}
                  </div>
                  {canManage && (
                    <button onClick={() => setEditing(p)} className="p-1 text-slate-400 hover:text-brand-700" aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {q.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{t('loading')}</Button>
        </div>
      )}

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.push(t('save'));
            void qc.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}
    </div>
  );
}

interface FormValues {
  name: string; nameUr?: string | null; barcode?: string | null; category?: string | null;
  unit: string; costPrice: number; sellingPrice: number; openingStock?: number; lowStockThreshold: number;
}

function ProductForm({ product, onClose, onSaved }: {
  product: Product | null; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = !!product;
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? updateProductSchema : createProductSchema),
    defaultValues: {
      name: product?.name ?? '',
      nameUr: product?.nameUr ?? '',
      barcode: product?.barcode ?? '',
      category: product?.category ?? '',
      unit: product?.unit ?? 'piece',
      costPrice: product ? toRupees(product.costPriceMinor) : 0,
      sellingPrice: product ? toRupees(product.sellingPriceMinor) : 0,
      openingStock: 0,
      lowStockThreshold: product ? Number(product.lowStockThreshold) : 0,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const base = {
      name: values.name,
      nameUr: values.nameUr || null,
      barcode: values.barcode || null,
      category: values.category || null,
      unit: values.unit,
      costPrice: Number(values.costPrice),
      sellingPrice: Number(values.sellingPrice),
      lowStockThreshold: Number(values.lowStockThreshold),
    };
    try {
      if (isEdit) {
        await api.patch(`/products/${product!.id}`, base);
      } else {
        await api.post('/products', {
          ...base,
          ...(values.openingStock && Number(values.openingStock) > 0 ? { openingStock: Number(values.openingStock) } : {}),
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        for (const [k, v] of Object.entries(err.fieldErrors)) setError(k as keyof FormValues, { message: v });
      }
      setFormError(err instanceof ApiError ? err.message : t('something_wrong'));
    }
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? t('edit_product') : t('new_product')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('name')} error={errors.name?.message} required>
          <Input {...register('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('urdu_name')} error={errors.nameUr?.message}>
            <Input className="font-urdu" dir="rtl" {...register('nameUr')} />
          </Field>
          <Field label={t('unit')} error={errors.unit?.message}>
            <Input {...register('unit')} placeholder="piece / kg / packet" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('selling_price')} error={errors.sellingPrice?.message} required>
            <Input inputMode="decimal" type="number" min="0" step="0.01" {...register('sellingPrice', { valueAsNumber: true })} />
          </Field>
          <Field label={t('cost_price')} error={errors.costPrice?.message}>
            <Input inputMode="decimal" type="number" min="0" step="0.01" {...register('costPrice', { valueAsNumber: true })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!isEdit && (
            <Field label={t('opening_stock')} error={errors.openingStock?.message}>
              <Input inputMode="decimal" type="number" min="0" step="1" {...register('openingStock', { valueAsNumber: true })} />
            </Field>
          )}
          <Field label={t('low_stock_at')} error={errors.lowStockThreshold?.message}>
            <Input inputMode="decimal" type="number" min="0" step="1" {...register('lowStockThreshold', { valueAsNumber: true })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('category')} error={errors.category?.message}>
            <Input {...register('category')} />
          </Field>
          <Field label={t('barcode')} error={errors.barcode?.message}>
            <Input inputMode="numeric" {...register('barcode')} />
          </Field>
        </div>
        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('save')}</Button>
        </div>
      </form>
    </Modal>
  );
}
