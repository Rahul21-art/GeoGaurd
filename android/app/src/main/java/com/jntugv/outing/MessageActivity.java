package com.jntugv.outing;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.text.format.DateUtils;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Full-screen message from the coordinator. Tapping "Got it" tells the coordinator it was seen. */
public class MessageActivity extends Activity {

    private LinearLayout content;
    private Ringtone ringtone;
    private Vibrator vibrator;
    private boolean alarmOn;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
    }

    @Override
    protected void onPause() {
        stopAlarm();
        super.onPause();
    }

    private void render() {
        JSONArray all = MessageStore.list(this);
        if (all.length() == 0) {
            cancelNotification();
            finish();
            return;
        }
        final List<String> ids = new ArrayList<>();
        content.removeAllViews();
        content.setBackgroundColor(0xFF1E3A8A);

        TextView head = text("MESSAGE FROM YOUR COORDINATOR", 20, Color.WHITE, true);
        head.setGravity(Gravity.CENTER);
        head.setPadding(dp(16), dp(40), dp(16), dp(14));
        content.addView(head);

        for (int i = 0; i < all.length(); i++) {
            JSONObject o = all.optJSONObject(i);
            if (o == null) continue;
            ids.add(o.optString("id"));
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(18), dp(16), dp(18), dp(16));
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(Color.WHITE);
            bg.setCornerRadius(dp(14));
            card.setBackground(bg);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMargins(dp(14), dp(6), dp(14), dp(6));
            card.setLayoutParams(lp);
            card.addView(text(o.optString("text"), 22, 0xFF0F172A, true));
            long created = o.optLong("createdAt", 0);
            String meta = o.optString("fromName", "Your coordinator");
            if (created > 0) meta += "  ·  " + DateUtils.getRelativeTimeSpanString(created, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS);
            TextView m = text(meta, 13, 0xFF475569, false);
            m.setPadding(0, dp(8), 0, 0);
            card.addView(m);
            content.addView(card);
        }

        Button got = new Button(this);
        got.setText("Got it");
        got.setAllCaps(false);
        got.setTextSize(18);
        got.setTypeface(Typeface.DEFAULT_BOLD);
        got.setTextColor(0xFF0F172A);
        GradientDrawable gb = new GradientDrawable();
        gb.setColor(Color.WHITE);
        gb.setCornerRadius(dp(12));
        got.setBackground(gb);
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        glp.setMargins(dp(14), dp(14), dp(14), dp(30));
        got.setLayoutParams(glp);
        got.setOnClickListener(v -> confirmSeen(ids));
        content.addView(got);

        startAlarm();
    }

    /** Tells Firebase the messages were seen (retried a few times), then closes. */
    private void confirmSeen(List<String> ids) {
        final Context app = getApplicationContext();
        SharedPreferences p = app.getSharedPreferences("outing_native", Context.MODE_PRIVATE);
        final String uid = p.getString("uid", null);
        stopAlarm();
        MessageStore.clear(app);
        cancelNotification();
        if (uid != null) {
            final List<String> copy = new ArrayList<>(ids);
            new Thread(() -> {
                for (String id : copy) {
                    for (int attempt = 0; attempt < 4; attempt++) {
                        if (SosSender.putJson(app, "inbox/" + uid + "/" + id + "/seenAt.json", "{\".sv\":\"timestamp\"}")) break;
                        try {
                            Thread.sleep(3000);
                        } catch (InterruptedException e) {
                            return;
                        }
                    }
                }
            }, "outing-seen").start();
        }
        finish();
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void cancelNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(InboxService.ID_MSG);
    }

    private void startAlarm() {
        if (alarmOn) return;
        alarmOn = true;
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            ringtone = RingtoneManager.getRingtone(this, uri);
            if (ringtone != null) {
                ringtone.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                if (Build.VERSION.SDK_INT >= 28) ringtone.setLooping(true);
                ringtone.play();
            }
        } catch (Exception ignored) {
            // sound is optional
        }
        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            long[] pattern = {0, 500, 300, 500, 300};
            if (vibrator != null) {
                if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                else vibrator.vibrate(pattern, 0);
            }
        } catch (Exception ignored) {
            // vibration is optional
        }
    }

    private void stopAlarm() {
        alarmOn = false;
        try {
            if (ringtone != null) ringtone.stop();
        } catch (Exception ignored) {
            // already stopped
        }
        ringtone = null;
        try {
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) {
            // already stopped
        }
    }
}
