import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Store } from 'lucide-react';
import { loginSchema, type LoginInput } from '@smartdukaan/shared';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { ApiError } from '../lib/api';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('something_wrong'));
    }
  });

  return (
    <AuthShell subtitle={t('sign_in')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('email')} error={errors.email?.message} required>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label={t('password')} error={errors.password?.message} required>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">{t('sign_in')}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">{t('demo_hint')}</p>
      <p className="mt-2 text-center text-sm text-slate-600">
        {t('no_account')}{' '}
        <Link to="/register" className="font-semibold text-brand-700 hover:underline">{t('create_account')}</Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { t, toggle, lang } = useI18n();
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-white">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">{t('app_name')}</h1>
          <p className="text-sm text-white/70">{subtitle}</p>
        </div>
        <div className="card">{children}</div>
        <button onClick={toggle} className="mt-4 block w-full text-center text-sm text-white/80 hover:text-white">
          {lang === 'en' ? 'اردو میں دیکھیں' : 'View in English'}
        </button>
      </div>
    </div>
  );
}
