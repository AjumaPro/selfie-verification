/**
 * QR settings tuned for phone cameras scanning a phone screen or a printed copy.
 * - Pure black/white (colored modules often fail scanners)
 * - Large quiet zone (margin)
 * - High error correction (glare / dirty screens)
 */
import QRCode from 'qrcode';

export const QR_SCAN_OPTS = {
  preview: {
    width: 400,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  },
  download: {
    width: 1024,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  },
};

export function makeScannableQrDataUrl(text, kind = 'preview') {
  const opts = kind === 'download' ? QR_SCAN_OPTS.download : QR_SCAN_OPTS.preview;
  return QRCode.toDataURL(String(text || ''), opts);
}

function dataUrlToFile(dataUrl, filename) {
  const [header, b64] = String(dataUrl).split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/png';
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

/**
 * Save / share a high-res QR so another phone can scan it from Photos or screen.
 * Prefers Web Share (mobile), then <a download>, then open image tab (iOS fallback).
 */
export async function downloadScannableQr(text, filename = 'glico-qr.png') {
  const dataUrl = await makeScannableQrDataUrl(text, 'download');
  const safeName = String(filename || 'glico-qr.png').replace(/[^\w.-]+/g, '_');

  try {
    if (navigator.share && navigator.canShare) {
      const file = dataUrlToFile(dataUrl, safeName);
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'QR code',
          text: 'Scan this QR code',
        });
        return { method: 'share' };
      }
    }
  } catch (err) {
    // User cancelled share — treat as done
    if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
      return { method: 'share-cancelled' };
    }
  }

  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = safeName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // iOS often ignores download and does nothing with data: URLs — open image next
    const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
    if (isIOS) {
      window.open(dataUrl, '_blank', 'noopener,noreferrer');
      return { method: 'ios-open' };
    }
    return { method: 'download' };
  } catch {
    window.open(dataUrl, '_blank', 'noopener,noreferrer');
    return { method: 'open' };
  }
}
