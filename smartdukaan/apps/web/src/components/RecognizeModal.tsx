import { useState } from 'react';
import { ScanLine, Camera, Search, Sparkles, AlertTriangle, Check } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { money } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import { scanBarcode, takePhoto, isNative } from '../lib/native';
import { recognizeOnDevice } from '../lib/ocr';
import { Badge, Button, Field, Modal, useToast } from './ui';

interface Candidate {
  rank: number; retailerProductId: string | null; globalProductId: string | null;
  displayName: string; brand: string | null; packSize: string | null;
  confidenceCategory: string; matchReasons: Array<{ label: string }>; source: 'retailer' | 'shared';
}
interface RecognizeResult {
  observationId: string; confidence: string; recommendedAction: string;
  extractedAttributes: { packSize: { baseQuantity: number | null; baseUnit: string | null } | null; printedPrice: { amountMinor: number } | null };
  candidates: Candidate[];
  priceChange: { observedPrintedMinor: number; previousPrintedMinor: number | null; sellingPriceMinor: number | null; differs: boolean } | null;
  packagingChange: { classification: string; note: string } | null;
}

export interface RecognizePrefill { name: string; barcode: string | null; sellingPrice?: number; category?: string | null }

const TONE: Record<string, 'green' | 'brand' | 'amber' | 'red' | 'slate'> = {
  exact: 'green', high: 'brand', medium: 'amber', low: 'slate', conflict: 'red',
};

/** "Read package" recognition flow. Uses on-device OCR when available, else a
 *  manual package-text box — both feed the same server recognition engine. */
export function RecognizeModal({ onClose, onCreateNew }: {
  onClose: () => void; onCreateNew: (p: RecognizePrefill) => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const L = (en: string, ur: string) => (lang === 'ur' ? ur : en);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RecognizeResult | null>(null);

  async function doScan() {
    const code = await scanBarcode();
    if (code) { setBarcode(code); toast.push(`${L('Barcode', 'بارکوڈ')}: ${code}`); }
    else toast.push(t('scan_not_supported'), 'error');
  }

  async function doPhoto() {
    const dataUrl = await takePhoto();
    if (!dataUrl) return;
    const ocr = await recognizeOnDevice(dataUrl);
    if (ocr.status === 'success' && ocr.fullText) setText((prev) => (prev ? prev + '\n' : '') + ocr.fullText);
    else toast.push(L('Camera reading not available — type the package text', 'کیمرہ پڑھائی دستیاب نہیں — پیکٹ کا متن لکھیں'), 'error');
  }

  async function recognize() {
    if (!barcode && !text.trim()) { toast.push(L('Scan a barcode or type package text', 'بارکوڈ اسکین کریں یا متن لکھیں'), 'error'); return; }
    setBusy(true);
    try {
      const res = await api.post<RecognizeResult>('/kb/recognize', {
        barcode: barcode ?? undefined, ocrText: text.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('something_wrong'), 'error');
    } finally { setBusy(false); }
  }

  async function useProduct(c: Candidate) {
    if (c.retailerProductId && result) {
      try {
        await api.post(`/kb/observations/${result.observationId}/confirm`, {
          action: 'confirmed_suggested', retailerProductId: c.retailerProductId,
        });
      } catch { /* best-effort */ }
      toast.push(`${c.displayName} — ${t('catalog_matched')}`);
      onClose();
    } else {
      // shared candidate → create a retailer product prefilled from it
      onCreateNew({ name: c.displayName, barcode });
    }
  }

  function createNew() {
    const price = result?.extractedAttributes.printedPrice?.amountMinor;
    onCreateNew({
      name: result?.candidates[0]?.displayName ?? '',
      barcode,
      sellingPrice: price ? price / 100 : undefined,
    });
  }

  return (
    <Modal open onClose={onClose} title={L('Read package', 'پیکٹ پڑھیں')}>
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {L('Scan the barcode, or take a photo / type what is written on the package (name, size, price).',
              'بارکوڈ اسکین کریں، یا تصویر لیں / پیکٹ پر لکھا (نام، سائز، قیمت) درج کریں۔')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void doScan()}>
              <ScanLine className="h-5 w-5" /> {barcode ? `✓ ${barcode.slice(0, 10)}` : t('scan')}
            </Button>
            {isNative() && (
              <Button variant="secondary" onClick={() => void doPhoto()}>
                <Camera className="h-5 w-5" /> {L('Photo', 'تصویر')}
              </Button>
            )}
          </div>
          <Field label={L('Package text', 'پیکٹ کا متن')}>
            <textarea
              className="input min-h-[90px]" dir="auto" value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={L('e.g. Surf Excel 1 kg MRP Rs 850', 'مثلاً سرف ایکسل ۱ کلو قیمت ۸۵۰')}
            />
          </Field>
          <Button className="w-full" loading={busy} onClick={() => void recognize()}>
            <Search className="h-4 w-4" /> {L('Find product', 'مصنوعات تلاش کریں')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600" />
            <Badge tone={TONE[result.confidence] ?? 'slate'}>
              {result.confidence === 'exact' ? L('Product found', 'مصنوعات مل گئی')
                : result.confidence === 'conflict' ? L('Needs your check', 'آپ کی جانچ درکار')
                  : result.confidence === 'low' ? L('Not found', 'نہیں ملی')
                    : L('Possible matches', 'ممکنہ مماثلتیں')}
            </Badge>
          </div>

          {result.priceChange?.differs && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              {L('Printed price', 'چھپی قیمت')}: {money(result.priceChange.observedPrintedMinor, lang)}.{' '}
              {L('Your selling price is unchanged.', 'آپ کی فروخت قیمت وہی ہے۔')}
            </div>
          )}
          {result.packagingChange && (
            <p className="text-xs text-slate-500">{result.packagingChange.note}</p>
          )}

          {result.candidates.length === 0 ? (
            <p className="text-sm text-slate-500">{L('No matching product. Create a new one.', 'کوئی مماثل مصنوعات نہیں۔ نئی بنائیں۔')}</p>
          ) : (
            <div className="space-y-2">
              {result.candidates.map((c) => (
                <div key={c.rank} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{c.displayName}
                        {c.packSize && <span className="ms-2 text-xs text-slate-500">{c.packSize}</span>}</p>
                      <p className="text-xs text-slate-500">{c.matchReasons.slice(0, 2).map((r) => r.label).join(' · ')}</p>
                    </div>
                    <Button className="shrink-0 px-3 py-1.5 text-sm" onClick={() => void useProduct(c)}>
                      <Check className="h-4 w-4" /> {c.source === 'retailer' ? L('Use', 'استعمال') : L('Add', 'شامل')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between gap-2 pt-1">
            <Button variant="secondary" onClick={() => setResult(null)}>{L('Scan again', 'دوبارہ')}</Button>
            <Button onClick={createNew}>{L('Create new product', 'نئی مصنوعات بنائیں')}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
