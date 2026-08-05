'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Radio, Sparkles, X } from 'lucide-react';
import { Spinner, cn } from '@fca/ui';
import { notificationsApi, type Notification } from '@/lib/notifications-api';
import { notificationMeta, relativeWhen, resolveNotificationHref } from '@/lib/notification-utils';
import { playNotificationChime, unlockNotificationAudio } from '@/lib/notification-sound';

/**
 * Futuristic signal inbox — live unread badge, chime on new signals,
 * click opens the related task and marks read.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);
  const qc = useQueryClient();
  const router = useRouter();
  const prevUnread = useRef<number | null>(null);
  const primed = useRef(false);

  const countQuery = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: open ? 10_000 : 15_000,
    refetchIntervalInBackground: false,
  });

  const listQuery = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: notificationsApi.list,
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications', 'count'] });
    qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
  };

  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });

  const unread = countQuery.data?.unread ?? 0;
  const items = listQuery.data?.data ?? [];

  // Chime + floating toast when unread rises (new signal arrived).
  useEffect(() => {
    const current = countQuery.data?.unread;
    if (typeof current !== 'number') return;

    if (prevUnread.current === null) {
      prevUnread.current = current;
      return;
    }

    if (current > prevUnread.current) {
      playNotificationChime();
      // Pull freshest item for toast (best-effort).
      notificationsApi
        .list()
        .then((res) => {
          const newest = res.data.find((n) => !n.readAt) ?? res.data[0];
          if (newest) {
            setToast(newest);
            window.setTimeout(() => setToast((t) => (t?.id === newest.id ? null : t)), 5200);
          }
        })
        .catch(() => undefined);
    }
    prevUnread.current = current;
  }, [countQuery.data?.unread]);

  const primeAudio = () => {
    if (primed.current) return;
    primed.current = true;
    void unlockNotificationAudio();
  };

  const openSignal = async (n: Notification) => {
    primeAudio();
    const href = resolveNotificationHref(n.type, n.deepLink);
    if (!n.readAt) {
      try {
        await markRead.mutateAsync(n.id);
      } catch {
        /* still navigate */
      }
    }
    setOpen(false);
    setToast(null);
    router.push(href);
  };

  return (
    <div className="relative" onPointerDown={primeAudio}>
      <button
        type="button"
        onClick={() => {
          primeAudio();
          setOpen((o) => !o);
        }}
        className={cn(
          'notif-bell relative flex h-10 w-10 items-center justify-center rounded-panel border border-hair bg-panel transition',
          'hover:border-brand-300 hover:bg-chip',
          open && 'border-brand-400 bg-chip shadow-glow',
          unread > 0 && 'notif-bell-live',
        )}
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className={cn('h-[18px] w-[18px]', unread > 0 ? 'text-brand-500' : 'text-ink')} aria-hidden />
        {unread > 0 && (
          <span className="notif-badge absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-grad-sunset px-1 text-[10px] font-extrabold text-white shadow-glow">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="notif-panel absolute right-0 z-40 mt-2 w-[min(100vw-1.5rem,380px)] overflow-hidden rounded-card border border-hair shadow-card">
            <div className="notif-panel-head relative overflow-hidden px-4 py-3.5 text-white">
              <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -left-6 bottom-0 h-20 w-20 rounded-full bg-accent-400/30 blur-2xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">
                    <Radio className="h-3 w-3" aria-hidden /> Signal inbox
                  </div>
                  <div className="mt-0.5 font-display text-lg font-extrabold">
                    {unread > 0 ? `${unread} live signal${unread === 1 ? '' : 's'}` : 'All clear'}
                  </div>
                  <p className="text-xs text-white/65">Tap a signal to open the task</p>
                </div>
                <div className="flex items-center gap-1">
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={() => markAll.mutate()}
                      disabled={markAll.isPending}
                      className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white ring-1 ring-inset ring-white/20 hover:bg-white/25"
                    >
                      <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                      Clear all
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                    className="rounded-full p-1.5 text-white/70 hover:bg-white/15 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="max-h-[min(70vh,420px)] overflow-y-auto bg-panel">
              {listQuery.isLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <Sparkles className="h-7 w-7 text-brand-400" aria-hidden />
                  <p className="font-display font-bold">You’re all caught up</p>
                  <p className="text-sm text-faint">New class, assignment, and mentor signals land here.</p>
                </div>
              ) : (
                <ul className="flex flex-col p-2">
                  {items.map((n) => {
                    const meta = notificationMeta(n.type);
                    const Icon = meta.icon;
                    const unreadItem = !n.readAt;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openSignal(n)}
                          className={cn(
                            'notif-row group flex w-full items-start gap-3 rounded-panel px-3 py-3 text-left transition',
                            unreadItem
                              ? 'bg-soft ring-1 ring-inset ring-brand-400/35 hover:bg-chip'
                              : 'hover:bg-soft',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-panel text-white shadow-card',
                              meta.accent,
                            )}
                          >
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-bold text-ink">{n.title}</span>
                              {unreadItem && (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                              )}
                            </span>
                            <span className="mt-0.5 line-clamp-2 text-xs font-medium text-faint">{n.body}</span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-faint">
                              <span className="rounded-full bg-chip px-1.5 py-0.5 text-brand-600 dark:text-brand-300">
                                {meta.label}
                              </span>
                              <span>{relativeWhen(n.createdAt)}</span>
                              <span className="text-brand-600 opacity-0 transition group-hover:opacity-100 dark:text-brand-300">
                                Open →
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="notif-toast fixed bottom-5 right-5 z-50 flex w-[min(100vw-2rem,360px)] items-start gap-3 rounded-card border border-hair bg-panel p-3.5 shadow-card">
          <button
            type="button"
            onClick={() => openSignal(toast)}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-grad-holo text-white shadow-glow">
              <Bell className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent-500">New signal</span>
              <span className="mt-0.5 block truncate font-display text-sm font-bold">{toast.title}</span>
              <span className="mt-0.5 line-clamp-2 text-xs text-faint">{toast.body}</span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToast(null)}
            className="rounded-full p-1 text-faint hover:bg-chip hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
