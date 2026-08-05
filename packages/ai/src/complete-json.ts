/**
 * Shared LLM JSON completion helpers. Supports Anthropic Messages API and
 * Google Gemini generateContent — selected via AI_PROVIDER + keys.
 */

export type LlmKind = 'anthropic' | 'gemini' | 'heuristic';

export interface LlmConfig {
  kind: Exclude<LlmKind, 'heuristic'>;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const kind = (env.AI_PROVIDER ?? 'heuristic').toLowerCase();
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? 60_000);

  if (kind === 'gemini') {
    const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_AI_API_KEY;
    if (!apiKey) return null;
    return {
      kind: 'gemini',
      apiKey,
      model: env.AI_DEFAULT_MODEL ?? 'gemini-flash-lite-latest',
      timeoutMs,
    };
  }

  if (kind === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return {
      kind: 'anthropic',
      apiKey,
      model: env.AI_DEFAULT_MODEL ?? 'claude-opus-4-8',
      timeoutMs,
    };
  }

  return null;
}

export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim() ?? text;
  const startObj = raw.indexOf('{');
  const startArr = raw.indexOf('[');
  let start = -1;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);
  const endObj = raw.lastIndexOf('}');
  const endArr = raw.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object/array in AI response');
  }
  return raw.slice(start, end + 1);
}

export async function completeJson(
  system: string,
  user: string,
  maxTokens: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  const cfg = resolveLlmConfig(env);
  if (!cfg) throw new Error('No LLM configured');

  if (cfg.kind === 'gemini') {
    return completeGemini(cfg, system, user, maxTokens);
  }
  return completeAnthropic(cfg, system, user, maxTokens);
}

async function completeGemini(
  cfg: LlmConfig,
  system: string,
  user: string,
  maxTokens: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return JSON.parse(extractJson(text));
  } finally {
    clearTimeout(timer);
  }
}

async function completeAnthropic(
  cfg: LlmConfig,
  system: string,
  user: string,
  maxTokens: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
    return JSON.parse(extractJson(text));
  } finally {
    clearTimeout(timer);
  }
}
