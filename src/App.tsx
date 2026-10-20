import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { LocalNotifications } from '@capacitor/local-notifications';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
  signOut,
  type User,
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  get,
  serverTimestamp,
  onDisconnect,
} from 'firebase/database';
import {
  Shield, ShieldCheck, GraduationCap, Lock, Mail, Phone, MapPin, Battery, BatteryCharging,
  AlertTriangle, AlertOctagon, Clock, Search, X, LogOut, Eye, EyeOff, ArrowLeft, Camera,
  Settings, History, Users, WifiOff, Radio, RefreshCw, Navigation, Info,
  Home, RotateCcw, BellRing,
} from 'lucide-react';
import PermissionGate from './PermissionGate';
import WelcomeSplash from './Welcome';
import { useShakeSos, ShakeSosCard, ShakeCountdownOverlay } from './shakeSos';

/* ============================================================================
 * 1. FIREBASE
 * Web config values are identifiers, not secrets. Security comes from the
 * Realtime Database rules (database.rules.json) and the API key restrictions.
 * ========================================================================== */

const firebaseConfig = {
  apiKey: 'AIzaSyB6iCLL404NV7nk4KDq_2UFb3unHuAPn0o',
  authDomain: 'jntugv-outing-safety.firebaseapp.com',
  databaseURL: 'https://jntugv-outing-safety-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'jntugv-outing-safety',
  storageBucket: 'jntugv-outing-safety.firebasestorage.app',
  messagingSenderId: '366334295468',
  appId: '1:366334295468:web:a3512f0a3d3c953d458e09',
  measurementId: 'G-201DQY8QBW',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* ============================================================================
 * Android app support (Capacitor). On the phone app, location runs in a
 * background foreground-service so it keeps working with the screen locked.
 * In a normal browser the code falls back to navigator.geolocation.
 * ========================================================================== */

interface BgLocation { latitude: number; longitude: number; accuracy: number; time: number | null }
interface BgError { code?: string; message?: string }
interface BgPlugin {
  addWatcher(
    opts: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    cb: (loc?: BgLocation, err?: BgError) => void
  ): Promise<string>;
  removeWatcher(opts: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}
const BackgroundGeolocation = registerPlugin<BgPlugin>('BackgroundGeolocation');
const isNative = Capacitor.isNativePlatform();

/* ============================================================================
 * Student notifications (local notifications work even with no internet).
 * ========================================================================== */

const NOTIF_CHANNEL = 'reconnect';
const RECONNECT_ID = 1001;
const BATTERY_ID = 1002;

async function setupNotifications() {
  try {
    if (isNative) {
      await LocalNotifications.requestPermissions();
      await LocalNotifications.createChannel({
        id: NOTIF_CHANNEL,
        name: 'Reconnect alerts',
        description: 'Tells you when your location is not reaching your coordinator',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
    } else if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch { /* notifications are optional */ }
}

async function notifyStudent(id: number, title: string, body: string) {
  try { navigator.vibrate?.([300, 150, 300]); } catch { /* optional */ }
  try {
    if (isNative) {
      await LocalNotifications.schedule({ notifications: [{ id, title, body, channelId: NOTIF_CHANNEL }] });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, tag: String(id) });
    }
  } catch { /* optional */ }
}

function clearNotification(id: number) {
  if (isNative) LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
}

/* ============================================================================
 * 2. TYPES & CONFIG
 * ========================================================================== */

type Status = 'SAFE' | 'OUT_OF_RANGE' | 'LOCATION_UNAVAILABLE' | 'SIGNAL_LOST';

interface Profile {
  rollNumber: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  batch: string;
  photo?: string;
  createdAt?: number;
}

interface Telemetry {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  battery?: number | null;
  charging?: boolean;
  sos?: boolean;
  online?: boolean;
  gpsError?: string | null;
  updatedAt?: number | null;
  /** Set by faculty when the student reaches the hostel. While set, the student is not tracked. */
  reachedAt?: number | null;
  /** Server time when the student's phone lost its connection. */
  disconnectedAt?: number | null;
}

interface LiveStudent extends Telemetry {
  uid: string;
  profile: Profile;
}

interface ReachedStudent {
  uid: string;
  profile: Profile;
  reachedAt: number;
}

interface StudentResult {
  uid: string;
  profile: Profile;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  battery: number | null;
  distanceKm: number | null;
  status: Status;
  lastKnownStatus?: Status;
  isBreach: boolean;
  /** Permitted radius that applies to this student (km). */
  radiusKm: number;
  /** True when faculty set a custom radius for this student. */
  customRadius: boolean;
  sos: boolean;
  lowAccuracy: boolean;
  updatedAt: number | null;
  disconnectedAt: number | null;
  gpsError: string | null;
}

interface SafetyEvent {
  id: string;
  time: string;
  studentId: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
}

interface SafetyConfig {
  centerLatitude: number;
  centerLongitude: number;
  centerName: string;
  safeRadiusKm: number;
  hysteresisKm: number;
  accuracyThresholdMeters: number;
  staleThresholdSeconds: number;
}

/** Default permitted radius for every student, in km. Faculty can override it per student. */
const DEFAULT_RADIUS_KM = 15;
const MIN_RADIUS_KM = 0.5;
const MAX_RADIUS_KM = 200;

const DEFAULT_CONFIG: SafetyConfig = {
  centerLatitude: 18.1516,
  centerLongitude: 83.3756,
  centerName: 'JNTU-GV College of Engineering, Dwarapudi, Vizianagaram',
  safeRadiusKm: DEFAULT_RADIUS_KM,
  hysteresisKm: 0.2,
  accuracyThresholdMeters: 100,
  staleThresholdSeconds: 90,
};

function useSafetyConfig(): SafetyConfig {
  const [cfg, setCfg] = useState<SafetyConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    return onValue(
      ref(db, 'config/safety'),
      (snap) => setCfg({ ...DEFAULT_CONFIG, ...(snap.val() || {}) }),
      () => setCfg(DEFAULT_CONFIG)
    );
  }, []);
  return cfg;
}

/** Per-student radius overrides set by faculty: studentRadius/{uid} = km. Missing means "use the default". */
function useStudentRadii(): Record<string, number> {
  const [radii, setRadii] = useState<Record<string, number>>({});
  useEffect(() => {
    return onValue(
      ref(db, 'studentRadius'),
      (snap) => {
        const v = snap.val() || {};
        const clean: Record<string, number> = {};
        Object.entries(v).forEach(([uid, km]) => {
          if (typeof km === 'number' && isFinite(km) && km > 0) clean[uid] = km;
        });
        setRadii(clean);
      },
      () => setRadii({})
    );
  }, []);
  return radii;
}

/* ============================================================================
 * 3. HELPERS: ROLL NUMBERS, VALIDATION, GEO
 * ========================================================================== */

const BRANCH_MAP: Record<string, string> = {
  '01': 'Civil Engineering',
  '02': 'Electrical & Electronics Engineering',
  '03': 'Mechanical Engineering',
  '04': 'Electronics & Communication Engineering',
  '05': 'Computer Science & Engineering',
  '12': 'Information Technology',
  '31': 'Metallurgical Engineering',
  '42': 'CSE (AI & Machine Learning)',
  '44': 'CSE (Data Science)',
  '61': 'AI & Machine Learning',
};

const ROLL_RE = /^(\d{2})([A-Z0-9]{2})(1A|5A|1D|1E|1F)(\d{2})([A-Z0-9]{2})$/;

function parseRoll(roll: string): { department: string; batch: string } {
  const m = roll.trim().toUpperCase().match(ROLL_RE);
  if (!m) return { department: 'JNTU-GV CEV', batch: 'B.Tech' };
  const start = 2000 + parseInt(m[1], 10);
  const prog = m[3];
  const end = prog === '5A' ? start + 3 : start + 4;
  const label = prog === '5A' ? 'B.Tech (Lateral)' : prog === '1D' ? 'M.Tech' : 'B.Tech';
  return {
    department: BRANCH_MAP[m[4]] || `Branch code ${m[4]}`,
    batch: `${label} ${start}–${end}`,
  };
}

const isValidRoll = (r: string) => ROLL_RE.test(r.trim().toUpperCase());
const isValidName = (n: string) => /^[A-Za-z][A-Za-z\s.]{2,60}$/.test(n.trim());
const isValidEmail = (e: string) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(e.trim());
const tenDigits = (p: string) => {
  const d = p.replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
};
const isValidMobile = (p: string) => /^[6-9]\d{9}$/.test(tenDigits(p)) && !/^(\d)\1{9}$/.test(tenDigits(p));
const formatMobile = (p: string) => `+91 ${tenDigits(p).slice(0, 5)} ${tenDigits(p).slice(5)}`;
const passwordChecks = (p: string) => ({
  len: p.length >= 6,
  letter: /[A-Za-z]/.test(p),
  number: /\d/.test(p),
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function authError(e: any): string {
  const code: string = e?.code || '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-not-found': 'No account found for this email. Use New Registration.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/operation-not-allowed':
      'Email/Password sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.',
    'PERMISSION_DENIED': 'Database permission denied. Check your Realtime Database rules.',
  };
  return map[code] || e?.message || 'Something went wrong. Please try again.';
}

/** Resize an uploaded photo to a small JPEG data URL so it stays cheap to store. */
function resizePhoto(file: File, maxW = 120, maxH = 150): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = url;
  });
}

