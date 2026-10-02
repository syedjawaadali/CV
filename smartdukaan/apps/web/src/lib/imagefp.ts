/**
 * Client-side image fingerprinting (Phase 4). Computes a cryptographic content
 * hash (SubtleCrypto) and a perceptual hash (dHash via canvas grayscale) from a
 * captured image data URL. The perceptual math matches @smartdukaan/shared so
 * client and server hashes are comparable.
 *
 * Only the small hash strings are sent to the backend for local matching — the
 * image bytes stay on the device unless the user explicitly opts into a cloud
 * check.
 */
import { differenceHash, PHASH_CONFIG, type PerceptualAlgorithm } from '@smartdukaan/shared';

export interface ImageFingerprint {
  contentHash: string | null;
  perceptualHash: string | null;
  phashAlgorithm: PerceptualAlgorithm;
  phashVersion: string;
  width: number;
  height: number;
}

/** SHA-256 hex of the raw image bytes decoded from a data URL. */
async function contentHashOfDataUrl(dataUrl: string): Promise<string | null> {
  try {
    const comma = dataUrl.indexOf(',');
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Draw the image at (size+1 x size) grayscale and compute a dHash. */
async function perceptualHashOfDataUrl(dataUrl: string): Promise<{ hash: string | null; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = PHASH_CONFIG.size;
        const cols = size + 1;
        const canvas = document.createElement('canvas');
        canvas.width = cols; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve({ hash: null, width: img.width, height: img.height });
        ctx.drawImage(img, 0, 0, cols, size);
        const data = ctx.getImageData(0, 0, cols, size).data;
        const gray: number[] = [];
        for (let i = 0; i < cols * size; i++) {
          const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
          gray.push(Math.round(0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0)));
        }
        resolve({ hash: differenceHash(gray, size), width: img.width, height: img.height });
      } catch {
        resolve({ hash: null, width: 0, height: 0 });
      }
    };
    img.onerror = () => resolve({ hash: null, width: 0, height: 0 });
    img.src = dataUrl;
  });
}

export async function fingerprintImage(dataUrl: string): Promise<ImageFingerprint> {
  const [contentHash, perceptual] = await Promise.all([
    contentHashOfDataUrl(dataUrl),
    perceptualHashOfDataUrl(dataUrl),
  ]);
  return {
    contentHash,
    perceptualHash: perceptual.hash,
    phashAlgorithm: 'dhash',
    phashVersion: PHASH_CONFIG.version,
    width: perceptual.width,
    height: perceptual.height,
  };
}

/**
 * Minimize an image for upload: downscale to a max edge and re-encode as JPEG.
 * Returns base64 (no data: prefix), mime and dimensions. Keeps only what a
 * product-recognition provider needs, reducing bytes and stripping metadata.
 */
export async function minimizeForUpload(
  dataUrl: string, maxEdge = 1024, quality = 0.7,
): Promise<{ base64: string; mime: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', quality);
        const base64 = out.slice(out.indexOf(',') + 1);
        resolve({ base64, mime: 'image/jpeg', width: w, height: h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
