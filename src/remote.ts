import { useEffect, useRef, useState } from 'react';
import { remotenessFromCount } from './risk';

/**
 * "Is this a quiet, isolated area?" from OpenStreetMap.
 *
 * Counts the buildings, shops and amenities within 300 m of a point using the public Overpass API
 * (no key, free). Only the count is requested. The request contains only a map position, never a
 * name, email or student id. Results are cached by area for 6 hours, requests are sent one at a
 * time with a pause between them, and a failed request is simply treated as "unknown".
 */

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const RADIUS_M = 300;
const CELL = 1000;            // cache cell = 0.001 degree (about 110 m)
const TTL_OK = 6 * 3600e3;
const TTL_FAIL = 5 * 60e3;
const GAP_MS = 1500;
const MAX_QUEUE = 12;

interface Entry { value: number | null; at: number; ttl: number }
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<number | null>>();
let chain: Promise<unknown> = Promise.resolve();
let queued = 0;

const cellKey = (lat: number, lon: number) => `${Math.round(lat * CELL)},${Math.round(lon * CELL)}`;

export function queryFor(lat: number, lon: number): string {
  const a = `(around:${RADIUS_M},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:10];(nwr${a}["building"];nwr${a}["shop"];nwr${a}["amenity"];);out count;`;
}

export function parseCount(json: any): number | null {
  const t = json?.elements?.[0]?.tags?.total;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function fetchCount(lat: number, lon: number): Promise<number | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(queryFor(lat, lon)),
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return parseCount(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 0 (busy) to 1 (isolated), or null when unknown. */
export function remotenessAt(lat: number, lon: number): Promise<number | null> {
  const key = cellKey(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return Promise.resolve(hit.value);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  if (queued >= MAX_QUEUE) return Promise.resolve(null);
  queued++;
  const p = new Promise<number | null>((resolve) => {
    chain = chain.then(async () => {
      const count = await fetchCount(lat, lon);
      const value = count === null ? null : remotenessFromCount(count);
      cache.set(key, { value, at: Date.now(), ttl: value === null ? TTL_FAIL : TTL_OK });
      pending.delete(key);
      queued--;
      resolve(value);
      await new Promise((r) => setTimeout(r, GAP_MS));
    });
  });
  pending.set(key, p);
  return p;
}

export interface RemotePoint { key: string; lat: number; lon: number }

/** Looks up every point (once per area) and returns key -> remoteness. */
export function useRemoteness(points: RemotePoint[]): Record<string, number | null> {
  const [vals, setVals] = useState<Record<string, number | null>>({});
  const asked = useRef<Record<string, string>>({});
  const sig = points.map((p) => `${p.key}:${cellKey(p.lat, p.lon)}`).join('|');
  useEffect(() => {
    let alive = true;
    for (const p of points) {
      const ck = cellKey(p.lat, p.lon);
      if (asked.current[p.key] === ck) continue;
      asked.current[p.key] = ck;
      remotenessAt(p.lat, p.lon).then((v) => {
        if (alive) setVals((prev) => (prev[p.key] === v ? prev : { ...prev, [p.key]: v }));
      });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return vals;
}
