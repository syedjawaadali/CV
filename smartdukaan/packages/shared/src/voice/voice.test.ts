import { describe, it, expect } from 'vitest';
import { parseSpokenNumber, parseSpokenMoney, foldDigits } from './numbers.js';
import { parseSpokenUnit } from './units.js';
import { detectLanguage } from './language.js';
import { detectConfirmation, detectStopSpeaking, confirmationLevelFor } from './confirm.js';
import { interpretTranscript } from './intent.js';
import { buildSpokenResponse } from './response.js';

describe('spoken numbers', () => {
  it('folds Urdu/Persian digits to ASCII', () => {
    expect(foldDigits('۱۰')).toBe('10');
    expect(foldDigits('٥٠٠')).toBe('500');
  });
  it('parses English and Roman-Urdu words', () => {
    expect(parseSpokenNumber('ten').value).toBe(10);
    expect(parseSpokenNumber('das').value).toBe(10);
    expect(parseSpokenNumber('panch sau').value).toBe(500);
    expect(parseSpokenNumber('do hazar').value).toBe(2000);
    expect(parseSpokenNumber('ek sau bees').value).toBe(120);
  });
  it('parses fractional retail quantities', () => {
    expect(parseSpokenNumber('dedh').value).toBe(1.5);
    expect(parseSpokenNumber('sawa do').value).toBe(2.25);
    expect(parseSpokenNumber('pauna char').value).toBe(3.75);
    expect(parseSpokenNumber('adha').value).toBe(0.5);
  });
  it('parses Urdu-script number words and digits', () => {
    expect(parseSpokenNumber('پانچ سو').value).toBe(500);
    expect(parseSpokenNumber('۱۰').value).toBe(10);
  });
  it('parses money with a currency hint at higher confidence', () => {
    const m = parseSpokenMoney('five hundred rupees');
    expect(m.amountMajor).toBe(500);
    expect(m.confidence).toBeGreaterThan(0.7);
  });
  it('returns null for non-numeric text', () => {
    expect(parseSpokenNumber('surf excel').value).toBeNull();
  });
});

describe('spoken units', () => {
  it('maps English/Roman/Urdu units to canonical', () => {
    expect(parseSpokenUnit('two packet').unit).toBe('packet');
    expect(parseSpokenUnit('do carton coke').unit).toBe('carton');
    expect(parseSpokenUnit('ایک کلو').unit).toBe('kg');
    expect(parseSpokenUnit('daral liter').unit).toBe('liter');
  });
  it('returns null for unknown units', () => {
    expect(parseSpokenUnit('surf excel').unit).toBeNull();
  });
});

describe('language detection', () => {
  it('detects Urdu script', () => {
    expect(detectLanguage('آج کتنی سیل ہوئی؟').primary).toBe('ur');
  });
  it('detects Roman Urdu via markers', () => {
    expect(detectLanguage('Coke ka stock kitna hai').primary).toBe('roman_ur');
  });
  it('detects English', () => {
    expect(detectLanguage('Add ten packets').primary).toBe('en');
  });
  it('detects mixed and never rejects it', () => {
    const d = detectLanguage('Surf Excel کے دس پیکٹ');
    expect(d.primary).toBe('mixed');
    expect(d.warnings.length).toBe(0);
  });
});

describe('confirmation detection', () => {
  it('detects multilingual confirmation and cancellation', () => {
    expect(detectConfirmation('haan ji')).toBe('confirm');
    expect(detectConfirmation('ٹھیک ہے')).toBe('confirm');
    expect(detectConfirmation('yes do it')).toBe('confirm');
    expect(detectConfirmation('nahi rehne do')).toBe('cancel');
    expect(detectConfirmation('نہیں')).toBe('cancel');
  });
  it('cancellation wins over an accidental yes', () => {
    expect(detectConfirmation('yes no cancel')).toBe('cancel');
  });
  it('unrelated speech is not confirmation', () => {
    expect(detectConfirmation('surf excel one kilo')).toBe('none');
  });
  it('detects stop-speaking', () => {
    expect(detectStopSpeaking('bas')).toBe(true);
    expect(detectStopSpeaking('stop')).toBe(true);
  });
  it('confirmation policy: read-only none, financial standard, strong for adjust/price', () => {
    expect(confirmationLevelFor('check_stock')).toBe('none');
    expect(confirmationLevelFor('record_expense')).toBe('standard');
    expect(confirmationLevelFor('update_price')).toBe('strong');
    expect(confirmationLevelFor('record_sale', { amountMajor: 200000 })).toBe('strong');
  });
});

