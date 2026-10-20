package com.jntugv.outing;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;

/**
 * Native helpers for the Outing app:
 *  - asks for every Android permission the app needs (as real system pop-ups)
 *  - asks to turn on device location and to be exempt from battery optimisation
 *  - controls the shake-to-SOS service
 *
 * JavaScript name: "OutingNative" (see src/native.ts).
 */
@CapacitorPlugin(
        name = "OutingNative",
        permissions = {
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }),
                @Permission(alias = "background", strings = {
                        "android.permission.ACCESS_BACKGROUND_LOCATION"
                }),
                @Permission(alias = "notifications", strings = {
                        "android.permission.POST_NOTIFICATIONS"
                })
        }
)
public class OutingNativePlugin extends Plugin {

    private static volatile OutingNativePlugin instance;

    private ActivityResultLauncher<IntentSenderRequest> gpsLauncher;
    private PluginCall pendingGpsCall;

    @Override
    public void load() {
        instance = this;
        try {
            gpsLauncher = getActivity().registerForActivityResult(
                    new ActivityResultContracts.StartIntentSenderForResult(),
                    result -> {
                        PluginCall call = pendingGpsCall;
                        pendingGpsCall = null;
                        if (call != null) call.resolve(buildStatus());
                    });
        } catch (Throwable t) {
            gpsLauncher = null;   // falls back to opening the Location settings screen
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    // ---------------------------------------------------------------- status

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(buildStatus());
    }

    private JSObject buildStatus() {
        Context c = getContext();
        boolean fine = granted(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = granted(Manifest.permission.ACCESS_COARSE_LOCATION);

        boolean background = Build.VERSION.SDK_INT < 29
                || granted("android.permission.ACCESS_BACKGROUND_LOCATION");

        boolean notifications;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        notifications = nm == null || nm.areNotificationsEnabled();

        boolean battery = true;
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        if (pm != null && Build.VERSION.SDK_INT >= 23) {
            battery = pm.isIgnoringBatteryOptimizations(c.getPackageName());
        }

        SensorManager sm = (SensorManager) c.getSystemService(Context.SENSOR_SERVICE);
        boolean hasAccel = sm != null && sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null;

        JSObject o = new JSObject();
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("location", fine || coarse);
        o.put("precise", fine);
        o.put("background", background);
        o.put("notifications", notifications);
        o.put("battery", battery);
        o.put("gps", isGpsOn());
        o.put("accelerometer", hasAccel);
        o.put("shakeRunning", ShakeSosService.running);
        o.put("sosActive", ShakeSosService.isSosActive(c));
        return o;
    }

    private boolean granted(String permission) {
        return getContext().checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean isGpsOn() {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        if (Build.VERSION.SDK_INT >= 28) return lm.isLocationEnabled();
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
                || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    // ----------------------------------------------------------- permissions

    @PluginMethod
    public void requestLocation(PluginCall call) {
        if (granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            call.resolve(buildStatus());
            return;
        }
        requestPermissionForAlias("location", call, "permissionsDone");
    }

    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29 || granted("android.permission.ACCESS_BACKGROUND_LOCATION")
                || getPermissionState("location") != PermissionState.GRANTED) {
            call.resolve(buildStatus());
            return;
        }
        // Android 11+ opens the app's location settings page where the user picks "Allow all the time".
        requestPermissionForAlias("background", call, "permissionsDone");
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || granted("android.permission.POST_NOTIFICATIONS")) {
            call.resolve(buildStatus());
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionsDone");
    }

    @PermissionCallback
    private void permissionsDone(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        if (Build.VERSION.SDK_INT < 23) {
            call.resolve(buildStatus());
            return;
        }
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        String pkg = getContext().getPackageName();
        if (pm != null && pm.isIgnoringBatteryOptimizations(pkg)) {
            call.resolve(buildStatus());
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
            startActivityForResult(call, i, "activityDone");
        } catch (Exception e) {
            try {
                startActivityForResult(call, new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), "activityDone");
            } catch (Exception e2) {
                call.resolve(buildStatus());
            }
        }
    }

    @ActivityCallback
    private void activityDone(PluginCall call, ActivityResult result) {
        if (call != null) call.resolve(buildStatus());
    }

    /** Shows Google's "Turn on device location?" pop-up. Falls back to the Location settings screen. */
    @PluginMethod
    public void requestGps(final PluginCall call) {
        if (isGpsOn()) {
            call.resolve(buildStatus());
            return;
        }
        try {
            LocationRequest lr = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L).build();
            LocationSettingsRequest req = new LocationSettingsRequest.Builder()
                    .addLocationRequest(lr)
                    .setAlwaysShow(true)
                    .build();
            LocationServices.getSettingsClient(getActivity()).checkLocationSettings(req)
                    .addOnSuccessListener(r -> call.resolve(buildStatus()))
                    .addOnFailureListener(e -> {
                        if (e instanceof ResolvableApiException && gpsLauncher != null) {
                            try {
                                pendingGpsCall = call;
                                gpsLauncher.launch(new IntentSenderRequest.Builder(
                                        ((ResolvableApiException) e).getResolution()).build());
                                return;
                            } catch (Throwable t) {
                                pendingGpsCall = null;
                            }
                        }
                        openLocationSettings(call);
                    });
        } catch (Throwable t) {
            openLocationSettings(call);
        }
    }

