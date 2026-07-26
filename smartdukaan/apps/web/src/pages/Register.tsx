import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@smartdukaan/shared';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { ApiError } from '../lib/api';
import { Button, Field, Input } from '../components/ui';
import { AuthShell } from './Login';

export function RegisterPage() {
  const { register: signup } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', shopName: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signup(values);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('something_wrong'));
    }
  });

  return (
    <AuthShell subtitle={t('create_account')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('shop_name')} error={errors.shopName?.message} required>
          <Input {...register('shopName')} />
        </Field>
        <Field label={t('your_name')} error={errors.name?.message} required>
          <Input {...register('name')} />
        </Field>
        <Field label={t('email')} error={errors.email?.message} required>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label={t('password')} error={errors.password?.message} hint="Min 8 characters" required>
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">{t('create_account')}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        {t('have_account')}{' '}
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">{t('sign_in')}</Link>
      </p>
    </AuthShell>
  );
}
