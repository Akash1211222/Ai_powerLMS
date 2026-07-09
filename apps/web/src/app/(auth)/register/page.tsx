'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthShell, Field, Input, Button, Alert } from '@fca/ui';
import { authApi } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { registerForm, type RegisterForm } from '@/lib/form-schemas';

export default function RegisterPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerForm) });

  async function onSubmit(values: RegisterForm) {
    setFormError(null);
    try {
      await authApi.register(values);
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  }

  if (done) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="We've sent a verification link to activate your account."
        footer={
          <Link href="/login" className="font-semibold text-brand-500">
            Back to sign in
          </Link>
        }
      >
        <Alert tone="success">
          Almost there — click the link in the email to verify, then sign in.
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start your learning and career journey."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-500">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={errors.firstName?.message}>
            {({ id, invalid }) => (
              <Input id={id} autoComplete="given-name" invalid={invalid} {...register('firstName')} />
            )}
          </Field>
          <Field label="Last name" error={errors.lastName?.message}>
            {({ id, invalid }) => (
              <Input id={id} autoComplete="family-name" invalid={invalid} {...register('lastName')} />
            )}
          </Field>
        </div>
        <Field label="Email" error={errors.email?.message}>
          {({ id, invalid }) => (
            <Input id={id} type="email" autoComplete="email" invalid={invalid} {...register('email')} />
          )}
        </Field>
        <Field
          label="Password"
          error={errors.password?.message}
          hint="8+ characters with upper, lower and a number."
        >
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
        <Button type="submit" fullWidth loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