describe('intent classification + entities', () => {
  it('add stock (Roman Urdu): product + quantity', () => {
    const r = interpretTranscript('Surf Excel ke das packet add karo');
    expect(r.intent).toBe('add_stock');
    expect(r.entities.quantity).toBe(10);
    expect(r.entities.unit).toBe('packet');
    expect(r.entities.productPhrase?.toLowerCase()).toContain('surf');
    expect(r.confirmationLevel).toBe('standard');
    expect(r.requiredPermission).toBe('inventory:manage');
    expect(r.missing).not.toContain('quantity');
  });
  it('add stock (Urdu script)', () => {
    const r = interpretTranscript('سرف ایکسل کے دس پیکٹ شامل کریں');
    expect(r.intent).toBe('add_stock');
    expect(r.entities.quantity).toBe(10);
  });
  it('check stock (Roman Urdu)', () => {
    const r = interpretTranscript('Coke ka stock kitna hai');
    expect(r.intent).toBe('check_stock');
    expect(r.entities.productPhrase?.toLowerCase()).toContain('coke');
    expect(r.confirmationLevel).toBe('none');
  });
  it('today sales question maps to a read-only report intent', () => {
    const r = interpretTranscript('Aaj kitni sale hui');
    expect(r.intent).toBe('ask_today_sales');
    expect(r.requiredPermission).toBe('sale:view');
  });
  it('khata credit with customer + amount', () => {
    const r = interpretTranscript('Imran ke khate mein five hundred add karo');
    expect(r.intent).toBe('khata_credit');
    expect(r.entities.customerPhrase).toBe('Imran');
    expect(r.entities.amountMajor).toBe(500);
    expect(r.entities.paymentMethod).toBe('credit');
  });
  it('expense with category + amount', () => {
    const r = interpretTranscript('Bijli ka kharcha five thousand likho');
    expect(r.intent).toBe('record_expense');
    expect(r.entities.expenseCategory).toBe('Electricity');
    expect(r.entities.amountMajor).toBe(5000);
  });
  it('price update routes number to newPrice, needs product', () => {
    const r = interpretTranscript('Change Coke price to two hundred');
    expect(r.intent).toBe('update_price');
    expect(r.entities.newPrice).toBe(200);
    expect(r.confirmationLevel).toBe('strong');
  });
  it('amount-only sale', () => {
    const r = interpretTranscript('Record a cash sale of fifteen hundred rupees');
    expect(r.intent).toBe('record_sale');
    expect(r.entities.amountMajor).toBe(1500);
    expect(r.entities.paymentMethod).toBe('cash');
  });
  it('recent products query', () => {
    expect(interpretTranscript('Tell me what I added recently').intent).toBe('ask_recent_added');
  });
  it('navigation open screen', () => {
    const r = interpretTranscript('Open khata');
    expect(r.intent).toBe('open_screen');
    expect(r.entities.screen).toBe('khata');
  });
  it('assistant control: repeat / cancel / stop', () => {
    expect(interpretTranscript('repeat').intent).toBe('repeat');
    expect(interpretTranscript('cancel').intent).toBe('cancel');
    expect(interpretTranscript('stop speaking').intent).toBe('stop_speaking');
  });
  it('missing quantity is surfaced, not guessed', () => {
    const r = interpretTranscript('Surf Excel add karo');
    expect(r.intent).toBe('add_stock');
    expect(r.missing).toContain('quantity');
  });
  it('unknown transcript yields no intent, zero confidence', () => {
    const r = interpretTranscript('blah blah nonsense zzzz');
    expect(r.intent).toBe('unknown');
    expect(r.confidence).toBe(0);
  });
});

describe('spoken response builder', () => {
  it('reads stock quantity', () => {
    const r = buildSpokenResponse({ kind: 'stock_qty', productName: 'Surf Excel', quantity: 5, unit: 'packets' });
    expect(r.speech).toContain('5');
    expect(r.speech).toContain('Surf Excel');
  });
  it('privacy mode hides outstanding amounts and gives a generic summary', () => {
    const r = buildSpokenResponse({ kind: 'outstanding', amountMajor: 12000, count: 2 }, { privacyMode: true });
    expect(r.speech).not.toContain('12,000');
    expect(r.sensitive).toBe(true);
  });
  it('pending-sync response never claims global update', () => {
    const r = buildSpokenResponse({ kind: 'action_pending_sync', previewText: 'Added 10 packets.' });
    expect(r.speech.toLowerCase()).toContain('waiting to sync');
    expect(r.speech.toLowerCase()).not.toContain('everywhere');
  });
});
