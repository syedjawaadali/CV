import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, ExternalLink, QrCode, Check } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { Button, useToast } from '../components/ui';

/**
 * "Your storefront" — a printable QR + shareable link that opens THIS shop's
 * online store in any phone browser. The public base is the deployed origin
 * (VITE_API_BASE_URL, which also serves the web app), falling back to the
 * current origin when opened in a browser.
 */
export function StorefrontPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
    || window.location.origin;
  const link = user ? `${base}/store/shop/${user.shopId}` : '';

  useEffect(() => {
    if (!link) return;
    let alive = true;
    QRCode.toDataURL(link, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => { if (alive) setQr(null); });
    return () => { alive = false; };
  }, [link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.push(t('link_copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.push(link);
    }
  }

  const L = (en: string, ur: string) => (lang === 'ur' ? ur : en);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-lg bg-brand-100 text-brand-700">
          <QrCode className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{t('your_storefront')}</h2>
        <p className="text-sm text-slate-500">{L('Print this QR for your counter. Customers scan it to order.', 'اسے کاؤنٹر پر لگائیں۔ گاہک اسکین کر کے آرڈر کریں گے۔')}</p>
      </div>

      <div className="card flex flex-col items-center gap-4">
        {qr ? (
          <img src={qr} alt="Storefront QR" className="h-64 w-64 rounded-lg" />
        ) : (
          <div className="grid h-64 w-64 place-items-center text-slate-400">…</div>
        )}
        <p className="font-semibold text-slate-900">{user?.shopName}</p>

        <div className="w-full rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-600 break-all">
          {link}
        </div>

        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {t('copy_link')}
          </Button>
          <a href={link} target="_blank" rel="noreferrer" className="btn-primary justify-center">
            <ExternalLink className="h-4 w-4" /> {t('open_store')}
          </a>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">
        {L('Tip: download the QR by long-pressing it, then print it or share on WhatsApp.',
          'مشورہ: QR کو دبا کر محفوظ کریں، پرنٹ کریں یا واٹس ایپ پر بھیجیں۔')}
      </p>
    </div>
  );
}
