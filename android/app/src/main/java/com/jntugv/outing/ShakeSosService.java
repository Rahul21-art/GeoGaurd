package com.jntugv.outing;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground service that listens to the accelerometer so a vigorous shake can trigger SOS
 * even when the screen is off and the phone is locked.
 *
 * Flow: shake detected -> vibrate + "SOS in 5..1" notification (tap CANCEL to stop a false alarm)
 *       -> SOS is written to Firebase and the app is told about it.
 */
public class ShakeSosService extends Service implements SensorEventListener, ShakeDetector.Listener {

    public static final String ACTION_START = "com.jntugv.outing.SHAKE_START";
    public static final String ACTION_STOP = "com.jntugv.outing.SHAKE_STOP";
    public static final String ACTION_CONFIG = "com.jntugv.outing.SHAKE_CONFIG";
    public static final String ACTION_CANCEL = "com.jntugv.outing.SHAKE_CANCEL";
    public static final String ACTION_SAFE = "com.jntugv.outing.SHAKE_SAFE";
    public static final String ACTION_CLEARED = "com.jntugv.outing.SHAKE_CLEARED";

    public static final String EXTRA_SENSITIVITY = "sensitivity";
    public static final String EXTRA_TEST = "test";

    private static final String PREFS = "outing_native";
    private static final String CH_STATUS = "shake_sos_status";
    private static final String CH_ALERT = "shake_sos_alert";
    private static final int ID_STATUS = 4101;
    private static final int ID_ALERT = 4102;
    private static final int COUNTDOWN_SECONDS = 5;
    private static final long COOLDOWN_MS = 8000;
    private static final long WAKELOCK_MS = 5L * 60 * 60 * 1000;

    /** True while the service is alive. Read by the plugin to report status. */
    public static volatile boolean running = false;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private ShakeDetector detector;
    private SensorManager sensors;
    private PowerManager.WakeLock wakeLock;

    private boolean testMode = false;
    private boolean counting = false;
    private boolean sosActive = false;
    private int secondsLeft = 0;
    private long lastTriggerMs = 0;

    // ---------- public helpers used by the plugin ----------

