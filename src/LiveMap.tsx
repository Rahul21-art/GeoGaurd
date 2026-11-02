import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Database } from 'firebase/database';
import { X, Phone, Route, AlertTriangle, Crosshair } from 'lucide-react';
import { loadTrail, type TrailPoint } from './trail';

/**
 * Live map for faculty: every active student as a coloured pin, the hostel and the safe radius,
 * and the last hour of a student's path. Map tiles come from OpenStreetMap and need internet.
 */

export interface MapStudent {
  uid: string;
  name: string;
  roll: string;
  phone: string;
  lat: number | null;
  lon: number | null;
  distanceKm: number | null;
  status: 'SAFE' | 'OUT_OF_RANGE' | 'LOCATION_UNAVAILABLE' | 'SIGNAL_LOST';
  isBreach: boolean;
  sos: boolean;
  updatedAt: number | null;
  battery: number | null;
}

export type PinKind = 'SOS' | 'OUT' | 'LOST' | 'SAFE';

export function kindOf(s: Pick<MapStudent, 'sos' | 'status' | 'isBreach'>): PinKind {
  if (s.sos) return 'SOS';
  if (s.status === 'SIGNAL_LOST' || s.status === 'LOCATION_UNAVAILABLE') return 'LOST';
  if (s.isBreach) return 'OUT';
  return 'SAFE';
}

export const PIN_COLOR: Record<PinKind, string> = { SOS: '#dc2626', OUT: '#ea580c', LOST: '#6b7280', SAFE: '#059669' };
const PIN_LABEL: Record<PinKind, string> = { SOS: 'SOS', OUT: 'Out of range', LOST: 'No signal', SAFE: 'Safe' };

interface Props {
  db: Database;
  students: MapStudent[];
  center: { lat: number; lon: number; radiusKm: number };
  hostel: { lat: number; lon: number; radiusKm: number };
  now: number;
  onClose: () => void;
}

const ago = (ts: number | null, now: number) => {
  if (!ts) return 'no update yet';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
};

