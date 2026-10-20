package com.jntugv.outing;

/**
 * Detects a deliberate, vigorous shake (not walking or a single bump).
 *
 * A shake is a run of strong accelerations that keep REVERSING direction, quickly one after another.
 * Walking and running produce one-directional spikes, so they are ignored.
 *
 * Plain Java (no Android classes) so it can be unit tested on a laptop.
 */
public final class ShakeDetector {

    public interface Listener {
        /** A strong direction-reversing swing was counted (1..needed-1). */
        void onProgress(int count, int needed);

        /** The full shake pattern was completed. */
        void onShake();
    }

    public static final int LOW = 0;     // hardest to trigger
    public static final int MEDIUM = 1;  // default
    public static final int HIGH = 2;    // easiest to trigger

    /** Strength of one swing, in m/s^2 of linear acceleration (gravity removed). 9.8 = 1 g. */
    private static final float[] THRESHOLD = {26f, 21f, 16f};
    /** Number of direction-reversing swings needed. */
    private static final int[] NEEDED = {6, 5, 4};

    private static final long MIN_GAP_MS = 70;    // faster than this is sensor noise
    private static final long MAX_GAP_MS = 650;   // slower than this is not a shake rhythm
    private static final float GRAVITY_ALPHA = 0.92f;

    private final Listener listener;
    private int level = MEDIUM;

    private float gx, gy, gz;
    private boolean primed = false;

    private boolean armed = true;
    private int count = 0;
    private long lastPeakMs = 0;
    private float dx, dy, dz;

    public ShakeDetector(Listener listener) {
        this.listener = listener;
    }

    public void setSensitivity(int level) {
        this.level = Math.max(LOW, Math.min(HIGH, level));
        reset();
    }

    public int getSensitivity() {
        return level;
    }

    public int needed() {
        return NEEDED[level];
    }

    public void reset() {
        count = 0;
        armed = true;
    }

    /** Feed one accelerometer sample (m/s^2, including gravity) and its time in milliseconds. */
    public void onSample(float x, float y, float z, long tMs) {
        if (!primed) {
            gx = x; gy = y; gz = z;
            primed = true;
            return;
        }
        // Low-pass filter isolates gravity; what is left is the movement of the phone.
        gx = GRAVITY_ALPHA * gx + (1 - GRAVITY_ALPHA) * x;
        gy = GRAVITY_ALPHA * gy + (1 - GRAVITY_ALPHA) * y;
        gz = GRAVITY_ALPHA * gz + (1 - GRAVITY_ALPHA) * z;
        float lx = x - gx, ly = y - gy, lz = z - gz;
        float mag = (float) Math.sqrt(lx * lx + ly * ly + lz * lz);

        float threshold = THRESHOLD[level];

        if (!armed) {
            // Wait until the swing dies down before we can count the next one.
            if (mag < threshold * 0.5f) armed = true;
            return;
        }
        if (mag < threshold) {
            if (count > 0 && tMs - lastPeakMs > MAX_GAP_MS) count = 0;  // too slow, start again
            return;
        }

        // A strong swing started.
        armed = false;
        if (count > 0) {
            long gap = tMs - lastPeakMs;
            if (gap > MAX_GAP_MS) {
                count = 0;
            } else if (gap < MIN_GAP_MS) {
                return;
            } else if (lx * dx + ly * dy + lz * dz >= 0) {
                return;  // same direction as the last swing: not a back-and-forth shake
            }
        }
        count++;
        dx = lx; dy = ly; dz = lz;
        lastPeakMs = tMs;

        int needed = NEEDED[level];
        if (count >= needed) {
            count = 0;
            listener.onShake();
        } else {
            listener.onProgress(count, needed);
        }
    }
}
