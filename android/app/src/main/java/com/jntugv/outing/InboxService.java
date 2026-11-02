package com.jntugv.outing;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

/**
 * Runs on a student phone during an outing so a coordinator's "call back" message arrives even
 * when the app is closed or the phone is locked. Every 15 seconds it checks the student's inbox in
 * Firebase. A new unseen message is shown as a full-screen alert ({@link MessageActivity}).
 *
 * While the app is open on screen, the web layer shows the message instead (src/messages.tsx).
 */
public class InboxService extends Service {

    static volatile boolean running;

    static final int ID_MSG = 3102;
    private static final int ID_WATCH = 3101;
    private static final String CH_WATCH = "outing_inbox_watch";
    private static final String CH_MSG = "outing_message_v1";
    private static final long POLL_MS = 15_000L;
    private static final long TTL_MS = 24L * 60 * 60 * 1000;

    private volatile boolean stopping;
    private Thread worker;
    private final Set<String> alerted = new HashSet<>();

    static void start(Context c) {
        Intent i = new Intent(c, InboxService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, InboxService.class));
        MessageStore.clear(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID_MSG);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        goForeground();
        running = true;
        if (worker == null || !worker.isAlive()) {
            stopping = false;
            worker = new Thread(this::loop, "outing-inbox");
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
                .setContentTitle("Outing messages are on")
                .setContentText("You will get messages from your coordinator.")
                .setContentIntent(pi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID_WATCH, n, 0x40000000); // specialUse
            else startForeground(ID_WATCH, n);
        } catch (Exception ignored) {
            // keeps running while the process lives
        }
    }

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel watch = new NotificationChannel(CH_WATCH, "Coordinator messages", NotificationManager.IMPORTANCE_LOW);
        nm.createNotificationChannel(watch);
        NotificationChannel msg = new NotificationChannel(CH_MSG, "Messages from your coordinator", NotificationManager.IMPORTANCE_HIGH);
        msg.enableVibration(true);
        msg.setVibrationPattern(new long[]{0, 600, 250, 600});
        msg.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        msg.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), attrs);
        nm.createNotificationChannel(msg);
    }

    private void loop() {
        while (!stopping) {
            PowerManager.WakeLock wl = null;
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "outing:inbox");
                    wl.acquire(30_000L);
                }
                poll();
            } catch (Throwable ignored) {
                // never let one bad poll stop the service
            } finally {
                try {
                    if (wl != null && wl.isHeld()) wl.release();
                } catch (Throwable ignored) {
                    // already released
                }
            }
            try {
                Thread.sleep(POLL_MS);
            } catch (InterruptedException e) {
                break;
            }
        }
    }

    private void poll() throws Exception {
        SharedPreferences p = getSharedPreferences("outing_native", Context.MODE_PRIVATE);
        String uid = p.getString("uid", null);
        if (uid == null) return;
        SosSender.Resp r = SosSender.getJson(this, "inbox/" + uid + ".json");
        if (r == null || r.code < 200 || r.code >= 300) return;
        String body = r.body == null ? "" : r.body.trim();
        JSONObject all = body.startsWith("{") ? new JSONObject(body) : new JSONObject();

        long now = System.currentTimeMillis();
        Set<String> unseen = new HashSet<>();
        boolean added = false;
        Iterator<String> it = all.keys();
        while (it.hasNext()) {
            String id = it.next();
            JSONObject m = all.optJSONObject(id);
            if (m == null) continue;
            if (m.has("seenAt") && !m.isNull("seenAt")) continue;
            long created = m.optLong("createdAt", 0);
            if (created <= 0 || Math.abs(now - created) > TTL_MS) continue;
            unseen.add(id);
            if (alerted.contains(id) || AdminWatchService.appForeground) continue;
            alerted.add(id);
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("text", m.optString("text", ""));
            o.put("fromName", m.optString("fromName", "Your coordinator"));
            o.put("createdAt", created);
            MessageStore.put(this, o);
            added = true;
        }
        // Messages already seen (for example in the app) leave the waiting list.
        JSONArray cur = MessageStore.list(this);
        for (int i = 0; i < cur.length(); i++) {
            JSONObject o = cur.optJSONObject(i);
            if (o != null && !unseen.contains(o.optString("id"))) MessageStore.remove(this, o.optString("id"));
        }
        notifyMessages(added);
    }

    private void notifyMessages(boolean loud) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        JSONArray list = MessageStore.list(this);
        if (list.length() == 0) {
            nm.cancel(ID_MSG);
            return;
        }
        if (!loud) return;
        ArrayList<String> lines = new ArrayList<>();
        JSONObject last = null;
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null) continue;
            last = o;
            lines.add(o.optString("text"));
        }
        if (last == null) return;
        Intent i = new Intent(this, MessageActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 12, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH_MSG)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("Message from " + last.optString("fromName", "your coordinator"))
                .setContentText(last.optString("text"))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(String.join("\n", lines)))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setColor(0xFF1D4ED8)
                .setContentIntent(pi)
                .setFullScreenIntent(pi, true)
                .setAutoCancel(false);
        nm.notify(ID_MSG, b.build());
    }
}
