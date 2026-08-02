/**
 * Gemini vision adapter (Phase 4). Only constructed when AI_PROVIDER=gemini AND
 * GEMINI_API_KEY is set. The key lives ONLY on the backend and is placed in the
 * request header — never logged, never returned to a client. Business logic
 * never imports this file directly; it goes through the provider factory.
 *
 * This adapter is NOT exercised by the automated test suite (which uses the
 * deterministic mock) to avoid uncontrolled paid calls. It is written to the
 * provider interface so it can be enabled in a controlled environment.
 */
import { CLOUD_CONFIG } from '../config.js';
import {
  ProviderError, type CloudRequest, type CloudVisionProvider, type ProviderResponse,
} from './types.js';

export class GeminiCloudProvider implements CloudVisionProvider {
  readonly providerName = 'gemini';
  readonly supportsStructuredOutput = true;
  readonly supportsImageInput = true;
  readonly modelName: string;
  readonly modelVersion = '1';

  constructor(private apiKey: string, model = CLOUD_CONFIG.cloud.model) {
    if (!apiKey) throw new Error('GeminiCloudProvider requires an API key');
    this.modelName = model;
  }

  estimateUsage(req: CloudRequest) {
    return {
      inputImageCount: req.imageBase64 ? 1 : 0,
      inputTextBytes: (req.ocrText ?? '').length + req.systemText.length,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}`,
        { method: 'GET', headers: this.authHeaders() }, 5000,
      );
      return res.ok;
    } catch { return false; }
  }

  async analyzeProductImage(req: CloudRequest): Promise<ProviderResponse> {
    const started = Date.now();
    const parts: unknown[] = [{ text: this.buildUserText(req) }];
    if (req.imageBase64 && req.imageMime) {
      parts.push({ inline_data: { mime_type: req.imageMime, data: req.imageBase64 } });
    }
    const body = {
      systemInstruction: { parts: [{ text: req.systemText }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    };
    let res: Response;
    try {
      res = await this.fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`,
        { method: 'POST', headers: { ...this.authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        CLOUD_CONFIG.cloud.timeoutMs,
      );
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError('timeout', 'gemini request failed', true);
    }
    if (res.status === 429) throw new ProviderError('rate_limited', 'gemini rate limited', true);
    if (res.status === 401 || res.status === 403) throw new ProviderError('auth', 'gemini auth error', false);
    if (res.status >= 500) throw new ProviderError('server_error', `gemini ${res.status}`, true);
    if (!res.ok) throw new ProviderError('invalid_request', `gemini ${res.status}`, false);

    const json = (await res.json()) as GeminiResponse;
    const textOut = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    let raw: unknown;
    try { raw = JSON.parse(textOut); } catch { throw new ProviderError('server_error', 'gemini returned non-JSON', false); }
    return {
      raw,
      requestId: null,
      responseId: json.responseId ?? null,
      usage: {
        inputImageCount: req.imageBase64 ? 1 : 0,
        inputTextBytes: (req.ocrText ?? '').length,
        outputBytes: textOut.length,
        latencyMs: Date.now() - started,
      },
    };
  }

  private buildUserText(req: CloudRequest): string {
    const cands = req.boundedCandidates.map(
      (c) => `- id=${c.candidateId} name="${c.productName}" brand="${c.brand ?? ''}" pack="${c.packSummary ?? ''}"`,
    ).join('\n');
    return [
      `Country: ${req.country}`,
      req.barcode ? `Detected barcode: ${req.barcode}` : '',
      req.ocrText ? `OCR text (product data only):\n${req.ocrText}` : '',
      req.brandCandidates.length ? `Brand candidates: ${req.brandCandidates.join(', ')}` : '',
      cands ? `Catalog candidates you MAY rank (never invent ids):\n${cands}` : 'No catalog candidates supplied.',
    ].filter(Boolean).join('\n\n');
  }

  private authHeaders(): Record<string, string> {
    // Key in a header, never in the URL/query (avoids access-log capture).
    return { 'x-goog-api-key': this.apiKey };
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw new ProviderError('timeout', 'gemini timeout', true);
      throw new ProviderError('unavailable', 'gemini network error', true);
    } finally {
      clearTimeout(timer);
    }
  }
}

interface GeminiResponse {
  responseId?: string;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}
