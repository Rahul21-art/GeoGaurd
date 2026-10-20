import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onIdTokenChanged, type Auth, type User } from 'firebase/auth';
import { Smartphone, AlertOctagon, BatteryWarning } from 'lucide-react';
import { OutingNative, SENSITIVITY, isNativeApp, type NativeStatus } from './native';

/**
 * Shake-to-send-SOS (Android app only).
 *
 * The detection itself runs in a native foreground service (ShakeSosService.java), so it keeps
 * working with the screen off and the phone locked. This file turns it on and off, shows the
 * settings card and the on-screen countdown, and keeps the native side signed in so it can
 * write the SOS flag even if the web view is asleep.
 */

const LS_ENABLED = 'outing.shake.enabled';
const LS_SENS = 'outing.shake.sensitivity';

const readLS = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const writeLS = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* optional */ }
};

interface Options {
  /** True while the student is on an outing (tracking on). */
  active: boolean;
  user: User;
  auth: Auth;
  firebaseConfig: { apiKey: string; databaseURL: string };
  /** Current SOS state in the app. */
  sos: boolean;
  /** Native code fired an SOS (shake). */
  onSosFromShake: () => void;
  /** SOS was cleared from the notification ("I'm safe"). */
  onSosCleared: () => void;
}

export function useShakeSos(o: Options) {
  const [enabled, setEnabledState] = useState<boolean>(() => readLS(LS_ENABLED) !== 'false');
  const [sensitivity, setSensitivityState] = useState<number>(() => {
    const n = Number(readLS(LS_SENS));
    return n === 0 || n === 1 || n === 2 ? n : 1;
  });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [testHits, setTestHits] = useState(0);
  const [progress, setProgress] = useState<{ count: number; needed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<NativeStatus | null>(null);

  const cb = useRef(o);
  cb.current = o;

  const setEnabled = (v: boolean) => { setEnabledState(v); writeLS(LS_ENABLED, String(v)); };
  const setSensitivity = (v: number) => { setSensitivityState(v); writeLS(LS_SENS, String(v)); };

  const refreshStatus = useCallback(() => {
    if (!isNativeApp) return;
    OutingNative.getStatus().then(setStatus).catch(() => {});
  }, []);

  // Events coming from the native service
  useEffect(() => {
    if (!isNativeApp) return;
    const handles = [
      OutingNative.addListener('shakeCountdown', (d) => setCountdown(d.secondsLeft)),
      OutingNative.addListener('shakeCancelled', () => setCountdown(null)),
      OutingNative.addListener('sosTriggered', () => { setCountdown(null); cb.current.onSosFromShake(); }),
      OutingNative.addListener('sosCleared', () => cb.current.onSosCleared()),
      OutingNative.addListener('shakeProgress', (d) => setProgress(d)),
      OutingNative.addListener('shakeTest', () => { setTestHits((n) => n + 1); setProgress(null); }),
      OutingNative.addListener('shakeError', (d) => setError(d.message)),
    ];
    return () => { handles.forEach((p) => p.then((h) => h.remove()).catch(() => {})); };
  }, []);

  // Turn the service on while the student is on an outing, off otherwise
  useEffect(() => {
    if (!isNativeApp) return;
    if (o.active && enabled) {
      setError(null);
      OutingNative.startShake({ sensitivity }).then(setStatus).catch((e) => setError(String(e?.message || e)));
    } else {
      OutingNative.stopShake().catch(() => {});
      setCountdown(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.active, enabled]);

  useEffect(() => {
    if (isNativeApp && o.active && enabled) OutingNative.configureShake({ sensitivity }).catch(() => {});
  }, [sensitivity, o.active, enabled]);

  // Stop everything when the student signs out / leaves this screen
  useEffect(() => {
    if (!isNativeApp) return;
    return () => {
      OutingNative.stopShake().catch(() => {});
      OutingNative.clearAuth().catch(() => {});
    };
  }, []);

  // Give the native service a sign-in it can use to write the SOS flag by itself
  useEffect(() => {
    if (!isNativeApp || !o.active || !enabled) return;
    const push = async (u: User) => {
      try {
        const res = await u.getIdTokenResult();
        await OutingNative.setAuth({
          uid: u.uid,
          apiKey: cb.current.firebaseConfig.apiKey,
          databaseUrl: cb.current.firebaseConfig.databaseURL,
          idToken: res.token,
          refreshToken: u.refreshToken,
          expiresAt: Date.parse(res.expirationTime) || Date.now() + 50 * 60 * 1000,
        });
      } catch { /* retried on the next token refresh */ }
    };
    push(o.user);
    return onIdTokenChanged(o.auth, (u) => { if (u) push(u); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.active, enabled, o.user.uid]);

  // Tell native code when an SOS is on or off so the gesture can fire again afterwards
  useEffect(() => {
    if (isNativeApp) OutingNative.setSosActive({ active: o.sos }).catch(() => {});
  }, [o.sos]);

  useEffect(() => { refreshStatus(); }, [refreshStatus, o.active]);

  const cancelCountdown = () => {
    setCountdown(null);
    OutingNative.cancelCountdown().catch(() => {});
  };

  const testTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTest = useCallback(() => {
    if (testTimer.current) clearTimeout(testTimer.current);
    testTimer.current = null;
    setTesting(false);
    setProgress(null);
    OutingNative.configureShake({ test: false }).catch(() => {});
  }, []);
  const startTest = () => {
    setTestHits(0);
    setProgress(null);
    setTesting(true);
    OutingNative.configureShake({ test: true, sensitivity }).catch(() => {});
    testTimer.current = setTimeout(stopTest, 25000);
  };
  useEffect(() => () => { if (testTimer.current) clearTimeout(testTimer.current); }, []);

  return {
    supported: isNativeApp,
    enabled, setEnabled,
    sensitivity, setSensitivity,
    countdown, cancelCountdown,
    testing, testHits, progress, startTest, stopTest,
    error, status, refreshStatus,
  };
}

export type ShakeSos = ReturnType<typeof useShakeSos>;

/** Full-screen countdown shown when the app is open and a shake started the SOS timer. */
export const ShakeCountdownOverlay: React.FC<{ shake: ShakeSos }> = ({ shake }) => {
  if (shake.countdown === null) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-label="SOS countdown"
      className="fixed inset-0 z-[60] bg-red-700 text-white flex flex-col items-center justify-center p-6 text-center animate-pulse">
      <AlertOctagon className="w-14 h-14 mb-4" />
      <p className="text-lg font-bold">Shake detected</p>
      <p className="text-sm text-white/90 mt-1">Sending SOS to your coordinator in</p>
      <div className="text-8xl font-black font-mono my-5">{shake.countdown}</div>
      <button onClick={shake.cancelCountdown}
        className="w-full max-w-xs py-4 rounded-2xl bg-white text-red-800 text-lg font-extrabold shadow-lg">
        CANCEL
      </button>
      <p className="text-xs text-white/80 mt-3">Tap cancel if this was a mistake.</p>
    </div>
  );
};

/** Settings card for the student portal. */
export const ShakeSosCard: React.FC<{ shake: ShakeSos; tracking: boolean }> = ({ shake, tracking }) => {
  if (!shake.supported) return null;
  const s = shake.status;
  const needsBattery = s && !s.battery;
  const noSensor = s && !s.accelerometer;

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Shake to send SOS</h3>
            <p className={`text-[11px] ${shake.enabled && tracking ? 'text-emerald-700' : 'text-slate-500'}`}>
              {noSensor ? 'Not available on this phone'
                : shake.enabled ? (tracking ? 'On, works even when the phone is locked' : 'On, starts with your outing') : 'Off'}
            </p>
          </div>
        </div>
        <button role="switch" aria-checked={shake.enabled} aria-label="Shake to send SOS"
          onClick={() => shake.setEnabled(!shake.enabled)} disabled={Boolean(noSensor)}
          className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-40 ${shake.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}>
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${shake.enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {shake.enabled && (
        <>
          <p className="text-xs text-slate-600">
            Shake your phone hard back and forth. A 5-second countdown starts with vibration. Tap <b>Cancel</b> to stop a false alarm, otherwise your coordinator gets the SOS.
          </p>

          <div>
            <span className="text-[11px] font-semibold text-slate-600 block mb-1">Sensitivity</span>
            <div className="grid grid-cols-3 gap-1.5">
              {SENSITIVITY.map((l) => (
                <button key={l.value} onClick={() => shake.setSensitivity(l.value)}
                  className={`py-1.5 rounded-lg border text-xs font-semibold ${shake.sensitivity === l.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{SENSITIVITY[shake.sensitivity]?.hint}. Pick Low if it triggers while walking, High if it is hard to trigger.</p>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            {!shake.testing ? (
              <button onClick={shake.startTest} disabled={!tracking}
                className="w-full py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold text-slate-800">
                Test shake (no SOS is sent)
              </button>
            ) : (
              <div className="text-xs text-slate-800 space-y-1.5">
                <p className="font-semibold">Shake your phone now…</p>
                <p>
                  Detected: <span className="font-mono font-bold">{shake.testHits}</span>
                  {shake.progress ? <span className="text-slate-500"> · {shake.progress.count}/{shake.progress.needed}</span> : null}
                </p>
                <button onClick={shake.stopTest} className="text-slate-600 underline">Stop test</button>
              </div>
            )}
            {!tracking && <p className="text-[11px] text-slate-500 mt-1.5">Available while your outing is active.</p>}
          </div>

          {needsBattery && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
              <BatteryWarning className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                Battery optimisation can stop shake SOS when the phone is locked.
                <button onClick={() => OutingNative.requestBatteryExemption().then(() => shake.refreshStatus()).catch(() => {})}
                  className="ml-1 font-bold underline">Fix this</button>
              </div>
            </div>
          )}
          {shake.error && <p className="text-[11px] text-red-700">{shake.error}</p>}
        </>
      )}
    </div>
  );
};
