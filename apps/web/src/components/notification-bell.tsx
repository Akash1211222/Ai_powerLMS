'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@fca/ui';
import { notificationsApi } from '@/lib/notifications-api';
import { formatDate, formatTime } from '@/lib/format';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  // Poll the unread count for the badge (push-ready; WS can replace this later).
  const countQuery = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 30_000,
  });
  const listQuery = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: notificationsApi.list,
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications', 'count'] });
    qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
  };
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });

  const unread = countQuery.data?.unread ?? 0;
  const items = listQuery.data?.data ?? [];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-hair bg-panel transition hover:bg-soft"
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3a6 6 0 0 0-6 6v3l-1.5 3h15L18 12V9a6 6 0 0 0-6-6Zm0 18a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Z"
            fill="currentColor"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <Card className="absolute right-0 z-20 mt-2 w-80 p-0">
            <div className="flex items-center justify-between border-b border-hair px-4 py-3">
              <span className="font-bold">Notifications</span>
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  className="text-xs font-semibold text-brand-500"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {listQuery.isLoading ? (
                <p className="px-4 py-6 text-center text-sm text-faint">Loading…</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-faint">You’re all caught up.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.readAt && markRead.mutate(n.id)}
                    className={`block w-full border-b border-hair px-4 py-3 text-left transition hover:bg-soft ${
                      n.readAt ? '' : 'bg-chip'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                      <div>
                        <div className="text-sm font-semibold">{n.title}</div>
                        <div className="text-xs text-faint">{n.body}</div>
                        <div className="mt-0.5 text-[11px] text-faint">
                          {formatDate(n.createdAt)} · {formatTime(n.createdAt)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
