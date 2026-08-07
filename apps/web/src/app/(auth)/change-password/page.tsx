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
  const forced = Boolean(user?.mustChangePassword);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordForm) });

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    // Deliberately no redirect for users who are not being forced: this page
    // is also how someone changes their password voluntarily from /profile.
    // It asks for the current password either way, so it is safe to visit.
  }, [status, router]);

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
      title={forced ? 'Choose your own password' : 'Change your password'}
      subtitle={
        forced
          ? "Your account was created with a shared starter password. Set your own before continuing — you won't be able to use the LMS until you do."
          : 'Enter your current password, then choose a new one. Other devices will be signed out.'
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {errors.root && <Alert tone="error">{errors.root.message}</Alert>}
        <Field
          label={forced ? 'Password you were given' : 'Current password'}
          error={errors.currentPassword?.message}
        >
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
          {forced ? 'Set my password' : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  );
}
