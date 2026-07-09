import type { AIProvider } from './provider';
import { HeuristicProvider } from './heuristic-provider';
import { AnthropicProvider } from './anthropic-provider';

/**
 * Selects the AI provider from environment (§3). Falls back to the deterministic
 * heuristic when no key is configured, so dev/CI run the full pipeline without
 * external calls.
 */
export function getProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  const kind = env.AI_PROVIDER ?? 'heuristic';
  const key = env.ANTHROPIC_API_KEY;
  const model = env.AI_DEFAULT_MODEL ?? 'claude-opus-4-8';
  const timeout = Number(env.AI_REQUEST_TIMEOUT_MS ?? 60_000);

  if (kind === 'anthropic' && key) {
    return new AnthropicProvider(key, model, timeout);
  }
  return new HeuristicProvider();
}
