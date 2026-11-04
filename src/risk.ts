/**
 * Smart Safety Mode: risk score and "will be late" prediction.
 *
 * Everything here is plain arithmetic on data the app already has (location, battery, signal, time),
 * plus two optional context signals: how isolated the area is, and whether other students are
 * nearby. There is no server and no AI service. The weights are listed in one place (assessRisk)
 * so they can be tuned.
 *
 * This is an early-warning aid. It does not replace SOS or the return-time alerts.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Sample {
  /** Epoch milliseconds of the location fix. */
  t: number;
  lat: number;
  lon: number;
  battery?: number | null;
}

export interface Motion {
  /** Metres per second over the last 1 to 2 minutes, or null with too little data. */
  speedMs: number | null;
  /** Direction of travel in degrees (0 = north), or null when standing still. */
  headingDeg: number | null;
  /** Change in distance from the hostel in metres per minute. Positive = moving away. */
  awayRateMPerMin: number | null;
  /** How long the student has stayed within 40 m of the current spot. */
  stationaryMin: number;
  /** Minutes of history behind these numbers. */
  spanMin: number;
  /** Battery percent lost per 10 minutes, or null. */
  batteryDropPer10Min: number | null;
  samples: number;
}

export type RiskLevel = 'GREEN' | 'YELLOW' | 'RED';

export interface Factor {
  key: string;
  /** Points added to the score (negative = lowers the risk). */
  points: number;
  /** Full sentence for the detail screen. */
  label: string;
  /** Few words for the one-line summary. */
  short: string;
}

export interface Eta {
  minutes: number;
  arrivalMs: number;
  mode: 'walking' | 'vehicle' | 'assumed-walking' | 'assumed-vehicle';
  confidence: 'low' | 'medium' | 'high';
  /** Minutes past the return time at arrival (negative = arrives early). */
  lateByMin: number;
  predictedLate: boolean;
  /** Latest time to start the journey and still be back on time (with a 5 minute buffer). */
  leaveByMs: number;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: Factor[];
  headline: string;
  eta: Eta | null;
}

export interface RiskInput {
  now: number;
  /** Return time as minutes after midnight, local time. */
  deadlineMinutes: number;
  deadlineLabel: string;
  /** Distance that still counts as "at the hostel", metres. */
  returnLimitM: number;
  /** Distance from the hostel in metres, or null without a location. */
  distToHostelM: number | null;
  /** Permitted radius from the campus centre, km. */
  radiusKm: number;
  isBreach: boolean;
  sos: boolean;
  status: 'SAFE' | 'OUT_OF_RANGE' | 'LOCATION_UNAVAILABLE' | 'SIGNAL_LOST';
  battery: number | null;
  charging: boolean;
  accuracyM: number | null;
  /** Time of the last location update (epoch ms). */
  updatedAt: number | null;
  motion: Motion | null;
  /** 0 = busy area, 1 = isolated. Null when unknown. */
  remote: number | null;
  /** Same, for the spot about 400 m ahead in the direction of travel. */
  remoteAhead: number | null;
  /** Other students within 100 m who are not at the hostel. */
  companions: number;
  isDark: boolean;
}

/* ------------------------------------------------------------- geometry */

