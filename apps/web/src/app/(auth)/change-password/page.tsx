'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthShell, Field, Input, Button, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { changePasswordForm, type ChangePasswordForm } from '@/lib/form-schemas';

/**
 * Deliberately outside the (app) route group: that layout redirects here while
 * mustChangePassword is set, so hosting this page inside it would loop.
 */
export default function ChangePasswordPage() {
  const { status, user, changePassword } = useAuth();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordForm) });

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    // Already sorted (or arrived here by hand) — nothing to force.
    if (status === 'authenticated' && user && !user.mustChangePassword) {
      router.replace('/dashboard');
    }
  }, [status, user, router]);

  async function onSubmit(values: ChangePasswordForm) {
    try {
      await changePassword(values.currentPassword, values.password);
      router.replace('/dashboard');
    } catch (err) {
      setError('root', {
        message:
          err instanceof ApiError ? err.message : 'Could not change your password. Try again.',
      });
    }
  }

  return (
    <AuthShell
      title="Choose your own password"
      subtitle="Your account was created with a shared starter password. Set your own before continuing — you won't be able to use the LMS until you do."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {errors.root && <Alert tone="error">{errors.root.message}</Alert>}
        <Field label="Password you were given" error={errors.currentPassword?.message}>
          {({ id, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              invalid={invalid}
              {...register('currentPassword')}
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
        <Field label="Confirm new password" error={errors.confirm?.message}>
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
          Set my password
        </Button>
      </form>
    </AuthShell>
  );
}
