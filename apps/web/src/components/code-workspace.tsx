'use client';

import { useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { sql } from '@codemirror/lang-sql';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { Play, Loader2, Terminal } from 'lucide-react';
import { Button, cn } from '@fca/ui';
import { codeApi, type CodeLanguage, type RunCodeResult } from '@/lib/lms-learning-api';

const LANG_LABEL: Record<Exclude<CodeLanguage, 'NONE'>, string> = {
  PYTHON: 'Python',
  JAVASCRIPT: 'JavaScript',
  TYPESCRIPT: 'TypeScript',
  JAVA: 'Java',
  C: 'C',
  CPP: 'C++',
  SQL: 'SQL',
  WEB: 'HTML / CSS / JS',
};

function extensionsFor(language: Exclude<CodeLanguage, 'NONE'>) {
  switch (language) {
    case 'PYTHON':
      return [python()];
    case 'JAVA':
      return [java()];
    case 'C':
    case 'CPP':
      return [cpp()];
    case 'SQL':
      return [sql()];
    case 'WEB':
      return [html()];
    case 'TYPESCRIPT':
      return [javascript({ typescript: true })];
    case 'JAVASCRIPT':
    default:
      return [javascript()];
  }
}

export function CodeWorkspace({
  language,
  value,
  onChange,
  onOutput,
  readOnly = false,
}: {
  language: Exclude<CodeLanguage, 'NONE'>;
  value: string;
  onChange: (v: string) => void;
  onOutput?: (result: RunCodeResult) => void;
  readOnly?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunCodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const extensions = useMemo(() => extensionsFor(language), [language]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await codeApi.run({ language, source: value });
      setResult(res);
      onOutput?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run code');
    } finally {
      setRunning(false);
    }
  }

  const consoleText = result
    ? [
        result.compileOutput ? `── compile ──\n${result.compileOutput}` : '',
        result.stdout ? `── stdout ──\n${result.stdout}` : '',
        result.stderr ? `── stderr ──\n${result.stderr}` : '',
        `exit: ${result.exitCode}${result.timedOut ? ' (timeout)' : ''}`,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    <div className="overflow-hidden rounded-card border border-hair bg-[#0f1e3d] shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-accent-500/20 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-accent-300">
            {LANG_LABEL[language]} compiler
          </span>
          <span className="text-xs font-medium text-white/50">AI-ready sandbox</span>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            onClick={run}
            disabled={running || !value.trim()}
            className="!bg-grad-brand !shadow-glow"
          >
            {running ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Play className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            {running ? 'Running…' : 'Run'}
          </Button>
        )}
      </div>

      <CodeMirror
        value={value}
        height="340px"
        theme={oneDark}
        extensions={extensions}
        editable={!readOnly}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          autocompletion: true,
        }}
      />

      {language === 'WEB' && result?.previewHtml && (
        <div className="border-t border-white/10 bg-white">
          <div className="border-b border-hair px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">
            Live preview
          </div>
          <iframe
            title="Web preview"
            sandbox="allow-scripts"
            className="h-64 w-full"
            srcDoc={result.previewHtml}
          />
        </div>
      )}

      <div className="border-t border-white/10 bg-black/40 px-4 py-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/50">
          <Terminal className="h-3.5 w-3.5" aria-hidden /> Console
        </div>
        {error && <p className="font-mono text-xs text-danger">{error}</p>}
        {!error && !consoleText && (
          <p className="text-xs text-white/40">Click Run to execute your code.</p>
        )}
        {consoleText && (
          <pre
            className={cn(
              'max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap',
              result && result.exitCode !== 0 ? 'text-amber-300' : 'text-emerald-300',
            )}
          >
            {consoleText}
          </pre>
        )}
      </div>
    </div>
  );
}
