'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthShell, Field, Input, Button, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { loginForm, type LoginForm } from '@/lib/form-schemas';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginForm) });

  async function onSubmit(values: LoginForm) {
    setFormError(null);
    try {
      await login(values.email, values.password);
      router.push('/dashboard');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your FutureCorp Academy account."
      footer={
        <>
          New here?{' '}
          <Link href="/register" className="font-semibold text-brand-500">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="Email" error={errors.email?.message}>
          {({ id, invalid }) => (
            <Input id={id} type="email" autoComplete="email" invalid={invalid} {...register('email')} />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {({ id, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              invalid={invalid}
              {...register('password')}
            />
          )}
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-semibold text-brand-500">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" fullWidth loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
