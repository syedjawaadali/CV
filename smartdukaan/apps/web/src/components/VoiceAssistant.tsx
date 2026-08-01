import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, Check, Loader2, Volume2, VolumeX } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { listenOnce, speak, stopSpeaking } from '../lib/native';
import { Button, useToast } from './ui';

/** Result contract from POST /voice/interpret. */
interface InterpretResult {
  sessionId: string;
  outcome: 'answer' | 'need_confirm' | 'need_clarify' | 'not_allowed' | 'not_understood' | 'navigate';
  intent: string;
  preview: string | null;
  actionId: string | null;
  confirmationToken: string | null;
  confirmationLevel: string;
  clarifyQuestion: string | null;
  candidates?: Array<{ id: string; label: string }>;
  screen?: string | null;
  answer?: string | null;
  speech: string;
}

type Phase = 'idle' | 'listening' | 'thinking' | 'confirm' | 'clarify' | 'done';

const SCREEN_ROUTES: Record<string, string> = {
  home: '/', products: '/products', inventory: '/inventory', khata: '/khata',
  sales: '/sales', expenses: '/expenses', reports: '/reports', scan: '/products',
};

/** Global floating voice assistant. User-activated only (no background listening).
 *  Speaks results; every record-changing action requires an explicit tap-confirm. */
export function VoiceAssistant() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const L = (en: string, ur: string) => (lang === 'ur' ? ur : en);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<InterpretResult | null>(null);
  const [muted, setMuted] = useState(false);
  const [privacyMode] = useState(false);

  useEffect(() => () => stopSpeaking(), []);

  function say(text: string) {
    if (!muted && text) void speak(text, lang === 'ur' ? 'ur-PK' : 'en-US');
  }

  function reset() {
    setPhase('idle'); setTranscript(''); setResult(null); stopSpeaking();
  }

  async function startListening() {
    stopSpeaking();
    setResult(null);
    setPhase('listening');
    const heard = await listenOnce(lang === 'ur' ? 'ur-PK' : 'en-US');
    if ('error' in heard) {
      setPhase('idle');
      toast.push(
        heard.error === 'permission' ? L('Microphone permission is needed only when you speak a command.', 'کمانڈ بولتے وقت مائیک کی اجازت درکار ہے۔')
          : heard.error === 'unavailable' || heard.error === 'unsupported' ? L('Voice is not available here — use the buttons or type.', 'یہاں آواز دستیاب نہیں — بٹن یا ٹائپ کریں۔')
            : L('I did not catch that. Please try again.', 'میں سمجھ نہیں سکا۔ دوبارہ کوشش کریں۔'),
        'error',
      );
      return;
    }
    await interpret(heard.transcript);
  }

  async function interpret(text: string) {
    setTranscript(text);
    setPhase('thinking');
    try {
      const res = await api.post<InterpretResult>('/voice/interpret', { transcript: text, language: lang, privacyMode });
      setResult(res);
      if (res.outcome === 'navigate' && res.screen && SCREEN_ROUTES[res.screen]) {
        navigate(SCREEN_ROUTES[res.screen]!);
        setOpen(false); reset();
        return;
      }
      if (res.outcome === 'need_confirm') { setPhase('confirm'); say(res.preview ?? res.speech); return; }
      if (res.outcome === 'need_clarify') { setPhase('clarify'); say(res.clarifyQuestion ?? res.speech); return; }
      // answer / not_allowed / not_understood → speak and finish.
      setPhase('done');
      say(res.speech || L('Done.', 'ہو گیا۔'));
    } catch (err) {
      setPhase('idle');
      toast.push(err instanceof ApiError ? err.message : t('something_wrong'), 'error');
    }
  }

  async function confirm() {
    if (!result?.actionId || !result.confirmationToken) return;
    setPhase('thinking');
    try {
      const res = await api.post<{ status: string; speech: string }>('/voice/confirm', {
        actionId: result.actionId, confirmationToken: result.confirmationToken,
      });
      setPhase('done');
      const msg = res.status === 'completed' ? (result.preview ?? L('Done.', 'ہو گیا۔'))
        : res.status === 'already_done' ? L('That was already done.', 'یہ پہلے ہو چکا ہے۔')
          : res.status === 'expired' ? L('That request expired. Please say it again.', 'درخواست ختم ہو گئی۔ دوبارہ کہیں۔')
            : L('Cancelled.', 'منسوخ ہو گیا۔');
      say(msg);
      toast.push(msg, res.status === 'completed' ? 'success' : 'error');
    } catch (err) {
      setPhase('idle');
      toast.push(err instanceof ApiError ? err.message : t('something_wrong'), 'error');
    }
  }

  async function cancel() {
    if (result?.actionId) { try { await api.post('/voice/cancel', { actionId: result.actionId }); } catch { /* best-effort */ } }
    reset();
  }

  return (
    <>
      <button
        type="button" aria-label={L('Voice assistant', 'صوتی معاون')}
        onClick={() => { setOpen(true); reset(); }}
        className="fixed bottom-20 end-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg lg:bottom-6"
      >
        <Mic className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => { setOpen(false); reset(); }}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" dir="auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{L('Assistant', 'معاون')}</h2>
              <div className="flex items-center gap-1">
                <button type="button" aria-label={muted ? 'unmute' : 'mute'} onClick={() => { setMuted((m) => !m); stopSpeaking(); }} className="rounded-lg p-2 text-slate-500">
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <button type="button" aria-label="close" onClick={() => { setOpen(false); reset(); }} className="rounded-lg p-2 text-slate-500"><X className="h-5 w-5" /></button>
              </div>
            </div>

            {transcript && <p className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">“{transcript}”</p>}

            {phase === 'thinking' && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {L('Understanding…', 'سمجھ رہا ہوں…')}</p>}

            {(phase === 'confirm') && result && (
              <div className="space-y-3">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{result.preview}</p>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => void confirm()}><Check className="h-4 w-4" /> {L('Confirm', 'تصدیق')}</Button>
                  <Button variant="secondary" className="flex-1" onClick={() => void cancel()}>{L('Cancel', 'منسوخ')}</Button>
                </div>
              </div>
            )}

            {phase === 'clarify' && result && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">{result.clarifyQuestion}</p>
                {result.candidates?.map((c) => (
                  <button key={c.id} type="button" onClick={() => void interpret(`${transcript} ${c.label}`)}
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-start text-sm">{c.label}</button>
                ))}
              </div>
            )}

            {phase === 'done' && result && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{result.speech || L('Done.', 'ہو گیا۔')}</p>
            )}

            {(phase === 'idle' || phase === 'done' || phase === 'listening') && (
              <Button className="mt-4 w-full" loading={phase === 'listening'} onClick={() => void startListening()}>
                <Mic className="h-5 w-5" /> {phase === 'listening' ? L('Listening…', 'سن رہا ہوں…') : L('Tap and speak', 'بولنے کے لیے دبائیں')}
              </Button>
            )}
            <p className="mt-3 text-center text-xs text-slate-400">
              {L('e.g. “Surf Excel ke das packet add karo”', 'مثلاً ”سرف ایکسل کے دس پیکٹ شامل کرو“')}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
