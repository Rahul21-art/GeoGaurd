package com.jntugv.outing;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Coordinator messages waiting for the student to tap "Got it". */
final class MessageStore {
    private static final String PREFS = "outing_messages";
    private static final String KEY = "pending";

    private MessageStore() {}

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

    static synchronized void put(Context c, JSONObject msg) {
        JSONArray old = list(c);
        JSONArray out = new JSONArray();
        String id = msg.optString("id");
        try {
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.getJSONObject(i);
                if (!id.equals(o.optString("id"))) out.put(o);
            }
            out.put(msg);
        } catch (JSONException ignored) {
            // keep what was copied
        }
        prefs(c).edit().putString(KEY, out.toString()).apply();
    }

    static synchronized void remove(Context c, String id) {
        JSONArray old = list(c);
        JSONArray out = new JSONArray();
        try {
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.getJSONObject(i);
                if (!id.equals(o.optString("id"))) out.put(o);
            }
        } catch (JSONException ignored) {
            // keep what was copied
        }
        prefs(c).edit().putString(KEY, out.toString()).apply();
    }

    static synchronized void clear(Context c) {
        prefs(c).edit().putString(KEY, "[]").apply();
    }
}
