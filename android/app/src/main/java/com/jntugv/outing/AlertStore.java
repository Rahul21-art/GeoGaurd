package com.jntugv.outing;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The alerts waiting for a faculty member to acknowledge them (SOS and "not back at the hostel").
 * Stored as JSON in SharedPreferences so the alert screen can show them after the app was closed.
 */
final class AlertStore {
    private static final String PREFS = "outing_alerts";
    private static final String KEY = "pending";

    private AlertStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized JSONArray list(Context c) {
        try {
            return new JSONArray(prefs(c).getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** Adds or replaces the alert with the same key. */
    static synchronized void put(Context c, JSONObject alert) {
        JSONArray old = list(c);
        JSONArray out = new JSONArray();
        String key = alert.optString("key");
        try {
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.getJSONObject(i);
                if (!key.equals(o.optString("key"))) out.put(o);
            }
            out.put(alert);
        } catch (JSONException ignored) {
            // keep whatever was copied
        }
        prefs(c).edit().putString(KEY, out.toString()).apply();
    }

    static synchronized void remove(Context c, String key) {
        JSONArray old = list(c);
        JSONArray out = new JSONArray();
        try {
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.getJSONObject(i);
                if (!key.equals(o.optString("key"))) out.put(o);
            }
        } catch (JSONException ignored) {
            // keep whatever was copied
        }
        prefs(c).edit().putString(KEY, out.toString()).apply();
    }

    static synchronized void clear(Context c) {
        prefs(c).edit().putString(KEY, "[]").apply();
    }

    static int count(Context c) {
        return list(c).length();
    }
}
