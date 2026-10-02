/**
 * Provider factory. Selects the configured cloud vision provider. Defaults to
 * the deterministic mock so no environment can incur real spend without an
 * explicit AI_PROVIDER=gemini + GEMINI_API_KEY. Tests can inject a provider.
 */
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import type { CloudVisionProvider } from './types.js';
import { MockCloudProvider } from './mock.provider.js';
import { GeminiCloudProvider } from './gemini.provider.js';

let override: CloudVisionProvider | null = null;

/** Test hook — inject a provider (e.g. a scripted mock) for a single run. */
export function setCloudProvider(p: CloudVisionProvider | null): void {
  override = p;
}

export function getCloudProvider(): CloudVisionProvider {
  if (override) return override;
  if (env.ai.provider === 'gemini') {
    if (!env.ai.geminiApiKey) {
      logger.warn('AI_PROVIDER=gemini but no GEMINI_API_KEY set; falling back to mock provider');
      return new MockCloudProvider();
    }
    return new GeminiCloudProvider(env.ai.geminiApiKey);
  }
  return new MockCloudProvider();
}
