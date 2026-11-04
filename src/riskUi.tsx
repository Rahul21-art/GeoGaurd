import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, ChevronDown, ChevronUp, Phone, Navigation, Clock, Footprints } from 'lucide-react';
import { assessRisk, motionFrom, destination, isDark, leaveInMinutes, walkingMinutes, deadlineAbs, type Sample, type Motion, type RiskResult, type RiskLevel } from './risk';
import { useRemoteness, type RemotePoint } from './remote';
import { hostelPoint, deadlineMinutes, formatDeadline, metresFromHostel, type AlertConfig } from './alerts';

/**
 * Smart Safety Mode, screens and wiring.
 * The scoring itself is in risk.ts. History of each student is kept in memory while the faculty app
 * is open, so the direction and speed numbers appear a few minutes after a student starts moving.
 */

export interface RiskStudent {
  uid: string;
  name: string;
  roll: string;
  phone: string;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  battery: number | null;
  status: 'SAFE' | 'OUT_OF_RANGE' | 'LOCATION_UNAVAILABLE' | 'SIGNAL_LOST';
  isBreach: boolean;
  radiusKm: number;
  sos: boolean;
  updatedAt: number | null;
}

const COLORS: Record<RiskLevel, { pill: string; bar: string; text: string }> = {
  GREEN: { pill: 'bg-emerald-50 text-emerald-800 border-emerald-300', bar: 'bg-emerald-500', text: 'Low' },
  YELLOW: { pill: 'bg-amber-50 text-amber-900 border-amber-400', bar: 'bg-amber-500', text: 'Watch' },
  RED: { pill: 'bg-red-50 text-red-800 border-red-400', bar: 'bg-red-600', text: 'High' },
};

const HOLD_MS = 20 * 60000;
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function useRiskAssessments(students: RiskStudent[], cfg: AlertConfig, now: number): Record<string, RiskResult> {
  const hist = useRef<Record<string, Sample[]>>({});
  const hostel = hostelPoint(cfg);

  // Keep the last 20 minutes of fixes of each student.
  const motions = useMemo(() => {
    const out: Record<string, Motion> = {};
    const alive = new Set<string>();
    for (const s of students) {
      alive.add(s.uid);
      const list = (hist.current[s.uid] ||= []);
      if (s.lat !== null && s.lon !== null && s.updatedAt && s.status !== 'LOCATION_UNAVAILABLE') {
        const last = list[list.length - 1];
        if (!last || last.t !== s.updatedAt) list.push({ t: s.updatedAt, lat: s.lat, lon: s.lon, battery: s.battery });
      }
      while (list.length > 0 && now - list[0].t > HOLD_MS) list.shift();
      out[s.uid] = motionFrom(list, hostel, now);
    }
    Object.keys(hist.current).forEach((k) => { if (!alive.has(k)) delete hist.current[k]; });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, now, hostel.lat, hostel.lon]);

  // Areas to look up: where the student is, and a spot 400 m ahead when they are walking.
  const points = useMemo(() => {
    const p: RemotePoint[] = [];
    for (const s of students) {
      if (s.lat === null || s.lon === null || s.sos) continue;
      const d = metresFromHostel(cfg, s.lat, s.lon);
      if (d === null || d < 500) continue;
      p.push({ key: s.uid, lat: s.lat, lon: s.lon });
      const m = motions[s.uid];
      if (m?.headingDeg != null && (m.speedMs ?? 0) >= 0.6) {
        const a = destination({ lat: s.lat, lon: s.lon }, m.headingDeg, 400);
        p.push({ key: s.uid + ':ahead', lat: a.lat, lon: a.lon });
      }
    }
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.map((s) => `${s.uid}:${s.lat?.toFixed(3)},${s.lon?.toFixed(3)}`).join('|'), Object.values(motions).map((m) => Math.round(m.headingDeg ?? -1) >> 5).join(',')]);
  const remote = useRemoteness(points);

  return useMemo(() => {
    const out: Record<string, RiskResult> = {};
    const dl = deadlineMinutes(cfg.returnDeadline);
    const away = students.filter((s) => s.lat !== null && s.lon !== null && (metresFromHostel(cfg, s.lat, s.lon) ?? 0) > cfg.returnDistanceKm * 1000);
    for (const s of students) {
      const dist = metresFromHostel(cfg, s.lat, s.lon);
      let companions = 0;
      if (s.lat !== null && s.lon !== null) {
        for (const o of away) {
          if (o.uid === s.uid) continue;
          const dy = (o.lat! - s.lat) * 111320;
          const dx = (o.lon! - s.lon) * 111320 * Math.cos((s.lat * Math.PI) / 180);
          if (dx * dx + dy * dy <= 100 * 100) companions++;
        }
      }
      out[s.uid] = assessRisk({
        now, deadlineMinutes: dl, deadlineLabel: formatDeadline(cfg.returnDeadline), returnLimitM: cfg.returnDistanceKm * 1000,
        distToHostelM: dist, radiusKm: s.radiusKm, isBreach: s.isBreach, sos: s.sos, status: s.status,
        battery: s.battery, charging: false, accuracyM: s.accuracy, updatedAt: s.updatedAt, motion: motions[s.uid] ?? null,
        remote: remote[s.uid] ?? null, remoteAhead: remote[s.uid + ':ahead'] ?? null, companions,
        isDark: s.lat !== null && s.lon !== null ? isDark(s.lat, s.lon, now) : false,
      });
    }
    return out;
  }, [students, motions, remote, cfg, now]);
}

