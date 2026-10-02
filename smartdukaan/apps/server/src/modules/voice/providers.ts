/**
 * Speech provider abstractions + deterministic mocks (Phase 5).
 *
 * The PRIMARY path is device-native STT/TTS on the client (Capacitor plugins) —
 * the backend receives TEXT, not audio, by default. These server-side provider
 * interfaces exist for the optional approved cloud path and, crucially, for
 * deterministic tests: no automated test makes a paid speech call.
 */

export type SttStatus = 'success' | 'no_speech' | 'low_confidence' | 'timeout' | 'unavailable' | 'invalid' | 'cancelled' | 'rate_limited';

export interface SttResult {
  status: SttStatus;
  transcript: string;
  language: string | null;
  confidence: number;
  provider: string;
  modelVersion: string;
  partial: boolean;
}

export interface SpeechToTextProvider {
  readonly providerName: string;
  readonly supportsOffline: boolean;
  transcribe(input: { audioBase64?: string | null; hintLanguage?: string | null; text?: string | null }): Promise<SttResult>;
}

/** Deterministic mock STT — driven by sentinel tokens or by echoing supplied text. */
export class MockSttProvider implements SpeechToTextProvider {
  readonly providerName = 'mock-stt';
  readonly supportsOffline = true;
  async transcribe(input: { audioBase64?: string | null; hintLanguage?: string | null; text?: string | null }): Promise<SttResult> {
    const t = (input.text ?? '').trim();
    const base = { provider: this.providerName, modelVersion: '1', partial: false, language: input.hintLanguage ?? null };
    if (/MOCK_STT_TIMEOUT/i.test(t)) return { ...base, status: 'timeout', transcript: '', confidence: 0 };
    if (/MOCK_STT_UNAVAIL/i.test(t)) return { ...base, status: 'unavailable', transcript: '', confidence: 0 };
    if (/MOCK_STT_RATELIMIT/i.test(t)) return { ...base, status: 'rate_limited', transcript: '', confidence: 0 };
    if (!t) return { ...base, status: 'no_speech', transcript: '', confidence: 0 };
    if (/MOCK_STT_LOWCONF/i.test(t)) return { ...base, status: 'low_confidence', transcript: t, confidence: 0.2 };
    return { ...base, status: 'success', transcript: t, confidence: 0.9 };
  }
}

export type TtsStatus = 'success' | 'unsupported_language' | 'unavailable' | 'cancelled';
export interface TtsResult { status: TtsStatus; provider: string; durationMs: number }

export interface TextToSpeechProvider {
  readonly providerName: string;
  readonly supportsOffline: boolean;
  speak(input: { text: string; language?: string | null }): Promise<TtsResult>;
  stop(): Promise<void>;
}

/** Deterministic mock TTS. The REAL device TTS runs client-side; this is for tests. */
export class MockTtsProvider implements TextToSpeechProvider {
  readonly providerName = 'mock-tts';
  readonly supportsOffline = true;
  async speak(input: { text: string; language?: string | null }): Promise<TtsResult> {
    if (/MOCK_TTS_UNAVAIL/i.test(input.text)) return { status: 'unavailable', provider: this.providerName, durationMs: 0 };
    return { status: 'success', provider: this.providerName, durationMs: Math.min(6000, input.text.length * 40) };
  }
  async stop(): Promise<void> { /* no-op for mock */ }
}

let sttOverride: SpeechToTextProvider | null = null;
export function setSttProvider(p: SpeechToTextProvider | null): void { sttOverride = p; }
export function getSttProvider(): SpeechToTextProvider { return sttOverride ?? new MockSttProvider(); }