const LiveMap: React.FC<Props> = ({ db, students, center, hostel, now, onClose }) => {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const staticLayer = useRef<any>(null);
  const pinLayer = useRef<any>(null);
  const trailLayer = useRef<any>(null);
  const fitted = useRef(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [trailBusy, setTrailBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const located = useMemo(() => students.filter((s) => s.lat !== null && s.lon !== null), [students]);
  const unlocated = students.length - located.length;
  const sel = students.find((s) => s.uid === selected) || null;

  const counts = useMemo(() => {
    const c: Record<PinKind, number> = { SOS: 0, OUT: 0, LOST: 0, SAFE: 0 };
    students.forEach((s) => { c[kindOf(s)]++; });
    return c;
  }, [students]);

  // Create the map once.
  useEffect(() => {
    if (!mapEl.current || map.current) return;
    const m = L.map(mapEl.current).setView([center.lat, center.lon], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    map.current = m;
    staticLayer.current = L.layerGroup().addTo(m);
    pinLayer.current = L.layerGroup().addTo(m);
    trailLayer.current = L.layerGroup().addTo(m);
    setTimeout(() => m.invalidateSize(), 100);
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safe radius and hostel.
  useEffect(() => {
    const g = staticLayer.current;
    if (!g) return;
    g.clearLayers();
    L.circle([center.lat, center.lon], { radius: center.radiusKm * 1000, color: '#1e3a8a', weight: 2, dashArray: '6 6', fillOpacity: 0.04 }).addTo(g);
    L.circle([hostel.lat, hostel.lon], { radius: hostel.radiusKm * 1000, color: '#059669', weight: 2, fillOpacity: 0.12 }).addTo(g);
    L.marker([hostel.lat, hostel.lon], {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:#1e3a8a;color:#fff;font:700 12px sans-serif;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:2px solid #fff">H</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).bindTooltip('Hostel').addTo(g);
  }, [center.lat, center.lon, center.radiusKm, hostel.lat, hostel.lon, hostel.radiusKm]);

  // Student pins.
  useEffect(() => {
    const g = pinLayer.current;
    if (!g) return;
    g.clearLayers();
    located.forEach((s) => {
      const k = kindOf(s);
      const isSel = s.uid === selected;
      L.circleMarker([s.lat, s.lon], {
        radius: k === 'SOS' ? 13 : isSel ? 12 : 9,
        color: isSel ? '#0f172a' : '#ffffff',
        weight: isSel ? 3 : 2,
        fillColor: PIN_COLOR[k],
        fillOpacity: 1,
      })
        .bindTooltip(`${s.name} (${s.roll})`)
        .on('click', () => setSelected(s.uid))
        .addTo(g);
    });
    if (!fitted.current && located.length > 0 && map.current) {
      fitted.current = true;
      const b = L.latLngBounds([[center.lat, center.lon], ...located.map((s) => [s.lat, s.lon])]);
      map.current.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
    }
  }, [located, selected, center.lat, center.lon]);

  // Load the path of the selected student, and refresh it every minute.
  const fetchTrail = useCallback(async (uid: string) => {
    setTrailBusy(true);
    try { setTrail(await loadTrail(db, uid, Date.now(), 60)); } catch { setTrail([]); } finally { setTrailBusy(false); }
  }, [db]);
  useEffect(() => {
    setTrail([]);
    if (!selected) return;
    fetchTrail(selected);
    const t = setInterval(() => fetchTrail(selected), 60000);
    return () => clearInterval(t);
  }, [selected, fetchTrail]);

  // Draw the path.
  useEffect(() => {
    const g = trailLayer.current;
    if (!g) return;
    g.clearLayers();
    if (trail.length === 0) return;
    const pts = trail.map((p) => [p.lat, p.lon]);
    if (pts.length > 1) L.polyline(pts, { color: '#2563eb', weight: 4, opacity: 0.85 }).addTo(g);
    trail.forEach((p, i) => {
      const first = i === 0;
      const last = i === trail.length - 1;
      L.circleMarker([p.lat, p.lon], {
        radius: first || last ? 6 : 3,
        color: '#ffffff',
        weight: 1,
        fillColor: first ? '#0f172a' : '#2563eb',
        fillOpacity: 1,
      }).bindTooltip(new Date(p.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })).addTo(g);
    });
  }, [trail]);

  const fit = (list: MapStudent[], emptyMsg: string) => {
    const pts = list.filter((s) => s.lat !== null && s.lon !== null).map((s) => [s.lat, s.lon]);
    if (pts.length === 0) { setNote(emptyMsg); setTimeout(() => setNote(null), 3000); return; }
    map.current?.fitBounds(L.latLngBounds([[center.lat, center.lon], ...pts]), { padding: [50, 50], maxZoom: 16 });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Live map" className="anim-fade fixed inset-0 z-50 bg-slate-900 flex flex-col">
      <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center gap-2 flex-wrap border-b-4 border-amber-600">
        <h2 className="text-sm font-bold mr-1">Live map</h2>
        <div className="flex items-center gap-2 text-[11px] font-semibold flex-wrap">
          {(['SOS', 'OUT', 'SAFE', 'LOST'] as PinKind[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border border-white" style={{ background: PIN_COLOR[k] }} />
              {PIN_LABEL[k]} {counts[k]}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => fit(students.filter((s) => kindOf(s) !== 'SAFE'), 'No problem students right now.')}
            className="px-2.5 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-[11px] font-semibold flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Problems
          </button>
          <button onClick={() => fit(students, 'No student has shared a location yet.')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-[11px] font-semibold flex items-center gap-1">
            <Crosshair className="w-3.5 h-3.5" /> Fit all
          </button>
          <button onClick={onClose} aria-label="Close map" className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="relative flex-1">
        <div ref={mapEl} className="absolute inset-0" />
        {note && <div className="anim-toast absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900 text-white text-xs font-semibold px-3 py-2 rounded-lg">{note}</div>}
        {unlocated > 0 && (
          <div className="absolute top-3 left-3 z-[1000] bg-white/95 text-slate-800 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shadow">
            {unlocated} student{unlocated === 1 ? ' has' : 's have'} no location yet
          </div>
        )}

        {sel && (
          <div className="anim-pop absolute left-2 right-2 bottom-2 z-[1000] max-w-lg mx-auto bg-white rounded-xl shadow-2xl p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900 truncate">{sel.name}</p>
                <p className="font-mono text-xs font-bold text-slate-600">{sel.roll}</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold text-white shrink-0" style={{ background: PIN_COLOR[kindOf(sel)] }}>{PIN_LABEL[kindOf(sel)]}</span>
              <button onClick={() => setSelected(null)} aria-label="Close details" className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-700 mt-1">
              {sel.distanceKm !== null ? `${sel.distanceKm.toFixed(2)} km from campus` : 'distance unknown'} · last seen {ago(sel.updatedAt, now)}
              {sel.battery !== null ? ` · battery ${sel.battery}%` : ''}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Route className="w-3.5 h-3.5" />
              {trailBusy ? 'Loading path…' : trail.length > 1 ? `Path of the last hour (${trail.length} points). Dark dot = oldest, blue dot = newest.` : 'No path saved for the last hour yet.'}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <a href={sel.phone ? `tel:${sel.phone.replace(/[^0-9+]/g, '')}` : undefined}
                className={`py-2 rounded-lg text-center text-xs font-bold text-white flex items-center justify-center gap-1.5 ${sel.phone ? 'bg-emerald-700' : 'bg-slate-400 pointer-events-none'}`}>
                <Phone className="w-3.5 h-3.5" /> Call
              </a>
              <button onClick={() => { if (sel.lat !== null && sel.lon !== null) map.current?.setView([sel.lat, sel.lon], 17); }}
                disabled={sel.lat === null}
                className="py-2 rounded-lg bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold">
                Zoom to student
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMap;
