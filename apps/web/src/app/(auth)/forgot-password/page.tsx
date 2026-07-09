'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthShell, Field, Input, Button, Alert } from '@fca/ui';
import { authApi } from '@/lib/auth-api';
import { forgotForm, type ForgotForm } from '@/lib/form-schemas';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({ resolver: zodResolver(forgotForm) });

  async function onSubmit(values: ForgotForm) {
    // Endpoint always succeeds (no account enumeration) — show the same result.
    await authApi.forgotPassword(values.email).catch(() => undefined);
    setSent(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send a reset link."
      footer={
        <Link href="/login" className="font-semibold text-brand-500">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success">
          If an account exists for that email, a reset link is on its way.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Field label="Email" error={errors.email?.message}>
            {({ id, invalid }) => (
              <Input id={id} type="email" autoComplete="email" invalid={invalid} {...register('email')} />
            )}
          </Field>
          <Button type="submit" fullWidth loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
