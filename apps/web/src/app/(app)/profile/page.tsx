'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Card, Button, Input, Alert, Badge } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { liveApi } from '@/lib/live-api';
import { ApiError } from '@/lib/api-client';

/**
 * Account settings. Exists chiefly to give the Google Meet email a findable
 * home: it decides whether live-class attendance is credited to you, but the
 * only place to set it used to be inside an individual live class, which a
 * student sees only if they happen to open one.
 */
export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [googleEmail, setGoogleEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGoogleEmail(user?.googleEmail ?? '');
  }, [user?.googleEmail]);

  const save = useMutation({
    mutationFn: () => liveApi.setGoogleEmail(googleEmail.trim() || null),
    onSuccess: async () => {
      setError(null);
      setSaved(true);
      await refreshUser();
    },
    onError: (e) => {
      setSaved(false);
      setError(e instanceof ApiError ? e.message : 'Could not save that address.');
    },
  });

  if (!user) return null;
  const name = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;
  const needsGoogleEmail = !user.googleEmail;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          <span className="gradient-text">Your profile</span>
        </h1>
        <p className="mt-1 text-faint">{name} · {user.email}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {user.roles.map((r) => (
            <Badge key={`${r.role}-${r.organizationId}`} tone="neutral">
              {r.role}
            </Badge>
          ))}
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-display font-bold">Google account for live classes</h2>
          <p className="mt-1 text-sm text-faint">
            Attendance for live classes comes from Google Meet, which reports the Google account you
            signed in with — not your LMS email. If you join from a personal Gmail, tell us that
            address here or your attendance cannot be credited to you.
          </p>
        </div>

        {needsGoogleEmail && !saved && (
          <Alert tone="warning">
            <div className="font-semibold">You haven&apos;t set a Google account yet.</div>
            <p className="mt-1 text-sm">
              If you join Meet with <code className="font-mono">{user.email}</code> you can leave
              this blank — that already matches. Only fill it in if you sign in to Meet with a
              different address.
            </p>
          </Alert>
        )}
        {saved && !save.isPending && (
          <Alert tone="success">
            Saved. Live-class attendance will now match{' '}
            {user.googleEmail ? (
              <code className="font-mono">{user.googleEmail}</code>
            ) : (
              <code className="font-mono">{user.email}</code>
            )}
            .
          </Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-faint">
            Google Meet email (leave blank to use {user.email})
          </span>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[16rem] flex-1"
              type="email"
              value={googleEmail}
              onChange={(e) => {
                setGoogleEmail(e.target.value);
                setSaved(false);
              }}
              placeholder={user.email}
            />
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Save
            </Button>
          </div>
        </label>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="font-display font-bold">Password</h2>
        <p className="text-sm text-faint">
          Change the password you sign in with. You&apos;ll be signed out of other devices.
        </p>
        <div>
          <Link href="/change-password">
            <Button variant="secondary">Change password</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
