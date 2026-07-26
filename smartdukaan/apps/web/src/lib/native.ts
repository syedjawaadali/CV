import { Capacitor } from '@capacitor/core';

/**
 * Thin, capability-guarded wrappers around native device features. Every call
 * is defensive: on the web, on an unsupported device, or if a plugin/permission
 * is unavailable, it degrades gracefully (returns null / no-op) so the caller
 * can fall back to manual entry. Nothing here ever throws to the UI.
 */

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/* -------------------------------------------------- barcode scanning (MLKit) */

export async function scanBarcode(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) return null;
    const perm = await BarcodeScanner.requestPermissions();
    if (perm.camera !== 'granted' && perm.camera !== 'limited') return null;
    // On Android the scanner UI relies on a Google Play module — install once.
    try {
      const mod = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!mod.available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      }
    } catch {
      /* module check unsupported on this platform — scan() may still work */
    }
    const { barcodes } = await BarcodeScanner.scan();
    return barcodes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------ text-to-speech (Urdu) */

let voicesReady: Promise<void> | null = null;
function ensureVoices(): Promise<void> {
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      if (synth.getVoices().length > 0) return resolve();
      const done = () => resolve();
      synth.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 800);
    } catch {
      resolve();
    }
  });
  return voicesReady;
}

export async function speak(text: string, lang = 'ur-PK'): Promise<void> {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    await ensureVoices();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.92;
    u.pitch = 1;
    const voice = synth
      .getVoices()
      .find((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {
    /* no-op */
  }
}

export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* no-op */
  }
}

/* ------------------------------------------- speech-to-text (Urdu dictation) */

interface WebSR {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
}

function webListen(lang: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const w = window as unknown as {
        webkitSpeechRecognition?: new () => WebSR;
        SpeechRecognition?: new () => WebSR;
      };
      const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (!SR) return resolve(null);
      const r = new SR();
      r.lang = lang;
      r.interimResults = false;
      r.maxAlternatives = 1;
      let settled = false;
      const finish = (v: string | null) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      r.onresult = (e) => finish(e.results[0]?.[0]?.transcript ?? null);
      r.onerror = () => finish(null);
      r.onend = () => finish(null);
      r.start();
    } catch {
      resolve(null);
    }
  });
}

export async function listenOnce(lang = 'ur-PK'): Promise<string | null> {
  if (!isNative()) return webListen(lang);
  try {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const avail = await SpeechRecognition.available();
    if (!avail.available) return null;
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') {
      perm = await SpeechRecognition.requestPermissions();
    }
    if (perm.speechRecognition !== 'granted') return null;
    const res = await SpeechRecognition.start({
      language: lang,
      maxResults: 1,
      partialResults: false,
      popup: false,
    });
    return res.matches?.[0] ?? null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- camera photo */

export async function takePhoto(): Promise<string | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      quality: 55,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      width: 480,
    });
    return photo.dataUrl ?? null;
  } catch {
    return null;
  }
}
