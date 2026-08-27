import { useCallback, useEffect, useState } from 'react';

/**
 * Short-lived in-app toast (fixed overlay — see AppToast.css).
 */
export function useAppToast(durationMs = 3200) {
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), durationMs);
    return () => clearTimeout(t);
  }, [toast, durationMs]);

  const flash = useCallback((msg) => {
    setToast(String(msg || '').trim());
  }, []);

  const clearToast = useCallback(() => setToast(''), []);

  return { toast, flash, clearToast };
}

export function meetingsSyncErrorMessage(err) {
  const status = err?.status || 0;
  if (status === 401 || status === 403) {
    return 'Your session expired. Please sign in again to sync meetings.';
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You are offline — showing meetings saved on this device. Will sync when back online.';
  }
  return (
    err?.message ||
    'Could not reach the meetings server — showing local saves only.'
  );
}
