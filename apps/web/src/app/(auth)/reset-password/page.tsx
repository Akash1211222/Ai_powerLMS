'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthShell, Field, Input, Button, Alert } from '@fca/ui';
import { authApi } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { resetForm, type ResetForm } from '@/lib/form-schemas';

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ resolver: zodResolver(resetForm) });

  async function onSubmit(values: ResetForm) {
    setFormError(null);
    try {
      await authApi.resetPassword(token, values.password);
      router.push('/login?reset=1');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'This reset link is invalid or has expired.',
      );
    }
  }

  if (!token) {
    return <Alert tone="error">Missing reset token. Request a new link.</Alert>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="New password" error={errors.password?.message}>
        {({ id, invalid }) => (
          <Input id={id} type="password" autoComplete="new-password" invalid={invalid} {...register('password')} />
        )}
      </Field>
      <Field label="Confirm password" error={errors.confirm?.message}>
        {({ id, invalid }) => (
          <Input id={id} type="password" autoComplete="new-password" invalid={invalid} {...register('confirm')} />
        )}
      </Field>
      <Button type="submit" fullWidth loading={isSubmitting}>
        Update password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Set a strong password you don't use elsewhere."
      footer={
        <Link href="/login" className="font-semibold text-brand-500">
          Back to sign in
        </Link>
      }
    >
      <Suspense fallback={null}>
        <ResetInner />
      </Suspense>
    </AuthShell>
  );
}
