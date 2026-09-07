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

function dataUrlToBlob(dataUrl) {
  const [header, b64] = String(dataUrl).split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/png';
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** iOS / iPadOS ignore <a download> for blobs — Share → Save Image is reliable. */
function prefersShareToSave() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel with touch
  return navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1;
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return { method: 'download', objectUrl };
  } catch (err) {
    try {
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      return { method: 'open', objectUrl };
    } catch {
      URL.revokeObjectURL(objectUrl);
      throw err;
    }
  }
}

/**
 * Save a high-res QR PNG.
 * Desktop/Android: real file download via blob URL (data: + download is flaky).
 * iOS: Web Share sheet (Save Image) — <a download> is ignored there.
 */
export async function downloadScannableQr(text, filename = 'glico-qr.png') {
  const dataUrl = await makeScannableQrDataUrl(text, 'download');
  const safeName = String(filename || 'glico-qr.png').replace(/[^\w.-]+/g, '_');
  const blob = dataUrlToBlob(dataUrl);

  if (prefersShareToSave() && typeof navigator.share === 'function') {
    try {
      const file =
        typeof File !== 'undefined'
          ? new File([blob], safeName, { type: blob.type || 'image/png' })
          : null;
      if (
        file &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: 'QR code',
          text: 'Scan this QR code',
        });
        return { method: 'share' };
      }
    } catch (err) {
      // Cancelled share — still try opening the image so the user can save it
      if (err && err.name === 'AbortError') {
        /* fall through */
      } else if (err && err.name !== 'NotAllowedError') {
        /* fall through */
      }
    }
    // iOS fallback: open PNG so user can long-press → Save Image
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return { method: 'ios-open' };
  }

  return triggerBlobDownload(blob, safeName);
}
