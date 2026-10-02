/**
 * On-device OCR provider abstraction (Phase 3).
 *
 * The recognition PIPELINE (extraction → candidate scoring → confidence →
 * confirmation) runs server-side over whatever text an OCR source produced, so
 * the UI and API never depend on a specific OCR library.
 *
 * Concrete on-device OCR status: no Capacitor-6-compatible MLKit text
 * recognition plugin exists (`@capacitor-mlkit/text-recognition` v8 requires
 * Capacitor 8). Rather than force a risky Capacitor-8 upgrade in Phase 3, the
 * device provider reports `unsupported`, and callers fall back to manual
 * package-text entry. When the app moves to Capacitor 8, add the MLKit provider
 * inside `recognizeOnDevice` WITHOUT changing any caller.
 */

export interface OcrBlock { text: string; normalizedText?: string }

export type OcrStatus = 'success' | 'no_text' | 'unsupported' | 'poor_image' | 'failed' | 'cancelled';

export interface OcrResult {
  provider: string;
  providerVersion: string;
  fullText: string;
  blocks: OcrBlock[];
  detectedScripts: string[];
  processingMs: number;
  status: OcrStatus;
  warnings: string[];
}

export interface OcrProviderInfo {
  name: string;
  version: string;
  supportedScripts: string[];
  available: boolean;
}

export function getOcrProviderInfo(): OcrProviderInfo {
  // Update `available: true` and `recognizeOnDevice` together when a compatible
  // on-device OCR provider is integrated (Capacitor 8 MLKit, or an alternative).
  return { name: 'none', version: '0', supportedScripts: [], available: false };
}

/**
 * Attempt on-device OCR of a captured image (data URL). Returns `unsupported`
 * today; the signature is stable so the recognition flow is provider-agnostic.
 */
export async function recognizeOnDevice(_imageDataUrl: string): Promise<OcrResult> {
  return {
    provider: 'none', providerVersion: '0', fullText: '', blocks: [],
    detectedScripts: [], processingMs: 0, status: 'unsupported',
    warnings: ['on-device OCR provider not available on this build; use manual package text'],
  };
}
