import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import {
  Button, ErrorState, Field, Input, Loading, Select, useToast,
} from '../components/ui';

interface Shop {
  id: string; name: string; category: string | null; address: string | null;
  phone: string | null; language: 'en' | 'ur';
}

export function SettingsPage() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Partial<Shop>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({ queryKey: ['shop'], queryFn: () => api.get<Shop>('/shop') });

  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const updated = await api.patch<Shop>('/shop', {
        name: form.name,
        category: form.category || null,
        address: form.address || null,
        phone: form.phone || null,
        language: form.language,
      });
      setForm(updated);
      if (user) setUser({ ...user, shopName: updated.name, language: updated.language });
      toast.push(t('save'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('something_wrong'));
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div className="mx-auto max-w-lg">
      <div className="card space-y-4">
        <Field label={t('shop_name')} required>
          <Input value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label={t('category')}>
          <Input value={form.category ?? ''} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Kiryana / Pharmacy / …" />
        </Field>
        <Field label={t('phone')} hint="03XXXXXXXXX">
          <Input inputMode="numeric" value={form.phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
        <Field label="Address">
          <Input value={form.address ?? ''} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </Field>
        <Field label="Language">
          <Select value={form.language ?? 'en'} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as 'en' | 'ur' }))}>
            <option value="en">English</option>
            <option value="ur">اردو</option>
          </Select>
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button loading={busy} onClick={() => void submit()}>{t('save')}</Button>
      </div>
    </div>
  );
}
