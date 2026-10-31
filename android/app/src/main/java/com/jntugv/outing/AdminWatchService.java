package com.jntugv.outing;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Runs on a faculty phone so SOS and "not back at the hostel" alerts arrive even when the app
 * is closed or the phone is locked.
 *
 * Every 10 seconds it asks Firebase (REST, signed in as the faculty member) whether any student
 * has an active SOS. Once a minute after the return deadline it checks who is still more than the
 * allowed distance from the hostel. New alerts are saved in {@link AlertStore} and shown as a
 * full-screen alert ({@link AlertActivity}) with name, roll number, phone and distance.
 *
 * While the app itself is open on screen, the web layer shows the alert instead (see
 * src/alerts.tsx), so the faculty member does not get two alerts for the same thing.
 */
public class AdminWatchService extends Service {

    static volatile boolean running;
    /** True while the app is on screen. Set by OutingNativePlugin. */
    static volatile boolean appForeground;

    static final String ACTION_STOP = "com.jntugv.outing.ADMIN_WATCH_STOP";
    static final String ACTION_TEST = "com.jntugv.outing.ADMIN_WATCH_TEST";

    static final int ID_ALERT = 3002;
    private static final int ID_WATCH = 3001;
    private static final String CH_WATCH = "outing_admin_watch";
    private static final String CH_ALERT = "outing_admin_alert_v1";

    private static final long POLL_MS = 10_000L;
    private static final int LATE_EVERY_N_POLLS = 6;
    private static final double DEFAULT_LAT = 18.1516;
    private static final double DEFAULT_LON = 83.3756;

    private volatile boolean stopping;
    private Thread worker;

    private final Set<String> sosAlerted = new HashSet<>();
    private final Set<String> lateDone = new HashSet<>();
    private String lateDay = "";

    private JSONObject cfgCache;
    private long cfgAt;
    private JSONObject usersCache;
    private long usersAt;

    // ------------------------------------------------------------- start / stop