const ago = (ms: number | null, now: number): string => {
  if (!ms) return 'No data';
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 5) return 'Just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

/* ============================================================================
 * 4. SAFETY ENGINE (runs in the faculty dashboard)
 * ========================================================================== */

interface InternalState {
  lastSos: boolean;
  lastValid?: 'SAFE' | 'OUT_OF_RANGE';
  lostGps: boolean;
  lostSignal: boolean;
  alertedOut: boolean;
}

class SafetyEngine {
  private states = new Map<string, InternalState>();
  private listeners: Array<(e: SafetyEvent) => void> = [];

  onEvent(cb: (e: SafetyEvent) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  /** Drop all remembered state for a student (used when they reach the hostel). */
  forget(uid: string) {
    this.states.delete(uid);
  }

  /** Add a manual entry to the event log. */
  note(studentId: string, message: string, severity: SafetyEvent['severity'] = 'info') {
    this.emit(studentId, message, severity);
  }

  private emit(studentId: string, message: string, severity: SafetyEvent['severity']) {
    const now = new Date();
    const event: SafetyEvent = {
      id: `${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      studentId,
      message,
      severity,
    };
    this.listeners.forEach((l) => l(event));
  }

  process(s: LiveStudent, cfg: SafetyConfig, now: number, customRadius = false): StudentResult {
    const id = s.profile.rollNumber;
    const label = `${s.profile.name} (${id})`;
    let st = this.states.get(s.uid);
    if (!st) {
      st = { lastSos: false, lostGps: false, lostSignal: false, alertedOut: false };
      this.states.set(s.uid, st);
    }

    const sos = Boolean(s.sos);
    if (sos && !st.lastSos) this.emit(id, `Emergency SOS from ${label}`, 'critical');
    if (!sos && st.lastSos) this.emit(id, `SOS cleared by ${label}`, 'info');
    st.lastSos = sos;

    const updatedAt = s.updatedAt ?? null;
    const stale = updatedAt === null || (now - updatedAt) / 1000 > cfg.staleThresholdSeconds;
    const hasCoords =
      typeof s.latitude === 'number' && typeof s.longitude === 'number' &&
      !isNaN(s.latitude) && !isNaN(s.longitude);
    const accuracy = typeof s.accuracy === 'number' ? s.accuracy : null;
    const lowAccuracy = accuracy !== null && accuracy > cfg.accuracyThresholdMeters;

    const distanceKm = hasCoords
      ? haversineKm(s.latitude!, s.longitude!, cfg.centerLatitude, cfg.centerLongitude)
      : null;

    let status: Status;
    if (stale) {
      status = 'SIGNAL_LOST';
      if (!st.lostSignal) {
        st.lostSignal = true;
        this.emit(id, `No telemetry from ${label} for over ${cfg.staleThresholdSeconds}s (phone off, offline or app closed)`, 'warning');
      }
    } else {
      if (st.lostSignal) {
        st.lostSignal = false;
        this.emit(id, `Telemetry restored for ${label}`, 'info');
      }
      if (!hasCoords) {
        status = 'LOCATION_UNAVAILABLE';
        if (!st.lostGps) {
          st.lostGps = true;
          this.emit(id, `GPS unavailable for ${label}${s.gpsError ? `: ${s.gpsError}` : ''}`, 'warning');
        }
      } else {
        st.lostGps = false;
        if (lowAccuracy && st.lastValid) {
          status = st.lastValid;
        } else if (st.lastValid === 'OUT_OF_RANGE') {
          status = distanceKm! <= cfg.safeRadiusKm - cfg.hysteresisKm ? 'SAFE' : 'OUT_OF_RANGE';
        } else {
          status = distanceKm! <= cfg.safeRadiusKm ? 'SAFE' : 'OUT_OF_RANGE';
        }
        st.lastValid = status as 'SAFE' | 'OUT_OF_RANGE';
      }
    }

    if (status === 'OUT_OF_RANGE' && !st.alertedOut) {
      st.alertedOut = true;
      this.emit(id, `${label} left the ${cfg.safeRadiusKm} km zone (${distanceKm!.toFixed(2)} km)`, 'critical');
    } else if (status === 'SAFE' && st.alertedOut) {
      st.alertedOut = false;
      this.emit(id, `${label} is back inside the zone (${distanceKm!.toFixed(2)} km)`, 'info');
    }

    const isBreach =
      status === 'OUT_OF_RANGE' ||
      ((status === 'SIGNAL_LOST' || status === 'LOCATION_UNAVAILABLE') && st.lastValid === 'OUT_OF_RANGE');

    return {
      uid: s.uid,
      profile: s.profile,
      latitude: hasCoords ? s.latitude! : null,
      longitude: hasCoords ? s.longitude! : null,
      accuracy,
      battery: typeof s.battery === 'number' ? s.battery : null,
      distanceKm,
      status,
      lastKnownStatus: st.lastValid,
      isBreach,
      radiusKm: cfg.safeRadiusKm,
      customRadius,
      sos,
      lowAccuracy,
      updatedAt,
      disconnectedAt: typeof s.disconnectedAt === 'number' ? s.disconnectedAt : null,
      gpsError: s.gpsError ?? null,
    };
  }
}

/* ============================================================================
 * 5. SHARED UI
 * ========================================================================== */

const inputCls =
  'w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-900';

const ErrorBox: React.FC<{ msg: string | null }> = ({ msg }) =>
  msg ? (
    <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  ) : null;

const NoticeBox: React.FC<{ msg: string | null }> = ({ msg }) =>
  msg ? (
    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-950 text-xs font-medium flex items-start gap-2">
      <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  ) : null;

const Field: React.FC<{ label: string; htmlFor: string; hint?: string; children: React.ReactNode }> = ({
  label, htmlFor, hint, children,
}) => (
  <div>
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
  </div>
);

const Avatar: React.FC<{ name: string; photo?: string; size?: string }> = ({ name, photo, size = 'w-14 h-16' }) => {
  const initials = useMemo(() => {
    const p = (name || 'ST').trim().split(/\s+/);
    return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0].slice(0, 2)).toUpperCase();
  }, [name]);
  return photo ? (
    <img src={photo} alt={name} className={`${size} rounded-xl object-cover border border-slate-300 shrink-0`} />
  ) : (
    <div className={`${size} rounded-xl bg-slate-800 text-white flex items-center justify-center text-sm font-bold shrink-0`}>
      {initials}
    </div>
  );
};

const PasswordInput: React.FC<{
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string;
}> = ({ id, value, onChange, placeholder, autoComplete }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        required
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pr-10`}
      />
      <button
        type="button"
        aria-label={show ? 'Hide password' : 'Show password'}
        onClick={() => setShow(!show)}
        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

/* ============================================================================
 * 6. LANDING
 * ========================================================================== */

/** College logo. Save the real JNTU-GV logo as public/jntugv-logo.png. Falls back to text if the file is missing. */
const CollegeLogo: React.FC<{ className?: string }> = ({ className = 'w-14 h-14' }) => {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className={`${className} rounded-xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-serif font-black`}>
      JNTU
    </div>
  ) : (
    <img
      src="/jntugv-logo.png"
      alt="JNTU-GV logo"
      onError={() => setFailed(true)}
      className={`${className} rounded-full object-contain bg-white p-0.5 shrink-0`}
    />
  );
};

/** Faint app logo behind the page. Uses public/app-logo.svg. Hidden if the file is missing. */
const AppLogoWatermark: React.FC = () => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
      <img
        src="/app-icon.png"
        alt=""
        onError={() => setFailed(true)}
        className="w-[26rem] max-w-[85%] opacity-[0.07] select-none"
      />
    </div>
  );
};