const R_EARTH_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** The point `meters` away from `p` in direction `deg`. */
export function destination(p: LatLon, deg: number, meters: number): LatLon {
  const d = meters / R_EARTH_M;
  const br = toRad(deg);
  const lat1 = toRad(p.lat);
  const lon1 = toRad(p.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

/* ------------------------------------------------------------- motion */

/** Speed, direction, stopping time and battery drain from the last 20 minutes of fixes. */
export function motionFrom(samples: Sample[], hostel: LatLon, now: number): Motion {
  const s = samples.filter((x) => now - x.t <= 20 * 60000 && x.t <= now + 60000).sort((a, b) => a.t - b.t);
  const empty: Motion = { speedMs: null, headingDeg: null, awayRateMPerMin: null, stationaryMin: 0, spanMin: 0, batteryDropPer10Min: null, samples: s.length };
  if (s.length < 2) return empty;
  const last = s[s.length - 1];
  const lastPt = { lat: last.lat, lon: last.lon };
  const spanMin = (last.t - s[0].t) / 60000;

  // Speed and heading: compare with a fix 1 to 2 minutes earlier.
  let ref: Sample | null = null;
  for (let i = s.length - 2; i >= 0; i--) {
    const dt = last.t - s[i].t;
    if (dt >= 60000) {
      ref = s[i];
      if (dt >= 120000) break;
    }
  }
  let speedMs: number | null = null;
  let headingDeg: number | null = null;
  if (ref) {
    const dist = distanceM(ref, lastPt);
    speedMs = dist / ((last.t - ref.t) / 1000);
    if (dist >= 25) headingDeg = bearingDeg(ref, lastPt);
  }

  // Moving away or coming back: slope of the distance to the hostel over the last 8 minutes.
  let awayRate: number | null = null;
  const recent = s.filter((x) => last.t - x.t <= 8 * 60000);
  if (recent.length >= 3 && (last.t - recent[0].t) / 60000 >= 3) {
    const xs = recent.map((x) => (x.t - recent[0].t) / 60000);
    const ys = recent.map((x) => distanceM(x, hostel));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    awayRate = den > 0 ? num / den : 0;
  }

  // Standing still: how far back do the fixes stay within 40 m of the current spot?
  let stationaryFrom = s[0].t;
  for (let i = s.length - 2; i >= 0; i--) {
    if (distanceM(s[i], lastPt) > 40) {
      stationaryFrom = s[i + 1].t;
      break;
    }
  }
  const stationaryMin = (last.t - stationaryFrom) / 60000;

  // Battery drain.
  let drop: number | null = null;
  const withBat = s.filter((x) => typeof x.battery === 'number');
  if (withBat.length >= 2) {
    const a = withBat[0];
    const b = withBat[withBat.length - 1];
    const dtMin = (b.t - a.t) / 60000;
    if (dtMin >= 5) drop = (((a.battery as number) - (b.battery as number)) / dtMin) * 10;
  }

  return { speedMs, headingDeg, awayRateMPerMin: awayRate, stationaryMin, spanMin, batteryDropPer10Min: drop, samples: s.length };
}

/* ---------------------------------------------------------------- time */

/** The return time today, as epoch milliseconds (phone's local time). */
export function deadlineAbs(now: number, deadlineMinutes: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + deadlineMinutes * 60000;
}

/** Sunrise and sunset in minutes after UTC midnight (NOAA formulas). Null near the poles. */
export function sunTimesUtcMin(lat: number, lon: number, now: number): { sunrise: number; sunset: number } | null {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const n = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000);
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const latR = toRad(lat);
  const c = Math.cos(toRad(90.833)) / (Math.cos(latR) * Math.cos(decl)) - Math.tan(latR) * Math.tan(decl);
  if (c < -1 || c > 1) return null;
  const ha = (Math.acos(c) * 180) / Math.PI;
  return { sunrise: 720 - 4 * (lon + ha) - eq, sunset: 720 - 4 * (lon - ha) - eq };
}

/** True from about 20 minutes after sunset until 20 minutes before sunrise. */
export function isDark(lat: number, lon: number, now: number): boolean {
  const t = sunTimesUtcMin(lat, lon, now);
  if (!t) return false;
  const mod = (x: number) => ((x % 1440) + 1440) % 1440;
  const nowMin = mod(now / 60000);
  const dawn = mod(t.sunrise - 20);
  const dusk = mod(t.sunset + 20);
  const light = dawn < dusk ? nowMin >= dawn && nowMin <= dusk : nowMin >= dawn || nowMin <= dusk;
  return !light;
}

/* ------------------------------------------------------ isolated areas */

/**
 * Turns the number of buildings, shops and amenities within 300 m (from OpenStreetMap) into
 * 0 (busy) to 1 (isolated). 25 or more is busy; fewer than 3 is isolated.
 */
export function remotenessFromCount(count: number): number {
  if (!Number.isFinite(count) || count < 0) return 0;
  if (count < 3) return 1;
  return Math.max(0, Math.min(1, 1 - count / 25));
}

/* ----------------------------------------------------------------- ETA */

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Roads are longer than a straight line, so the distance is multiplied by this. */
const DETOUR = 1.3;
const ARRIVE_MARGIN_MIN = 2;
const LEAVE_BUFFER_MIN = 5;

export function estimateEta(distM: number, m: Motion | null, now: number, deadlineMs: number): Eta {
  const road = distM * DETOUR;
  let speed: number;
  let mode: Eta['mode'];
  let confidence: Eta['confidence'];
  const v = m?.speedMs ?? null;
  if (v !== null && v >= 6) {
    speed = Math.min(v, 20);
    mode = 'vehicle';
    confidence = (m?.samples ?? 0) >= 4 ? 'medium' : 'low';
  } else if (v !== null && v >= 0.7) {
    speed = clamp(v, 0.7, 2.2);
    mode = 'walking';
    confidence = (m?.samples ?? 0) >= 5 ? 'high' : 'medium';
  } else if (distM <= 2500) {
    speed = 1.2;
    mode = 'assumed-walking';
    confidence = 'low';
  } else {
    speed = 5;
    mode = 'assumed-vehicle';
    confidence = 'low';
  }
  const minutes = road / speed / 60;
  const arrivalMs = now + minutes * 60000;
  const lateByMin = (arrivalMs - deadlineMs) / 60000;
  return {
    minutes,
    arrivalMs,
    mode,
    confidence,
    lateByMin,
    predictedLate: lateByMin > ARRIVE_MARGIN_MIN,
    leaveByMs: deadlineMs - minutes * 60000 - LEAVE_BUFFER_MIN * 60000,
  };
}

/* --------------------------------------------------------- risk score */

export const RED_AT = 55;
export const YELLOW_AT = 25;

const fmtKm = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export function assessRisk(i: RiskInput): RiskResult {
  if (i.sos) {
    return { score: 100, level: 'RED', factors: [{ key: 'sos', points: 100, label: 'SOS is active', short: 'SOS' }], headline: 'SOS is active', eta: null };
  }
  const dist = i.distToHostelM;
  const away = dist !== null && dist > i.returnLimitM;
  if (dist !== null && !away) {
    return { score: 0, level: 'GREEN', factors: [], headline: 'At the hostel', eta: null };
  }

  const f: Factor[] = [];
  const add = (key: string, points: number, label: string, short: string) => {
    if (points !== 0) f.push({ key, points: Math.round(points), label, short });
  };

  const dl = deadlineAbs(i.now, i.deadlineMinutes);
  const minsLeft = (dl - i.now) / 60000;
  const m = i.motion;
  const km = dist === null ? null : dist / 1000;
  const far = km !== null && km >= 1;
  const eta = dist !== null ? estimateEta(dist, m, i.now, dl) : null;
  const awayRate = m?.awayRateMPerMin ?? null;
  const speed = m?.speedMs ?? null;
  const dk = dist === null ? '' : fmtKm(dist);

  // 1. Time against the return time
  if (dist !== null && minsLeft < 0) {
    const late = Math.round(-minsLeft);
    add('late', Math.min(30, 18 + late / 10), `${dk} from the hostel, ${late} min after ${i.deadlineLabel}`, `${late} min past ${i.deadlineLabel}`);
  } else if (eta && eta.predictedLate) {
    const by = Math.round(eta.lateByMin);
    add('predicted-late', 14 + Math.min(10, eta.lateByMin / 6), `Needs about ${Math.round(eta.minutes)} min to get back but only ${Math.max(0, Math.round(minsLeft))} min are left (about ${by} min late)`, `will miss ${i.deadlineLabel}`);
  }

  // 2. Direction of travel
  if (awayRate !== null && awayRate >= 40 && minsLeft <= 90) {
    add('away', awayRate >= 100 ? 16 : 12, `Moving away from the hostel (about ${Math.round(awayRate)} m every minute) close to the return time`, 'moving away from the hostel');
  }

  // 3. Battery
  if (i.battery !== null && !i.charging) {
    const base = i.battery <= 5 ? 22 : i.battery <= 10 ? 16 : i.battery <= 15 ? 10 : i.battery <= 20 ? 6 : 0;
    if (base > 0) add('battery', far ? base : base * 0.5, `Battery is at ${i.battery}%`, `battery ${i.battery}%`);
    if (i.battery <= 10 && far && minsLeft < 90) add('lose-contact', 10, `Only ${i.battery}% battery left and still ${dk} from the hostel, so contact may be lost before getting back`, 'may lose contact');
    const drop = m?.batteryDropPer10Min ?? null;
    if (drop !== null && drop >= 6) add('drain', 6, `Battery is dropping fast (${drop.toFixed(0)}% every 10 minutes)`, 'battery draining fast');
  }

  // 4. Signal
  const ageMin = i.updatedAt ? (i.now - i.updatedAt) / 60000 : null;
  if (i.status === 'SIGNAL_LOST') {
    const mins = ageMin !== null ? Math.round(ageMin) : null;
    // The last battery reading tells two cases apart: a phone that died (battery nearly empty,
    // and the app already warned about it) versus one that was switched off or put in airplane
    // mode with plenty of charge left. The second is the one to worry about.
    const died = i.battery !== null && i.battery <= 4;
    const wasMoving = (m?.speedMs ?? 0) >= 0.7;
    if (died) {
      add('signal', 16, `Phone went silent with ${i.battery}% battery. It has probably run out of charge`, 'battery likely died');
    } else if (i.battery !== null && i.battery > 15) {
      const pts = 26 + (mins !== null && mins >= 10 ? 8 : 0) + (wasMoving ? 4 : 0);
      add('switched-off', pts, `Went silent${mins !== null ? ` ${mins} min ago` : ''} with ${i.battery}% battery. The phone was probably switched off or put in airplane mode${wasMoving ? ' while moving' : ''}`, `likely switched off${mins !== null ? ` ${mins} min ago` : ''}`);
    } else {
      add('signal', 18 + (mins !== null && mins >= 5 ? 8 : 0), mins !== null ? `No signal for ${mins} min. The phone may be off or in airplane mode` : 'No signal', mins !== null ? `no signal for ${mins} min` : 'no signal');
    }
  } else if (i.status === 'LOCATION_UNAVAILABLE') {
    add('gps', 14, 'The phone cannot find its location (GPS off or blocked)', 'no GPS');
  } else {
    if (ageMin !== null && ageMin * 60 > 45) add('slow', 5, 'Location updates are slow', 'slow updates');
    if (i.accuracyM !== null && i.accuracyM > 150) add('accuracy', 4, `Location is rough (within ${Math.round(i.accuracyM)} m)`, 'rough GPS');
  }

  // 5. Standing still far from the hostel
  if (m && far && m.stationaryMin >= 10) {
    const min = Math.round(m.stationaryMin);
    add('stopped', m.stationaryMin >= 30 ? 16 : m.stationaryMin >= 20 ? 12 : 8, `Has stayed in one place for ${min} min, ${dk} from the hostel`, `stopped ${min} min`);
  }

  // 6. Outside the permitted radius
  if (i.isBreach) add('breach', 18, `Outside the permitted ${i.radiusKm} km zone`, `outside ${i.radiusKm} km zone`);

  // 7. Isolated surroundings (OpenStreetMap), now and ahead
  const awayFromHostel = km !== null && km >= 0.5;
  let remoteCounted = false;
  if (i.remote !== null && i.remote >= 0.6 && awayFromHostel) {
    add('remote', 12 * i.remote * (i.isDark ? 1.5 : 1), `In an area with very few buildings or shops nearby${i.isDark ? ', after dark' : ''}`, 'isolated area');
    remoteCounted = true;
  }
  const heading = (speed !== null && speed >= 0.6) || (awayRate !== null && awayRate > 20);
  if (!remoteCounted && i.remoteAhead !== null && i.remoteAhead >= 0.7 && heading && awayFromHostel) {
    add('remote-ahead', 10, 'Heading toward an area with very few buildings or shops', 'heading to an isolated area');
  }

  // 8. Darkness and being alone
  if (i.isDark && awayFromHostel) add('dark', 8, 'It is after sunset', 'after dark');
  const lonely = i.companions === 0;
  if (lonely && far && (i.isDark || (i.remote !== null && i.remote >= 0.6))) add('alone', 6, 'No other student is nearby', 'alone');

  // 9. Company lowers the risk
  if (i.companions >= 2) add('company', -10, `${i.companions} other students are within 100 m`, `with ${i.companions} students`);
  else if (i.companions === 1) add('company', -5, 'Another student is within 100 m', 'with a friend');

  const score = clamp(Math.round(f.reduce((a, x) => a + x.points, 0)), 0, 100);
  const level: RiskLevel = score >= RED_AT ? 'RED' : score >= YELLOW_AT ? 'YELLOW' : 'GREEN';
  f.sort((a, b) => b.points - a.points);
  const top = f.filter((x) => x.points > 0).slice(0, 3).map((x) => x.short);
  const headline = top.length > 0 ? [dist !== null ? `${dk} away` : null, ...top].filter(Boolean).join(', ') : dist !== null ? `${dk} away, no warning signs` : 'No warning signs';
  return { score, level, factors: f, headline, eta };
}

/* ----------------------------------------------------------- student side */

/** Walking time back in minutes for a student at `distM`, with a detour allowance. */
export function walkingMinutes(distM: number): number {
  return Math.ceil((distM * DETOUR) / 1.2 / 60);
}

/**
 * For a student close enough to walk (within 3 km): how many minutes from now they can wait before
 * they must start back to be home by the return time. 0 or less means "leave now".
 */
export function leaveInMinutes(distM: number, minsLeft: number): number | null {
  if (distM > 3000) return null;
  return Math.floor(minsLeft - walkingMinutes(distM) - LEAVE_BUFFER_MIN);
}
