# JNTU-GV Outing (GeoGaurd)

An outing safety app for JNTU-GV students. It is built as a web app (React) and packaged as an Android app (Capacitor), with Firebase as the backend.

| | |
|---|---|
| App name | JNTU-GV Outing (shown inside the app as "JNTU-GV Tracking App") |
| Android package ID | `com.jntugv.outing` |
| Repository | https://github.com/Rahul21-art/GeoGaurd |
| Current version | `versionName 1.7`, `versionCode 8` (see `android/app/build.gradle`) |

## Main features
- **Live location sharing**: students share their location during an outing, even when the screen is locked.
- **Safe-zone alerts**: faculty see who is inside or outside the permitted radius. The default radius is **15 km**.
- **Per-student range**: faculty can change the permitted range of any single student from that student's card.
- **Shake-to-SOS**: a hard shake starts a 5-second cancellable countdown, then sends an SOS, even when the phone is locked.
- **SOS handling**: faculty see SOS alerts live. The student can clear it with "I'm safe".
- **Permission pop-ups at app open**: location, notifications, "Allow all the time", GPS and battery permissions are asked one after another.
- **Full-screen SOS alerts for faculty**: name, roll number, phone, distance from the hostel and location, even when the faculty app is closed and the phone is locked.
- **Evening return rule**: after the return time (default 6:00 PM), every student who is still more than 0.2 km from the hostel is reported to faculty as a full-screen alert.
- **Hostel roll call**: students who stay at the hostel for 3 minutes are listed as "Arrived", and faculty can mark them all as reached with one tap. A line at the top shows how many are back.
- **Call-back messages**: faculty send a full-screen message to students (still out, everyone, or picked students) and see who has seen it.
- **Live map**: every active student on one map with coloured pins, the hostel, the safe radius and the last hour of a student's path.
- **New version pop-up**: when a newer version is released, the app shows a pop-up with the download link.
- **Welcome screen and smooth transitions** on every screen and button.

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
16. [What is new in version 1.2](#16-what-is-new-in-version-12)
17. [What is new in version 1.3](#17-what-is-new-in-version-13)
18. [What is new in version 1.4](#18-what-is-new-in-version-14)
19. [What is new in version 1.5](#19-what-is-new-in-version-15)
20. [What is new in version 1.6](#20-what-is-new-in-version-16)
21. [What is new in version 1.7](#21-what-is-new-in-version-17)

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| Map | Leaflet 1.9.4 with OpenStreetMap tiles |
| UI | React + TypeScript, built with Vite, styled with Tailwind CSS v4 and a custom motion system in `src/index.css` |
| Icons | lucide-react |
| Mobile wrapper | Capacitor 8 (`@capacitor/core`, `@capacitor/android`) |
| Native plugins | Local Notifications, Device, Background Geolocation (`@capacitor-community/background-geolocation`), plus our own `OutingNative` plugin written in Java |
| Backend | Firebase (Authentication and Realtime Database) |
| Android build | Android Studio, Gradle 8.14.3, Android Gradle Plugin 8.13.0, Java 21 |
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
├── src/                    React app source code
│   ├── App.tsx             Main app: landing, student portal, faculty portal, settings
│   ├── Welcome.tsx         Welcome splash screen
│   ├── PermissionGate.tsx  Permission pop-ups shown when the app opens
│   ├── shakeSos.tsx        Shake-to-SOS settings, countdown screen and logic
│   ├── alerts.tsx          Faculty full-screen alerts, return-time rule, hostel roll call
│   ├── messages.tsx        Call-back messages and read receipts
│   ├── updater.tsx         "New version released" pop-up
│   ├── LiveMap.tsx         Faculty live map (Leaflet + OpenStreetMap)
│   ├── trail.ts            Saves and reads each student's recent path
│   ├── native.ts           JavaScript side of our native Android plugin
│   ├── index.css           Tailwind import and all animations / transitions
│   └── main.tsx            Entry point
├── public/                 Static files copied as-is (app icon, favicon)
├── docs/
│   └── firebase-rules-update.md   Firebase database rules to publish
├── android/                Native Android project (open THIS folder in Android Studio)
│   └── app/
│       ├── build.gradle    App version (versionCode / versionName)
│       └── src/main/
│           ├── AndroidManifest.xml   Permissions and the shake service
│           ├── java/com/jntugv/outing/
│           │   ├── MainActivity.java         Registers our plugin
│           │   ├── OutingNativePlugin.java   Permission and shake bridge to the web app
│           │   ├── ShakeSosService.java      Foreground service that watches for shakes
│           │   ├── AdminWatchService.java    Faculty background watcher (SOS and late-return checks)
│           │   ├── AlertActivity.java        Full-screen alert over the lock screen
│           │   ├── AlertStore.java           Alerts waiting to be acknowledged
│           │   ├── InboxService.java         Student background watcher for coordinator messages
│           │   ├── MessageActivity.java      Full-screen message over the lock screen
│           │   ├── MessageStore.java         Messages waiting for "Got it"
│           │   ├── ShakeDetector.java        Shake detection algorithm
│           │   └── SosSender.java            Sends the SOS to Firebase from native code
│           └── res/                          Icons, splash screens, strings
├── version.json            Latest released version (read by the app for the update pop-up)
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
3. Check the Gradle settings once (see the Troubleshooting table, "Gradle sync fails"):
   **File → Settings → Build, Execution, Deployment → Build Tools → Gradle**
   - Distribution: **Wrapper**
   - Gradle JDK: **jbr-21** (the JetBrains Runtime that ships with Android Studio)
4. Wait for the **Gradle sync** to finish (progress bar at the bottom). The first time can take several minutes.

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

**Never commit the keystore, its password, or `.env`.** The repository is public. If one is committed by mistake, tell the team lead immediately, because deleting it later is not enough (it stays in Git history).

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

Note: the web version (`npm run dev`) cannot test background location, permission pop-ups or shake SOS. Always check those on a real phone.

**Checklist for a release test (on at least two phones):**
- The welcome screen appears, then the permission pop-ups one after another.
- The app icon is the new one.
- Faculty can change a student's range from the student card.
- With an outing active, lock the screen and shake the phone hard. The countdown starts and the SOS reaches the faculty side.
- "I'm safe" in the notification clears the SOS.

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
   versionCode 5        // must go up by 1 for every release (the 1.3 release is 4)
   versionName "1.4"    // the version users see
   ```
   If `versionCode` does not increase, phones will refuse to update the old app.
4. In Android Studio (with the **`android`** folder open): **Build → Clean Project**.
5. **Build → Generate Signed App Bundle / APK → APK → Next.**
6. Choose the keystore file, enter the keystore password, key alias and key password, click **Next**.
7. Select the **release** build variant and click **Create** (or **Finish**).
8. When it finishes, click **locate**. The file is `android/app/release/app-release.apk`.
9. Announce the release so users get the update pop-up (see section 20, "Releasing an update").
10. Commit the version change and push it (the APK itself is not committed):
   ```bash
   git add android/app/build.gradle
   git commit -m "Release 1.4"
   git push
   ```

## 9. How the app is deployed to users

The app is distributed as a signed **APK file** (not through the Play Store). Users install it directly on their phones.

1. Build the signed APK (section 8).
2. Upload `app-release.apk` to a place where everyone can download it, such as Google Drive or GitHub Releases.

   **Google Drive:** right-click the file → **Share** → under **General access** choose **Anyone with the link** (role: Viewer) → **Copy link**. If you skip this, users see "request access from the file owner".
   To replace the file but keep the same link, upload the new one with **Right-click → Manage versions → Upload new version**.

   **GitHub Releases (alternative):** on GitHub open **Releases → Draft a new release**, create a tag like `v1.3`, attach the APK and publish. Everyone gets one stable download link.
3. Share the link in the WhatsApp group.

### Instructions for users installing the app
1. Open the download link on your Android phone and tap **Download**. (If Drive says it cannot scan for viruses, tap **Download anyway**.)
2. Open the downloaded file. If Android asks, allow **Install unknown apps** for your browser or Files app.
3. Tap **Install**. To update, install the new APK over the old one (same signing key, higher version). Do not uninstall first.
4. When the app opens, tap **Allow** on every pop-up. For location choose **Allow all the time**, so tracking and shake SOS work with the screen locked.
5. On Xiaomi, Oppo, Vivo, Realme and Samsung phones, also set the app's battery use to **Unrestricted** (or "No restrictions") if the app asks, otherwise the phone may stop the app in the background.

## 10. Firebase

The app uses Firebase for sign-in and its database.

- Team members should be added in the Firebase console under **Project settings → Users and permissions**. Give developers the **Editor** role and keep **Owner** for the team lead.
- Everyone works against the same Firebase project, so be careful when changing or deleting data. Prefer a separate test project for experiments.
- **Database rules** must be published in the Firebase console (**Realtime Database → Rules → Publish**). The current rules, including the `studentRadius` node used for per-student range, are in `docs/firebase-rules-update.md`. Without them, faculty cannot save a student's range.
- Data used by the app: `admins`, `users`, `telemetry/{uid}` (location and SOS), `rollIndex`, `config/safety` (default radius and timing) and `studentRadius/{uid}` (per-student range).
- **2-Step Verification:** Google asks Firebase and Cloud console accounts to turn on 2-Step Verification. Turn it on for every team member who signs in to the Firebase console.
- Firebase Dynamic Links shutting down does not affect this app, because it does not use them.

## 11. Android permissions and location

The app needs these permissions in `android/app/src/main/AndroidManifest.xml`. They go inside `<manifest>`, outside `<application>`:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
```

The shake service, the faculty alert watcher (`AdminWatchService`) and the alert screen (`AlertActivity`) are declared inside `<application>`. The shake service looks like this:

```xml
<service android:name=".ShakeSosService"
         android:exported="false"
         android:foregroundServiceType="specialUse">
    <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
              android:value="Shake gesture detection for SOS" />
</service>
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
- An Android app **cannot switch the phone's GPS on silently**. It can only show the system pop-up asking the user to turn location on (or open the Location settings if that pop-up is unavailable).
- On Android 11 and newer, **"Allow all the time"** cannot be granted from a pop-up. The app opens the settings page and the user picks it there.
- If the permission prompt never appears, uninstall the app, install the fresh APK, and check the manifest permissions above.
- If a user denied permission twice, Android will not show the pop-up again. They must enable it at **Settings → Apps → JNTU-GV Outing → Permissions → Location → Allow all the time**.

## 12. App icon and logo

- Source artwork: `public/app-icon.png` (used on the welcome screen and the landing page), `public/favicon.png` and `public/icon-192.png` (browser icons).
- The Android launcher icon is an **adaptive icon**. Its files are in `android/app/src/main/res/`:
  - `mipmap-*/ic_launcher_foreground.png`, the foreground layer (keep the artwork inside the central safe zone)
  - `mipmap-*/ic_launcher.webp` and `ic_launcher_round.webp`, the icons for older Android versions
  - `values/ic_launcher_background.xml`, the background color (`#041536`)
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
2. **Add the libraries:** Firebase, lucide-react, Tailwind CSS, and the Capacitor packages:
   ```bash
   npm install firebase lucide-react
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npm install @capacitor/local-notifications @capacitor/device
   npm install @capacitor-community/background-geolocation
   npm install leaflet@1.9.4
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
| **Gradle sync fails** | Check your internet connection. Then see the next two rows. Use **File → Invalidate Caches → Invalidate and Restart** and sync again. Make sure Android Studio's SDK is installed. |
| **Sync error mentioning `InternalProblems`, "removed in Gradle 9.6.0", or Gradle 9.x** | Android Studio is using a newer Gradle than the project. Go to **File → Settings → Build, Execution, Deployment → Build Tools → Gradle**, set **Distribution** to **Wrapper**, click Apply and OK, then **File → Sync Project with Gradle Files**. Do not accept "Upgrade Gradle" or "Upgrade Android Gradle Plugin" pop-ups. |
| **Error "Unsupported class file major version 69"** | Gradle is running on Java 25, which is too new. In the same Gradle settings page set **Gradle JDK** to **jbr-21** (Embedded JDK), then sync again. |
| **VS Code shows many Gradle errors** | The VS Code "Gradle for Java" extension tries to import the Android project. They are harmless. Disable the extension for this workspace, or add `"java.import.gradle.enabled": false` to the workspace settings. Build only in Android Studio. |
| **Build error: `resource drawable/ic_launcher_foreground not found`** | `ic_launcher.xml` and `ic_launcher_round.xml` must reference `@mipmap/ic_launcher_foreground` (see section 12). |
| **Phone still shows the old version or icon** | The new APK was not installed. Check **App info → Version**. Raise `versionCode`, rebuild, uninstall the old app, and install the new APK. |
| **Changes in `src/` do not appear in the app** | Run `npm run build` then `npx cap sync android` before building. |
| **Location prompt does not appear / "open settings and allow location"** | Add the manifest permissions in section 11, rebuild, reinstall, and grant location in the phone's app settings. |
| **Shake SOS does not work when the phone is locked** | Set location to **Allow all the time** and battery use to **Unrestricted** for the app. On Xiaomi, Oppo, Vivo, Realme and Samsung also allow **Autostart** or "Run in background". Use **Test shake** in the app to check sensitivity. |
| **Faculty do not get alerts when the app is closed** | In the faculty portal, turn on **Alerts when the app is closed** and tap **Send a test alert**. If the test does not appear on the lock screen, fix the yellow warnings in that card: allow notifications, turn on full-screen alerts, and set battery use to Unrestricted. On Xiaomi, Oppo, Vivo, Realme and Samsung also allow Autostart. Publish the `.indexOn` rule from `docs/firebase-rules-update.md`. |
| **Everyone is reported as "not back" after 6 PM** | Open Settings → Return to hostel and tap **Use my current location as the hostel** while standing at the hostel, then Save. The default hostel point is the campus centre. |
| **Build error: cannot find module `leaflet`** | Run `npm install leaflet@1.9.4` in the project folder, then `npm run build` again. |
| **Map is grey / no map pictures** | The map pictures come from OpenStreetMap and need internet. The pins still show without them. |
| **Map shows pins but no path** | Publish the `trail` rules from `docs/firebase-rules-update.md`. Paths exist only for students who are on an outing with version 1.7 or newer. |
| **Faculty cannot send messages ("Could not send")** | Publish the `inbox` rules from `docs/firebase-rules-update.md` (section 10). |
| **Update pop-up does not appear** | The phone needs internet. `version.json` on GitHub must have a `versionCode` higher than the installed one, and must be pushed to the `main` branch. GitHub can take up to 5 minutes to show a new version of the file. The pop-up shows only in the Android app, and only from version 1.6 onward. |
| **Faculty cannot save a student's range** | The Firebase rules were not published. Publish the rules from `docs/firebase-rules-update.md` (section 10). |
| **Drive link says "request access"** | Set **General access** to **Anyone with the link** (section 9). |
| **Update will not install over the old app** | The APK must be signed with the **same keystore** and have a **higher versionCode**. |
| **`git push` is rejected (non-fast-forward)** | Commit your changes first (`git add .` then `git commit -m "..."`), then run `git pull origin main --no-edit`, fix any conflicts, and push again. Use `--allow-unrelated-histories` only the very first time. |
| **`git pull` says "Your local changes would be overwritten"** | Commit or stash your changes first, then pull. |
| **Conflict where `Readme.md` was deleted** | Windows treats `README.md` and `Readme.md` as the same name. Use `git rm --cached Readme.md` so your file is not deleted. |
| **`Filename too long` when running `git add`** | `node_modules/` is not being ignored. Check `.gitignore` is saved in UTF-8 and contains `node_modules/`. |
| **LF will be replaced by CRLF warnings** | Harmless on Windows. You can ignore them. |

## 15. Team rules

- Never commit the keystore, passwords, `.env`, or any API secrets. The repository is public.
- Never push straight to `main`. Use a branch and a Pull Request.
- Run `git pull` before you start working each day.
- Run `npm run build` before opening a Pull Request, to make sure it still compiles.
- Only the release manager changes `versionCode` and `versionName` and builds the release APK.
- Keep the keystore in two safe places (for example a password manager and a private backup). If it is lost, existing users cannot receive updates.
- Ask in the team group before deleting or changing shared Firebase data.
- Keep only one README file, named `README.md`.

## 16. What is new in version 1.2

- **New app icon** made from the supplied artwork. It works with round, squircle and square launcher shapes.
- **Default range of 15 km** for every student.
- **Per-student range:** on each student card, faculty can open the range editor, type a value or tap a quick value (5, 10, 15, 25, 50 km), and **Save**. **Reset to default** removes the custom range. The allowed values are 0.5 to 200 km. The value is stored in Firebase at `studentRadius/{uid}`, and the student's own app uses it too.
- **Shake-to-SOS** (see below).
- **Permissions asked as pop-ups when the app opens** (see below).

## 17. What is new in version 1.3

Version 1.3 (`versionCode 4`) adds the look-and-feel update on top of 1.2:

- **Welcome screen** every time the app opens: "Welcome to the JNTU-GV Tracking App", with the app icon, animated rings and a loading bar. Tap to skip.
- **Transitions everywhere:** every button, link and switch has a smooth hover and press effect. Screens fade in, cards rise in one after another, modals pop in, and toasts slide up. Animations switch off automatically for people who turned on "reduce motion" on their phone.
- **Friendly greetings:** the student portal says "Welcome, <first name>. Stay safe on your outing." and the faculty portal has a welcome line.

### How shake-to-SOS works
1. The student starts an outing. The app starts a **foreground service** (a notification stays in the status bar). It reads the phone's motion sensor and keeps a wake lock, so it keeps working with the screen off.
2. A firm back-and-forth shake (3 to 5 swings depending on the sensitivity setting, 4 at the default Medium) starts a **5-second countdown** with vibration and a notification with **Cancel** and **I'm safe** buttons.
3. If nobody cancels, the native code writes the SOS directly to Firebase (`telemetry/{uid}/sos`) using the student's sign-in, so it works even if the web view is asleep.
4. Faculty see the SOS live. After an SOS, the gesture can fire again once it has been cleared.
5. The student can switch shake SOS off, change the sensitivity (Low, Medium, High) and use **Test shake** (no SOS is sent) from the card on the student portal.

### Permission pop-ups
When the Android app opens, `PermissionGate` asks, one after another: precise location, notifications, background location ("Allow all the time"), the device location (GPS) switch, and unrestricted battery use. If a permission is already granted the screen is skipped. If the system will not show a pop-up again, the app offers an **Open settings** button. Students must allow the required permissions, and faculty can continue without them.

### Release notes for the release manager
- Bump to `versionCode 4`, `versionName "1.3"` (already done in this repo).
- Publish the Firebase rules from `docs/firebase-rules-update.md` before sharing the APK.
- Test the locked-screen shake on at least two different phone brands before sending the APK to the group.

## 18. What is new in version 1.4

Version 1.4 (`versionCode 5`) adds SOS push alerts and the evening return rule.

### Full-screen alerts for faculty
- Each alert shows the **student's name, roll number, phone number, distance from the hostel and location** (with a Call button and a Map button). It is not a plain notification.
- **App open:** the alert covers the whole screen with a siren sound and vibration until faculty tap **Got it**. A small red or amber button brings it back if it is hidden.
- **App closed or phone locked:** the faculty phone runs a small background service (`AdminWatchService`). Every 10 seconds it asks Firebase if any student has an active SOS. When one appears, Android shows the same alert over the lock screen (`AlertActivity`) with an alarm sound.
- Turn this on or off with **Alerts when the app is closed** in the faculty portal. **Send a test alert** shows a fake SOS after 10 seconds, so you can lock the phone and see the real screen.
- This needs no paid Firebase plan and no server. The faculty phone must stay switched on, with internet, signed in, and with battery use set to Unrestricted. If a faculty member signs out or force-stops the app, alerts stop on that phone.

### Return rule
- Settings has a new section, **Return to hostel (evening alert)**: return time (default 6:00 PM), allowed distance from the hostel (default 200 m), and the hostel location. Tap **Use my current location as the hostel** while standing at the hostel.
- After the return time, a student **within 200 m of the hostel may stay**. Every other student who has not been marked "reached hostel" is reported to faculty: one alert per student per day. Students with no location at all are reported too, as "Location unknown".
- If a student comes back within the allowed distance or is marked as reached, their late alert disappears.
- Students see a notice in their app: a reminder up to 30 minutes before the return time, a red warning when they are late, and a green message when they are back. They also get a phone notification.
- If a student has an active SOS, only the SOS alert is shown for that student.

### Limits you should know
- Alerts use the last location the student's phone sent. If a student's phone is switched off after they left, faculty still get the alert, with "last seen" time, because the last known position is used.
- The same alert may show once on the app screen and once as a phone alert if the faculty member moves the app to the background right after. Tap **Dismiss** on one of them.
- A faculty phone that is restarted must open the app once to start the watcher again.

### Release notes for the release manager
- Version is `versionCode 5`, `versionName "1.4"`.
- Publish the `.indexOn` rule from `docs/firebase-rules-update.md`.
- After installing, open Settings in the faculty portal and set the hostel location and return time, then use **Send a test alert** on every faculty phone.

## 19. What is new in version 1.5

Version 1.5 (`versionCode 6`) makes shake SOS easier and adds the hostel roll call.

### Easier shake SOS
- The default (Medium) now needs a firm shake of about **4 swings** (before: a very hard shake of 5). Strength needed went down by about 40 percent.
- Low: 5 swings, strong shake. Medium: 4 swings. High: 3 swings, light shake.
- Walking, running and a single bump or drop are still ignored. If it triggers while walking or running, choose **Low** in the Shake to send SOS card. If it is hard to trigger, choose **High**.
- A false trigger is harmless: the 5-second countdown can be cancelled.

### Hostel roll call (faculty)
- A summary bar at the top of the faculty portal shows "42 of 48 back at the hostel" with the names of those still out.
- When a student stays within the allowed distance of the hostel (Settings, default 200 m) for **3 minutes** with a live signal, they appear in **Arrived at the hostel**. Faculty can untick anyone, then tap **Mark N as reached**. This uses the existing "reached hostel" action, so tracking stops for them.
- Students with an active SOS, a lost signal, or who walk out again never count as arrived.
- The 3-minute timer runs while the faculty portal is open. If you open the portal at 6 PM, students already at the hostel appear 3 minutes later.
- Students see "You are at the hostel. Your coordinator will confirm your arrival."

### Release notes for the release manager
- Version is `versionCode 6`, `versionName "1.5"`.
- No Firebase rule changes are needed for this version.

## 20. What is new in version 1.6

Version 1.6 (`versionCode 7`) adds call-back messages and the update pop-up.

### Call-back messages with read receipts
- In the faculty portal tap **Message**. Choose **Still out**, **Everyone** or **Pick students**, tap a quick message or type your own (up to 200 characters), then **Send**.
- On the student's phone it appears as a **full-screen message** with an alarm sound until they tap **Got it**. With the app open it shows inside the app. With the app closed or the phone locked it arrives through a small background service that runs during an outing, within about 15 seconds.
- **Recent messages** in the same window shows "seen 4/6" and the names of students who have not seen it. After 2 minutes unseen, the message is highlighted red and the **Message** button shows a red number, so you know whom to phone.
- Messages older than 24 hours are ignored.
- Needs the `inbox` Firebase rules in `docs/firebase-rules-update.md`.

### New version pop-up
- When the Android app opens, it reads `version.json` from this repository (`https://raw.githubusercontent.com/Rahul21-art/GeoGaurd/main/version.json`) and compares it with the installed version.
- If `versionCode` in `version.json` is **higher** than the installed one, a pop-up shows the version name, the notes and a **Download** button that opens the Google Drive link. **Later** closes it until the next time the app opens.
- If the phone already has that version or a newer one, no pop-up is shown.
- The download link must point to Google Drive, Google Docs or GitHub. Any other site is ignored and the default Drive link is used.
- Phones that still have version 1.5 or older do not have this feature. They must install 1.6 once by hand. From 1.6 onward, updates are announced automatically.

### Releasing an update (every time)
1. Raise `versionCode` and `versionName` in `android/app/build.gradle`, build the signed APK.
2. Upload it to Google Drive using **Manage versions → Upload new version** on the existing file, so the download link stays the same.
3. Edit `version.json` in the repository root: set `versionCode` and `versionName` to the new numbers (they must match `build.gradle`), and change `notes`. Keep `downloadUrl` as it is.
   ```json
   {
     "versionCode": 8,
     "versionName": "1.7",
     "downloadUrl": "https://drive.google.com/file/d/1E5gWIM-2mzJvHZliGaPMVjTTyAmaThSk/view?usp=sharing",
     "notes": ["What is new in this version"],
     "force": false
   }
   ```
4. Commit and push `version.json` to `main`. Phones that open the app after that (within about 5 minutes) show the pop-up.
5. Set `"force": true` to hide the **Later** button (use only for important fixes).

Do not change `version.json` to a higher number before the new APK is on Drive, or users will download the old file.

### Release notes for the release manager
- Version is `versionCode 7`, `versionName "1.6"`. The included `version.json` already says 7 and 1.6, so nobody sees the pop-up until you release 1.7.
- Publish the `inbox` rules from `docs/firebase-rules-update.md`.
- Test: send a message to a student phone with the app closed and the screen locked.

## 21. What is new in version 1.7

Version 1.7 (`versionCode 8`) adds the faculty live map.

### Live map
- In the faculty portal tap **Map**. You see the hostel (blue **H**, with a green circle for the allowed hostel distance), the safe radius (dashed blue circle) and a pin for every active student.
- Pin colours: green = safe, orange = out of range, red = SOS (bigger), grey = no signal. The top bar counts each kind.
- Tap a pin to see name, roll number, distance, last seen and battery, with **Call** and **Zoom to student**.
- **Problems** zooms to every student who is out of range, in SOS or without signal. **Fit all** shows everyone. Students with no location yet are counted in the corner.
- **Path:** when you select a student, the last hour of their route is drawn as a blue line (dark dot = oldest point, blue dot = newest, tap a dot for its time). If a phone dies, you can see where it was heading and where it was last seen. The path refreshes every minute.
- The student's phone saves one point per minute and deletes points older than 3 hours. This adds only a very small amount of data.
- Map pictures come from OpenStreetMap (free) and need internet on the faculty phone.

### New dependency
Run `npm install leaflet@1.9.4` once in the project folder before `npm run build`.

### Release notes for the release manager
- Version is `versionCode 8`, `versionName "1.7"`.
- Publish the `trail` rules from `docs/firebase-rules-update.md`.
- After the new APK is on Google Drive, edit `version.json` to `"versionCode": 8` and `"versionName": "1.7"` and push it, so phones show the update pop-up (see section 20).

---

Maintained by the JNTU-GV Outing team.

## 22. What is new in version 1.8: Smart Safety Mode

**For the faculty app**
- **Safety Radar** card on the dashboard. Every active student gets a risk score from 0 to 100 and a level: Low (green), Watch (yellow, 25 or more), High (red, 55 or more). Tap a student to see each reason with its points, the predicted arrival, and Call / Map buttons.
- A **Risk badge** appears on the student card for Watch and High students.
- **Predicted late**: from the student's distance, walking or vehicle speed and the return time, the app says whether they will reach the hostel in time, and how late.

**What the score looks at**

| Signal | Source |
|---|---|
| Time left against the time needed to get back | location, return time |
| Moving away from the hostel near the return time | last 8 minutes of positions |
| Low battery and fast battery drain | battery readings |
| Phone went silent with plenty of battery (probably switched off or airplane mode) | last update age and last battery |
| GPS off, slow updates, rough accuracy | telemetry |
| Standing still far from the hostel for 10 minutes or more | position history |
| Outside the permitted radius | existing zone check |
| Isolated area now, or an isolated area ahead on the route | OpenStreetMap building / shop count within 300 m |
| After sunset (computed from the position and date) | no internet needed |
| Alone, or with other students within 100 m (lowers the score) | other students' positions |

A phone that goes silent with a nearly empty battery is scored lower than one that goes silent with plenty of charge, because the first one most likely ran out of power.

**For the student app**
- **Leave-by reminder**: when a student is within 3 km, the app shows "The walk back is about 18 min. Start by 5:25 PM." and sends a notification when it is time to leave.

**Good to know**
- The isolated-area check uses the free Overpass API of OpenStreetMap. Only a map position is sent. If it is unreachable the check is skipped and the rest still works.
- Speed, direction and stopping time need a few minutes of history, which the faculty app collects while it is open. The score is calculated while the faculty app is open. The lock-screen alerts of version 1.4 still work when the app is closed.
- The score is a guide for deciding whom to call first. It is not a replacement for SOS.
- No new Firebase rules are needed.