const Landing: React.FC<{ onAdmin: () => void; onStudent: () => void }> = ({ onAdmin, onStudent }) => (
  <div className="relative min-h-screen bg-slate-50 flex flex-col overflow-hidden">
    <AppLogoWatermark />
    <header className="relative z-10 bg-slate-900 text-white border-b-4 border-amber-600">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3.5">
        <CollegeLogo />
        <div>
          <p className="text-[11px] font-bold tracking-wide text-amber-400">
            Jawaharlal Nehru Technological University Gurajada Vizianagaram
          </p>
          <h1 className="text-base sm:text-lg font-bold">JNTU-GV College of Engineering Vizianagaram</h1>
          <p className="text-xs text-slate-300">Student outing safety and perimeter tracking</p>
        </div>
      </div>
    </header>
    <main className="relative z-10 max-w-5xl w-full mx-auto px-4 py-10 flex-1 flex flex-col justify-center">
      <div className="flex items-center gap-4 mb-8">
        <img src="/app-icon.png" alt="" className="float-slow w-16 h-16 rounded-2xl shadow-lg shadow-blue-900/30 shrink-0" />
        <div>
          <p className="text-[11px] font-bold tracking-[0.25em] text-amber-600 uppercase">Welcome to the</p>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">JNTU-GV Tracking App</h2>
          <p className="text-sm text-slate-600 mt-1">Choose how you use the outing safety system.</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-lift bg-white/85 rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center mb-4">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold">Faculty and coordinators</h3>
            <p className="text-sm text-slate-600 mt-1.5">
              See where students on outings are, get alerts when someone leaves the permitted radius or sends an SOS, and call them directly.
            </p>
          </div>
          <button onClick={onAdmin} className="mt-6 w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Faculty sign in
          </button>
        </div>
        <div className="card-lift bg-white/85 rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-lg bg-blue-900 text-white flex items-center justify-center mb-4">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold">Students</h3>
            <p className="text-sm text-slate-600 mt-1.5">
              Register with your roll number and email, then share your location with your coordinator while you are out. One tap sends an SOS.
            </p>
          </div>
          <button onClick={onStudent} className="mt-6 w-full py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold flex items-center justify-center gap-2">
            <GraduationCap className="w-4 h-4" /> Student sign in or register
          </button>
        </div>
      </div>
      {!isNative && (
        <a href="/jntugv-outing.apk" download
          className="mt-6 block rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 hover:bg-emerald-100">
          <span className="font-bold">Android students: download the app.</span> It keeps sharing your location when the screen is locked. After downloading, open the file and allow "Install unknown apps" if asked.
        </a>
      )}
    </main>
  </div>
);

/* ============================================================================
 * 7. ADMIN LOGIN (Firebase Auth + admins/{uid} flag)
 * ========================================================================== */

const AdminLogin: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const flag = await get(ref(db, `admins/${cred.user.uid}`));
      if (flag.val() !== true) {
        await signOut(auth);
        setError('This account does not have faculty access.');
      }
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 p-6 text-white border-b-4 border-amber-600">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <h2 className="text-lg font-bold">Faculty sign in</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <ErrorBox msg={error} />
          <Field label="Email" htmlFor="admin-email">
            <input id="admin-email" type="email" required autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Password" htmlFor="admin-pass">
            <PasswordInput id="admin-pass" value={password} onChange={setPassword} autoComplete="current-password" />
          </Field>
          <button type="submit" disabled={busy}
            className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-[11px] text-slate-500">
            Faculty accounts are created by an administrator in the Firebase console.
          </p>
        </form>
      </div>
    </div>
  );
};

/* ============================================================================
 * 8. STUDENT AUTH (email + password, email verified by Firebase, mobile not verified)
 * ========================================================================== */

