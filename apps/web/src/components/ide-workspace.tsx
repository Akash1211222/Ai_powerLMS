'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { Alert, Button, cn } from '@fca/ui';
import { ideApi } from '@/lib/ide-api';

/**
 * The learner's own VS Code, framed in the page.
 *
 * The frame is a different origin (the API serves it), so the workbench can
 * reach nothing of the LMS page and the page nothing of it. Fullscreen is a
 * CSS overlay rather than the Fullscreen API so the frame is never remounted
 * — remounting would reload the whole workbench and drop terminal sessions.
 */
export function IdeWorkspace({ className }: { className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const open = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setUrl((await ideApi.open()).url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start your workspace');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void open();
  }, [open]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && e.shiftKey && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  async function restart() {
    setUrl(null);
    setBusy(true);
    await ideApi.stop().catch(() => undefined);
    await open();
  }

  async function popOut() {
    // Opened before the await so the popup blocker sees a user gesture.
    const tab = window.open('about:blank', '_blank');
    try {
      const next = (await ideApi.open()).url;
      if (tab) tab.location.href = next;
      else window.location.href = next;
    } catch {
      tab?.close();
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden border border-hair bg-[#181818] shadow-card',
        fullscreen
          ? 'fixed inset-0 z-50 rounded-none'
          : 'h-[calc(100vh-14rem)] min-h-[560px] rounded-card',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-full bg-[#0078d4]/25 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#6cb6ff]">
            VS Code
          </span>
          <span className="truncate text-xs font-medium text-white/50">
            Your workspace — extensions, terminal, any language. Files are saved between visits.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Restart workspace" onClick={restart} disabled={busy}>
            <RotateCcw className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton label="Open in a new tab" onClick={popOut} disabled={busy || !url}>
            <ExternalLink className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton
            label={fullscreen ? 'Exit full screen (Shift + Esc)' : 'Full screen'}
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" aria-hidden />
            ) : (
              <Maximize2 className="h-4 w-4" aria-hidden />
            )}
          </IconButton>
        </div>
      </div>

      <div className="relative flex-1">
        {url && (
          <iframe
            key={url}
            title="VS Code workspace"
            src={url}
            className="absolute inset-0 h-full w-full border-0"
            allow="clipboard-read; clipboard-write"
          />
        )}
        {busy && !url && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/60">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <p className="text-sm">Starting your workspace…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
            <Alert tone="error">{error}</Alert>
            <Button size="sm" variant="secondary" onClick={open}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}
