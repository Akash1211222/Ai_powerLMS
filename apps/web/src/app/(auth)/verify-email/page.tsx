'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthShell, Alert, Button } from '@fca/ui';
import { authApi } from '@/lib/auth-api';

function VerifyInner() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'verifying' | 'ok' | 'error'>('verifying');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState('error');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setState('ok'))
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'verifying') {
    return <Alert tone="info">Verifying your email…</Alert>;
  }
  if (state === 'ok') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">Your email is verified. You can sign in now.</Alert>
        <Link href="/login">
          <Button fullWidth>Continue to sign in</Button>
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="error">This verification link is invalid or has expired.</Alert>
      <Link href="/login">
        <Button variant="secondary" fullWidth>
          Back to sign in
        </Button>
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Email verification">
      <Suspense fallback={<Alert tone="info">Loading…</Alert>}>
        <VerifyInner />
      </Suspense>
    </AuthShell>
  );
}
