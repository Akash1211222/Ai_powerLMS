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
  // Carried over from the forgot-password step so the code and the account it
  // belongs to stay together; still editable if someone lands here directly.
  const emailFromQuery = useSearchParams().get('email') ?? '';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetForm),
    defaultValues: { email: emailFromQuery },
  });

  async function onSubmit(values: ResetForm) {
    setFormError(null);
    try {
      await authApi.resetPassword(values.email, values.otp, values.password);
      router.push('/login?reset=1');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'That code is invalid or has expired.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Email" error={errors.email?.message}>
        {({ id, invalid }) => (
          <Input id={id} type="email" autoComplete="email" invalid={invalid} {...register('email')} />
        )}
      </Field>
      <Field label="6-digit code" error={errors.otp?.message}>
        {({ id, invalid }) => (
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            invalid={invalid}
            {...register('otp')}
          />
        )}
      </Field>
      <Field label="New password" error={errors.password?.message}>
        {({ id, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            invalid={invalid}
            {...register('password')}
          />
        )}
      </Field>
      <Field label="Confirm password" error={errors.confirm?.message}>
        {({ id, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            invalid={invalid}
            {...register('confirm')}
          />
        )}
      </Field>
      <Button type="submit" fullWidth loading={isSubmitting}>
        Update password
      </Button>
      <p className="text-center text-sm text-muted">
        Didn&apos;t get a code?{' '}
        <Link href="/forgot-password" className="font-semibold text-brand-500">
          Send a new one
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Enter your reset code"
      subtitle="We emailed you a 6-digit code. It expires in 15 minutes."
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
