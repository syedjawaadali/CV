/**
 * Provider-independent cloud vision interface (Phase 4). Business logic depends
 * ONLY on this interface, never on a vendor SDK. Adapters (mock, gemini, …)
 * implement it. The provider receives a minimized image + bounded candidates
 * and returns a RAW structured result that the backend then validates — it is
 * never trusted directly.
 */
import type { CloudRecognitionResult } from '@smartdukaan/shared';

export interface BoundedCandidate {
  candidateId: string;    // opaque id the backend controls and later re-verifies
  productName: string;
  brand: string | null;
  variant: string | null;
  packSummary: string | null;
  manufacturer: string | null;
}

export interface CloudRequest {
  imageBase64: string | null;   // minimized, cropped package image (no data: prefix)
  imageMime: string | null;
  ocrText: string | null;
  barcode: string | null;
  brandCandidates: string[];
  packSizeSummary: string | null;
  boundedCandidates: BoundedCandidate[];
  country: string;              // e.g. 'PK'
  promptKey: string;
  promptVersion: string;
  systemText: string;
}

export interface ProviderUsage {
  inputImageCount: number;
  inputTextBytes: number;
  outputBytes: number;
  latencyMs: number;
}

export type ProviderErrorKind =
  | 'timeout' | 'rate_limited' | 'unavailable' | 'auth' | 'invalid_request'
  | 'safety' | 'server_error' | 'unknown';

export class ProviderError extends Error {
  constructor(public kind: ProviderErrorKind, message: string, public retryable: boolean) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface ProviderResponse {
  /** RAW result as returned by the provider — MUST be validated before use. */
  raw: unknown;
  requestId: string | null;
  responseId: string | null;
  usage: ProviderUsage;
}

export interface CloudVisionProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly modelVersion: string;
  readonly supportsStructuredOutput: boolean;
  readonly supportsImageInput: boolean;
  analyzeProductImage(req: CloudRequest): Promise<ProviderResponse>;
  healthCheck(): Promise<boolean>;
  /** Best-effort cost inputs estimate before sending (image count + text size). */
  estimateUsage(req: CloudRequest): { inputImageCount: number; inputTextBytes: number };
}

/** A well-formed result the mock/gemini adapters can emit for tests/reference. */
export type RawCloudResult = Partial<CloudRecognitionResult> & Record<string, unknown>;
