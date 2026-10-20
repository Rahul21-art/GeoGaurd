import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * JavaScript side of the custom Android plugin in
 * android/app/src/main/java/com/jntugv/outing/OutingNativePlugin.java
 */

export const isNativeApp = Capacitor.isNativePlatform();

export interface NativeStatus {
  sdk: number;
  /** Fine or coarse location allowed. */
  location: boolean;
  /** Precise (fine) location allowed. */
  precise: boolean;
  /** "Allow all the time" location (always true below Android 10). */
  background: boolean;
  notifications: boolean;
  /** App is exempt from battery optimisation. */
  battery: boolean;
  /** Device location (GPS) switch is on. */
  gps: boolean;
  accelerometer: boolean;
  shakeRunning: boolean;
  sosActive: boolean;
}

export interface AuthPayload {
  uid: string;
  apiKey: string;
  databaseUrl: string;
  idToken: string;
  refreshToken: string;
  /** Epoch milliseconds when idToken expires. */
  expiresAt: number;
}

export interface OutingNativePlugin {
  getStatus(): Promise<NativeStatus>;
  requestLocation(): Promise<NativeStatus>;
  requestBackgroundLocation(): Promise<NativeStatus>;
  requestNotifications(): Promise<NativeStatus>;
  requestBatteryExemption(): Promise<NativeStatus>;
  requestGps(): Promise<NativeStatus>;
  openAppSettings(): Promise<void>;

  startShake(opts: { sensitivity: number; test?: boolean }): Promise<NativeStatus>;
  stopShake(): Promise<void>;
  configureShake(opts: { sensitivity?: number; test?: boolean }): Promise<void>;
  cancelCountdown(): Promise<void>;
  setSosActive(opts: { active: boolean }): Promise<void>;
  setAuth(opts: AuthPayload): Promise<void>;
  clearAuth(): Promise<void>;

  addListener(event: 'shakeCountdown', cb: (d: { secondsLeft: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'shakeProgress', cb: (d: { count: number; needed: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'shakeCancelled' | 'shakeTest' | 'sosCleared', cb: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'sosTriggered', cb: (d: { active: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'shakeError', cb: (d: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const OutingNative = registerPlugin<OutingNativePlugin>('OutingNative');

/** Sensitivity levels understood by the native shake detector. */
export const SENSITIVITY = [
  { value: 0, label: 'Low', hint: 'Hard shake, 6 times' },
  { value: 1, label: 'Medium', hint: 'Firm shake, 5 times' },
  { value: 2, label: 'High', hint: 'Quick shake, 4 times' },
] as const;
