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
  // On the web / desktop (no camera scanner), fall back to manual barcode entry
  // so the same "Scan" action still works — the shopkeeper types the number.
  if (!isNative()) {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return null;
    const entered = window.prompt('Enter the barcode number');
    const digits = (entered ?? '').replace(/\D/g, '');
    return digits.length >= 6 ? digits : null;
  }
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
  // Native engine first — Android's in-app WebView often has no/blocked Web
  // Speech Synthesis, which is why the browser API stayed silent on-device.
  if (isNative()) {
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      try { await TextToSpeech.stop(); } catch { /* nothing playing */ }
      const attempts = [lang, 'ur', 'ur-IN', 'en-US'];
      for (const l of attempts) {
        try {
          await TextToSpeech.speak({ text, lang: l, rate: 1.0, pitch: 1.0, volume: 1.0 });
          return;
        } catch { /* try the next locale */ }
      }
      try { await TextToSpeech.speak({ text, rate: 1.0 }); return; } catch { /* give up */ }
      return;
    } catch {
      /* plugin unavailable — fall through to the web synth */
    }
  }
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    await ensureVoices();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.95;
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
  if (isNative()) {
    import('@capacitor-community/text-to-speech')
      .then((m) => m.TextToSpeech.stop().catch(() => undefined))
      .catch(() => undefined);
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

export type VoiceResult =
  | { transcript: string }
  | { error: 'permission' | 'unavailable' | 'nomatch' | 'unsupported' };

export async function listenOnce(lang = 'ur-PK'): Promise<VoiceResult> {
  if (!isNative()) {
    const t = await webListen(lang);
    return t ? { transcript: t } : { error: 'unsupported' };
  }
  try {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const avail = await SpeechRecognition.available();
    if (!avail.available) return { error: 'unavailable' };
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') {
      perm = await SpeechRecognition.requestPermissions();
    }
    if (perm.speechRecognition !== 'granted') return { error: 'permission' };
    // popup:true hands off to the system speech dialog — far more reliable
    // across devices than the silent background recognizer.
    const res = await SpeechRecognition.start({
      language: lang,
      maxResults: 3,
      partialResults: false,
      popup: true,
    });
    const match = res?.matches?.[0];
    return match ? { transcript: match } : { error: 'nomatch' };
  } catch {
    return { error: 'unavailable' };
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
