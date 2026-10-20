import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MapPin, Bell, Navigation, BatteryCharging, ShieldCheck, Check, X, Settings, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { OutingNative, type NativeStatus } from './native';

/**
 * Shown when the Android app opens. It asks for every permission the app needs, one system
 * pop-up after another, then lets the student in. Skipped automatically when all are granted.
 */

type StepKey = 'location' | 'notifications' | 'background' | 'gps' | 'battery';

interface Step {
  key: StepKey;
  title: string;
  why: string;
  icon: React.ReactNode;
  /** Required for tracking to work at all. */
  essential: boolean;
  isOn: (s: NativeStatus) => boolean;
  applies: (s: NativeStatus) => boolean;
  ask: () => Promise<NativeStatus>;
  /** Button label when the system will not show the pop-up again. */
  fallbackLabel: string;
}

const STEPS: Step[] = [
  {
    key: 'location',
    title: 'Precise location',
    why: 'Lets your coordinator see where you are during the outing.',
    icon: <MapPin className="w-5 h-5" />,
    essential: true,
    isOn: (s) => s.precise,
    applies: () => true,
    ask: () => OutingNative.requestLocation(),
    fallbackLabel: 'Open settings',
  },
  {
    key: 'notifications',
    title: 'Notifications',
    why: 'Alerts you if your location stops reaching your coordinator, and shows the SOS countdown.',
    icon: <Bell className="w-5 h-5" />,
    essential: true,
    isOn: (s) => s.notifications,
    applies: () => true,
    ask: () => OutingNative.requestNotifications(),
    fallbackLabel: 'Open settings',
  },
  {
    key: 'background',
    title: 'Location "Allow all the time"',
    why: 'Keeps tracking and shake-SOS working when the screen is locked or you use other apps.',
    icon: <Navigation className="w-5 h-5" />,
    essential: false,
    isOn: (s) => s.background,
    applies: (s) => s.sdk >= 29,
    ask: () => OutingNative.requestBackgroundLocation(),
    fallbackLabel: 'Open settings',
  },
  {
    key: 'gps',
    title: 'Turn on device location (GPS)',
    why: 'Location must be switched on in your phone for coordinates to be read.',
    icon: <MapPin className="w-5 h-5" />,
    essential: true,
    isOn: (s) => s.gps,
    applies: () => true,
    ask: () => OutingNative.requestGps(),
    fallbackLabel: 'Open settings',
  },
  {
    key: 'battery',
    title: 'Unrestricted battery use',
    why: 'Stops Android from putting the app to sleep and cutting off tracking and shake-SOS.',
    icon: <BatteryCharging className="w-5 h-5" />,
    essential: false,
    isOn: (s) => s.battery,
    applies: (s) => s.sdk >= 23,
    ask: () => OutingNative.requestBatteryExemption(),
    fallbackLabel: 'Open settings',
  },
];

