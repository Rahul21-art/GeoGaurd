import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jntugv.outing',
  appName: 'JNTU-GV Outing',
  webDir: 'dist',
  android: {
    // Keeps the web layer running in the background so location and SOS updates are not paused
    // after ~5 minutes (required by @capacitor-community/background-geolocation).
    useLegacyBridge: true,
  },
};

export default config;
