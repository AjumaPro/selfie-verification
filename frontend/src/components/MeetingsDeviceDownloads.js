import React, { useEffect, useState, useCallback } from 'react';
import {
  FaApple,
  FaWindows,
  FaMobileAlt,
  FaExternalLinkAlt,
  FaFileArchive,
} from 'react-icons/fa';
import {
  resolveDownloadUrl,
  triggerDownload,
  isLocalDevHost,
} from '../utils/downloadUtils';
import './MeetingsDeviceDownloads.css';

const FILES = {
  exe: 'Glico-Meetings-Windows.exe',
  dmg: 'Glico-Meetings-Mac.dmg',
  macZip: 'Glico-Meetings-Mac.zip',
  pwaZip: 'glico-meetings-pwa.zip',
};

/**
 * Meetings download grid: equal-width cards (Windows · Mac · web).
 */
const MeetingsDeviceDownloads = ({
  compact = false,
  showOpenPwa = true,
  className = '',
}) => {
  const [resolved, setResolved] = useState({
    exe: null,
    dmg: null,
    macZip: null,
    pwaZip: null,
  });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        Object.entries(FILES).map(async ([key, name]) => {
          const r = await resolveDownloadUrl(name);
          return [key, r];
        })
      );
      if (cancelled) return;
      const next = {};
      for (const [k, r] of entries) next[k] = r;
      setResolved(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onDownload = useCallback(
    async (key, filename) => {
      setBusy(key);
      try {
        let r = resolved[key];
        if (!r || r.source === 'missing') {
          r = await resolveDownloadUrl(FILES[key] || filename);
        }
        if (!r?.url) {
          window.alert(`File not available: ${filename}`);
          return;
        }
        triggerDownload(r.url, filename);
      } finally {
        setBusy('');
      }
    },
    [resolved]
  );

  const ready = (key) => resolved[key] !== null;
  const ok = (key) => resolved[key] && resolved[key].source !== 'missing';

  const items = [];
  if (!ready('exe') || ok('exe')) {
    items.push({
      key: 'exe',
      filename: FILES.exe,
      title: 'Windows',
      sub: '.exe installer',
      Icon: FaWindows,
      tone: 'win',
    });
  }
  if (!ready('dmg') || ok('dmg')) {
    items.push({
      key: 'dmg',
      filename: FILES.dmg,
      title: 'Mac',
      sub: '.dmg installer',
      Icon: FaApple,
      tone: 'mac',
    });
  } else if (!ready('macZip') || ok('macZip')) {
    items.push({
      key: 'macZip',
      filename: FILES.macZip,
      title: 'Mac',
      sub: '.zip package',
      Icon: FaApple,
      tone: 'mac',
    });
  }
  if (!ready('pwaZip') || ok('pwaZip')) {
    items.push({
      key: 'pwaZip',
      filename: FILES.pwaZip,
      title: 'Web package',
      sub: '.zip · any platform',
      Icon: FaFileArchive,
      tone: 'web',
    });
  }

  const cols = Math.min(Math.max(items.length, 1), 3);

  return (
    <div className={`meet-device-dl ${compact ? 'compact' : ''} ${className}`.trim()}>
      {!compact && (
        <div className="meet-device-dl-head">
          <FaMobileAlt aria-hidden />
          <div>
            <strong>Meetings on this device</strong>
            <p>Choose your platform</p>
          </div>
        </div>
      )}

      <div
        className={`meet-device-dl-grid meet-device-dl-grid--${cols}`}
        role="group"
        aria-label="Meetings downloads"
      >
        {items.map(({ key, filename, title, sub, Icon, tone }) => {
          const waiting = !ready(key);
          const missing = ready(key) && !ok(key);
          return (
            <button
              key={key}
              type="button"
              className={`meet-dl-btn meet-dl-tone-${tone} ${missing ? 'is-disabled' : ''}`}
              disabled={missing || busy === key || waiting}
              onClick={() => onDownload(key, filename)}
            >
              <span className="meet-dl-btn-icon" aria-hidden>
                <Icon />
              </span>
              <span className="meet-dl-btn-text">
                <span className="meet-dl-btn-title">
                  {busy === key ? 'Starting…' : waiting ? 'Checking…' : title}
                </span>
                <span className="meet-dl-btn-sub">{sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {showOpenPwa && isLocalDevHost() && (
        <div className="meet-device-dl-foot">
          <a
            className="meet-dl-link"
            href="http://localhost:3002"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open local Meetings PWA <FaExternalLinkAlt aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
};

export default MeetingsDeviceDownloads;
