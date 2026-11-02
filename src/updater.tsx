import React, { useEffect, useState } from 'react';
import { Download, X, Sparkles } from 'lucide-react';
import { OutingNative, isNativeApp } from './native';

/**
 * "New version available" pop-up.
 *
 * When the Android app opens it reads version.json from the GitHub repository (public, no sign-in
 * needed) and compares it with the version installed on the phone. If the file lists a newer
 * versionCode, a pop-up offers the Google Drive download link. If the phone already has that
 * version or a newer one, nothing is shown.
 *
 * To announce a release: upload the new APK to Google Drive, then edit version.json in the
 * repository (see README section 20) and push it.
 */

const VERSION_URL = 'https://raw.githubusercontent.com/Rahul21-art/GeoGaurd/main/version.json';
const DEFAULT_DOWNLOAD = 'https://drive.google.com/file/d/1E5gWIM-2mzJvHZliGaPMVjTTyAmaThSk/view?usp=sharing';
/** Download links are only trusted if they point to one of these sites. */
const ALLOWED_HOSTS = ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'github.com'];

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  notes: string[];
  force: boolean;
}

/** Reads and validates the JSON. Returns null when it is missing or malformed. */
export function parseUpdateInfo(raw: unknown): UpdateInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const code = Number(o.versionCode);
  if (!Number.isFinite(code) || code <= 0) return null;
  let url = typeof o.downloadUrl === 'string' ? o.downloadUrl.trim() : '';
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) url = DEFAULT_DOWNLOAD;
  } catch {
    url = DEFAULT_DOWNLOAD;
  }
  const notes = Array.isArray(o.notes) ? o.notes.filter((n): n is string => typeof n === 'string').slice(0, 8) : [];
  return {
    versionCode: Math.floor(code),
    versionName: typeof o.versionName === 'string' && o.versionName.trim() ? o.versionName.trim() : String(code),
    downloadUrl: url,
    notes,
    force: o.force === true,
  };
}

/** True when the phone should be told about `latest`. */
export function needsUpdate(installedCode: number, latest: UpdateInfo | null): boolean {
  return latest !== null && Number.isFinite(installedCode) && installedCode > 0 && latest.versionCode > installedCode;
}

let checked: Promise<UpdateInfo | null> | null = null;
let dismissed = false;

async function check(): Promise<UpdateInfo | null> {
  try {
    const [info, res] = await Promise.all([
      OutingNative.getAppInfo(),
      (async () => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        try {
          return await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal });
        } finally {
          clearTimeout(t);
        }
      })(),
    ]);
    if (!res.ok) return null;
    const latest = parseUpdateInfo(await res.json());
    return needsUpdate(info.versionCode, latest) ? latest : null;
  } catch {
    return null; // offline or file missing: no pop-up
  }
}

export const UpdatePrompt: React.FC = () => {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isNativeApp || dismissed) return;
    if (!checked) checked = check();
    let alive = true;
    checked.then((r) => {
      if (alive && r && !dismissed) { setInfo(r); setOpen(true); }
    });
    return () => { alive = false; };
  }, []);

  if (!open || !info) return null;

  const later = () => { dismissed = true; setOpen(false); };
  const download = () => {
    OutingNative.openUrl({ url: info.downloadUrl }).catch(() => {});
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="New version available"
      className="anim-fade fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/70">
      <div className="anim-pop w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-blue-900 to-slate-900 text-white px-5 py-5 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-white/15 flex items-center justify-center mb-2">
            <Sparkles className="w-6 h-6 text-amber-300" />
          </div>
          <h2 className="text-lg font-bold">New version released</h2>
          <p className="text-sm text-blue-100 mt-0.5">Version <span className="font-mono font-bold">{info.versionName}</span> is ready to download.</p>
        </div>
        <div className="p-5 space-y-3">
          {info.notes.length > 0 && (
            <ul className="text-xs text-slate-700 space-y-1 list-disc pl-4">
              {info.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          <p className="text-xs text-slate-600">Please download and install it. Install it over the old app, do not uninstall first.</p>
          <button onClick={download}
            className="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-sm font-bold flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> Download version {info.versionName}
          </button>
          {!info.force && (
            <button onClick={later} className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5">
              <X className="w-3.5 h-3.5" /> Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
