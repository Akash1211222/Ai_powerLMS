'use client';

import { Card } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';

/**
 * Authenticated landing page. Renders REAL data from /auth/me (identity, roles,
 * resolved permissions) — no mock metrics. Role-specific dashboards (student,
 * trainer, admin) with real aggregated data are built in Phase 1.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const firstName = user.profile?.firstName ?? user.email;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Welcome, {firstName} 👋</h1>
        <p className="mt-1 text-faint">
          You&apos;re signed in. Role-specific dashboards arrive in Phase 1.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-faint">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-faint">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-faint">Status</dt>
              <dd className="font-medium">{user.status}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-faint">Roles</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {user.roles.length === 0 && <span className="text-sm text-faint">No roles assigned</span>}
            {user.roles.map((r, i) => (
              <span
                key={`${r.role}-${i}`}
                className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-600"
              >
                {r.role}
                {r.organizationName ? ` · ${r.organizationName}` : ''}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-faint">Your permissions ({user.permissions.length})</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.permissions.map((p) => (
            <code key={p} className="rounded-md bg-soft px-2 py-1 text-xs text-ink">
              {p}
            </code>
          ))}
        </div>
      </Card>
    </div>
  );
}
