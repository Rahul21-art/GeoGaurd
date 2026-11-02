import { ref, set, get, update, query, orderByKey, limitToLast, limitToFirst, endAt, type Database } from 'firebase/database';

/**
 * Recent path of each student for the faculty live map.
 *
 * The student's phone saves one point per minute at trail/{uid}/{minuteNumber} = { la, lo }, where
 * minuteNumber is the time in whole minutes since 1970. Points older than 3 hours are deleted by the
 * same phone. The key is the time, so no index is needed to read the newest points.
 */

export const TRAIL_KEEP_MS = 3 * 60 * 60 * 1000;
const CLEAN_EVERY_MS = 30 * 60 * 1000;

export interface TrailPoint {
  /** Epoch milliseconds (start of the minute). */
  t: number;
  lat: number;
  lon: number;
}

export interface TrailState {
  lastBucket: number;
  lastCleaned: number;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Saves the student's position once per minute. Safe to call every few seconds. */
export async function writeTrail(db: Database, uid: string, lat: number, lon: number, st: TrailState, now = Date.now()): Promise<void> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const bucket = Math.floor(now / 60000);
  if (bucket === st.lastBucket) return;
  st.lastBucket = bucket;
  await set(ref(db, `trail/${uid}/${bucket}`), { la: round6(lat), lo: round6(lon) });
  if (now - st.lastCleaned > CLEAN_EVERY_MS) {
    st.lastCleaned = now;
    cleanTrail(db, uid, now).catch(() => {});
  }
}

async function cleanTrail(db: Database, uid: string, now: number): Promise<void> {
  const cutoff = Math.floor((now - TRAIL_KEEP_MS) / 60000);
  const snap = await get(query(ref(db, `trail/${uid}`), orderByKey(), endAt(String(cutoff)), limitToFirst(200)));
  const old = snap.val() as Record<string, unknown> | null;
  if (!old) return;
  const patch: Record<string, null> = {};
  Object.keys(old).forEach((k) => { patch[k] = null; });
  await update(ref(db, `trail/${uid}`), patch);
}

/** Turns the stored object into a sorted list of points inside the time window. */
export function parseTrail(raw: unknown, now: number, windowMin = 60): TrailPoint[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: TrailPoint[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    const t = Number(k) * 60000;
    const lat = Number(v?.la);
    const lon = Number(v?.lo);
    if (!Number.isFinite(t) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (now - t > windowMin * 60000 || t - now > 5 * 60000) continue;
    out.push({ t, lat, lon });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Faculty side: the last `windowMin` minutes of one student's path. */
export async function loadTrail(db: Database, uid: string, now = Date.now(), windowMin = 60): Promise<TrailPoint[]> {
  const snap = await get(query(ref(db, `trail/${uid}`), orderByKey(), limitToLast(windowMin + 5)));
  return parseTrail(snap.val(), now, windowMin);
}
