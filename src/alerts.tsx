import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onIdTokenChanged, type Auth, type User } from 'firebase/auth';
import { AlertOctagon, Clock, Phone, MapPin, BellRing, BatteryWarning, Check, Navigation } from 'lucide-react';
import { OutingNative, isNativeApp, type NativeStatus } from './native';

/**
 * Faculty alerts and the evening return rule.
 *
 *  - SOS alert: a student pressed SOS or shook the phone.
 *  - Late-return alert: after the return time (default 6:00 PM) a student is still more than
 *    0.2 km from the hostel (or has no location at all).
 *
 * AlertCenter shows them as a full-screen alert with name, roll number, phone, distance and
 * location while the app is open. When the app is closed, the native service
 * (AdminWatchService.java) shows the same information as a full-screen alert on the lock screen.
 */

/* ------------------------------------------------------------------ types */

export interface AlertConfig {
  centerLatitude: number;
  centerLongitude: number;
  hostelLatitude?: number;
  hostelLongitude?: number;
  /** "HH:mm", 24-hour, in the phone's local time. */
  returnDeadline: string;
  /** Students farther than this from the hostel after the deadline are reported (km). */
  returnDistanceKm: number;
  returnAlertsEnabled: boolean;
}

export interface AlertSource {
  uid: string;
  profile: { name: string; rollNumber: string; phone: string };
  latitude: number | null;
  longitude: number | null;
  battery: number | null;
  sos: boolean;
  updatedAt: number | null;
}

export interface AlertItem {
  key: string;
  type: 'SOS' | 'LATE';
  uid: string;
  name: string;
  roll: string;
  phone: string;
  /** Metres from the hostel, or null when the student has no location. */
  distM: number | null;
  lat: number | null;
  lon: number | null;
  updatedAt: number | null;
  battery: number | null;
}

/* ---------------------------------------------------------------- helpers */

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function hostelPoint(cfg: AlertConfig): { lat: number; lon: number } {
  const lat = Number(cfg.hostelLatitude);
  const lon = Number(cfg.hostelLongitude);
  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) return { lat, lon };
  return { lat: cfg.centerLatitude, lon: cfg.centerLongitude };
}

export function deadlineMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return 18 * 60;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

export function formatDeadline(hhmm: string): string {
  const mins = deadlineMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function minutesOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Metres from the hostel, or null without a location. */
export function metresFromHostel(cfg: AlertConfig, lat: number | null, lon: number | null): number | null {
  if (lat === null || lon === null || lat === undefined || lon === undefined) return null;
  const h = hostelPoint(cfg);
  return Math.round(haversineKm(lat, lon, h.lat, h.lon) * 1000);
}

export function fmtDist(m: number | null): string {
  if (m === null) return 'Location unknown';
  if (m < 1000) return `${m} m from hostel`;
  return `${(m / 1000).toFixed(2)} km from hostel`;
}

function agoText(ts: number | null, now: number): string {
  if (!ts) return 'no update yet';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

/** What a student should be told about the return rule right now. */
export type ReturnState =
  | { kind: 'off' }
  | { kind: 'before'; minsLeft: number }
  | { kind: 'ok'; distM: number }
  | { kind: 'late'; distM: number }
  | { kind: 'unknown' };

export function returnState(cfg: AlertConfig, lat: number | null, lon: number | null, now: number): ReturnState {
  if (!cfg.returnAlertsEnabled) return { kind: 'off' };
  const dl = deadlineMinutes(cfg.returnDeadline);
  const mins = minutesOfDay(now);
  const distM = metresFromHostel(cfg, lat, lon);
  const limitM = cfg.returnDistanceKm * 1000;
  if (mins < dl) {
    const left = dl - mins;
    if (left <= 30 && (distM === null || distM > limitM)) return { kind: 'before', minsLeft: left };
    return { kind: 'off' };
  }
  if (distM === null) return { kind: 'unknown' };
  return distM > limitM ? { kind: 'late', distM } : { kind: 'ok', distM };
}

/** All alerts that are active right now. SOS first. */
export function buildAlerts(list: AlertSource[], cfg: AlertConfig, now: number): AlertItem[] {
  const out: AlertItem[] = [];
  const pastDeadline = cfg.returnAlertsEnabled && minutesOfDay(now) >= deadlineMinutes(cfg.returnDeadline);
  const limitM = cfg.returnDistanceKm * 1000;
  const day = dayKey(now);
  for (const r of list) {
    const distM = metresFromHostel(cfg, r.latitude, r.longitude);
    const base = {
      uid: r.uid,
      name: r.profile.name,
      roll: r.profile.rollNumber,
      phone: r.profile.phone,
      distM,
      lat: r.latitude,
      lon: r.longitude,
      updatedAt: r.updatedAt,
      battery: r.battery,
    };
    if (r.sos) {
      out.push({ ...base, key: `sos:${r.uid}`, type: 'SOS' });
    } else if (pastDeadline && (distM === null || distM > limitM)) {
      out.push({ ...base, key: `late:${r.uid}:${day}`, type: 'LATE' });
    }
  }
  return out.sort((a, b) => (a.type === b.type ? (b.distM ?? 1e9) - (a.distM ?? 1e9) : a.type === 'SOS' ? -1 : 1));
}

/* -------------------------------------------------------------- local storage */

const LS_ACK = 'outing.alerts.ack';
const LS_WATCH = 'outing.admin.watch';
const readLS = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* optional */ } };

