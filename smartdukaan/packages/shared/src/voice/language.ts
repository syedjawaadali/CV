/**
 * Language / script detection for voice transcripts (Phase 5) — pure. Mixed
 * scripts are expected (English brand names inside Urdu speech) and must NOT be
 * rejected. Detection is a hint for TTS voice + response language, never a gate.
 */

export type VoiceLanguage = 'en' | 'ur' | 'roman_ur' | 'mixed';
export type VoiceScript = 'latin' | 'arabic' | 'mixed' | 'unknown';

export interface LanguageDetection {
  primary: VoiceLanguage;
  script: VoiceScript;
  confidence: number;
  hasNumbers: boolean;
  warnings: string[];
}

const ARABIC_RANGE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-z]/;
const DIGIT = /[0-9٠-٩۰-۹]/;

// Common Roman-Urdu function words that mark Latin text as Roman Urdu, not English.
// Distinctly Roman-Urdu function words (NOT common English words like add/stock/do).
const ROMAN_UR_MARKERS = new Set([
  'ka', 'ki', 'ke', 'ko', 'kitna', 'kitni', 'mein', 'karo', 'kar', 'hai', 'hain',
  'kado', 'wala', 'wali', 'roz', 'aaj', 'kal', 'kharcha', 'khate', 'khata',
  'rupay', 'rupaye', 'wasool', 'likho', 'batao', 'bta', 'bata', 'nikaalo', 'dedh', 'sawa', 'pauna',
]);

export function detectLanguage(input: string): LanguageDetection {
  const warnings: string[] = [];
  const hasArabic = ARABIC_RANGE.test(input);
  const hasLatin = LATIN.test(input);
  const hasNumbers = DIGIT.test(input);

  let script: VoiceScript;
  if (hasArabic && hasLatin) script = 'mixed';
  else if (hasArabic) script = 'arabic';
  else if (hasLatin) script = 'latin';
  else script = 'unknown';

  const tokens = input.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const romanMarkers = tokens.filter((t) => ROMAN_UR_MARKERS.has(t)).length;

  let primary: VoiceLanguage;
  let confidence: number;
  if (hasArabic && hasLatin) { primary = 'mixed'; confidence = 0.7; }
  else if (hasArabic) { primary = 'ur'; confidence = 0.9; }
  else if (hasLatin && romanMarkers > 0) { primary = 'roman_ur'; confidence = Math.min(0.9, 0.55 + romanMarkers * 0.12); }
  else if (hasLatin) { primary = 'en'; confidence = 0.8; }
  else { primary = 'en'; confidence = 0.3; warnings.push('no recognizable script'); }

  return { primary, script, confidence, hasNumbers, warnings };
}

/** The best response language for spoken output given a detected input language. */
export function responseLanguageFor(detected: VoiceLanguage, preferred?: VoiceLanguage): VoiceLanguage {
  if (preferred) return preferred;
  if (detected === 'roman_ur' || detected === 'mixed') return 'ur';
  return detected;
}
