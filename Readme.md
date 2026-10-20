# JNTU-GV Outing (GeoGaurd)

An outing safety app for JNTU-GV students. It is built as a web app (React) and packaged as an Android app (Capacitor), with Firebase as the backend.

| | |
|---|---|
| App name | JNTU-GV Outing |
| Android package ID | `com.jntugv.outing` |
| Repository | https://github.com/Rahul21-art/GeoGaurd |
| Current version | `versionName 1.3`, `versionCode 4` (see `android/app/build.gradle`) |

<!-- TODO (owner): add a short list of the app's main features here, e.g. live location sharing, alerts, notifications. -->

---

## Table of contents
1. [Tech stack](#1-tech-stack)
2. [How the app is built (big picture)](#2-how-the-app-is-built-big-picture)
3. [Project structure](#3-project-structure)
4. [Getting started (for new team members)](#4-getting-started-for-new-team-members)
5. [Files that are NOT in the repo](#5-files-that-are-not-in-the-repo)
6. [Daily Git workflow](#6-daily-git-workflow)
7. [Running and testing](#7-running-and-testing)
8. [Building and releasing the Android APK](#8-building-and-releasing-the-android-apk)
9. [How the app is deployed to users](#9-how-the-app-is-deployed-to-users)
10. [Firebase](#10-firebase)
11. [Android permissions and location](#11-android-permissions-and-location)
12. [App icon and logo](#12-app-icon-and-logo)
13. [How this project was created from scratch](#13-how-this-project-was-created-from-scratch)
14. [Troubleshooting](#14-troubleshooting)
15. [Team rules](#15-team-rules)

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| UI | React + TypeScript, built with Vite |
| Icons | lucide-react |
| Mobile wrapper | Capacitor (`@capacitor/core`, `@capacitor/android`) |
| Native plugins | Local Notifications, Device, Background Geolocation (`@capacitor-community/background-geolocation`), plus our own `OutingNative` plugin (permissions + shake SOS, in `android/app/src/main/java/com/jntugv/outing/`) |
| Backend | Firebase (Authentication and Realtime Database) |
| Android build | Android Studio, Gradle |
| Linting | oxlint |

## 2. How the app is built (big picture)

```
 React + TypeScript code (src/)
            │  npm run build   (Vite)
            ▼
   Static web files (dist/)
            │  npx cap sync android
            ▼
 Copied into the Android project (android/)
            │  Android Studio → Build → Generate Signed APK
            ▼
      app-release.apk  →  shared with users
```

1. The whole app is a normal website written in React. It lives in `src/`.
2. `npm run build` compiles it into plain HTML, CSS and JavaScript in `dist/`.
3. **Capacitor** wraps those files inside a native Android app (a WebView). It also gives the website access to phone features such as GPS and notifications.
4. `npx cap sync android` copies `dist/` into the `android/` project and updates the native plugins.
5. **Android Studio** builds the `android/` project into an installable `.apk` file.

**Important:** every time you change anything in `src/`, run `npm run build` and `npx cap sync android` again before building the APK. Otherwise the APK contains the old code.

## 3. Project structure

```
GeoGaurd/
├── src/                    React app source code (App.tsx, main.tsx, index.css, assets)
├── public/                 Static files copied as-is (logos, favicon)
├── android/                Native Android project (open THIS folder in Android Studio)
│   └── app/
│       ├── build.gradle    App version (versionCode / versionName)
│       └── src/main/
│           ├── AndroidManifest.xml   Permissions
│           └── res/                  Icons, splash screens, strings
├── capacitor.config.ts     Capacitor settings (appId, appName, webDir)
├── vite.config.ts          Vite build settings
├── index.html              App entry page
├── package.json            Dependencies and npm scripts
├── package-lock.json       Exact dependency versions (do not delete)
└── tsconfig*.json          TypeScript settings
```

Generated folders such as `node_modules/`, `dist/` and `android/app/build/` are not stored in Git. You recreate them locally with the steps below.

## 4. Getting started (for new team members)

### 4.1 Install these first
- **Git**: https://git-scm.com/downloads
- **Node.js** (LTS version): https://nodejs.org
- **Android Studio** (latest stable): https://developer.android.com/studio
  - During setup, let it install the Android SDK.
- **VS Code** (recommended editor): https://code.visualstudio.com
- A **GitHub account**. Ask the repo owner to invite you, then accept the invite from your email.

### 4.2 Get the code and run the setup
```bash
git clone https://github.com/Rahul21-art/GeoGaurd.git
cd GeoGaurd
npm install
npm run build
npx cap sync android
```

- `npm install` downloads all libraries (recreates `node_modules/`).
- `npm run build` creates `dist/`.
- `npx cap sync android` copies the web build into the Android project.

### 4.3 Open the Android project
1. Open **Android Studio**.
2. Choose **Open** and select the **`android`** folder inside the project.
   Do **not** open the main project folder. If you do, the "Generate Signed App Bundle / APK" menu stays greyed out.
3. Wait for the **Gradle sync** to finish (progress bar at the bottom). The first time can take several minutes.

### 4.4 Add your private files
Ask the team lead for the items in the next section and put them in the right place.

## 5. Files that are NOT in the repo

These are kept out of Git on purpose (see `.gitignore`). Get them from the team lead **privately (never post them in a public chat or in GitHub)**.

| Item | Why it is private | Who needs it |
|---|---|---|
| **Firebase config values** (API key, project ID, etc.) | Connects the app to our Firebase project | Every developer, if the code reads them from a `.env` file or a config file |
| **Keystore file** (`keystore`, `.jks`) and its **password and alias** | Signs the release APK. Without it, no update can install over the old app | Only the person who builds the release APK |
| `local.properties` | Your own computer's Android SDK path. Android Studio creates it automatically | Nobody, it is generated |

If the Firebase values are read from a `.env` file, create `.env` in the project root like this (variable names depend on the code, so check `src/` for the exact names):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

**Never commit the keystore, its password, or `.env`.** If one is committed by mistake, tell the team lead immediately, because deleting it later is not enough (it stays in Git history).

## 6. Daily Git workflow

`main` always holds the working version. Nobody commits straight to `main`.

```bash
git pull                          # 1. get the latest code
git checkout -b feature/my-task   # 2. create your own branch
# ...make your changes...
git add .                         # 3. stage your changes
git commit -m "what I changed"    # 4. save them with a clear message
git push -u origin feature/my-task  # 5. upload your branch
```

Then:
1. Open your repo on GitHub and click **Compare & pull request**.
2. Describe what you changed and ask a teammate to review.
3. After approval, click **Merge** into `main`.
4. Locally, run `git checkout main` and `git pull` to get the merged code.

**Branch names:** `feature/<name>` for new features, `fix/<name>` for bug fixes.
**Commit messages:** short and clear, for example `Fix location permission prompt`.

**Optional but recommended: protect `main`.** In GitHub go to **Settings → Branches → Add rule** for `main` and tick **Require a pull request before merging**.

## 7. Running and testing

| Goal | Command or action |
|---|---|
| Run the web version in the browser | `npm run dev` (open the local link it prints) |
| Check the code for problems | `npm run lint` (if configured in `package.json`) |
| Build the web files | `npm run build` |
| Test on a real phone | See below |

**Test on your phone from Android Studio (best for debugging):**
1. On the phone: **Settings → About phone**, tap **Build number** 7 times to enable Developer options.
2. Turn on **USB debugging** in Developer options and plug the phone into your computer.
3. Run `npm run build` and `npx cap sync android`.
4. In Android Studio, pick your phone at the top and press the green **Run** button.

Note: the web version (`npm run dev`) cannot fully test background location and native notifications. Always check those on a real phone.

## 8. Building and releasing the Android APK

Only the **release manager** (the person who has the keystore) does this.

1. Make sure everything to be released is merged into `main`, then run `git pull`.
2. Run:
   ```bash
   npm run build
   npx cap sync android
   ```
3. Increase the version in `android/app/build.gradle`:
   ```gradle
   versionCode 3        // must go up by 1 for every release
   versionName "1.2"    // the version users see
   ```
   If `versionCode` does not increase, phones will refuse to update the old app.
4. In Android Studio (with the **`android`** folder open): **Build → Clean Project**.
5. **Build → Generate Signed App Bundle / APK → APK → Next.**
6. Choose the keystore file, enter the keystore password, key alias and key password, click **Next**.
7. Select the **release** build variant and click **Create** (or **Finish**).
8. When it finishes, click **locate**. The file is `android/app/release/app-release.apk`.
9. Commit the version change and push it (the APK itself is not committed):
   ```bash
   git add android/app/build.gradle
   git commit -m "Release 1.2"
   git push
   ```

## 9. How the app is deployed to users

The app is distributed as a signed **APK file** (not through the Play Store). Users install it directly on their phones.

1. Build the signed APK (section 8).
2. Upload `app-release.apk` to a place where everyone can download it, such as Google Drive or GitHub Releases.

   **Google Drive:** right-click the file → **Share** → under **General access** choose **Anyone with the link** (role: Viewer) → **Copy link**. If you skip this, users see "request access from the file owner".
   To replace the file but keep the same link, upload the new one with **Right-click → Manage versions → Upload new version**.

   **GitHub Releases (alternative):** on GitHub open **Releases → Draft a new release**, create a tag like `v1.2`, attach the APK and publish. Everyone gets one stable download link.
3. Share the link in the WhatsApp group.

### Instructions for users installing the app
1. Open the download link on your Android phone and tap **Download**. (If Drive says it cannot scan for viruses, tap **Download anyway**.)
2. Open the downloaded file. If Android asks, allow **Install unknown apps** for your browser or Files app.
3. Tap **Install**. To update, install the new APK over the old one (same signing key, higher version).
4. When the app asks for **Location** and **Notifications**, choose **Allow** (for location choose **Allow all the time** so tracking works in the background).

## 10. Firebase

The app uses Firebase for sign-in and its database.

- Team members should be added in the Firebase console under **Project settings → Users and permissions**. Give developers the **Editor** role and keep **Owner** for the team lead.
- Everyone works against the same Firebase project, so be careful when changing or deleting data. Prefer a separate test project for experiments.
- Database rules (who can read and write) are managed in the Firebase console, or in `firebase.json` and rules files if they are added to the repo later.

## 11. Android permissions and location

The app needs these permissions in `android/app/src/main/AndroidManifest.xml`. They go inside `<manifest>`, outside `<application>`:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

And in `capacitor.config.ts`, the background geolocation plugin works best with:

```ts
const config: CapacitorConfig = {
  appId: 'com.jntugv.outing',
  appName: 'JNTU-GV Outing',
  webDir: 'dist',
  android: { useLegacyBridge: true },
};
```

Good to know:
- An Android app **cannot switch the phone's GPS on silently**. It can only show the system prompt asking the user to turn location on.
- If the permission prompt never appears, uninstall the app, install the fresh APK, and check the manifest permissions above.
- If a user denied permission once, they must enable it at **Settings → Apps → JNTU-GV Outing → Permissions → Location → Allow all the time**.

## 12. App icon and logo

- Source artwork: `public/app-logo.svg` and `public/logo-full.svg` (website logo and favicon are in `public/`).
- The Android launcher icon is an **adaptive icon**. Its files are in `android/app/src/main/res/`:
  - `mipmap-*/ic_launcher_foreground.png`, the foreground layer (keep the artwork inside the central safe zone)
  - `values/ic_launcher_background.xml`, the background color
  - `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml`, which join the layers:
    ```xml
    <?xml version="1.0" encoding="utf-8"?>
    <adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
        <background android:drawable="@color/ic_launcher_background"/>
        <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    </adaptive-icon>
    ```
- To change the icon in Android Studio: right-click `res` → **New → Image Asset**, choose the foreground and background, then **Next → Finish**. Make sure the XML files above point to `@mipmap/ic_launcher_foreground`.
- After changing the icon, raise `versionCode`, rebuild the APK, and uninstall the old app before installing (some phones cache the old icon).

## 13. How this project was created from scratch

For anyone who wants to understand or recreate the setup:

1. **Create the React app** with Vite (React + TypeScript template):
   ```bash
   npm create vite@latest outing-safety -- --template react-ts
   cd outing-safety
   npm install
   ```
2. **Add the libraries:** Firebase, lucide-react, and the Capacitor packages:
   ```bash
   npm install firebase lucide-react
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npm install @capacitor/local-notifications @capacitor/device
   npm install @capacitor-community/background-geolocation
   ```
3. **Write the app** in `src/` (main screen in `src/App.tsx`, entry point `src/main.tsx`).
4. **Initialise Capacitor:**
   ```bash
   npx cap init "JNTU-GV Outing" com.jntugv.outing --web-dir dist
   ```
5. **Build and add the Android platform:**
   ```bash
   npm run build
   npx cap add android
   npx cap sync android
   ```
6. **Open `android/` in Android Studio**, let Gradle sync, add the manifest permissions (section 11), set the icon (section 12).
7. **Create a keystore** in Android Studio (**Build → Generate Signed App Bundle / APK → Create new**) and keep it safe.
8. **Build the signed release APK** (section 8) and share it (section 9).
9. **Put the code on GitHub** so the team can collaborate (sections 4 and 6).

## 14. Troubleshooting

| Problem | Fix |
|---|---|
| **"Generate Signed App Bundle / APK" is greyed out** | You opened the main project folder. Close it and open the **`android`** folder in Android Studio, then wait for Gradle sync. |
| **Gradle sync fails** | Check your internet connection. Use **File → Invalidate Caches / Restart**. Make sure Android Studio's SDK is installed. |
| **Build error: `resource drawable/ic_launcher_foreground not found`** | `ic_launcher.xml` and `ic_launcher_round.xml` must reference `@mipmap/ic_launcher_foreground` (see section 12). |
| **Phone still shows the old version or icon** | The new APK was not installed. Check **App info → Version**. Raise `versionCode`, rebuild, uninstall the old app, and install the new APK. |
| **Changes in `src/` do not appear in the app** | Run `npm run build` then `npx cap sync android` before building. |
| **Location prompt does not appear / "open settings and allow location"** | Add the manifest permissions in section 11, rebuild, reinstall, and grant location in the phone's app settings. |
| **Drive link says "request access"** | Set **General access** to **Anyone with the link** (section 9). |
| **Update will not install over the old app** | The APK must be signed with the **same keystore** and have a **higher versionCode**. |
| **`git push` is rejected (non-fast-forward)** | Run `git pull origin main --allow-unrelated-histories --no-edit` (first time) or `git pull` and then push again. |
| **`Filename too long` when running `git add`** | `node_modules/` is not being ignored. Check `.gitignore` is saved in UTF-8 and contains `node_modules/`. |
| **LF will be replaced by CRLF warnings** | Harmless on Windows. You can ignore them. |

## 15. Team rules

- Never commit the keystore, passwords, `.env`, or any API secrets.
- Never push straight to `main`. Use a branch and a Pull Request.
- Run `git pull` before you start working each day.
- Run `npm run build` before opening a Pull Request, to make sure it still compiles.
- Only the release manager changes `versionCode` and `versionName` and builds the release APK.
- Keep the keystore in two safe places (for example a password manager and a private backup). If it is lost, existing users cannot receive updates.
- Ask in the team group before deleting or changing shared Firebase data.

---

Maintained by the JNTU-GV Outing team.

## 16. What is new in version 1.2

### New app icon
The launcher icon is the pin, students, road and calendar artwork. Files: `android/app/src/main/res/mipmap-*/` (`ic_launcher_foreground.png`, `ic_launcher.webp`, `ic_launcher_round.webp`), `values/ic_launcher_background.xml` (navy `#041536`), and `android/app/src/main/ic_launcher-playstore.png`. The website uses `public/app-icon.png` and `public/favicon.png`.

### Default range 15 km, changeable per student
- The default permitted radius is **15 km** (`DEFAULT_RADIUS_KM` in `src/App.tsx`). Faculty can still change the default in **Settings**.
- On every **student card** in the faculty dashboard there is an **Allowed range** row with a **Change range** button. Faculty type a value (0.5 to 200 km) or tap a quick value, then **Save**. **Reset to default** removes the custom range.
- Custom ranges are stored in Firebase at `studentRadius/{uid}` (km). The student's own app also shows and uses their range. Firebase rules for this node are in `docs/firebase-rules-update.md`, and **must be published once** or saving will say permission denied.

### Shake to send SOS (works when the phone is locked)
- Native Android service: `ShakeSosService.java` (accelerometer, foreground service, partial wake lock) with the detection logic in `ShakeDetector.java`.
- A deliberate back-and-forth shake (default: 5 firm swings within about 2.5 seconds) starts a **5-second countdown** with vibration and a notification with a **CANCEL** button, so accidental shakes can be stopped. If not cancelled, SOS is sent.
- SOS is written to Firebase by the app, and also directly by the native service over HTTPS (`SosSender.java`), so it still goes out if the web view is asleep.
- Students can switch it on or off, pick **Low / Medium / High** sensitivity and **Test shake** (no SOS sent) from the **Shake to send SOS** card in the student screen.
- Needs: "Allow all the time" location, notifications, and **Unrestricted battery**. Some phone brands (Xiaomi, Oppo, Vivo, Realme, Samsung "sleeping apps") also need the app set to **Autostart / No restrictions** in their battery settings.

### Permission pop-ups on first open
When the Android app opens, `src/PermissionGate.tsx` asks, one after another: precise location, notifications, location "Allow all the time", turn on device location (GPS), and unrestricted battery use. If something is denied it shows an **Open settings** button. Students cannot be tracked or send SOS without the required ones.

### Build checklist for 1.2
```bash
git pull
npm install          # picks up nothing new, but keeps node_modules in sync
npm run build
npx cap sync android
```
Then open the `android` folder in Android Studio, let Gradle sync (a new `play-services-location` dependency is added), and build the signed APK as in section 8. Uninstall the old app first if the old icon still shows.

## 17. What is new in version 1.3 (look and feel)
- **Welcome screen** on every launch: "Welcome to the JNTU-GV Tracking App" with the app icon, ripples and a loading bar (`src/Welcome.tsx`). Tap to skip.
- **Animated landing page** with a welcome heading and cards that lift when touched.
- **Smooth transitions everywhere**: every button, link and switch has hover and press feedback, screens fade and slide in, cards rise in one after another, modals pop in, progress bars glide, and an active SOS pulses red. All of it is defined in `src/index.css` and switches off automatically for phones set to "reduce motion".
- Students see "Welcome, <name>" on their screen, and faculty see a welcome line on the dashboard.
