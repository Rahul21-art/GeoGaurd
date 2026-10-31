package com.jntugv.outing;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
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
import android.view.View;
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
import java.util.Locale;

/**
 * Full-screen alert for faculty. Opens over the lock screen when an SOS arrives or when students
 * are not back at the hostel after the deadline. Shows each student's name, roll number, phone
 * number, distance from the hostel and location, with Call, Map and Dismiss buttons.
 */
public class AlertActivity extends Activity {

    private static final int RED = 0xFFB91C1C;
    private static final int AMBER = 0xFFB45309;

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

    // ---------------------------------------------------------------- screen

    private void render() {
        JSONArray all = AlertStore.list(this);
        if (all.length() == 0) {
            cancelNotification();
            finish();
            return;
        }
        List<JSONObject> sos = new ArrayList<>();
        List<JSONObject> late = new ArrayList<>();
        for (int i = 0; i < all.length(); i++) {
            JSONObject o = all.optJSONObject(i);
            if (o == null) continue;
            if ("SOS".equals(o.optString("type"))) sos.add(o); else late.add(o);
        }
        boolean hasSos = !sos.isEmpty();
        content.removeAllViews();
        content.setBackgroundColor(hasSos ? 0xFF7F1D1D : 0xFF78350F);

        TextView head = text(hasSos ? "SOS ALERT" : "STUDENTS NOT BACK", 26, Color.WHITE, true);
        head.setGravity(Gravity.CENTER);
        head.setPadding(dp(16), dp(36), dp(16), dp(4));
        content.addView(head);

        TextView sub = text(hasSos
                ? "A student needs help now. Call them first."
                : "These students are still away from the hostel after the return time.", 14, 0xFFFFE4E6, false);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(dp(20), 0, dp(20), dp(14));
        content.addView(sub);

        for (JSONObject o : sos) content.addView(card(o, true));
        for (JSONObject o : late) content.addView(card(o, false));

        LinearLayout footer = new LinearLayout(this);
        footer.setOrientation(LinearLayout.HORIZONTAL);
        footer.setPadding(dp(12), dp(4), dp(12), dp(24));
        Button open = button("Open app", 0xFF1E293B, Color.WHITE);
        open.setOnClickListener(v -> {
            Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
            finish();
        });
        Button dismissAll = button("Dismiss all", Color.WHITE, 0xFF111827);
        dismissAll.setOnClickListener(v -> {
            AlertStore.clear(this);
            cancelNotification();
            finish();
        });
        footer.addView(open, weight());
        footer.addView(dismissAll, weight());
        content.addView(footer);

        if (hasSos) startAlarm(); else stopAlarm();
    }

    private View card(JSONObject o, boolean isSos) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(14));
        card.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(12), dp(6), dp(12), dp(6));
        card.setLayoutParams(lp);

        TextView badge = text(isSos ? "SOS" : "NOT BACK AT HOSTEL", 11, Color.WHITE, true);
        badge.setPadding(dp(8), dp(2), dp(8), dp(2));
        GradientDrawable bb = new GradientDrawable();
        bb.setColor(isSos ? RED : AMBER);
        bb.setCornerRadius(dp(6));
        badge.setBackground(bb);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        card.addView(badge, blp);

        TextView name = text(o.optString("name", "Student"), 22, 0xFF0F172A, true);
        name.setPadding(0, dp(8), 0, 0);
        card.addView(name);

        String roll = o.optString("roll", "");
        if (!roll.isEmpty()) {
            TextView r = text("Roll number: " + roll, 15, 0xFF334155, false);
            r.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            card.addView(r);
        }
        String phone = o.optString("phone", "");
        TextView ph = text(phone.isEmpty() ? "Phone: not available" : "Phone: " + phone, 17, 0xFF0F172A, true);
        ph.setPadding(0, dp(4), 0, 0);
        card.addView(ph);

        long distM = o.optLong("distM", -1);
        TextView dist = text(AdminWatchService.distanceText(distM), 18, isSos ? RED : AMBER, true);
        dist.setPadding(0, dp(4), 0, 0);
        card.addView(dist);

        boolean hasLoc = o.has("lat") && o.has("lon");
        StringBuilder loc = new StringBuilder();
        if (hasLoc) loc.append(String.format(Locale.US, "Location: %.5f, %.5f", o.optDouble("lat"), o.optDouble("lon")));
        else loc.append("Location: not shared yet");
        long upd = o.optLong("updatedAt", 0);
        if (upd > 0) {
            loc.append("\nLast seen ").append(DateUtils.getRelativeTimeSpanString(upd, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS));
        }
        int battery = o.optInt("battery", -1);
        if (battery >= 0) loc.append("   Battery ").append(battery).append("%");
        TextView locView = text(loc.toString(), 13, 0xFF475569, false);
        locView.setPadding(0, dp(4), 0, dp(10));
        card.addView(locView);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button call = button("Call", 0xFF15803D, Color.WHITE);
        call.setEnabled(!phone.isEmpty());
        call.setOnClickListener(v -> {
            try {
                startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone.replaceAll("[^0-9+]", ""))));
            } catch (Exception ignored) {
                // no dialer
            }
        });
        Button map = button("Map", 0xFF1D4ED8, Color.WHITE);
        map.setEnabled(hasLoc);
        map.setOnClickListener(v -> {
            try {
                String q = o.optDouble("lat") + "," + o.optDouble("lon");
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/search/?api=1&query=" + q)));
            } catch (Exception ignored) {
                // no browser
            }
        });
        Button dismiss = button("Dismiss", 0xFFE2E8F0, 0xFF0F172A);
        dismiss.setOnClickListener(v -> {
            AlertStore.remove(this, o.optString("key"));
            render();
        });
        row.addView(call, weight());
        row.addView(map, weight());
        row.addView(dismiss, weight());
        card.addView(row);
        return card;
    }

    // ------------------------------------------------------------ small views

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button button(String label, int bgColor, int fg) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(fg);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable d = new GradientDrawable();
        d.setColor(bgColor);
        d.setCornerRadius(dp(10));
        b.setBackground(d);
        return b;
    }

    private LinearLayout.LayoutParams weight() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(48), 1f);
        p.setMargins(dp(4), 0, dp(4), 0);
        return p;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void cancelNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(AdminWatchService.ID_ALERT);
    }

    // ----------------------------------------------------------------- alarm

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
            long[] pattern = {0, 600, 300, 600, 300};
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
