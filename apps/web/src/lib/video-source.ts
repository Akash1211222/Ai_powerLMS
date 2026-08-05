/** Parse instructor video URLs into an in-app playable source. */

export type VideoSource =
  | { kind: 'youtube'; id: string; embedUrl: string }
  | { kind: 'vimeo'; id: string; embedUrl: string }
  | { kind: 'file'; url: string }
  | { kind: 'unknown'; url: string };

export function parseVideoUrl(raw: string | null | undefined): VideoSource | null {
  if (!raw?.trim()) return null;
  const url = raw.trim();

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id) return yt(id);
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/')[2];
        if (id) return yt(id);
      }
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2];
        if (id) return yt(id);
      }
      const id = u.searchParams.get('v');
      if (id) return yt(id);
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      const id = parts.find((p) => /^\d+$/.test(p));
      if (id) {
        return {
          kind: 'vimeo',
          id,
          embedUrl: `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0`,
        };
      }
    }

    if (/\.(mp4|webm|ogg)(\?|$)/i.test(u.pathname) || u.searchParams.has('file')) {
      return { kind: 'file', url };
    }

    // Treat direct media hosts / signed URLs as file when Content-Type isn't known.
    if (/cloudinary|mux\.com|storage\.googleapis|blob\.core\.windows|cdn/i.test(host)) {
      return { kind: 'file', url };
    }

    return { kind: 'unknown', url };
  } catch {
    return { kind: 'unknown', url };
  }
}

function yt(id: string): VideoSource {
  return {
    kind: 'youtube',
    id,
    embedUrl: `https://www.youtube.com/embed/${id}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1`,
  };
}

export function formatDuration(sec: number | null | undefined) {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatWatch(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
