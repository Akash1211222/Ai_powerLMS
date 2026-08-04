'use client';

import { useEffect, useState } from 'react';
import { IconSun, IconMoon } from './icons';

/** Light/dark toggle that flips `.dark` on <html> and persists the choice. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('fca.theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-hair bg-panel text-faint transition hover:bg-soft hover:text-ink"
    >
      {dark ? <IconSun width={17} height={17} /> : <IconMoon width={17} height={17} />}
    </button>
  );
}
