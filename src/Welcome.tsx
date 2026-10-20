import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, MapPin, BellRing } from 'lucide-react';

/**
 * Welcome screen shown for a couple of seconds every time the app opens.
 * Tap anywhere to skip. The animation itself lives in src/index.css (.splash).
 */

const SHOW_MS = 2600;
const LEAVE_MS = 450;

const features = [
  { icon: <MapPin className="w-3.5 h-3.5" />, text: 'Live location' },
  { icon: <ShieldCheck className="w-3.5 h-3.5" />, text: 'Safe zone alerts' },
  { icon: <BellRing className="w-3.5 h-3.5" />, text: 'One-shake SOS' },
];

const WelcomeSplash: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    setTimeout(onDone, LEAVE_MS);
  }, [onDone]);

  useEffect(() => {
    const t = setTimeout(leave, SHOW_MS);
    return () => clearTimeout(t);
  }, [leave]);

  return (
    <div className={`splash ${leaving ? 'leaving' : ''}`} onClick={leave} role="button" aria-label="Continue">
      {/* soft moving colour behind everything */}
      <div className="splash-glow bg-blue-600" style={{ top: '-120px', left: '-140px' }} />
      <div className="splash-glow bg-amber-500" style={{ bottom: '-160px', right: '-140px', opacity: 0.22, animationDelay: '-4s' }} />

      <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
        <span className="splash-ring" />
        <span className="splash-ring" style={{ animationDelay: '1s' }} />
        <span className="splash-ring" style={{ animationDelay: '2s' }} />
        <img
          src="/app-icon.png"
          alt="JNTU-GV Tracking App"
          className="anim-pop float-slow relative w-36 h-36 rounded-[2rem] shadow-2xl shadow-blue-900/60"
          style={{ animationDelay: '0.1s' }}
        />
      </div>

      <p className="anim-up mt-8 text-[11px] font-bold tracking-[0.35em] text-amber-400 uppercase" style={{ '--d': '0.35s' } as React.CSSProperties}>
        Welcome to the
      </p>
      <h1 className="anim-up text-shimmer mt-2 text-3xl sm:text-4xl font-black leading-tight" style={{ '--d': '0.5s' } as React.CSSProperties}>
        JNTU-GV
        <br />
        Tracking App
      </h1>
      <p className="anim-up mt-3 text-sm text-slate-300 max-w-xs" style={{ '--d': '0.7s' } as React.CSSProperties}>
        Safe outings. Every step tracked.
      </p>

      <div className="anim-up mt-6 flex flex-wrap items-center justify-center gap-2" style={{ '--d': '0.9s' } as React.CSSProperties}>
        {features.map((f) => (
          <span key={f.text}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-semibold text-slate-100 backdrop-blur">
            {f.icon}{f.text}
          </span>
        ))}
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-44">
        <div className="h-1 rounded-full bg-white/15 overflow-hidden">
          <div className="splash-bar h-full rounded-full bg-gradient-to-r from-blue-400 to-amber-400" />
        </div>
        <p className="mt-2 text-[10px] tracking-wider text-slate-400 uppercase">Tap to continue</p>
      </div>
    </div>
  );
};

export default WelcomeSplash;