    public static void start(Context c, int sensitivity, boolean test) {
        Intent i = new Intent(c, ShakeSosService.class)
                .setAction(ACTION_START)
                .putExtra(EXTRA_SENSITIVITY, sensitivity)
                .putExtra(EXTRA_TEST, test);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    /** Sends a command to the service only if it is already running. */
    public static void command(Context c, String action, Integer sensitivity, Boolean test) {
        if (!running) return;
        Intent i = new Intent(c, ShakeSosService.class).setAction(action);
        if (sensitivity != null) i.putExtra(EXTRA_SENSITIVITY, sensitivity.intValue());
        if (test != null) i.putExtra(EXTRA_TEST, test.booleanValue());
        c.startService(i);
    }

    public static boolean isSosActive(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("sosActive", false);
    }

    // ---------- lifecycle ----------

    @Override
    public void onCreate() {
        super.onCreate();
        detector = new ShakeDetector(this);
        sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        createChannels();
        sosActive = isSosActive(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        if (ACTION_STOP.equals(action)) {
            p.edit().putBoolean("shakeEnabled", false).apply();
            shutdown();
            return START_NOT_STICKY;
        }

        if (ACTION_CANCEL.equals(action)) {
            cancelCountdown(true);
            return START_STICKY;
        }
        if (ACTION_SAFE.equals(action)) {
            markSafe(true);
            return START_STICKY;
        }
        if (ACTION_CLEARED.equals(action)) {
            markSafe(false);
            return START_STICKY;
        }

        // START, CONFIG, or a restart by the system (null intent).
        if (intent == null && !p.getBoolean("shakeEnabled", false)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && intent.hasExtra(EXTRA_SENSITIVITY)) {
            int s = intent.getIntExtra(EXTRA_SENSITIVITY, ShakeDetector.MEDIUM);
            p.edit().putInt("sensitivity", s).apply();
            detector.setSensitivity(s);
        } else {
            detector.setSensitivity(p.getInt("sensitivity", ShakeDetector.MEDIUM));
        }
        if (intent != null && intent.hasExtra(EXTRA_TEST)) testMode = intent.getBooleanExtra(EXTRA_TEST, false);

        if (!running) {
            p.edit().putBoolean("shakeEnabled", true).apply();
            if (!goForeground()) {
                stopSelf();
                return START_NOT_STICKY;
            }
            registerSensor();
            acquireWakeLock();
            running = true;
        } else if (ACTION_START.equals(action)) {
            goForeground();   // satisfies startForegroundService() when already running
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        main.removeCallbacksAndMessages(null);
        try { if (sensors != null) sensors.unregisterListener(this); } catch (Exception ignored) { }
        releaseWakeLock();
        io.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void shutdown() {
        main.removeCallbacksAndMessages(null);
        counting = false;
        try { if (sensors != null) sensors.unregisterListener(this); } catch (Exception ignored) { }
        releaseWakeLock();
        running = false;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID_ALERT);
        if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    private boolean goForeground() {
        try {
            Notification n = statusNotification();
            if (Build.VERSION.SDK_INT >= 34) {
                // 0x40000000 = FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                startForeground(ID_STATUS, n, 0x40000000);
            } else {
                startForeground(ID_STATUS, n);
            }
            return true;
        } catch (Exception e) {
            OutingNativePlugin.emitError("Could not start Shake SOS: " + e.getMessage());
            return false;
        }
    }

    private void registerSensor() {
        Sensor accel = sensors != null ? sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) : null;
        if (accel == null) {
            OutingNativePlugin.emitError("This phone has no accelerometer, so shake SOS is not available.");
            return;
        }
        sensors.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME);
    }

    /** The CPU must stay awake or Android stops delivering accelerometer data when the screen is off. */
    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            if (wakeLock == null) wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "outing:shake");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(WAKELOCK_MS);
            main.postDelayed(renewWakeLock, WAKELOCK_MS - 60_000);
        } catch (Exception ignored) {
            // shake still works while the screen is on
        }
    }

    private final Runnable renewWakeLock = new Runnable() {
        @Override
        public void run() {
            if (running) acquireWakeLock();
        }
    };

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) { }
    }

    // ---------- sensor + detector ----------

    @Override
    public void onSensorChanged(SensorEvent e) {
        if (e.values == null || e.values.length < 3) return;
        detector.onSample(e.values[0], e.values[1], e.values[2], e.timestamp / 1_000_000L);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    @Override
    public void onProgress(int count, int needed) {
        if (testMode) OutingNativePlugin.emitProgress(count, needed);
    }

    @Override
    public void onShake() {
        long now = System.currentTimeMillis();
        if (counting || now - lastTriggerMs < COOLDOWN_MS) return;
        lastTriggerMs = now;

        if (testMode) {
            vibrate(new long[]{0, 120, 80, 120});
            OutingNativePlugin.emitEvent("shakeTest");
            return;
        }
        if (isSosActive(this)) return;   // SOS already running
        startCountdown();
    }

    // ---------- countdown and SOS ----------

    private void startCountdown() {
        counting = true;
        secondsLeft = COUNTDOWN_SECONDS;
        main.post(tick);
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!counting) return;
            if (secondsLeft <= 0) {
                counting = false;
                fireSos();
                return;
            }
            notifyAlert("Shake detected: sending SOS in " + secondsLeft + "s",
                    "Tap CANCEL if this was a mistake.", true, false);
            OutingNativePlugin.emitCountdown(secondsLeft);
            vibrate(new long[]{0, 250});
            secondsLeft--;
            main.postDelayed(this, 1000);
        }
    };

    private void cancelCountdown(boolean tellApp) {
        if (!counting) return;
        counting = false;
        main.removeCallbacks(tick);
        cancelAlert();
        vibrate(new long[]{0, 80});
        if (tellApp) OutingNativePlugin.emitEvent("shakeCancelled");
    }

    private void fireSos() {
        sosActive = true;
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("sosActive", true).apply();
        vibrate(new long[]{0, 600, 200, 600, 200, 600});
        notifyAlert("SOS sent", "Your coordinator has been alerted. Tap \"I'm safe\" to cancel.", false, true);
        OutingNativePlugin.emitSos(true);   // the app updates its own state if it is alive

        io.execute(new Runnable() {
            @Override
            public void run() {
                final boolean ok = SosSender.sendSos(getApplicationContext(), true);
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (!isSosActive(ShakeSosService.this)) return;
                        if (ok) {
                            notifyAlert("SOS sent", "Your coordinator can see your location. Tap \"I'm safe\" to cancel.", false, true);
                        } else {
                            notifyAlert("SOS could not be sent",
                                    "No internet. Move to a place with signal. Open the app to retry.", false, true);
                        }
                    }
                });
            }
        });
    }

    private void markSafe(final boolean sendToServer) {
        counting = false;
        main.removeCallbacks(tick);
        sosActive = false;
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("sosActive", false).apply();
        cancelAlert();
        if (sendToServer) {
            OutingNativePlugin.emitSos(false);
            io.execute(new Runnable() {
                @Override
                public void run() {
                    SosSender.sendSos(getApplicationContext(), false);
                }
            });
        }
    }

    // ---------- notifications ----------

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel status = new NotificationChannel(CH_STATUS, "Shake SOS protection",
                NotificationManager.IMPORTANCE_LOW);
        status.setDescription("Shows that shake-to-send-SOS is active while you are on an outing");
        status.setShowBadge(false);
        nm.createNotificationChannel(status);

        NotificationChannel alert = new NotificationChannel(CH_ALERT, "Shake SOS alerts",
                NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("Countdown and confirmation when a shake triggers SOS");
        alert.enableVibration(false);   // vibration is done in code so it matches the countdown
        alert.setSound(null, null);
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alert);
    }

    private Notification.Builder builder(String channel) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, channel) : new Notification.Builder(this);
    }

    private PendingIntent openApp() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) launch = new Intent();
        return PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private PendingIntent serviceAction(String action, int req) {
        Intent i = new Intent(this, ShakeSosService.class).setAction(action);
        return PendingIntent.getService(this, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification statusNotification() {
        Notification.Builder b = builder(CH_STATUS)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("Shake SOS is on")
                .setContentText("Shake your phone hard to send an SOS, even when it is locked.")
                .setContentIntent(openApp())
                .setOngoing(true)
                .setShowWhen(false);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        return b.build();
    }

    private void notifyAlert(String title, String text, boolean withCancel, boolean withSafe) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b = builder(CH_ALERT)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(openApp())
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MAX);
        if (withCancel) {
            b.addAction(new Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
                    "CANCEL", serviceAction(ACTION_CANCEL, 1)).build());
        }
        if (withSafe) {
            b.addAction(new Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
                    "I'M SAFE, CANCEL SOS", serviceAction(ACTION_SAFE, 2)).build());
        }
        try {
            nm.notify(ID_ALERT, b.build());
        } catch (Exception ignored) {
            // notification permission may be off; vibration and SOS still work
        }
    }

    private void cancelAlert() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID_ALERT);
    }

    private void vibrate(long[] pattern) {
        try {
            Vibrator v;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                v = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, -1));
            else v.vibrate(pattern, -1);
        } catch (Exception ignored) { }
    }
}