/* -------------------------------------------------------------- alert sound */

function useAlarm(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let ctx: AudioContext | null = null;
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) ctx = new AC();
    } catch { ctx = null; }
    const beep = () => {
      try {
        navigator.vibrate?.([500, 200, 500]);
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = 880;
        g.gain.value = 0.18;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.35);
      } catch { /* sound is optional */ }
    };
    beep();
    const t = setInterval(beep, 1400);
    return () => {
      clearInterval(t);
      try { navigator.vibrate?.(0); } catch { /* optional */ }
      try { ctx?.close(); } catch { /* optional */ }
    };
  }, [active]);
}

/* -------------------------------------------------------------- AlertCenter */

interface AlertCenterProps {
  results: AlertSource[];
  cfg: AlertConfig;
  now: number;
}

/** Full-screen alert for faculty (SOS and students not back at the hostel). */
export const AlertCenter: React.FC<AlertCenterProps> = ({ results, cfg, now }) => {
  const alerts = useMemo(() => buildAlerts(results, cfg, now), [results, cfg, now]);
  const [acked, setAcked] = useState<Record<string, true>>(() => {
    try { return JSON.parse(readLS(LS_ACK) || '{}'); } catch { return {}; }
  });
  const [showAll, setShowAll] = useState(false);

  // Forget acknowledgements of alerts that are over, so a new SOS from the same student alerts again.
  const keysSig = alerts.map((a) => a.key).join('|');
  useEffect(() => {
    setAcked((prev) => {
      const live = new Set(alerts.map((a) => a.key));
      const next: Record<string, true> = {};
      let changed = false;
      for (const k of Object.keys(prev)) {
        if (live.has(k)) next[k] = true; else changed = true;
      }
      if (changed) writeLS(LS_ACK, JSON.stringify(next));
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSig]);

  const ack = useCallback((keys: string[]) => {
    setAcked((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = true; });
      writeLS(LS_ACK, JSON.stringify(next));
      return next;
    });
  }, []);

  const pending = alerts.filter((a) => !acked[a.key]);
  const shown = showAll ? alerts : pending;
  const hasSos = shown.some((a) => a.type === 'SOS');
  useAlarm(pending.some((a) => a.type === 'SOS'));

  if (alerts.length === 0) return null;

  if (shown.length === 0) {
    const sosCount = alerts.filter((a) => a.type === 'SOS').length;
    return (
      <button onClick={() => setShowAll(true)}
        className={`anim-pop fixed bottom-4 left-4 z-40 px-3.5 py-2 rounded-full text-white text-xs font-bold shadow-lg flex items-center gap-2 ${sosCount > 0 ? 'bg-red-700' : 'bg-amber-700'}`}>
        <BellRing className="w-4 h-4" />
        {sosCount > 0 ? `${sosCount} SOS` : ''}{sosCount > 0 && alerts.length > sosCount ? ' + ' : ''}
        {alerts.length > sosCount ? `${alerts.length - sosCount} not back` : ''} · View
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-modal="true" aria-label={hasSos ? 'SOS alert' : 'Students not back at the hostel'}
      className={`anim-fade fixed inset-0 z-[70] overflow-y-auto ${hasSos ? 'bg-red-900' : 'bg-amber-900'} text-white`}>
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="text-center mb-4">
          <div className={`w-14 h-14 mx-auto rounded-full bg-white/15 flex items-center justify-center mb-3 ${hasSos ? 'sos-ring' : ''}`}>
            {hasSos ? <AlertOctagon className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
          </div>
          <h1 className="text-2xl font-black tracking-wide">{hasSos ? 'SOS ALERT' : 'STUDENTS NOT BACK'}</h1>
          <p className="text-sm text-white/85 mt-1">
            {hasSos
              ? 'A student needs help now. Call them first.'
              : `These students are still more than ${Math.round(cfg.returnDistanceKm * 1000)} m from the hostel after ${formatDeadline(cfg.returnDeadline)}.`}
          </p>
        </div>

        <div className="space-y-3 stagger">
          {shown.map((a) => {
            const done = Boolean(acked[a.key]);
            return (
              <div key={a.key} className={`rounded-2xl bg-white text-slate-900 p-4 shadow-xl ${done ? 'opacity-70' : ''}`}>
                <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded text-white ${a.type === 'SOS' ? 'bg-red-700' : 'bg-amber-700'}`}>
                  {a.type === 'SOS' ? 'SOS' : 'NOT BACK AT HOSTEL'}
                </span>
                <h2 className="text-xl font-extrabold mt-2 leading-tight">{a.name}</h2>
                <p className="font-mono text-sm font-bold text-slate-600">Roll number: {a.roll}</p>
                <p className="text-base font-bold mt-1 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-slate-500" /> {a.phone || 'Phone not available'}
                </p>
                <p className={`text-lg font-extrabold mt-1 ${a.type === 'SOS' ? 'text-red-700' : 'text-amber-700'}`}>{fmtDist(a.distM)}</p>
                <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 flex-wrap">
                  <MapPin className="w-3.5 h-3.5" />
                  {a.lat !== null && a.lon !== null ? `${a.lat.toFixed(5)}, ${a.lon.toFixed(5)}` : 'Location not shared yet'}
                  <span>· last seen {agoText(a.updatedAt, now)}</span>
                  {a.battery !== null && <span>· battery {a.battery}%</span>}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <a href={a.phone ? `tel:${a.phone.replace(/[^0-9+]/g, '')}` : undefined}
                    className={`py-2.5 rounded-xl text-center text-sm font-bold flex items-center justify-center gap-1.5 text-white ${a.phone ? 'bg-emerald-700' : 'bg-slate-400 pointer-events-none'}`}>
                    <Phone className="w-4 h-4" /> Call
                  </a>
                  <a href={a.lat !== null && a.lon !== null ? `https://www.google.com/maps?q=${a.lat},${a.lon}` : undefined}
                    target="_blank" rel="noopener noreferrer"
                    className={`py-2.5 rounded-xl text-center text-sm font-bold flex items-center justify-center gap-1.5 text-white ${a.lat !== null ? 'bg-blue-700' : 'bg-slate-400 pointer-events-none'}`}>
                    <Navigation className="w-4 h-4" /> Map
                  </a>
                  <button onClick={() => ack([a.key])} disabled={done}
                    className="py-2.5 rounded-xl text-sm font-bold bg-slate-200 text-slate-900 disabled:opacity-60 flex items-center justify-center gap-1.5">
                    <Check className="w-4 h-4" /> {done ? 'Done' : 'Got it'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5">
          {showAll ? (
            <button onClick={() => setShowAll(false)} className="w-full py-3 rounded-xl bg-white text-slate-900 text-sm font-extrabold">Close</button>
          ) : (
            <button onClick={() => ack(pending.map((a) => a.key))} className="w-full py-3 rounded-xl bg-white text-slate-900 text-sm font-extrabold">
              Acknowledge all
            </button>
          )}
        </div>
        <p className="text-[11px] text-center text-white/70 mt-3">
          An SOS stays on the dashboard until the student presses "I'm safe" or you mark them as reached.
        </p>
      </div>
    </div>
  );
};

/* -------------------------------------------------------- student-side notice */

export const ReturnNotice: React.FC<{ cfg: AlertConfig; lat: number | null; lon: number | null; now: number }> = ({ cfg, lat, lon, now }) => {
  const s = returnState(cfg, lat, lon, now);
  if (s.kind === 'off') return null;
  const time = formatDeadline(cfg.returnDeadline);
  let cls = 'bg-amber-50 border-amber-300 text-amber-950';
  let text = '';
  if (s.kind === 'before') {
    text = `Return to the hostel by ${time} (${s.minsLeft} min left). After that your coordinator is alerted if you are more than ${Math.round(cfg.returnDistanceKm * 1000)} m away.`;
  } else if (s.kind === 'late') {
    cls = 'bg-red-50 border-red-300 text-red-950';
    text = `It is past ${time} and you are ${fmtDist(s.distM).replace(' from hostel', '')} from the hostel. Your coordinator has been alerted. Please return now.`;
  } else if (s.kind === 'unknown') {
    text = `It is past ${time} and your location is not available. Turn on location and data so your coordinator can see you.`;
  } else {
    cls = 'bg-emerald-50 border-emerald-300 text-emerald-950';
    text = `You are at the hostel (${s.distM} m). Thank you for returning on time.`;
  }
  return (
    <div className={`anim-pop rounded-xl border p-3 text-xs font-semibold flex items-start gap-2 ${cls}`}>
      <Clock className="w-4 h-4 shrink-0 mt-0.5" /> <span>{text}</span>
    </div>
  );
};

/* ------------------------------------------- background watcher (faculty, Android) */

interface WatchOptions {
  user: User;
  auth: Auth;
  firebaseConfig: { apiKey: string; databaseURL: string };
}

export function useAdminWatch(o: WatchOptions) {
  const [enabled, setEnabledState] = useState<boolean>(() => readLS(LS_WATCH) !== 'false');
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const cb = useRef(o);
  cb.current = o;

  const refresh = useCallback(() => {
    if (!isNativeApp) return;
    OutingNative.getStatus().then(setStatus).catch(() => {});
  }, []);

  const setEnabled = (v: boolean) => { setEnabledState(v); writeLS(LS_WATCH, String(v)); };

  useEffect(() => {
    if (!isNativeApp) return;
    if (!enabled) {
      OutingNative.stopAdminWatch().catch(() => {});
      refresh();
      return;
    }
    let off: (() => void) | null = null;
    let cancelled = false;
    const push = async (u: User) => {
      const res = await u.getIdTokenResult();
      await OutingNative.setAuth({
        uid: u.uid,
        apiKey: cb.current.firebaseConfig.apiKey,
        databaseUrl: cb.current.firebaseConfig.databaseURL,
        idToken: res.token,
        refreshToken: u.refreshToken,
        expiresAt: Date.parse(res.expirationTime) || Date.now() + 50 * 60 * 1000,
      });
    };
    (async () => {
      try {
        setError(null);
        await push(cb.current.user);
        if (cancelled) return;
        setStatus(await OutingNative.startAdminWatch());
        off = onIdTokenChanged(cb.current.auth, (u) => { if (u) push(u).catch(() => {}); });
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; if (off) off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, o.user.uid]);

  // Signing out of the faculty portal ends the watcher and forgets the sign-in.
  useEffect(() => {
    if (!isNativeApp) return;
    return () => {
      OutingNative.stopAdminWatch().catch(() => {});
      OutingNative.clearAuth().catch(() => {});
    };
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [refresh]);

  const sendTest = async () => {
    try {
      setTesting(true);
      await OutingNative.sendTestAlert();
      setTimeout(() => setTesting(false), 12000);
    } catch (e: any) {
      setTesting(false);
      setError(String(e?.message || e));
    }
  };

  return { supported: isNativeApp, enabled, setEnabled, status, error, refresh, sendTest, testing };
}

export type AdminWatch = ReturnType<typeof useAdminWatch>;

/** Settings card shown on the faculty portal in the Android app. */
export const AdminAlertsCard: React.FC<{ watch: AdminWatch }> = ({ watch }) => {
  if (!watch.supported) return null;
  const s = watch.status;
  const needFull = s && !s.fullScreen;
  const needBattery = s && !s.battery;
  const needNotif = s && !s.notifications;

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 mb-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shrink-0">
            <BellRing className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Alerts when the app is closed</h3>
            <p className={`text-[11px] ${watch.enabled && s?.adminWatchRunning ? 'text-emerald-700' : 'text-slate-500'}`}>
              {watch.enabled ? (s?.adminWatchRunning ? 'On. SOS and late-return alerts appear even on the lock screen.' : 'Starting…') : 'Off. You only see alerts while this app is open.'}
            </p>
          </div>
        </div>
        <button role="switch" aria-checked={watch.enabled} aria-label="Alerts when the app is closed"
          onClick={() => watch.setEnabled(!watch.enabled)}
          className={`relative w-12 h-7 rounded-full shrink-0 ${watch.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}>
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${watch.enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {watch.enabled && (
        <>
          {(needFull || needBattery || needNotif) && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
              <BatteryWarning className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                {needNotif && <div>Notifications are off. <button className="font-bold underline" onClick={() => OutingNative.requestNotifications().then(watch.refresh).catch(() => {})}>Allow</button></div>}
                {needFull && <div>Full-screen alerts are off for this app. <button className="font-bold underline" onClick={() => OutingNative.openFullScreenSettings().then(watch.refresh).catch(() => {})}>Turn on</button></div>}
                {needBattery && <div>Battery saving can stop alerts when the phone is locked. <button className="font-bold underline" onClick={() => OutingNative.requestBatteryExemption().then(watch.refresh).catch(() => {})}>Fix this</button></div>}
              </div>
            </div>
          )}
          <button onClick={watch.sendTest} disabled={watch.testing}
            className="w-full py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-60 text-xs font-semibold text-slate-800">
            {watch.testing ? 'Test alert in 10 seconds. Lock your phone now…' : 'Send a test alert (arrives in 10 seconds)'}
          </button>
          {watch.error && <p className="text-[11px] text-red-700">{watch.error}</p>}
        </>
      )}
    </div>
  );
};