    static void start(Context c) {
        Intent i = new Intent(c, AdminWatchService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, AdminWatchService.class));
        AlertStore.clear(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID_ALERT);
    }

    /** Shows a fake SOS alert after a short delay, so faculty can lock the phone and see how it looks. */
    static void sendTest(Context c) {
        Intent i = new Intent(c, AdminWatchService.class).setAction(ACTION_TEST);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        goForeground();
        running = true;
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_TEST.equals(action)) {
            new Thread(() -> {
                try {
                    Thread.sleep(10_000);
                } catch (InterruptedException ignored) {
                    return;
                }
                try {
                    JSONObject a = new JSONObject();
                    a.put("key", "test:" + System.currentTimeMillis());
                    a.put("type", "SOS");
                    a.put("uid", "test");
                    a.put("name", "Test Student");
                    a.put("roll", "00A00A0000");
                    a.put("phone", "9999999999");
                    a.put("lat", 18.1601);
                    a.put("lon", 83.3802);
                    a.put("distM", 1450);
                    a.put("updatedAt", System.currentTimeMillis());
                    a.put("battery", 62);
                    a.put("createdAt", System.currentTimeMillis());
                    AlertStore.put(this, a);
                    postAlertNotification(true);
                } catch (Exception ignored) {
                    // test only
                }
            }, "outing-admin-test").start();
        }
        if (worker == null || !worker.isAlive()) {
            stopping = false;
            worker = new Thread(this::loop, "outing-admin-watch");
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopping = true;
        running = false;
        if (worker != null) worker.interrupt();
        super.onDestroy();
    }

    private void goForeground() {
        ensureChannels();
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CH_WATCH)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Outing alerts are on")
                .setContentText("You will be alerted about SOS and students not back at the hostel.")
                .setContentIntent(pi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID_WATCH, n, 0x40000000); // specialUse
            else startForeground(ID_WATCH, n);
        } catch (Exception e) {
            // Could not become a foreground service. The loop still runs while the process lives.
        }
    }

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel watch = new NotificationChannel(CH_WATCH, "Alert monitoring", NotificationManager.IMPORTANCE_LOW);
        watch.setDescription("Shows that the app is watching for SOS and late-return alerts.");
        nm.createNotificationChannel(watch);

        NotificationChannel alert = new NotificationChannel(CH_ALERT, "SOS and late-return alerts", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("Loud full-screen alerts for SOS and students not back at the hostel.");
        alert.enableVibration(true);
        alert.setVibrationPattern(new long[]{0, 700, 300, 700, 300, 700});
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        alert.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), attrs);
        nm.createNotificationChannel(alert);
    }

    // --------------------------------------------------------------- main loop

    private void loop() {
        int n = 0;
        while (!stopping) {
            PowerManager.WakeLock wl = null;
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "outing:adminwatch");
                    wl.acquire(45_000L);
                }
                pollSos();
                if (n % LATE_EVERY_N_POLLS == 0) pollLate();
            } catch (Throwable ignored) {
                // never let one bad poll stop the watcher
            } finally {
                try {
                    if (wl != null && wl.isHeld()) wl.release();
                } catch (Throwable ignored) {
                    // already released
                }
            }
            n++;
            try {
                Thread.sleep(POLL_MS);
            } catch (InterruptedException e) {
                break;
            }
        }
    }

    // --------------------------------------------------------------------- SOS

    private void pollSos() throws Exception {
        SosSender.Resp r = SosSender.getJson(this, "telemetry.json?orderBy=%22sos%22&equalTo=true");
        // Without the ".indexOn": ["sos"] rule Firebase answers 400. Fall back to reading everything.
        if (r != null && r.code == 400) r = SosSender.getJson(this, "telemetry.json");
        if (r == null || r.code < 200 || r.code >= 300) return;

        JSONObject all = parseObject(r.body);
        Set<String> active = new HashSet<>();
        if (all != null) {
            Iterator<String> it = all.keys();
            while (it.hasNext()) {
                String uid = it.next();
                JSONObject t = all.optJSONObject(uid);
                if (t == null || !t.optBoolean("sos", false)) continue;
                if (t.has("reachedAt") && !t.isNull("reachedAt")) continue;
                active.add(uid);
                if (sosAlerted.add(uid)) raise("SOS", "sos:" + uid, uid, t);
            }
        }
        boolean changed = false;
        for (String uid : new ArrayList<>(sosAlerted)) {
            if (!active.contains(uid)) {
                sosAlerted.remove(uid);
                AlertStore.remove(this, "sos:" + uid);
                changed = true;
            }
        }
        if (changed) postAlertNotification(false);
    }

    // ------------------------------------------------------------ late return

    private void pollLate() throws Exception {
        JSONObject cfg = config();
        if (!cfg.optBoolean("returnAlertsEnabled", true)) return;

        Calendar cal = Calendar.getInstance();
        String day = String.format(Locale.US, "%04d%02d%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
        if (!day.equals(lateDay)) {
            // New day: forget yesterday's late alerts.
            lateDay = day;
            lateDone.clear();
            JSONArray old = AlertStore.list(this);
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.optJSONObject(i);
                if (o != null && "LATE".equals(o.optString("type"))) AlertStore.remove(this, o.optString("key"));
            }
        }
        int deadline = parseMinutes(cfg.optString("returnDeadline", "18:00"));
        int now = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
        if (now < deadline) return;

        double limitKm = cfg.optDouble("returnDistanceKm", 0.2);
        SosSender.Resp r = SosSender.getJson(this, "telemetry.json");
        if (r == null || r.code < 200 || r.code >= 300) return;
        JSONObject all = parseObject(r.body);
        if (all == null) return;

        Set<String> stillLate = new HashSet<>();
        boolean added = false;
        Iterator<String> it = all.keys();
        while (it.hasNext()) {
            String uid = it.next();
            JSONObject t = all.optJSONObject(uid);
            if (t == null) continue;
            if (t.has("reachedAt") && !t.isNull("reachedAt")) continue;
            if (t.optBoolean("sos", false)) continue; // the SOS alert covers this student
            double d = distanceToHostelKm(cfg, t);
            if (d >= 0 && d <= limitKm) continue;      // at the hostel
            stillLate.add(uid);
            if (lateDone.contains(uid)) continue;
            lateDone.add(uid);
            if (!appForeground) {
                raise("LATE", "late:" + uid + ":" + day, uid, t);
                added = true;
            }
        }
        // Drop alerts for students who have since come back or been marked as reached.
        boolean removed = false;
        JSONArray cur = AlertStore.list(this);
        for (int i = 0; i < cur.length(); i++) {
            JSONObject o = cur.optJSONObject(i);
            if (o != null && "LATE".equals(o.optString("type")) && !stillLate.contains(o.optString("uid"))) {
                AlertStore.remove(this, o.optString("key"));
                lateDone.remove(o.optString("uid"));
                removed = true;
            }
        }
        if (added) postAlertNotification(true);
        else if (removed) postAlertNotification(false);
    }

    // ---------------------------------------------------------------- helpers

    /** Saves an alert and shows it (unless the app is open, where the web layer shows it). */
    private void raise(String type, String key, String uid, JSONObject tele) {
        try {
            if (appForeground && "SOS".equals(type)) return;
            JSONObject cfg = config();
            JSONObject u = user(uid);
            JSONObject a = new JSONObject();
            a.put("key", key);
            a.put("type", type);
            a.put("uid", uid);
            a.put("name", u != null ? u.optString("name", "Student") : "Student");
            a.put("roll", u != null ? u.optString("rollNumber", "") : "");
            a.put("phone", u != null ? u.optString("phone", "") : "");
            if (tele.has("latitude") && !tele.isNull("latitude") && tele.has("longitude") && !tele.isNull("longitude")) {
                a.put("lat", tele.optDouble("latitude"));
                a.put("lon", tele.optDouble("longitude"));
            }
            double km = distanceToHostelKm(cfg, tele);
            a.put("distM", km < 0 ? -1 : Math.round(km * 1000));
            a.put("updatedAt", tele.optLong("updatedAt", 0));
            a.put("battery", tele.has("battery") && !tele.isNull("battery") ? tele.optInt("battery", -1) : -1);
            a.put("createdAt", System.currentTimeMillis());
            AlertStore.put(this, a);
            if ("SOS".equals(type)) postAlertNotification(true);
        } catch (Exception ignored) {
            // skip this alert, it is retried on the next poll for late alerts
        }
    }

    private JSONObject config() {
        long now = System.currentTimeMillis();
        if (cfgCache != null && now - cfgAt < 60_000L) return cfgCache;
        JSONObject c = null;
        try {
            SosSender.Resp r = SosSender.getJson(this, "config/safety.json");
            if (r != null && r.code >= 200 && r.code < 300) c = parseObject(r.body);
        } catch (Exception ignored) {
            // use defaults
        }
        if (c == null) c = cfgCache != null ? cfgCache : new JSONObject();
        cfgCache = c;
        cfgAt = now;
        return c;
    }

    private JSONObject user(String uid) {
        try {
            long now = System.currentTimeMillis();
            if (usersCache == null || now - usersAt > 300_000L || !usersCache.has(uid)) {
                SosSender.Resp r = SosSender.getJson(this, "users.json");
                if (r != null && r.code >= 200 && r.code < 300) {
                    JSONObject u = parseObject(r.body);
                    if (u != null) {
                        usersCache = u;
                        usersAt = now;
                    }
                }
            }
            return usersCache == null ? null : usersCache.optJSONObject(uid);
        } catch (Exception e) {
            return null;
        }
    }

    /** Distance from the hostel in km, or -1 when the student has no location. */
    private static double distanceToHostelKm(JSONObject cfg, JSONObject t) {
        if (!t.has("latitude") || t.isNull("latitude") || !t.has("longitude") || t.isNull("longitude")) return -1;
        double lat = t.optDouble("latitude", Double.NaN);
        double lon = t.optDouble("longitude", Double.NaN);
        if (Double.isNaN(lat) || Double.isNaN(lon)) return -1;
        double hLat = cfg.optDouble("hostelLatitude", cfg.optDouble("centerLatitude", DEFAULT_LAT));
        double hLon = cfg.optDouble("hostelLongitude", cfg.optDouble("centerLongitude", DEFAULT_LON));
        return haversineKm(lat, lon, hLat, hLon);
    }

    static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double r = 6371.0088;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    static int parseMinutes(String hhmm) {
        try {
            String[] p = hhmm.trim().split(":");
            int h = Integer.parseInt(p[0]);
            int m = p.length > 1 ? Integer.parseInt(p[1]) : 0;
            return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
        } catch (Exception e) {
            return 18 * 60;
        }
    }

    private static JSONObject parseObject(String body) {
        try {
            if (body == null) return null;
            String b = body.trim();
            if (b.isEmpty() || b.equals("null") || !b.startsWith("{")) return null;
            return new JSONObject(b);
        } catch (Exception e) {
            return null;
        }
    }

    static String distanceText(long distM) {
        if (distM < 0) return "Location unknown";
        if (distM < 1000) return distM + " m from hostel";
        return String.format(Locale.US, "%.2f km from hostel", distM / 1000.0);
    }

    // ------------------------------------------------------------ notification

    /** Shows (or updates) the alert notification. With a full-screen intent it opens the alert screen over the lock screen. */
    private void postAlertNotification(boolean loud) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        JSONArray list = AlertStore.list(this);
        if (list.length() == 0) {
            nm.cancel(ID_ALERT);
            return;
        }
        int sos = 0;
        int late = 0;
        JSONObject first = null;
        StringBuilder lines = new StringBuilder();
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null) continue;
            boolean isSos = "SOS".equals(o.optString("type"));
            if (isSos) sos++; else late++;
            if (first == null || (isSos && !"SOS".equals(first.optString("type")))) first = o;
            if (i < 6) {
                if (lines.length() > 0) lines.append('\n');
                lines.append(isSos ? "SOS: " : "Not back: ")
                        .append(o.optString("name")).append(" (").append(o.optString("roll")).append(")")
                        .append("  ").append(o.optString("phone"))
                        .append("  ").append(distanceText(o.optLong("distM", -1)));
            }
        }
        if (first == null) return;
        String title;
        if (sos > 0) {
            title = "SOS: " + first.optString("name") + " (" + first.optString("roll") + ")" + (sos > 1 ? " +" + (sos - 1) + " more" : "");
        } else {
            title = late + (late == 1 ? " student is" : " students are") + " not back at the hostel";
        }
        String text = first.optString("phone") + " · " + distanceText(first.optLong("distM", -1));

        Intent i = new Intent(this, AlertActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 11, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH_ALERT)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(lines.toString()))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setColor(sos > 0 ? 0xFFB91C1C : 0xFFB45309)
                .setContentIntent(pi)
                .setAutoCancel(false)
                .setOnlyAlertOnce(!loud);
        if (loud) b.setFullScreenIntent(pi, true);
        nm.notify(ID_ALERT, b.build());
    }
}