const PermissionGate: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [busy, setBusy] = useState<StepKey | null>(null);
  const [tried, setTried] = useState<Partial<Record<StepKey, boolean>>>({});
  const [autoDone, setAutoDone] = useState(false);
  const started = useRef(false);
  const finished = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await OutingNative.getStatus();
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  const allGranted = (s: NativeStatus) => STEPS.every((st) => !st.applies(s) || st.isOn(s));
  const essentialsGranted = (s: NativeStatus) => STEPS.every((st) => !st.essential || !st.applies(s) || st.isOn(s));

  // On open: ask for everything that is missing, one pop-up after another.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      let s = await refresh();
      if (!s) { finish(); return; }          // plugin not available: do not block the app
      if (allGranted(s)) { finish(); return; }
      for (const step of STEPS) {
        if (!step.applies(s) || step.isOn(s)) continue;
        setBusy(step.key);
        try { s = (await step.ask()) ?? s; } catch { /* user dismissed */ }
        setBusy(null);
        setTried((t) => ({ ...t, [step.key]: true }));
        s = (await refresh()) ?? s;
      }
      setAutoDone(true);
      if (allGranted(s)) finish();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back from a settings screen: re-check.
  useEffect(() => {
    const check = async () => {
      const s = await refresh();
      if (s && autoDone && allGranted(s)) finish();
    };
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(check, 2000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDone]);

  const tapStep = async (step: Step) => {
    if (!status) return;
    // If we already asked once and it is still off, Android will not show the pop-up again.
    const needsSettings = tried[step.key] && (step.key === 'location' || step.key === 'notifications' || step.key === 'background');
    setBusy(step.key);
    try {
      if (needsSettings) await OutingNative.openAppSettings();
      else setStatus((await step.ask()) ?? status);
    } catch { /* ignore */ }
    setBusy(null);
    setTried((t) => ({ ...t, [step.key]: true }));
    await refresh();
  };

  if (!status) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-300 text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Checking permissions…
      </div>
    );
  }

  const visible = STEPS.filter((s) => s.applies(status));
  const ready = essentialsGranted(status);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="px-5 pt-8 pb-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-4">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold">Allow permissions</h1>
        <p className="text-sm text-slate-300 mt-1">
          For your safety the app needs these. Tap <b>Allow</b> on each pop-up. Without them your coordinator cannot see you and SOS will not work.
        </p>
      </header>

      <main className="flex-1 px-4 pb-4 space-y-2.5 overflow-y-auto">
        {visible.map((step) => {
          const on = step.isOn(status);
          const working = busy === step.key;
          const denied = !on && tried[step.key] && !working;
          const toSettings = denied && (step.key === 'location' || step.key === 'notifications' || step.key === 'background');
          return (
            <div key={step.key}
              className={`rounded-xl border p-3.5 flex items-start gap-3 ${on ? 'bg-emerald-950/60 border-emerald-700/60' : denied ? 'bg-red-950/50 border-red-700/60' : 'bg-slate-800 border-slate-700'}`}>
              <div className={`mt-0.5 shrink-0 ${on ? 'text-emerald-400' : denied ? 'text-red-300' : 'text-amber-400'}`}>{step.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold">{step.title}</h2>
                  {!step.essential && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Recommended</span>}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">{step.why}</p>
                {!on && (
                  <button onClick={() => tapStep(step)} disabled={working}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-900 text-xs font-bold inline-flex items-center gap-1.5">
                    {working ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : toSettings ? <Settings className="w-3.5 h-3.5" /> : null}
                    {working ? 'Waiting…' : toSettings ? step.fallbackLabel : denied ? 'Try again' : 'Allow'}
                  </button>
                )}
                {toSettings && step.key === 'background' && (
                  <p className="text-[11px] text-slate-400 mt-1.5">In settings choose Location, then "Allow all the time".</p>
                )}
                {toSettings && step.key === 'location' && (
                  <p className="text-[11px] text-slate-400 mt-1.5">In settings choose Location, then "Allow" and turn on "Use precise location".</p>
                )}
              </div>
              <div className="shrink-0 mt-0.5">
                {on ? <Check className="w-5 h-5 text-emerald-400" /> : denied ? <X className="w-5 h-5 text-red-300" /> : null}
              </div>
            </div>
          );
        })}
      </main>

      <footer className="p-4 border-t border-slate-800 space-y-2">
        {!ready && autoDone && (
          <div className="flex items-start gap-2 text-xs text-amber-200 bg-amber-950/50 border border-amber-800/60 rounded-lg p-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Students must allow the required permissions. Faculty can continue without them.
          </div>
        )}
        <button onClick={finish} disabled={!ready && !autoDone}
          className={`w-full py-3 rounded-xl text-sm font-bold ${ready ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-40'}`}>
          {ready ? 'Continue' : 'Continue anyway'}
        </button>
      </footer>
    </div>
  );
};

export default PermissionGate;
