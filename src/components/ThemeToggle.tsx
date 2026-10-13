'use client';
import { useEffect, useState } from 'react';

type Mode = 'system' | 'light' | 'dark';
const KEY = 'fdb-theme';
const NEXT: Record<Mode, Mode> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Mode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

function apply(mode: Mode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

/** Cycles System -> Light -> Dark. The choice is remembered in this browser; "System" follows the OS setting live. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    let saved: Mode = 'system';
    try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') saved = v; } catch {}
    setMode(saved);
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  function cycle() {
    const next = NEXT[mode];
    setMode(next);
    try { next === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, next); } catch {}
    apply(next);
  }

  const icon = {
    system: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
    light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  }[mode];

  return (
    <button type="button" onClick={cycle} title={`Theme: ${LABEL[mode]} (click to change)`} aria-label={`Theme: ${LABEL[mode]}. Click to change.`}
      className={`inline-grid h-8 w-8 place-items-center sm:h-9 sm:w-9 rounded-full border border-[#4a4a4a] text-white hover:bg-white/10 ${className}`}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
    </button>
  );
}
