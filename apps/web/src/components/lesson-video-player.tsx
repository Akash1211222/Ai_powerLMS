'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@fca/ui';
import { parseVideoUrl, type VideoSource } from '@/lib/video-source';

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (e: { target: YtPlayer }) => void;
            onStateChange?: (e: { data: number; target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
  seekTo: (sec: number, allowSeek: boolean) => void;
}

let ytApiPromise: Promise<void> | null = null;

function loadYtApi() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

export interface LessonVideoPlayerProps {
  contentUrl: string;
  title: string;
  /** Resume position in seconds. */
  startAt?: number;
  durationSec?: number | null;
  className?: string;
  onProgress: (payload: { positionSec: number; watchedSec: number; completed?: boolean }) => void;
}

/**
 * In-app lesson video — YouTube (IFrame API), Vimeo embed + focus time,
 * or native HTML5 for MP4/WebM. Emits progress for LMS tracking.
 */
export function LessonVideoPlayer({
  contentUrl,
  title,
  startAt = 0,
  durationSec,
  className,
  onProgress,
}: LessonVideoPlayerProps) {
  const source = parseVideoUrl(contentUrl);

  if (!source) {
    return (
      <div className={cn('flex aspect-video items-center justify-center rounded-card bg-ink/90 text-sm text-white/70', className)}>
        No video attached yet.
      </div>
    );
  }

  if (source.kind === 'youtube') {
    return (
      <YoutubePlayer
        source={source}
        title={title}
        startAt={startAt}
        durationSec={durationSec}
        className={className}
        onProgress={onProgress}
      />
    );
  }

  if (source.kind === 'file') {
    return (
      <NativePlayer
        url={source.url}
        title={title}
        startAt={startAt}
        durationSec={durationSec}
        className={className}
        onProgress={onProgress}
      />
    );
  }

  // Vimeo / unknown — embed + active watch-time heartbeat
  return (
    <EmbedHeartbeatPlayer
      source={source}
      title={title}
      startAt={startAt}
      durationSec={durationSec}
      className={className}
      onProgress={onProgress}
    />
  );
}

function YoutubePlayer({
  source,
  title,
  startAt,
  durationSec,
  className,
  onProgress,
}: {
  source: Extract<VideoSource, { kind: 'youtube' }>;
  title: string;
  startAt: number;
  durationSec?: number | null;
  className?: string;
  onProgress: LessonVideoPlayerProps['onProgress'];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const maxWatched = useRef(startAt);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    let cancelled = false;
    let tick: number | undefined;

    loadYtApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT) return;
      const player = new window.YT.Player(hostRef.current, {
        videoId: source.id,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: Math.floor(Math.max(0, startAt)),
        },
        events: {
          onReady: (e) => {
            if (startAt > 0) e.target.seekTo(startAt, true);
          },
          onStateChange: (e) => {
            const YT = window.YT!;
            if (e.data === YT.PlayerState.ENDED) {
              const dur = Math.floor(e.target.getDuration() || durationSec || 0);
              maxWatched.current = Math.max(maxWatched.current, dur);
              onProgressRef.current({
                positionSec: dur,
                watchedSec: maxWatched.current,
                completed: true,
              });
            }
          },
        },
      });
      playerRef.current = player;

      tick = window.setInterval(() => {
        const p = playerRef.current;
        if (!p || typeof p.getCurrentTime !== 'function') return;
        try {
          const pos = Math.floor(p.getCurrentTime() || 0);
          const dur = Math.floor(p.getDuration() || durationSec || 0);
          const playing = p.getPlayerState() === window.YT!.PlayerState.PLAYING;
          if (playing) {
            maxWatched.current = Math.max(maxWatched.current, pos);
            onProgressRef.current({
              positionSec: pos,
              watchedSec: maxWatched.current,
              completed: dur > 0 && maxWatched.current >= Math.floor(dur * 0.9),
            });
          }
        } catch {
          /* player mid-destroy */
        }
      }, 5000);
    });

    return () => {
      cancelled = true;
      if (tick) window.clearInterval(tick);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount when video id changes
  }, [source.id]);

  return (
    <div className={cn('lesson-stage overflow-hidden rounded-card bg-black shadow-card', className)}>
      <div className="relative aspect-video w-full">
        <div ref={hostRef} className="absolute inset-0 h-full w-full" title={title} />
      </div>
    </div>
  );
}

function NativePlayer({
  url,
  title,
  startAt,
  durationSec,
  className,
  onProgress,
}: {
  url: string;
  title: string;
  startAt: number;
  durationSec?: number | null;
  className?: string;
  onProgress: LessonVideoPlayerProps['onProgress'];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxWatched = useRef(startAt);
  const lastEmit = useRef(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || startAt <= 0) return;
    const seek = () => {
      if (Math.abs(v.currentTime - startAt) > 1.5) v.currentTime = startAt;
    };
    v.addEventListener('loadedmetadata', seek);
    return () => v.removeEventListener('loadedmetadata', seek);
  }, [startAt, url]);

  const emit = (completed?: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    const pos = Math.floor(v.currentTime || 0);
    maxWatched.current = Math.max(maxWatched.current, pos);
    const now = Date.now();
    if (!completed && now - lastEmit.current < 4000) return;
    lastEmit.current = now;
    const dur = Math.floor(v.duration || durationSec || 0);
    onProgress({
      positionSec: pos,
      watchedSec: maxWatched.current,
      completed: completed || (dur > 0 && maxWatched.current >= Math.floor(dur * 0.9)),
    });
  };

  return (
    <div className={cn('lesson-stage overflow-hidden rounded-card bg-black shadow-card', className)}>
      <video
        ref={videoRef}
        className="aspect-video w-full"
        src={url}
        controls
        playsInline
        preload="metadata"
        title={title}
        onTimeUpdate={() => emit()}
        onPause={() => emit()}
        onEnded={() => emit(true)}
      />
    </div>
  );
}

function EmbedHeartbeatPlayer({
  source,
  title,
  startAt,
  durationSec,
  className,
  onProgress,
}: {
  source: Extract<VideoSource, { kind: 'vimeo' | 'unknown' }>;
  title: string;
  startAt: number;
  durationSec?: number | null;
  className?: string;
  onProgress: LessonVideoPlayerProps['onProgress'];
}) {
  const [active, setActive] = useState(true);
  const watched = useRef(startAt);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const embedUrl = source.kind === 'vimeo' ? source.embedUrl : source.url;

  useEffect(() => {
    const onVis = () => setActive(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      watched.current += 5;
      const dur = durationSec ?? 0;
      onProgressRef.current({
        positionSec: watched.current,
        watchedSec: watched.current,
        completed: dur > 0 && watched.current >= Math.floor(dur * 0.9),
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [active, durationSec]);

  return (
    <div className={cn('lesson-stage overflow-hidden rounded-card bg-black shadow-card', className)}>
      <iframe
        src={embedUrl}
        title={title}
        className="aspect-video w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
