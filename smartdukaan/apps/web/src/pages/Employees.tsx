import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { createEmployeeSchema, ALL_ROLES, type CreateEmployeeInput } from '@smartdukaan/shared';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import {
  Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, Select, useToast,
} from '../components/ui';

interface Employee { id: string; name: string; email: string; role: string; status: 'active' | 'suspended' }

export function EmployeesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<{ data: Employee[] }>('/employees'),
  });

  async function setStatus(id: string, status: 'active' | 'suspended') {
    try {
      await api.patch(`/employees/${id}`, { status });
      toast.push(t('save'));
      void qc.invalidateQueries({ queryKey: ['employees'] });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('something_wrong'), 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {t('add_staff')}</Button>
      </div>

      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        q.data!.data.length === 0 ? <EmptyState /> : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            {q.data!.data.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <div>
                  <p className="font-medium text-slate-900">{e.name} {e.id === user?.id && <span className="text-xs text-slate-400">(you)</span>}</p>
                  <p className="text-xs text-slate-500">{e.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="brand">{e.role}</Badge>
                  <Badge tone={e.status === 'active' ? 'green' : 'red'}>{t(e.status)}</Badge>
                  {e.id !== user?.id && (
                    <Button variant="secondary" onClick={() => void setStatus(e.id, e.status === 'active' ? 'suspended' : 'active')}>
                      {e.status === 'active' ? t('suspended') : t('active')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {open && (
        <StaffForm
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); toast.push(t('save')); void qc.invalidateQueries({ queryKey: ['employees'] }); }}
        />
      )}
    </div>
  );
}

function StaffForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  // Only the owner can create another owner.
  const assignableRoles = ALL_ROLES.filter((r) => r !== 'owner' || user?.role === 'owner');
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { name: '', email: '', password: '', role: 'cashier' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('/employees', values);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        for (const [k, v] of Object.entries(err.fieldErrors)) setError(k as keyof CreateEmployeeInput, { message: v });
      }
      setFormError(err instanceof ApiError ? err.message : t('something_wrong'));
    }
  });

  return (
    <Modal open onClose={onClose} title={t('add_staff')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('name')} error={errors.name?.message} required><Input {...register('name')} /></Field>
        <Field label={t('email')} error={errors.email?.message} required><Input type="email" {...register('email')} /></Field>
        <Field label={t('password')} error={errors.password?.message} hint="Min 8 characters" required>
          <Input type="password" {...register('password')} />
        </Field>
        <Field label={t('role')} error={errors.role?.message} required>
          <Select {...register('role')}>
            {assignableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
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