const StudentAuth: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [tab, setTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');

  const [roll, setRoll] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [photo, setPhoto] = useState<string>('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pw = passwordChecks(pass);
  const decoded = parseRoll(roll);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPass);
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    if (!isValidEmail(loginEmail)) {
      setError('Enter your email above first, then tap "Forgot password".');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim());
      setNotice('Password reset email sent. Check your inbox and spam folder.');
    } catch (err) {
      setError(authError(err));
    }
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setPhoto(await resizePhoto(f));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const R = roll.trim().toUpperCase();
    if (!isValidRoll(R)) return setError('Roll number must be 10 characters, for example 22MT1A0501.');
    if (!isValidName(name)) return setError('Enter your full name using letters only, as printed on your ID card.');
    if (!isValidMobile(mobile)) return setError('Enter a valid 10-digit Indian mobile number.');
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    if (!(pw.len && pw.letter && pw.number)) return setError('Password needs 6+ characters with letters and numbers.');

    setBusy(true);
    let created: User | null = null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
      created = cred.user;
      // Claim the roll number. The database rules only allow the first claim.
      try {
        await set(ref(db, `rollIndex/${R}`), cred.user.uid);
      } catch {
        await deleteUser(cred.user);
        created = null;
        setError(`Roll number ${R} is already registered. Contact your coordinator if this is a mistake.`);
        return;
      }
      const profile: Profile = {
        rollNumber: R,
        name: name.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
        phone: formatMobile(mobile),
        department: decoded.department,
        batch: decoded.batch,
        createdAt: Date.now(),
        ...(photo ? { photo } : {}),
      };
      await set(ref(db, `users/${cred.user.uid}`), profile);
      await updateProfile(cred.user, { displayName: profile.name });
      await sendEmailVerification(cred.user);
    } catch (err) {
      if (created) {
        try { await deleteUser(created); } catch { /* ignore */ }
      }
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-blue-950 p-6 text-white border-b-4 border-amber-500">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-blue-200 hover:text-white mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <h2 className="text-lg font-bold">{tab === 'LOGIN' ? 'Student sign in' : 'Student registration'}</h2>
          <div className="mt-4 grid grid-cols-2 gap-1.5 bg-blue-900/60 p-1 rounded-lg border border-blue-800">
            {(['LOGIN', 'REGISTER'] as const).map((t) => (
              <button key={t} type="button"
                onClick={() => { setTab(t); setError(null); setNotice(null); }}
                className={`py-2 rounded-md text-xs font-bold ${tab === t ? 'bg-white text-slate-900' : 'text-blue-200 hover:text-white'}`}>
                {t === 'LOGIN' ? 'Sign in' : 'New registration'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'LOGIN' ? (
          <form onSubmit={login} className="p-6 space-y-4">
            <ErrorBox msg={error} />
            <NoticeBox msg={notice} />
            <Field label="Email" htmlFor="l-email">
              <input id="l-email" type="email" required autoComplete="username" value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Password" htmlFor="l-pass">
              <PasswordInput id="l-pass" value={loginPass} onChange={setLoginPass} autoComplete="current-password" />
            </Field>
            <button type="submit" disabled={busy}
              className="w-full py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2">
              <Radio className="w-4 h-4" /> {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="flex justify-between text-xs pt-2 border-t border-slate-100">
              <button type="button" onClick={reset} className="font-semibold text-slate-600 hover:underline">Forgot password</button>
              <button type="button" onClick={() => setTab('REGISTER')} className="font-semibold text-blue-900 hover:underline">New student? Register</button>
            </div>
          </form>
        ) : (
          <form onSubmit={register} className="p-6 space-y-4">
            <ErrorBox msg={error} />
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
              <Avatar name={name || 'New Student'} photo={photo} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs font-bold text-slate-900">{roll || 'ROLL NUMBER'}</div>
                <div className="text-xs text-slate-600 truncate">{isValidRoll(roll) ? decoded.department : 'Branch is read from your roll number'}</div>
                <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="mt-1 text-[11px] font-semibold text-blue-800 hover:underline flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Add ID card photo
                </button>
              </div>
            </div>

            <Field label="Roll number" htmlFor="r-roll">
              <input id="r-roll" required maxLength={10} value={roll}
                onChange={(e) => setRoll(e.target.value.toUpperCase().replace(/\s/g, ''))}
                placeholder="e.g. 22MT1A0501" className={`${inputCls} font-mono font-bold uppercase`} />
            </Field>
            <Field label="Full name (as on ID card)" htmlFor="r-name">
              <input id="r-name" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Mobile number" htmlFor="r-mobile" hint="Your coordinator can call this number if you do not respond. It is not verified by OTP, so double-check it.">
              <input id="r-mobile" type="tel" required value={mobile} onChange={(e) => setMobile(e.target.value)}
                placeholder="10-digit mobile number" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Email" htmlFor="r-email" hint="We send a verification link to this address.">
              <input id="r-email" type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com or roll@jntugv.edu.in" className={inputCls} />
            </Field>
            <Field label="Create password" htmlFor="r-pass">
              <PasswordInput id="r-pass" value={pass} onChange={setPass} autoComplete="new-password" />
              <div className="flex gap-3 mt-1 text-[11px] font-medium">
                <span className={pw.len ? 'text-emerald-700' : 'text-slate-400'}>{pw.len ? '✓' : '○'} 6+ characters</span>
                <span className={pw.letter ? 'text-emerald-700' : 'text-slate-400'}>{pw.letter ? '✓' : '○'} Letters</span>
                <span className={pw.number ? 'text-emerald-700' : 'text-slate-400'}>{pw.number ? '✓' : '○'} Numbers</span>
              </div>
            </Field>
            <button type="submit" disabled={busy}
              className="w-full py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold text-sm">
              {busy ? 'Creating account…' : 'Create account and send verification email'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const VerifyEmail: React.FC<{ user: User; onChecked: () => void }> = ({ user, onChecked }) => {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const resend = async () => {
    setErr(null);
    try {
      await sendEmailVerification(user);
      setMsg('Verification email sent again. Check your inbox and spam folder.');
    } catch (e) {
      setErr(authError(e));
    }
  };
  const check = async () => {
    setErr(null);
    await user.reload();
    await user.getIdToken(true); // refresh the email_verified claim used by database rules
    if (!user.emailVerified) setErr('Email not verified yet. Open the link we sent, then try again.');
    onChecked();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="w-11 h-11 rounded-lg bg-blue-900 text-white flex items-center justify-center"><Mail className="w-5 h-5" /></div>
        <h2 className="text-lg font-bold text-slate-900">Verify your email</h2>
        <p className="text-sm text-slate-600">
          We sent a verification link to <span className="font-semibold">{user.email}</span>. Open it, then come back and continue.
        </p>
        <ErrorBox msg={err} />
        <NoticeBox msg={msg} />
        <button onClick={check} className="w-full py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold">
          I have verified my email
        </button>
        <div className="flex justify-between text-xs">
          <button onClick={resend} className="font-semibold text-blue-900 hover:underline">Resend email</button>
          <button onClick={() => signOut(auth)} className="font-semibold text-slate-600 hover:underline">Sign out</button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 9. STUDENT PORTAL (GPS + battery + SOS -> telemetry/{uid})
 * Tracking runs from sign-in until faculty mark the student as "reached hostel".
 * ========================================================================== */

const StudentPortal: React.FC<{ user: User }> = ({ user }) => {
  const cfg = useSafetyConfig();
  const [radiusOverride, setRadiusOverride] = useState<number | null>(null);
  useEffect(
    () =>
      onValue(
        ref(db, `studentRadius/${user.uid}`),
        (s) => { const v = s.val(); setRadiusOverride(typeof v === 'number' && v > 0 ? v : null); },
        () => setRadiusOverride(null)
      ),
    [user.uid]
  );
  const radiusKm = radiusOverride ?? cfg.safeRadiusKm;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [acc, setAcc] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>('Waiting for GPS…');
  const [battery, setBattery] = useState<number | null>(null);
  const [charging, setCharging] = useState(false);
  const [sos, setSos] = useState(false);
  const [confirmSos, setConfirmSos] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reachedAt, setReachedAt] = useState<number | null>(null);
  const [reachedLoaded, setReachedLoaded] = useState(false);
  const [connected, setConnected] = useState(true);
  const [lastSent, setLastSent] = useState<string>('—');
  const [sendError, setSendError] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  const [alertActive, setAlertActive] = useState(false);
  const trackingRef = useRef(false);
  const lastSendRef = useRef(0);
  const lowBatteryWarned = useRef(100);

  // Tracking is on until faculty mark this student as reached.
  const tracking = loaded && reachedLoaded && !reachedAt;
  trackingRef.current = tracking;

  const latest = useRef({ lat, lon, acc, gpsError, battery, charging, sos });
  latest.current = { lat, lon, acc, gpsError, battery, charging, sos };

  // Ask for notification permission once
  useEffect(() => { setupNotifications(); }, []);

  // Profile, SOS state after a reload, and the "reached hostel" flag set by faculty
  useEffect(() => {
    const offProfile = onValue(ref(db, `users/${user.uid}`), (s) => setProfile(s.val()));
    const offReached = onValue(
      ref(db, `telemetry/${user.uid}/reachedAt`),
      (s) => {
        const v = s.val();
        setReachedAt(typeof v === 'number' ? v : null);
        setReachedLoaded(true);
      },
      () => setReachedLoaded(true)
    );
    // Live, so an SOS raised by the shake service while the screen was locked shows up here too.
    const offSos = onValue(
      ref(db, `telemetry/${user.uid}/sos`),
      (s) => { setSos(s.val() === true); setLoaded(true); },
      () => setLoaded(true)
    );
    return () => { offProfile(); offReached(); offSos(); };
  }, [user.uid]);

  // When faculty mark the student as reached, clear local SOS and warnings
  useEffect(() => {
    if (reachedAt) {
      setSos(false);
      setConfirmSos(false);
      clearNotification(RECONNECT_ID);
      clearNotification(BATTERY_ID);
    }
  }, [reachedAt]);

  // Connection state. If the connection drops, the server records when it happened.
  useEffect(() => {
    return onValue(ref(db, '.info/connected'), (s) => {
      const ok = s.val() === true;
      setConnected(ok);
      if (ok) {
        onDisconnect(ref(db, `telemetry/${user.uid}`))
          .update({ online: false, disconnectedAt: serverTimestamp() })
          .catch(() => {});
      }
    });
  }, [user.uid]);

  // Battery
  useEffect(() => {
    const read = async () => {
      try {
        if (isNative) {
          const b = await Device.getBatteryInfo();
          if (typeof b.batteryLevel === 'number') setBattery(Math.round(b.batteryLevel * 100));
          setCharging(Boolean(b.isCharging));
        } else {
          const nav: any = navigator;
          if (typeof nav.getBattery === 'function') {
            const b = await nav.getBattery();
            setBattery(Math.round(b.level * 100));
            setCharging(Boolean(b.charging));
          }
        }
      } catch { /* battery info is optional */ }
    };
    read();
    const t = setInterval(read, 60000);
    return () => clearInterval(t);
  }, []);

  // Low battery warning: a dead phone means the coordinator loses the student.
  useEffect(() => {
    if (charging || (battery !== null && battery > 25)) lowBatteryWarned.current = 100;
    if (!tracking || battery === null || charging) return;
    const level = battery <= 10 ? 10 : battery <= 20 ? 20 : 100;
    if (level < lowBatteryWarned.current) {
      lowBatteryWarned.current = level;
      notifyStudent(
        BATTERY_ID,
        'Battery is low',
        `Battery is at ${battery}%. Charge your phone now. If it switches off, your coordinator cannot see you and the hostel admin may call you.`
      );
    }
  }, [battery, charging, tracking]);

  // Web only: keep the screen awake. The Android app uses a background service instead.
  useEffect(() => {
    if (isNative) return;
    const nav: any = navigator;
    let lock: any = null;
    const acquire = async () => {
      try {
        if (nav.wakeLock?.request) {
          lock = await nav.wakeLock.request('screen');
        }
      } catch { /* stay-awake is optional */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch(() => {});
    };
  }, []);

  // Location. Only runs while tracking. No fake fallback: if GPS fails, we report that honestly.
  useEffect(() => {
    if (!tracking) return;

    const apply = (la: number | null, lo: number | null, ac: number | null, err: string | null) => {
      latest.current = { ...latest.current, lat: la, lon: lo, acc: ac, gpsError: err };
      setLat(la); setLon(lo); setAcc(ac); setGpsError(err);
    };
    // Send right when a new fix arrives so uploads do not depend on a timer that Android may slow down.
    const pushNow = () => {
      if (!trackingRef.current || Date.now() - lastSendRef.current < 4000) return;
      lastSendRef.current = Date.now();
      send();
    };

    apply(null, null, null, 'Waiting for GPS…');

    if (isNative) {
      let watcherId: string | null = null;
      let cancelled = false;
      BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: 'Outing safety tracking is on',
          backgroundMessage: 'Your location is shared with your coordinator.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
        },
        (loc, err) => {
          if (err) {
            const denied = err.code === 'NOT_AUTHORIZED';
            setNeedsSettings(denied);
            apply(null, null, null, denied
              ? 'Location permission denied. Open app settings and allow location.'
              : 'Location unavailable. Turn on GPS.');
            return;
          }
          if (loc) {
            setNeedsSettings(false);
            apply(loc.latitude, loc.longitude, Math.round(loc.accuracy), null);
            pushNow();
          }
        }
      )
        .then((id) => {
          if (cancelled) BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
          else watcherId = id;
        })
        .catch(() => apply(null, null, null, 'Could not start location tracking.'));
      return () => {
        cancelled = true;
        if (watcherId) BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
      };
    }

    if (!navigator.geolocation) {
      apply(null, null, null, 'This browser has no location support.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => apply(p.coords.latitude, p.coords.longitude, Math.round(p.coords.accuracy), null),
      (e) =>
        apply(null, null, null,
          e.code === 1 ? 'Location permission denied. Allow location for this site.'
          : e.code === 2 ? 'Location unavailable. Move outdoors or enable GPS.'
          : 'Location request timed out.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking]);

  // update() (not set()) so the faculty's reachedAt flag is never overwritten.
  const send = useCallback(
    async (sosOverride?: boolean) => {
      if (!trackingRef.current) return;
      const v = latest.current;
      try {
        await update(ref(db, `telemetry/${user.uid}`), {
          latitude: v.lat,
          longitude: v.lon,
          accuracy: v.acc,
          battery: v.battery,
          charging: v.charging,
          sos: sosOverride ?? v.sos,
          gpsError: v.gpsError,
          online: true,
          disconnectedAt: null,
          updatedAt: serverTimestamp(),
        });
        setLastSent(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setSendError(null);
      } catch (e: any) {
        setSendError(
          e?.code === 'PERMISSION_DENIED'
            ? 'Not allowed to send location. Verify your email, then sign in again.'
            : 'Could not send location. Retrying…'
        );
      }
    },
    [user.uid]
  );

  useEffect(() => {
    if (!tracking) return;
    send();
    const t = setInterval(() => send(), 5000);
    return () => clearInterval(t);
  }, [tracking, send]);

  // Shake-to-SOS (Android app). Detection runs in a native service so it works when the phone is locked.
  const shake = useShakeSos({
    active: tracking && isNative,
    user,
    auth,
    firebaseConfig,
    sos,
    onSosFromShake: () => { setSos(true); setConfirmSos(false); send(true); },
    onSosCleared: () => { setSos(false); send(false); },
  });

  // Reconnect alerts. If location is not reaching the coordinator, tell the student.
  const problem: string | null = !tracking
    ? null
    : !connected
    ? 'No internet connection. Turn on mobile data or Wi-Fi.'
    : gpsError
    ? gpsError
    : sendError
    ? 'Your location could not be sent.'
    : null;

  useEffect(() => {
    if (!tracking || !problem) {
      setAlertActive(false);
      clearNotification(RECONNECT_ID);
      return;
    }
    const alertNow = () =>
      notifyStudent(
        RECONNECT_ID,
        'Reconnect to the outing tracker',
        `${problem} Your coordinator cannot see you. Please fix this as soon as possible, otherwise the hostel admin may call you.`
      );
    const first = setTimeout(() => { setAlertActive(true); alertNow(); }, 20000);
    const repeat = setInterval(alertNow, 60000);
    return () => { clearTimeout(first); clearInterval(repeat); };
  }, [tracking, problem]);

  const startNewOuting = async () => {
    setSendError(null);
    try {
      await update(ref(db, `telemetry/${user.uid}`), {
        reachedAt: null,
        sos: false,
        online: true,
        disconnectedAt: null,
        updatedAt: serverTimestamp(),
      });
    } catch {
      setSendError('Could not start the outing. Check your connection and try again.');
    }
  };

  const toggleSos = () => {
    if (sos) {
      setSos(false);
      send(false);
      return;
    }
    if (!confirmSos) {
      setConfirmSos(true);
      setTimeout(() => setConfirmSos(false), 5000);
      return;
    }
    setConfirmSos(false);
    setSos(true);
    send(true);
  };

  const distance = lat !== null && lon !== null ? haversineKm(lat, lon, cfg.centerLatitude, cfg.centerLongitude) : null;
  const out = distance !== null && distance > radiusKm;

  const banner = sos
    ? { cls: 'bg-red-800 sos-ring', text: 'SOS is active' }
    : distance === null
    ? { cls: 'bg-amber-700', text: 'Location unavailable' }
    : out
    ? { cls: 'bg-red-700', text: 'Outside the permitted radius' }
    : { cls: 'bg-emerald-800', text: 'Inside the permitted radius' };

  const hasReached = reachedLoaded && Boolean(reachedAt);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      <ShakeCountdownOverlay shake={shake} />
      <header className="bg-slate-900 text-white border-b-2 border-amber-500 sticky top-0 z-30">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold">JNTU-GV outing tracker</h1>
            <p className={`text-[11px] flex items-center gap-1 ${connected ? 'text-emerald-400' : 'text-red-300'}`}>
              {connected
                ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {tracking ? `Connected · last sent ${lastSent}` : 'Connected'}</>
                : <><WifiOff className="w-3 h-3" /> Offline · will resend when connected</>}
            </p>
          </div>
          {/* Signing out would stop tracking, so it is only available after the student has reached the hostel. */}
          {hasReached && (
            <button onClick={() => signOut(auth)} aria-label="Sign out" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-5 space-y-4">
        {tracking && alertActive && problem && (
          <div role="alert" className="rounded-xl p-4 bg-red-700 text-white flex items-start gap-3">
            <BellRing className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Reconnect needed</p>
              <p className="text-xs mt-1 text-white/90">
                {problem} Your coordinator cannot see you right now. Fix this as soon as possible, otherwise the hostel admin may call you.
              </p>
            </div>
          </div>
        )}

        {profile && (
          <p className="text-sm font-semibold text-slate-700">
            Welcome, <span className="text-blue-900 capitalize">{profile.name.split(' ')[0].toLowerCase()}</span>. Stay safe on your outing.
          </p>
        )}

        {profile && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4">
            <Avatar name={profile.name} photo={profile.photo} size="w-20 h-24" />
            <div className="min-w-0">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">{profile.rollNumber}</span>
              <h2 className="text-base font-bold mt-1.5 truncate">{profile.name}</h2>
              <p className="text-xs text-slate-600">{profile.department}</p>
              <p className="text-[11px] text-slate-500">{profile.batch}</p>
              <p className="text-xs font-mono text-slate-600 mt-1 flex items-center gap-1"><Phone className="w-3 h-3" />{profile.phone}</p>
            </div>
          </div>
        )}

        {hasReached ? (
          <>
            <div className="rounded-xl p-5 bg-emerald-800 text-white">
              <span className="text-xs font-bold bg-black/25 px-2.5 py-1 rounded inline-flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5" /> Reached hostel
              </span>
              <p className="mt-3 text-sm">
                Your coordinator marked you as reached at{' '}
                <span className="font-semibold">
                  {new Date(reachedAt!).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                . Location sharing is off.
              </p>
              <button onClick={startNewOuting}
                className="mt-4 w-full py-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-900 text-sm font-semibold">
                Start a new outing
              </button>
            </div>
            <ErrorBox msg={sendError} />
          </>
        ) : (
          <>
            <div className={`rounded-xl p-5 text-white transition-colors duration-500 ${banner.cls}`}>
              <span className="text-xs font-bold bg-black/25 px-2.5 py-1 rounded">{banner.text}</span>
              <div className="mt-4 flex justify-between items-baseline">
                <div>
                  <span className="text-xs text-white/80 block">Distance from campus</span>
                  <span className="text-3xl font-bold font-mono">{distance !== null ? `${distance.toFixed(2)} km` : 'N/A'}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-white/80 block">Permitted radius</span>
                  <span className="text-base font-bold font-mono">{radiusKm} km</span>
                </div>
              </div>
              {distance !== null && (
                <div className="mt-3 w-full bg-black/30 rounded-full h-2 overflow-hidden">
                  <div className="bg-white h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(100, (distance / radiusKm) * 100)}%` }} />
                </div>
              )}
              {gpsError && <p className="text-xs mt-3 text-white/90">{gpsError}</p>}
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <button onClick={toggleSos}
                className={`w-full py-3.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 text-white ${sos ? 'bg-slate-900 hover:bg-slate-800' : confirmSos ? 'bg-red-900 hover:bg-red-950 animate-pulse' : 'bg-red-700 hover:bg-red-800'}`}>
                <AlertOctagon className="w-5 h-5" />
                {sos ? 'Cancel SOS' : confirmSos ? 'Tap again to confirm SOS' : 'Send emergency SOS'}
              </button>
              <p className="text-[11px] text-slate-500 mt-2">Your coordinator is alerted immediately and can see your location.</p>
            </div>

            <ShakeSosCard shake={shake} tracking={tracking} />

            <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Location</span>
                  <span className="font-mono font-bold">{lat !== null && lon !== null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : 'No signal'}</span>
                  {acc !== null && <span className="text-[10px] text-slate-500 block">±{acc} m</span>}
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Battery</span>
                  <span className="font-mono font-bold flex items-center gap-1">
                    {charging ? <BatteryCharging className="w-4 h-4 text-emerald-700" /> : <Battery className="w-4 h-4" />}
                    {battery !== null ? `${battery}%` : 'Unknown'}
                  </span>
                </div>
              </div>
              {sendError && <ErrorBox msg={sendError} />}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                Tracking stays on until your coordinator marks you as reached at the hostel. Keep your phone switched on and charged, and keep mobile data and GPS on.
              </div>
              {isNative && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                  Tracking keeps running while the screen is locked or you use other apps. A notification shows while it is active. Do not swipe this app away from recent apps, and turn off battery optimization for it if your phone stops it.
                </div>
              )}
              {needsSettings && (
                <button onClick={() => BackgroundGeolocation.openSettings().catch(() => {})}
                  className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold">
                  Open app settings to allow location
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

/* ============================================================================
 * 10. FACULTY DASHBOARD
 * ========================================================================== */

type Filter = 'ALL' | 'SAFE' | 'BREACH' | 'SOS' | 'LOST' | 'REACHED';

const statusBadge = (r: StudentResult) => {
  if (r.status === 'SAFE') return { t: 'In safe zone', c: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
  if (r.status === 'OUT_OF_RANGE') return { t: 'Out of range', c: 'bg-red-50 text-red-800 border-red-200' };
  if (r.status === 'LOCATION_UNAVAILABLE') return { t: 'GPS unavailable', c: 'bg-amber-50 text-amber-900 border-amber-200' };
  return { t: 'Signal lost', c: 'bg-amber-50 text-amber-900 border-amber-200' };
};

/** Inline editor so faculty can change the permitted radius of one student. */
const RadiusEditor: React.FC<{
  r: StudentResult;
  defaultKm: number;
  onSet: (r: StudentResult, km: number | null) => Promise<void> | void;
}> = ({ r, defaultKm, onSet }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(r.radiusKm));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = () => { setVal(String(r.radiusKm)); setErr(null); setEditing(true); };
  const save = async () => {
    const km = Number(val);
    if (!isFinite(km) || km < MIN_RADIUS_KM || km > MAX_RADIUS_KM) {
      return setErr(`Enter a value from ${MIN_RADIUS_KM} to ${MAX_RADIUS_KM} km.`);
    }
    setBusy(true);
    await onSet(r, km === defaultKm ? null : km);
    setBusy(false);
    setEditing(false);
  };
  const reset = async () => {
    setBusy(true);
    await onSet(r, null);
    setBusy(false);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-600 flex items-center gap-1.5">
          Allowed range
          <span className="font-mono font-bold text-slate-900">{r.radiusKm} km</span>
          {r.customRadius
            ? <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-semibold">Custom</span>
            : <span className="text-slate-400">(default)</span>}
        </span>
        <button onClick={open} aria-label={`Change range for ${r.profile.name}`}
          className="px-2 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold flex items-center gap-1">
          <Settings className="w-3 h-3" /> Change range
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 p-2.5 rounded-lg bg-white border border-slate-300 text-[11px] space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor={`rad-${r.uid}`} className="font-semibold text-slate-700 shrink-0">Range (km)</label>
        <input id={`rad-${r.uid}`} type="number" inputMode="decimal" step="0.5" min={MIN_RADIUS_KM} max={MAX_RADIUS_KM}
          value={val} onChange={(e) => setVal(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900" />
      </div>
      <div className="flex flex-wrap gap-1">
        {[5, 10, 15, 25, 50].map((k) => (
          <button key={k} type="button" onClick={() => setVal(String(k))}
            className={`px-2 py-0.5 rounded border font-mono font-semibold ${Number(val) === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'}`}>
            {k}
          </button>
        ))}
      </div>
      {err && <p className="text-red-700 font-medium">{err}</p>}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={reset} disabled={busy || !r.customRadius}
          className="text-slate-600 hover:text-slate-900 underline disabled:opacity-40 disabled:no-underline">
          Reset to default ({defaultKm} km)
        </button>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setEditing(false)} disabled={busy}
            className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-semibold">Cancel</button>
          <button type="button" onClick={save} disabled={busy}
            className="px-2.5 py-1 rounded-md bg-slate-900 text-white font-semibold disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

const StudentCard: React.FC<{
  r: StudentResult;
  cfg: SafetyConfig;
  now: number;
  onCall: (r: StudentResult) => void;
  onReached: (r: StudentResult) => void;
  onSetRadius: (r: StudentResult, km: number | null) => Promise<void> | void;
}> = ({ r, cfg, now, onCall, onReached, onSetRadius }) => {
  const b = statusBadge(r);
  const border = r.sos ? 'border-red-700 ring-2 ring-red-700/15' : r.isBreach ? 'border-red-400' : r.status === 'SAFE' ? 'border-slate-200' : 'border-amber-400';
  const urgent = r.sos || r.isBreach;
  const followUp = r.status === 'SIGNAL_LOST' || r.status === 'LOCATION_UNAVAILABLE';
  const callCls = urgent
    ? 'bg-red-700 hover:bg-red-800'
    : followUp
    ? 'bg-amber-600 hover:bg-amber-700'
    : 'bg-slate-900 hover:bg-slate-800';
  return (
    <div className={`card-lift rounded-xl border bg-white p-4 flex flex-col justify-between ${border}`}>
      <div>
        <div className="flex items-start gap-3.5">
          <Avatar name={r.profile.name} photo={r.profile.photo} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">{r.profile.rollNumber}</span>
              {r.battery !== null && (
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold flex items-center gap-1 ${r.battery <= 20 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-700'}`}>
                  <Battery className="w-3.5 h-3.5" />{r.battery}%
                </span>
              )}
            </div>
            <h3 className="font-bold text-sm text-slate-900 truncate mt-1">{r.profile.name}</h3>
            <p className="text-[11px] text-slate-600 truncate">{r.profile.department}</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {r.sos && <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-800 text-white">SOS emergency</span>}
            <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${b.c}`}>{b.t}</span>
            {r.isBreach && r.status !== 'OUT_OF_RANGE' && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-800 border border-red-200">Last seen out of range</span>
            )}
            {r.lowAccuracy && <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">Low accuracy</span>}
          </div>
          <span className="text-[11px] text-slate-500 flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{ago(r.updatedAt, now)}</span>
        </div>

        <div className="mt-3 bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-600">{r.status === 'SIGNAL_LOST' ? 'Last known distance' : 'Distance from campus'}</span>
            <span className="font-mono font-bold">{r.distanceKm !== null ? `${r.distanceKm.toFixed(2)} km` : 'Unavailable'}<span className="text-slate-400 font-normal"> / {r.radiusKm} km</span></span>
          </div>
          {r.distanceKm !== null && (
            <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div className={`h-full transition-all duration-700 ease-out ${r.isBreach ? 'bg-red-600' : r.distanceKm >= r.radiusKm * 0.85 ? 'bg-amber-500' : 'bg-emerald-600'}`}
                style={{ width: `${Math.min(100, (r.distanceKm / r.radiusKm) * 100)}%` }} />
            </div>
          )}
          <RadiusEditor key={`${r.uid}-${r.radiusKm}-${r.customRadius}`} r={r} defaultKm={cfg.safeRadiusKm} onSet={onSetRadius} />
          {r.gpsError && <p className="mt-2 text-amber-800">{r.gpsError}</p>}
          {r.status === 'SIGNAL_LOST' && r.disconnectedAt !== null && (
            <p className="mt-2 text-amber-800">
              Phone went offline {ago(r.disconnectedAt, now)}.
              {r.battery !== null && r.battery <= 5 ? ` Last battery was ${r.battery}%, it may have switched off.` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
        {r.latitude !== null ? (
          <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noopener noreferrer"
            className="py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> View on map
          </a>
        ) : (
          <span className="py-2 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold flex items-center justify-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> No location
          </span>
        )}
        <button onClick={() => onCall(r)}
          className={`py-2 rounded-lg text-white text-xs font-semibold flex items-center justify-center gap-1.5 ${callCls}`}>
          <Phone className="w-3.5 h-3.5" /> Call student
        </button>
        <button onClick={() => onReached(r)}
          className="col-span-2 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5">
          <Home className="w-3.5 h-3.5" /> Reached hostel
        </button>
      </div>
    </div>
  );
};

const ReachedRow: React.FC<{ r: ReachedStudent; onUndo: (r: ReachedStudent) => void }> = ({ r, onUndo }) => (
  <div className="rounded-xl border border-emerald-200 bg-white p-4 flex items-center gap-3.5">
    <Avatar name={r.profile.name} photo={r.profile.photo} size="w-12 h-14" />
    <div className="flex-1 min-w-0">
      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">{r.profile.rollNumber}</span>
      <h3 className="font-bold text-sm text-slate-900 truncate mt-1">{r.profile.name}</h3>
      <p className="text-[11px] text-emerald-800 flex items-center gap-1 mt-0.5">
        <Home className="w-3 h-3" />
        Reached hostel {new Date(r.reachedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
    <button onClick={() => onUndo(r)}
      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 shrink-0">
      <RotateCcw className="w-3.5 h-3.5" /> Undo
    </button>
  </div>
);

const SettingsModal: React.FC<{ cfg: SafetyConfig; onClose: () => void; onSaved: (m: string) => void }> = ({ cfg, onClose, onSaved }) => {
  const [f, setF] = useState<SafetyConfig>(cfg);
  const [err, setErr] = useState<string | null>(null);
  const num = (k: keyof SafetyConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value === '' ? ('' as any) : Number(e.target.value) });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean: SafetyConfig = {
      ...f,
      centerLatitude: Number(f.centerLatitude),
      centerLongitude: Number(f.centerLongitude),
      safeRadiusKm: Number(f.safeRadiusKm),
      hysteresisKm: Number(f.hysteresisKm),
      accuracyThresholdMeters: Number(f.accuracyThresholdMeters),
      staleThresholdSeconds: Number(f.staleThresholdSeconds),
    };
    if (Object.values(clean).some((v) => typeof v === 'number' && isNaN(v)) || clean.safeRadiusKm <= 0) {
      return setErr('Enter valid numbers. Radius must be above 0.');
    }
    try {
      await set(ref(db, 'config/safety'), clean);
      onSaved('Settings saved for all devices.');
      onClose();
    } catch (e2) {
      setErr(authError(e2));
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Settings" className="anim-fade fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <form onSubmit={save} className="anim-pop bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="text-sm font-bold">Perimeter settings</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-3">
          <ErrorBox msg={err} />
          <Field label="Base location name" htmlFor="s-name">
            <input id="s-name" value={f.centerName} onChange={(e) => setF({ ...f, centerName: e.target.value })} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" htmlFor="s-lat"><input id="s-lat" type="number" step="any" value={f.centerLatitude} onChange={num('centerLatitude')} className={`${inputCls} font-mono`} /></Field>
            <Field label="Longitude" htmlFor="s-lon"><input id="s-lon" type="number" step="any" value={f.centerLongitude} onChange={num('centerLongitude')} className={`${inputCls} font-mono`} /></Field>
            <Field label="Default permitted radius (km)" htmlFor="s-rad" hint="Applies to every student unless you change it on that student's card."><input id="s-rad" type="number" step="any" value={f.safeRadiusKm} onChange={num('safeRadiusKm')} className={`${inputCls} font-mono`} /></Field>
            <Field label="Return margin (km)" htmlFor="s-hys" hint="Student must come this far inside before the alert clears."><input id="s-hys" type="number" step="any" value={f.hysteresisKm} onChange={num('hysteresisKm')} className={`${inputCls} font-mono`} /></Field>
            <Field label="Ignore GPS worse than (m)" htmlFor="s-acc"><input id="s-acc" type="number" step="any" value={f.accuracyThresholdMeters} onChange={num('accuracyThresholdMeters')} className={`${inputCls} font-mono`} /></Field>
            <Field label="Signal lost after (s)" htmlFor="s-stale"><input id="s-stale" type="number" step="any" value={f.staleThresholdSeconds} onChange={num('staleThresholdSeconds')} className={`${inputCls} font-mono`} /></Field>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 flex justify-between">
          <button type="button" onClick={() => setF({ ...DEFAULT_CONFIG })} className="text-xs text-slate-500 hover:text-slate-800">Restore defaults</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">Cancel</button>
            <button type="submit" className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold">Save</button>
          </div>
        </div>
      </form>
    </div>
  );
};

const AdminPortal: React.FC<{ user: User }> = () => {
  const cfg = useSafetyConfig();
  const radii = useStudentRadii();
  const engine = useRef(new SafetyEngine()).current;
  const [users, setUsers] = useState<Record<string, Profile>>({});
  const [tele, setTele] = useState<Record<string, Telemetry>>({});
  const [results, setResults] = useState<StudentResult[]>([]);
  const [reached, setReached] = useState<ReachedStudent[]>([]);
  const [events, setEvents] = useState<SafetyEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [showLog, setShowLog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((p) => (p === m ? null : p)), 4000);
  };

  useEffect(() => engine.onEvent((e) => setEvents((p) => [e, ...p].slice(0, 200))), [engine]);

  useEffect(() => {
    const onErr = (e: any) => setError(authError(e));
    const offs = [
      onValue(ref(db, 'users'), (s) => { setUsers(s.val() || {}); setError(null); }, onErr),
      onValue(ref(db, 'telemetry'), (s) => setTele(s.val() || {}), onErr),
      onValue(ref(db, '.info/serverTimeOffset'), (s) => setOffset(s.val() || 0)),
      onValue(ref(db, '.info/connected'), (s) => setConnected(s.val() === true)),
    ];
    const t = setInterval(() => setTick(Date.now()), 5000);
    return () => { offs.forEach((o) => o()); clearInterval(t); };
  }, []);

  // Students marked "reached hostel" leave the active list and are no longer monitored.
  useEffect(() => {
    const now = tick + offset;
    const live: LiveStudent[] = [];
    const done: ReachedStudent[] = [];
    Object.entries(tele).forEach(([uid, t]) => {
      const profile = users[uid];
      if (!profile) return;
      if (t.reachedAt) {
        engine.forget(uid);
        done.push({ uid, profile, reachedAt: t.reachedAt });
      } else {
        live.push({ ...t, uid, profile });
      }
    });
    setResults(
      live.map((s) => {
        const custom = radii[s.uid];
        return engine.process(s, custom ? { ...cfg, safeRadiusKm: custom } : cfg, now, Boolean(custom));
      })
    );
    setReached(done.sort((a, b) => b.reachedAt - a.reachedAt));
  }, [tele, users, cfg, radii, tick, offset, engine]);

  const now = tick + offset;

  const sorted = useMemo(() => {
    const rank = (r: StudentResult) => (r.sos ? 0 : r.isBreach ? 1 : r.status !== 'SAFE' ? 2 : 3);
    return [...results].sort((a, b) => rank(a) - rank(b) || (b.distanceKm ?? 0) - (a.distanceKm ?? 0));
  }, [results]);

  const counts = useMemo(() => ({
    all: results.length,
    safe: results.filter((r) => r.status === 'SAFE' && !r.sos).length,
    breach: results.filter((r) => r.isBreach).length,
    sos: results.filter((r) => r.sos).length,
    lost: results.filter((r) => r.status === 'SIGNAL_LOST' || r.status === 'LOCATION_UNAVAILABLE').length,
  }), [results]);

  const q = query.toLowerCase().trim();
  const matchesQuery = (p: Profile) =>
    !q || p.rollNumber.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.department.toLowerCase().includes(q);

  const shown = sorted.filter((r) => {
    if (!matchesQuery(r.profile)) return false;
    if (filter === 'SAFE') return r.status === 'SAFE' && !r.sos;
    if (filter === 'BREACH') return r.isBreach;
    if (filter === 'SOS') return r.sos;
    if (filter === 'LOST') return r.status === 'SIGNAL_LOST' || r.status === 'LOCATION_UNAVAILABLE';
    return true;
  });

  const reachedShown = reached.filter((r) => matchesQuery(r.profile));

  const call = (r: StudentResult) => {
    const num = r.profile.phone.replace(/[^0-9+]/g, '');
    if (!num) return showToast(`No phone number for ${r.profile.name}.`);
    window.location.href = `tel:${num}`;
  };

  const markReached = async (r: StudentResult) => {
    const warn = r.sos
      ? 'This student has an active SOS. '
      : r.isBreach
      ? 'This student is outside the permitted radius. '
      : r.status === 'SIGNAL_LOST'
      ? 'This student has no signal right now. '
      : '';
    const ok = window.confirm(
      `${warn}Mark ${r.profile.name} (${r.profile.rollNumber}) as reached hostel? Tracking will stop and they will leave the active list.`
    );
    if (!ok) return;
    try {
      await set(ref(db, `telemetry/${r.uid}/reachedAt`), serverTimestamp());
      engine.note(r.profile.rollNumber, `${r.profile.name} (${r.profile.rollNumber}) marked as reached hostel`, 'info');
      showToast(`${r.profile.name} marked as reached hostel.`);
    } catch (e) {
      showToast(authError(e));
    }
  };

  const setRadius = async (r: StudentResult, km: number | null) => {
    try {
      await set(ref(db, `studentRadius/${r.uid}`), km);
      const msg = km === null
        ? `${r.profile.name} (${r.profile.rollNumber}) range reset to default ${cfg.safeRadiusKm} km`
        : `${r.profile.name} (${r.profile.rollNumber}) range set to ${km} km`;
      engine.note(r.profile.rollNumber, msg, 'info');
      showToast(msg + '.');
    } catch (e) {
      showToast(authError(e));
    }
  };

  const undoReached = async (r: ReachedStudent) => {
    try {
      await set(ref(db, `telemetry/${r.uid}/reachedAt`), null);
      engine.note(r.profile.rollNumber, `${r.profile.name} (${r.profile.rollNumber}) moved back to active outing`, 'info');
      showToast(`${r.profile.name} is back in the active list.`);
    } catch (e) {
      showToast(authError(e));
    }
  };

  const priority = sorted.filter((r) => r.sos || r.isBreach);

  const tabs: Array<[Filter, string, number]> = [
    ['ALL', 'All', counts.all], ['SAFE', 'Safe', counts.safe], ['BREACH', 'Out of range', counts.breach],
    ['SOS', 'SOS', counts.sos], ['LOST', 'No signal', counts.lost], ['REACHED', 'Reached hostel', reached.length],
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {toast && (
        <div className="anim-toast fixed bottom-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400" /> {toast}
        </div>
      )}

      <header className="bg-slate-900 text-white border-b-4 border-amber-600 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-bold">Outing safety command center</h1>
              {connected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-red-950 text-red-300 border border-red-700">
                  <WifiOff className="w-3 h-3" /> Offline
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-0.5">{cfg.centerName} · default radius <span className="text-amber-300 font-mono font-semibold">{cfg.safeRadiusKm} km</span></p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLog(true)} className="relative px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Event log
              {events.length > 0 && <span className="px-1.5 rounded-full text-[10px] font-bold bg-red-600">{events.length}</span>}
            </button>
            <button onClick={() => setShowSettings(true)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Settings
            </button>
            <button onClick={() => signOut(auth)} className="px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-900 text-red-100 border border-red-800 text-xs font-semibold flex items-center gap-1.5">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5">
        <p className="text-sm text-slate-600">
          Welcome to the <span className="font-bold text-slate-900">JNTU-GV Tracking App</span>. Students on outings appear below.
        </p>
        <ErrorBox msg={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-4">
          {[
            { k: 'ALL' as Filter, l: 'Active outing students', v: counts.all, c: 'text-slate-900', i: <Users className="w-4 h-4 text-slate-600" /> },
            { k: 'SAFE' as Filter, l: 'Inside zone', v: counts.safe, c: 'text-emerald-800', i: <ShieldCheck className="w-4 h-4 text-emerald-700" /> },
            { k: 'BREACH' as Filter, l: 'Out of range', v: counts.breach, c: 'text-red-700', i: <AlertTriangle className="w-4 h-4 text-red-700" /> },
            { k: 'SOS' as Filter, l: 'Active SOS', v: counts.sos, c: 'text-red-800', i: <AlertOctagon className="w-4 h-4 text-red-700" /> },
          ].map((c) => (
            <button key={c.k} onClick={() => setFilter(c.k)}
              className={`text-left p-4 rounded-xl border bg-white ${filter === c.k ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-500">{c.l}</span>{c.i}</div>
              <div className={`mt-2 text-2xl font-bold font-mono ${c.c}`}>{c.v}</div>
            </button>
          ))}
        </div>

        {priority.length > 0 && (
          <div className={`rounded-xl p-4 mb-5 border ${counts.sos > 0 ? 'bg-red-900 text-white border-red-950' : 'bg-red-50 text-red-950 border-red-300'}`}>
            <h2 className="text-sm font-bold">
              {counts.sos > 0 ? `Emergency SOS active (${counts.sos})` : `Perimeter breach (${counts.breach})`}
            </h2>
            <div className="mt-3 space-y-2">
              {priority.map((r) => (
                <div key={r.uid} className="bg-white text-slate-900 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={r.profile.name} photo={r.profile.photo} size="w-10 h-12" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{r.profile.name} <span className="font-mono text-xs text-red-800">{r.profile.rollNumber}</span></div>
                      <div className="text-xs text-slate-600">
                        {r.sos ? 'SOS · ' : ''}{r.distanceKm !== null ? `${r.distanceKm.toFixed(2)} km from campus` : 'distance unknown'} · {ago(r.updatedAt, now)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {r.latitude !== null && (
                      <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                        <Navigation className="w-3.5 h-3.5" /> Map
                      </a>
                    )}
                    <button onClick={() => call(r)} className="px-3.5 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" /> Call
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input aria-label="Search students" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by roll number, name or department" className="w-full pl-10 pr-9 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-slate-900" />
            {query && <button aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-3 top-2.5 text-slate-400"><X className="w-4 h-4" /></button>}
          </div>
          <div className="flex gap-1 overflow-x-auto bg-white p-1 rounded-lg border border-slate-300">
            {tabs.map(([k, l, n]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${filter === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {l} <span className="font-mono opacity-80">({n})</span>
              </button>
            ))}
          </div>
        </div>

        {filter === 'REACHED' ? (
          reachedShown.length > 0 ? (
            <div className="stagger grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reachedShown.map((r) => <ReachedRow key={r.uid} r={r} onUndo={undoReached} />)}
            </div>
          ) : (
            <div className="text-center py-14 bg-white rounded-xl border border-slate-200">
              <Home className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-800">{reached.length === 0 ? 'No students marked as reached yet' : 'No students match this search'}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {reached.length === 0 ? 'Use "Reached hostel" on a student card when they are back.' : 'Clear the search to see everyone.'}
              </p>
            </div>
          )
        ) : shown.length > 0 ? (
          <div className="stagger grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((r) => <StudentCard key={r.uid} r={r} cfg={cfg} now={now} onCall={call} onReached={markReached} onSetRadius={setRadius} />)}
          </div>
        ) : (
          <div className="text-center py-14 bg-white rounded-xl border border-slate-200">
            <Users className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">{results.length === 0 ? 'No active outing students' : 'No students match this filter'}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {results.length === 0 ? 'Students appear here when they sign in and open the tracker. Students marked as reached hostel are in the "Reached hostel" tab.' : 'Clear the search or choose another filter.'}
            </p>
          </div>
        )}
      </main>

      {showLog && (
        <div role="dialog" aria-modal="true" aria-label="Event log" className="anim-fade fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="anim-pop bg-white rounded-xl w-full max-w-lg shadow-xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold">Event log (this session)</h2>
              <div className="flex gap-3">
                {events.length > 0 && <button onClick={() => setEvents([])} className="text-xs text-slate-500 hover:text-red-700">Clear</button>}
                <button aria-label="Close" onClick={() => setShowLog(false)}><X className="w-5 h-5 text-slate-500" /></button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {events.length === 0 ? (
                <p className="text-center py-10 text-xs text-slate-500">No alerts yet.</p>
              ) : events.map((e) => (
                <div key={e.id} className={`p-3 rounded-lg border text-xs ${e.severity === 'critical' ? 'bg-red-50 border-red-200' : e.severity === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex justify-between font-mono text-slate-500"><span>{e.time}</span><span className="font-bold text-slate-800">{e.studentId}</span></div>
                  <p className="font-semibold text-slate-900 mt-1">{e.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSettings && <SettingsModal cfg={cfg} onClose={() => setShowSettings(false)} onSaved={showToast} />}
    </div>
  );
};

/* ============================================================================
 * 11. APP ROOT
 * ========================================================================== */

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'ADMIN' | 'STUDENT' | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<'LANDING' | 'ADMIN' | 'STUDENT'>('LANDING');
  const [, force] = useReducer((x: number) => x + 1, 0);
  // On the Android app, ask for every permission as soon as the app opens.
  const [permissionsChecked, setPermissionsChecked] = useState(!isNative);
  // Welcome screen shown on every app launch.
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setRole(null);
        setScreen('LANDING');
        setReady(true);
        return;
      }
      try {
        const flag = await get(ref(db, `admins/${u.uid}`));
        setRole(flag.val() === true ? 'ADMIN' : 'STUDENT');
      } catch {
        setRole('STUDENT');
      }
      setReady(true);
    });
  }, []);

  if (!splashDone) return <WelcomeSplash onDone={() => setSplashDone(true)} />;

  // Each screen fades and slides in when it appears.
  const page = (key: string, node: React.ReactNode) => <div key={key} className="page-enter">{node}</div>;

  if (!permissionsChecked) return page('gate', <PermissionGate onDone={() => setPermissionsChecked(true)} />);

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500 text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (user && role === 'ADMIN') return page('admin', <AdminPortal user={user} />);
  if (user && role === 'STUDENT') {
    return user.emailVerified
      ? page('student', <StudentPortal user={user} />)
      : page('verify', <VerifyEmail user={user} onChecked={force} />);
  }
  if (screen === 'ADMIN') return page('admin-login', <AdminLogin onBack={() => setScreen('LANDING')} />);
  if (screen === 'STUDENT') return page('student-auth', <StudentAuth onBack={() => setScreen('LANDING')} />);
  return page('landing', <Landing onAdmin={() => setScreen('ADMIN')} onStudent={() => setScreen('STUDENT')} />);
}