'use client';

import { useEffect } from 'react';

/**
 * FutureCorp Academy site FX — ported from futurecorpacademy.in/assets/site-fx.js
 * - Soft cursor glow + ring with spark trail (fine pointers only)
 * - Die-cut sticker stamp + ripple on click
 */
export function SiteFx() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as Window & { __fcFx?: boolean }).__fcFx) return;
    (window as Window & { __fcFx?: boolean }).__fcFx = true;

    const body = document.body;
    const coarse = window.matchMedia('(pointer:coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cleanups: Array<() => void> = [];

    /* ---------- cursor glow + ring (fine pointers only) ---------- */
    if (!coarse && !reduced) {
      const glow = document.createElement('div');
      glow.setAttribute('aria-hidden', 'true');
      glow.style.cssText =
        'position:fixed;top:0;left:0;width:46px;height:46px;border-radius:50%;pointer-events:none;z-index:99998;transform:translate(-50%,-50%);background:radial-gradient(circle at 40% 35%,rgba(255,224,190,.95),rgba(249,115,22,.55) 45%,rgba(37,99,235,.25) 75%,transparent 78%);mix-blend-mode:screen;filter:blur(2px);opacity:0;transition:width .22s ease,height .22s ease,opacity .3s ease';
      body.appendChild(glow);

      const ring = document.createElement('div');
      ring.setAttribute('aria-hidden', 'true');
      ring.style.cssText =
        'position:fixed;top:0;left:0;width:12px;height:12px;border-radius:50%;pointer-events:none;z-index:99999;transform:translate(-50%,-50%);border:2px solid rgba(37,99,235,.75);opacity:0;transition:opacity .3s ease';
      body.appendChild(ring);

      let mx = innerWidth / 2;
      let my = innerHeight / 2;
      let gx = mx;
      let gy = my;
      let rx = mx;
      let ry = my;
      let lastSpark = 0;
      let raf = 0;
      let running = true;

      const onMove = (e: MouseEvent) => {
        mx = e.clientX;
        my = e.clientY;
        glow.style.opacity = '0.9';
        ring.style.opacity = '1';
        const t = Date.now();
        if (t - lastSpark > 55) {
          lastSpark = t;
          spark(e.clientX, e.clientY);
        }
      };

      const onLeave = () => {
        glow.style.opacity = '0';
        ring.style.opacity = '0';
      };

      const onOver = (e: MouseEvent) => {
        const target = e.target as Element | null;
        const hot = target?.closest?.('a,button,input,label,textarea,select,[role=button]');
        glow.style.width = glow.style.height = hot ? '74px' : '46px';
        ring.style.borderColor = hot ? 'rgba(249,115,22,.85)' : 'rgba(37,99,235,.75)';
      };

      function spark(x: number, y: number) {
        const s = document.createElement('div');
        const c = Math.random() < 0.5 ? '#f97316' : '#2563eb';
        s.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:6px;height:6px;border-radius:50%;background:${c};pointer-events:none;z-index:99997;transform:translate(-50%,-50%);will-change:transform,opacity`;
        body.appendChild(s);
        const dx = (Math.random() - 0.5) * 34;
        const dy = (Math.random() - 0.5) * 24 + 14;
        s.animate(
          [
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.85 },
            {
              transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(0)`,
              opacity: 0,
            },
          ],
          { duration: 680, easing: 'cubic-bezier(.2,.7,.3,1)' },
        ).onfinish = () => s.remove();
      }

      const loop = () => {
        if (!running) return;
        gx += (mx - gx) * 0.15;
        gy += (my - gy) * 0.15;
        rx += (mx - rx) * 0.35;
        ry += (my - ry) * 0.35;
        glow.style.left = `${gx}px`;
        glow.style.top = `${gy}px`;
        ring.style.left = `${rx}px`;
        ring.style.top = `${ry}px`;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      addEventListener('mousemove', onMove, { passive: true });
      document.addEventListener('mouseleave', onLeave);
      addEventListener('mouseover', onOver, { passive: true });

      cleanups.push(() => {
        running = false;
        cancelAnimationFrame(raf);
        removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseleave', onLeave);
        removeEventListener('mouseover', onOver);
        glow.remove();
        ring.remove();
      });
    }

    /* ---------- click sticker stamp ---------- */
    type Sticker = { e: string; bg: string };
    const STICKERS: Sticker[] = [
      { e: '👍', bg: 'radial-gradient(circle at 35% 28%,#5aa0ff,#2563eb 70%)' },
      { e: '🔥', bg: 'radial-gradient(circle at 35% 28%,#ffb457,#f97316 68%)' },
      { e: '⭐', bg: 'radial-gradient(circle at 35% 28%,#ffd77a,#f5a623 70%)' },
      { e: '🚀', bg: 'radial-gradient(circle at 35% 28%,#7db4ff,#3b6fe0 70%)' },
      { e: '💯', bg: 'radial-gradient(circle at 35% 28%,#ff8a8a,#e0334b 70%)' },
      { e: '✨', bg: 'radial-gradient(circle at 35% 28%,#a6d3ff,#2563eb 72%)' },
    ];
    const CHECK: Sticker = {
      e: '✓',
      bg: 'radial-gradient(circle at 35% 28%,#3ddc84,#16a34a 70%)',
    };

    function stampAt(x: number, y: number, onControl: boolean) {
      if (reduced) return;
      const rot = Math.random() * 30 - 15;
      const pick = onControl ? CHECK : STICKERS[Math.floor(Math.random() * STICKERS.length)]!;
      const sz = 58;

      const wrap = document.createElement('div');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:100000;pointer-events:none;width:${sz}px;height:${sz}px;filter:drop-shadow(0 10px 14px rgba(15,30,61,.35));will-change:transform,opacity`;

      const face = document.createElement('div');
      face.style.cssText = `position:absolute;inset:0;border-radius:20px;background:${pick.bg};border:4px solid #fff;box-shadow:inset 0 -6px 12px rgba(0,0,0,.22),inset 0 5px 10px rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;font-size:28px;line-height:1;${
        pick === CHECK ? 'font-weight:900;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.25);' : ''
      }`;
      face.textContent = pick.e;

      const gloss = document.createElement('div');
      gloss.style.cssText =
        'position:absolute;top:5px;left:7px;right:16px;height:38%;border-radius:16px 16px 60% 60%/16px 16px 30% 30%;background:linear-gradient(180deg,rgba(255,255,255,.6),rgba(255,255,255,0));pointer-events:none;';

      const peel = document.createElement('div');
      peel.style.cssText =
        'position:absolute;right:-1px;bottom:-1px;width:16px;height:16px;background:linear-gradient(135deg,rgba(255,255,255,.15),#e9eef7);border-radius:0 0 20px 0;box-shadow:-3px -3px 6px rgba(0,0,0,.18);transform:skew(-6deg,-6deg);';

      face.appendChild(gloss);
      wrap.appendChild(face);
      wrap.appendChild(peel);
      body.appendChild(wrap);

      const base = `translate(-50%,-50%) rotate(${rot}deg)`;
      wrap.animate(
        [
          { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(0)`, opacity: 0 },
          {
            transform: `translate(-50%,-50%) rotate(${rot - 4}deg) scale(1.22)`,
            opacity: 1,
            offset: 0.5,
          },
          { transform: `${base} scale(1)`, opacity: 1, offset: 0.68 },
          { transform: `${base} scale(1)`, opacity: 1, offset: 0.82 },
          {
            transform: `translate(-50%,-118%) rotate(${rot}deg) scale(.82)`,
            opacity: 0,
          },
        ],
        { duration: 1050, easing: 'cubic-bezier(.2,.9,.25,1.15)' },
      ).onfinish = () => wrap.remove();

      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:99999;pointer-events:none;width:30px;height:30px;border-radius:50%;border:2px solid ${
        onControl ? 'rgba(22,163,74,.55)' : 'rgba(37,99,235,.55)'
      };transform:translate(-50%,-50%)`;
      body.appendChild(r);
      r.animate(
        [
          { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0.8 },
          { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 },
        ],
        { duration: 640, easing: 'ease-out' },
      ).onfinish = () => r.remove();
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const onControl = !!target?.closest?.('a,button,input,label,[role=button]');
      stampAt(e.clientX, e.clientY, onControl);
    };
    addEventListener('click', onClick);
    cleanups.push(() => removeEventListener('click', onClick));

    return () => {
      cleanups.forEach((fn) => fn());
      (window as Window & { __fcFx?: boolean }).__fcFx = false;
    };
  }, []);

  return null;
}
