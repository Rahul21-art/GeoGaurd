package com.jntugv.outing;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Sends the SOS flag straight to Firebase Realtime Database over HTTPS.
 *
 * This is the safety net for the shake gesture: it works even if the web view is frozen
 * because the phone is locked. The web layer hands over the student's sign-in token with
 * OutingNative.setAuth(); this class refreshes it when it expires.
 *
 * Blocking. Always call off the main thread.
 */
final class SosSender {
    private static final String PREFS = "outing_native";

    private SosSender() {}

    static void saveAuth(Context c, String uid, String apiKey, String dbUrl,
                         String idToken, String refreshToken, long expiresAtMs) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("uid", uid)
                .putString("apiKey", apiKey)
                .putString("dbUrl", dbUrl)
                .putString("idToken", idToken)
                .putString("refreshToken", refreshToken)
                .putLong("expiresAt", expiresAtMs)
                .apply();
    }

    static void clearAuth(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove("uid").remove("apiKey").remove("dbUrl")
                .remove("idToken").remove("refreshToken").remove("expiresAt")
                .apply();
    }

    /** Sets telemetry/{uid}/sos. Retries a few times so a short signal gap does not lose the SOS. */
    static boolean sendSos(Context c, boolean on) {
        for (int attempt = 0; attempt < 6; attempt++) {
            try {
                if (trySend(c, on)) return true;
            } catch (Exception ignored) {
                // fall through and retry
            }
            try {
                Thread.sleep(4000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    private static boolean trySend(Context c, boolean on) throws Exception {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String uid = p.getString("uid", null);
        String dbUrl = p.getString("dbUrl", null);
        if (uid == null || dbUrl == null) return false;
        if (dbUrl.endsWith("/")) dbUrl = dbUrl.substring(0, dbUrl.length() - 1);

        String token = validToken(p);
        if (token == null) return false;

        String base = dbUrl + "/telemetry/" + uid;
        int code = put(base + "/sos.json?auth=" + token, on ? "true" : "false");
        if (code == 401 || code == 403) {
            // Token may just have expired. Refresh once and try again.
            token = refresh(p);
            if (token == null) return false;
            code = put(base + "/sos.json?auth=" + token, on ? "true" : "false");
        }
        if (code < 200 || code >= 300) return false;

        // Best effort: stamp the time so the faculty dashboard sees fresh data.
        try {
            put(base + "/updatedAt.json?auth=" + token, "{\".sv\":\"timestamp\"}");
        } catch (Exception ignored) {
            // not critical
        }
        return true;
    }

    /** PUT a JSON value at {dbUrl}/{path} as the signed-in user. Refreshes the token once on 401/403. */
    static boolean putJson(Context c, String path, String jsonBody) {
        try {
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String dbUrl = p.getString("dbUrl", null);
            if (dbUrl == null) return false;
            if (dbUrl.endsWith("/")) dbUrl = dbUrl.substring(0, dbUrl.length() - 1);
            String token = validToken(p);
            if (token == null) return false;
            int code = put(dbUrl + "/" + path + "?auth=" + token, jsonBody);
            if (code == 401 || code == 403) {
                token = refresh(p);
                if (token == null) return false;
                code = put(dbUrl + "/" + path + "?auth=" + token, jsonBody);
            }
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        }
    }

    /** Result of a GET against the Realtime Database REST API. */
    static final class Resp {
        final int code;
        final String body;
        Resp(int code, String body) { this.code = code; this.body = body; }
    }

    /**
     * GET {dbUrl}/{path} as the signed-in user. {@code path} may already contain a query
     * string (for example telemetry.json?orderBy=...). Refreshes the token once on 401/403.
     * Returns null when nobody is signed in or the network is down.
     */
    static Resp getJson(Context c, String path) {
        try {
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String dbUrl = p.getString("dbUrl", null);
            if (dbUrl == null) return null;
            if (dbUrl.endsWith("/")) dbUrl = dbUrl.substring(0, dbUrl.length() - 1);
            String token = validToken(p);
            if (token == null) return null;
            Resp r = get(dbUrl + "/" + path + (path.contains("?") ? "&" : "?") + "auth=" + token);
            if (r.code == 401 || r.code == 403) {
                token = refresh(p);
                if (token == null) return r;
                r = get(dbUrl + "/" + path + (path.contains("?") ? "&" : "?") + "auth=" + token);
            }
            return r;
        } catch (Exception e) {
            return null;
        }
    }

    private static Resp get(String urlStr) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        try {
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(20_000);
            conn.setRequestMethod("GET");
            int code = conn.getResponseCode();
            InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String body = in == null ? "" : readAll(in);
            return new Resp(code, body);
        } finally {
            conn.disconnect();
        }
    }

    private static String validToken(SharedPreferences p) throws Exception {
        String token = p.getString("idToken", null);
        long exp = p.getLong("expiresAt", 0);
        if (token != null && System.currentTimeMillis() < exp - 60_000) return token;
        return refresh(p);
    }

    /** Exchanges the refresh token for a new ID token (Firebase Auth REST API). */
    private static String refresh(SharedPreferences p) throws Exception {
        String key = p.getString("apiKey", null);
        String refresh = p.getString("refreshToken", null);
        if (key == null || refresh == null) return null;

        URL url = new URL("https://securetoken.googleapis.com/v1/token?key=" + key);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            byte[] body = ("grant_type=refresh_token&refresh_token=" + java.net.URLEncoder.encode(refresh, "UTF-8"))
                    .getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            JSONObject json = new JSONObject(readAll(conn.getInputStream()));
            String idToken = json.optString("id_token", null);
            String newRefresh = json.optString("refresh_token", refresh);
            long expiresIn = Long.parseLong(json.optString("expires_in", "3600"));
            if (idToken == null || idToken.isEmpty()) return null;
            p.edit()
                    .putString("idToken", idToken)
                    .putString("refreshToken", newRefresh)
                    .putLong("expiresAt", System.currentTimeMillis() + expiresIn * 1000L)
                    .apply();
            return idToken;
        } finally {
            conn.disconnect();
        }
    }

    private static int put(String urlStr, String jsonBody) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        try {
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setRequestMethod("PUT");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            try {
                InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
                if (in != null) readAll(in);
            } catch (Exception ignored) {
                // body not needed
            }
            return code;
        } finally {
            conn.disconnect();
        }
    }

    private static String readAll(InputStream in) throws Exception {
        try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[2048];
            int n;
            while ((n = is.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }
}
