import type { LucideIcon } from 'lucide-react';
import {
  Braces,
  Coffee,
  Code2,
  Database,
  FileCode2,
  FileText,
  Globe,
  Terminal,
} from 'lucide-react';
import type { CodeLanguage } from '@/lib/lms-learning-api';

export const LANG_META: Record<
  CodeLanguage,
  {
    label: string;
    short: string;
    Icon: LucideIcon;
    /** Cover gradient for assignment cards */
    cover: string;
    chip: string;
    glow: string;
  }
> = {
  NONE: {
    label: 'Written',
    short: 'Text',
    Icon: FileText,
    cover: 'from-[#0f1e3d] via-[#1e3a8a] to-[#2563eb]',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-200',
    glow: 'shadow-glow-aqua',
  },
  PYTHON: {
    label: 'Python',
    short: 'Py',
    Icon: Terminal,
    cover: 'from-[#0f3d2e] via-[#059669] to-[#34d399]',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
    glow: 'shadow-glow-aqua',
  },
  JAVASCRIPT: {
    label: 'JavaScript',
    short: 'JS',
    Icon: Braces,
    cover: 'from-[#3d2e0f] via-[#d97706] to-[#fbbf24]',
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300',
    glow: 'shadow-glow-pink',
  },
  TYPESCRIPT: {
    label: 'TypeScript',
    short: 'TS',
    Icon: FileCode2,
    cover: 'from-[#0f1e3d] via-[#1d4ed8] to-[#60a5fa]',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300',
    glow: 'shadow-glow-aqua',
  },
  JAVA: {
    label: 'Java',
    short: 'Java',
    Icon: Coffee,
    cover: 'from-[#3d1a0f] via-[#ea580c] to-[#fb923c]',
    chip: 'bg-orange-100 text-orange-900 dark:bg-orange-400/15 dark:text-orange-300',
    glow: 'shadow-glow-pink',
  },
  C: {
    label: 'C',
    short: 'C',
    Icon: Code2,
    cover: 'from-[#1e293b] via-[#475569] to-[#94a3b8]',
    chip: 'bg-slate-200 text-slate-800 dark:bg-slate-400/20 dark:text-slate-200',
    glow: 'shadow-glow-aqua',
  },
  CPP: {
    label: 'C++',
    short: 'C++',
    Icon: Code2,
    cover: 'from-[#1e1b4b] via-[#4f46e5] to-[#a5b4fc]',
    chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300',
    glow: 'shadow-glow-aqua',
  },
  SQL: {
    label: 'SQL',
    short: 'SQL',
    Icon: Database,
    cover: 'from-[#083344] via-[#0891b2] to-[#67e8f9]',
    chip: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-400/15 dark:text-cyan-300',
    glow: 'shadow-glow-aqua',
  },
  WEB: {
    label: 'Web',
    short: 'Web',
    Icon: Globe,
    cover: 'from-[#4c0519] via-[#db2777] to-[#f9a8d4]',
    chip: 'bg-pink-100 text-pink-900 dark:bg-pink-400/15 dark:text-pink-300',
    glow: 'shadow-glow-pink',
  },
};

export function langOf(language?: CodeLanguage | null) {
  return LANG_META[language ?? 'NONE'];
}

export function scoreTone(percent: number) {
  if (percent >= 80) return 'text-emerald-600 dark:text-emerald-300';
  if (percent >= 50) return 'text-brand-600 dark:text-brand-300';
  return 'text-danger dark:text-red-300';
}
