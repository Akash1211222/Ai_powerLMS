'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

/**
 * Removal control for community content, shown only to holders of
 * `community:moderate`.
 *
 * Hiding it from everyone else is a courtesy, not the control: the API
 * enforces the permission independently, so a member who forges the request
 * still gets a 403.
 *
 * Requires an explicit confirm because removal is not something the author can
 * undo themselves — it takes a moderator, and there is no in-app restore yet.
 */
export function ModerateButton({
  onRemove,
  label,
  pending,
  className,
}: {
  onRemove: () => void;
  label: string;
  pending?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);

  if (!user?.permissions.includes('community:moderate')) return null;

  if (confirming) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-x-2 whitespace-nowrap text-xs ${className ?? ''}`}>
        <span className="text-faint">{label}?</span>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onRemove();
          }}
          disabled={pending}
          className="font-semibold text-danger hover:underline disabled:opacity-50"
        >
          {pending ? 'Removing…' : 'Yes, remove'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-faint hover:underline"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title="Remove this content (moderator)"
      className={`text-xs font-semibold text-faint transition hover:text-danger ${className ?? ''}`}
    >
      Remove
    </button>
  );
}