export const RiskBadge: React.FC<{ risk?: RiskResult }> = ({ risk }) => {
  if (!risk || risk.level === 'GREEN') return null;
  const c = COLORS[risk.level];
  return (
    <span title={risk.headline} className={`px-2 py-0.5 rounded text-xs font-bold border ${c.pill}`}>
      Risk {risk.score} · {c.text}
    </span>
  );
};

export function etaText(r: RiskResult): string | null {
  const e = r.eta;
  if (!e) return null;
  const mode = e.mode.includes('vehicle') ? 'by vehicle' : 'on foot';
  const guess = e.confidence === 'low' ? ' (estimate)' : '';
  const when = `about ${Math.max(1, Math.round(e.minutes))} min ${mode}, arrives ${timeOf(e.arrivalMs)}${guess}`;
  if (e.predictedLate) return `Will be late: ${when}, ${Math.round(e.lateByMin)} min after the return time`;
  return `Should be back in time: ${when}`;
}

interface RadarProps {
  students: RiskStudent[];
  risks: Record<string, RiskResult>;
  onCall: (uid: string) => void;
}

export const RiskRadar: React.FC<RadarProps> = ({ students, risks, onCall }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () => students.map((s) => ({ s, r: risks[s.uid] })).filter((x) => x.r && x.r.level !== 'GREEN').sort((a, b) => b.r.score - a.r.score),
    [students, risks]
  );
  const counts = { red: rows.filter((x) => x.r.level === 'RED').length, yellow: rows.filter((x) => x.r.level === 'YELLOW').length };
  const green = students.length - rows.length;
  const prevRed = useRef(0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (counts.red > prevRed.current) { setFlash(true); const t = setTimeout(() => setFlash(false), 15000); prevRed.current = counts.red; return () => clearTimeout(t); }
    prevRed.current = counts.red;
  }, [counts.red]);
  if (students.length === 0) return null;
  const shown = all ? rows : rows.slice(0, 4);
  return (
    <div className={`rounded-xl border bg-white p-4 ${counts.red > 0 ? 'border-red-300' : 'border-slate-200'} ${flash ? 'ring-2 ring-red-500/40' : ''}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-slate-700" /> Safety Radar</h2>
        <div className="flex gap-2 text-xs font-bold">
          <span className="px-2 py-0.5 rounded border bg-red-50 text-red-800 border-red-300">{counts.red} High</span>
          <span className="px-2 py-0.5 rounded border bg-amber-50 text-amber-900 border-amber-400">{counts.yellow} Watch</span>
          <span className="px-2 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-300">{green} Low</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-600 mt-2">No student shows warning signs right now.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {shown.map(({ s, r }) => {
            const c = COLORS[r.level];
            const isOpen = open === s.uid;
            const eta = etaText(r);
            return (
              <div key={s.uid} className="rounded-lg border border-slate-200 overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : s.uid)} className="w-full text-left p-3 flex items-center gap-3">
                  <div className="w-10 shrink-0">
                    <div className="text-sm font-bold font-mono">{r.score}</div>
                    <div className="h-1.5 rounded bg-slate-100 mt-0.5"><div className={`h-1.5 rounded ${c.bar}`} style={{ width: `${r.score}%` }} /></div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{s.name} <span className="font-mono text-xs text-slate-500">{s.roll}</span></div>
                    <div className="text-xs text-slate-600 truncate">{r.headline}</div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 text-xs space-y-2 border-t border-slate-100 pt-2">
                    {eta && <p className={`font-semibold flex items-start gap-1.5 ${r.eta?.predictedLate ? 'text-red-800' : 'text-slate-700'}`}><Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />{eta}</p>}
                    <ul className="space-y-1">
                      {r.factors.map((f) => (
                        <li key={f.key} className="flex gap-2"><span className={`font-mono font-bold w-8 text-right ${f.points < 0 ? 'text-emerald-700' : 'text-slate-800'}`}>{f.points > 0 ? '+' : ''}{f.points}</span><span className="text-slate-700">{f.label}</span></li>
                      ))}
                    </ul>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => onCall(s.uid)} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-semibold flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Call</button>
                      {s.lat !== null && (
                        <a href={`https://www.google.com/maps?q=${s.lat},${s.lon}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold flex items-center gap-1.5"><Navigation className="w-3.5 h-3.5" /> Map</a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {rows.length > 4 && (
            <button onClick={() => setAll(!all)} className="text-xs font-semibold text-slate-600 hover:text-slate-900">{all ? 'Show fewer' : `Show all ${rows.length}`}</button>
          )}
        </div>
      )}
      <p className="text-[11px] text-slate-500 mt-3">A score helps you decide who to call first. It is a guide, not a certainty. It updates while this app is open.</p>
    </div>
  );
};

