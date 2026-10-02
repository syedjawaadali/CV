/**
 * Deterministic mock cloud vision provider (Phase 4). Used for development and
 * ALL automated tests — no real paid calls, fully reproducible. Behavior is
 * driven by sentinel tokens in the OCR text so integration tests can exercise
 * every path through the real HTTP gateway:
 *
 *   MOCK_TIMEOUT   -> transient timeout (retryable)
 *   MOCK_RATELIMIT -> rate limited (retryable)
 *   MOCK_UNAVAIL   -> provider unavailable (retryable)
 *   MOCK_SAFETY    -> safety rejection (non-retryable)
 *   MOCK_MALFORMED -> returns a structurally invalid result
 *   MOCK_UNKNOWN   -> valid result, no catalog candidate matched
 *
 * Otherwise it extracts plausible attributes from the OCR text and, when a
 * bounded candidate's product name appears in the text, marks that candidate as
 * a match. It NEVER invents a candidateId the backend did not supply.
 */
import { CLOUD_RESPONSE_VERSION } from '@smartdukaan/shared';
import {
  ProviderError, type CloudRequest, type CloudVisionProvider, type ProviderResponse,
} from './types.js';

function attr<T>(value: T | null, confidence: number, uncertain = false) {
  return { value, confidence, uncertain };
}

export class MockCloudProvider implements CloudVisionProvider {
  readonly providerName = 'mock';
  readonly modelName = 'mock-vision';
  readonly modelVersion = '1';
  readonly supportsStructuredOutput = true;
  readonly supportsImageInput = true;

  async healthCheck(): Promise<boolean> { return true; }

  estimateUsage(req: CloudRequest) {
    return {
      inputImageCount: req.imageBase64 ? 1 : 0,
      inputTextBytes: (req.ocrText ?? '').length,
    };
  }

  async analyzeProductImage(req: CloudRequest): Promise<ProviderResponse> {
    const text = (req.ocrText ?? '').toUpperCase();
    if (text.includes('MOCK_TIMEOUT')) throw new ProviderError('timeout', 'mock timeout', true);
    if (text.includes('MOCK_RATELIMIT')) throw new ProviderError('rate_limited', 'mock rate limit', true);
    if (text.includes('MOCK_UNAVAIL')) throw new ProviderError('unavailable', 'mock unavailable', true);
    if (text.includes('MOCK_SAFETY')) throw new ProviderError('safety', 'mock safety rejection', false);

    const latencyMs = 5;
    const outputBase = { requestId: 'mock-req', responseId: 'mock-res' };

    if (text.includes('MOCK_MALFORMED')) {
      // Deliberately violates the schema (providerConfidence out of range, bad enum).
      return {
        raw: { responseVersion: CLOUD_RESPONSE_VERSION, providerConfidence: 5, identifiedPackUnit: { value: 'furlong', confidence: 0.9, uncertain: false } },
        ...outputBase,
        usage: { inputImageCount: req.imageBase64 ? 1 : 0, inputTextBytes: (req.ocrText ?? '').length, outputBytes: 40, latencyMs },
      };
    }

    const raw = this.buildResult(req, text.includes('MOCK_UNKNOWN'));
    return {
      raw, ...outputBase,
      usage: {
        inputImageCount: req.imageBase64 ? 1 : 0,
        inputTextBytes: (req.ocrText ?? '').length,
        outputBytes: JSON.stringify(raw).length,
        latencyMs,
      },
    };
  }

  private buildResult(req: CloudRequest, forceUnknown: boolean) {
    const ocr = req.ocrText ?? '';
    const lower = ocr.toLowerCase();
    // Match a bounded candidate only if its product name appears in the OCR text.
    const matched = forceUnknown ? [] : req.boundedCandidates.filter(
      (c) => c.productName && lower.includes(c.productName.toLowerCase()),
    );
    const brand = req.brandCandidates[0] ?? null;
    const priceMatch = ocr.match(/(?:rs|mrp|pkr)\s*\.?\s*([0-9]{2,6})/i);
    const priceMinor = priceMatch ? parseInt(priceMatch[1]!, 10) * 100 : null;

    return {
      responseVersion: CLOUD_RESPONSE_VERSION,
      identifiedBrand: attr(brand, brand ? 0.7 : 0.2, !brand),
      identifiedProductName: attr(matched[0]?.productName ?? (req.boundedCandidates[0]?.productName ?? null), matched.length ? 0.8 : 0.4, !matched.length),
      identifiedVariant: attr(null, 0.2, true),
      identifiedFlavor: attr(null, 0.2, true),
      identifiedPackQuantity: attr(null, 0.2, true),
      identifiedPackUnit: attr(null, 0.2, true),
      identifiedUnitsPerPack: attr(null, 0.2, true),
      identifiedProductForm: attr(null, 0.2, true),
      identifiedManufacturer: attr(null, 0.2, true),
      identifiedPrintedPriceMinor: attr(priceMinor, priceMinor ? 0.6 : 0.1, !priceMinor),
      currency: 'PKR',
      possibleCatalogCandidates: matched.map((c) => ({
        candidateId: c.candidateId, matches: true, confidence: 0.75, contradictionReasons: [],
      })),
      packagingChangeIndicators: [],
      uncertaintyReasons: matched.length ? [] : ['no confident catalog match'],
      safetyFlags: ['none'],
      providerConfidence: matched.length ? 0.75 : 0.3,
      requiresHumanConfirmation: true,
    };
  }
}