    private void openLocationSettings(PluginCall call) {
        try {
            startActivityForResult(call, new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS), "activityDone");
        } catch (Exception e) {
            call.resolve(buildStatus());
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", getContext().getPackageName(), null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) { }
        call.resolve();
    }

    // ------------------------------------------------------------- shake SOS

    @PluginMethod
    public void startShake(PluginCall call) {
        int sensitivity = call.getInt("sensitivity", ShakeDetector.MEDIUM);
        boolean test = call.getBoolean("test", false);
        try {
            ShakeSosService.start(getContext(), sensitivity, test);
            call.resolve(buildStatus());
        } catch (Exception e) {
            call.reject("Could not start Shake SOS: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopShake(PluginCall call) {
        ShakeSosService.command(getContext(), ShakeSosService.ACTION_STOP, null, null);
        call.resolve();
    }

    @PluginMethod
    public void configureShake(PluginCall call) {
        Integer sensitivity = call.getData().has("sensitivity") ? call.getInt("sensitivity") : null;
        Boolean test = call.getData().has("test") ? call.getBoolean("test") : null;
        ShakeSosService.command(getContext(), ShakeSosService.ACTION_CONFIG, sensitivity, test);
        call.resolve();
    }

    @PluginMethod
    public void cancelCountdown(PluginCall call) {
        ShakeSosService.command(getContext(), ShakeSosService.ACTION_CANCEL, null, null);
        call.resolve();
    }

    /** The app tells native code whether an SOS is active, so the shake gesture can fire again after "I'm safe". */
    @PluginMethod
    public void setSosActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        getContext().getSharedPreferences("outing_native", Context.MODE_PRIVATE)
                .edit().putBoolean("sosActive", active).apply();
        if (!active) ShakeSosService.command(getContext(), ShakeSosService.ACTION_CLEARED, null, null);
        call.resolve();
    }

    /** Stores the sign-in details the service needs to write the SOS flag when the web view is asleep. */
    @PluginMethod
    public void setAuth(PluginCall call) {
        String uid = call.getString("uid");
        String apiKey = call.getString("apiKey");
        String dbUrl = call.getString("databaseUrl");
        String idToken = call.getString("idToken");
        String refreshToken = call.getString("refreshToken");
        long expiresAt = call.getData().optLong("expiresAt", 0);
        if (uid == null || apiKey == null || dbUrl == null || idToken == null || refreshToken == null) {
            call.reject("Missing auth fields");
            return;
        }
        SosSender.saveAuth(getContext(), uid, apiKey, dbUrl, idToken, refreshToken, expiresAt);
        call.resolve();
    }

    @PluginMethod
    public void clearAuth(PluginCall call) {
        SosSender.clearAuth(getContext());
        call.resolve();
    }

    // ------------------------------------------- events from the service -> JS

    static void emitCountdown(int secondsLeft) {
        OutingNativePlugin p = instance;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("secondsLeft", secondsLeft);
        p.notifyListeners("shakeCountdown", o);
    }

    static void emitProgress(int count, int needed) {
        OutingNativePlugin p = instance;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("count", count);
        o.put("needed", needed);
        p.notifyListeners("shakeProgress", o);
    }

    static void emitEvent(String name) {
        OutingNativePlugin p = instance;
        if (p != null) p.notifyListeners(name, new JSObject());
    }

    /** Retained, so the app still learns about an SOS that fired while its web view was asleep. */
    static void emitSos(boolean active) {
        OutingNativePlugin p = instance;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("active", active);
        p.notifyListeners(active ? "sosTriggered" : "sosCleared", o, true);
    }

    static void emitError(String message) {
        OutingNativePlugin p = instance;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("message", message);
        p.notifyListeners("shakeError", o);
    }
}