/* ---------------------------------------------------------- student side */

interface NudgeProps {
  cfg: AlertConfig;
  lat: number | null;
  lon: number | null;
  now: number;
  notify: (title: string, body: string) => void;
}

/** "Start back by 5:25 PM" for a student who is within walking distance of the hostel. */
export const LeaveNudge: React.FC<NudgeProps> = ({ cfg, lat, lon, now, notify }) => {
  const dist = metresFromHostel(cfg, lat, lon);
  const dl = deadlineAbs(now, deadlineMinutes(cfg.returnDeadline));
  const minsLeft = (dl - now) / 60000;
  const applies = cfg.returnAlertsEnabled && dist !== null && dist > cfg.returnDistanceKm * 1000 && minsLeft > 0 && minsLeft <= 240;
  const leaveIn = applies && dist !== null ? leaveInMinutes(dist, minsLeft) : null;
  const fired = useRef(false);
  const now0 = leaveIn !== null && leaveIn <= 0;
  useEffect(() => {
    if (now0 && !fired.current) {
      fired.current = true;
      notify('Time to head back', `Leave now to be at the hostel by ${formatDeadline(cfg.returnDeadline)}.`);
    }
    if (!applies) fired.current = false;
  }, [now0, applies]);
  if (!applies || dist === null) return null;
  const walk = walkingMinutes(dist);
  if (leaveIn === null) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-950 p-3 text-xs font-semibold flex gap-2"><Footprints className="w-4 h-4 shrink-0 mt-0.5" /><span>You are far from the hostel. Arrange a vehicle early so you are back by {formatDeadline(cfg.returnDeadline)}.</span></div>
    );
  }
  const cls = leaveIn <= 0 ? 'bg-red-50 border-red-300 text-red-950' : leaveIn <= 15 ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-slate-50 border-slate-200 text-slate-800';
  return (
    <div className={`rounded-xl border p-3 text-xs font-semibold flex gap-2 ${cls}`}>
      <Footprints className="w-4 h-4 shrink-0 mt-0.5" />
      <span>
        {leaveIn <= 0
          ? `Leave now. The walk back is about ${walk} min and the return time is ${formatDeadline(cfg.returnDeadline)}.`
          : `The walk back is about ${walk} min. Start by ${timeOf(now + leaveIn * 60000)} to be home by ${formatDeadline(cfg.returnDeadline)}.`}
      </span>
    </div>
  );
};
