# JNTU-GV Outing (GeoGaurd)

An outing safety app for JNTU-GV students. It is built as a web app (React) and packaged as an Android app (Capacitor), with Firebase as the backend.

| | |
|---|---|
| App name | JNTU-GV Outing (shown inside the app as "JNTU-GV Tracking App") |
| Android package ID | `com.jntugv.outing` |
| Repository | https://github.com/Rahul21-art/GeoGaurd |
| Current version | `versionName 1.3`, `versionCode 4` (see `android/app/build.gradle`) |

## Main features
- **Live location sharing**: students share their location during an outing, even when the screen is locked.
- **Safe-zone alerts**: faculty see who is inside or outside the permitted radius. The default radius is **15 km**.
- **Per-student range**: faculty can change the permitted range of any single student from that student's card.
- **Shake-to-SOS**: a hard shake starts a 5-second cancellable countdown, then sends an SOS, even when the phone is locked.
- **SOS handling**: faculty see SOS alerts live. The student can clear it with "I'm safe".
- **Permission pop-ups at app open**: location, notifications, "Allow all the time", GPS and battery permissions are asked one after another.
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

---

## 1. Tech stack

| Layer | Technology |
|---|---|
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
│           │   ├── ShakeDetector.java        Shake detection algorithm
│           │   └── SosSender.java            Sends the SOS to Firebase from native code
│           └── res/                          Icons, splash screens, strings
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
9. Commit the version change and push it (the APK itself is not committed):
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
```

The shake service is declared inside `<application>`:

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
2. A hard back-and-forth shake (4 to 6 swings depending on the sensitivity setting) starts a **5-second countdown** with vibration and a notification with **Cancel** and **I'm safe** buttons.
3. If nobody cancels, the native code writes the SOS directly to Firebase (`telemetry/{uid}/sos`) using the student's sign-in, so it works even if the web view is asleep.
4. Faculty see the SOS live. After an SOS, the gesture can fire again once it has been cleared.
5. The student can switch shake SOS off, change the sensitivity (Low, Medium, High) and use **Test shake** (no SOS is sent) from the card on the student portal.

### Permission pop-ups
When the Android app opens, `PermissionGate` asks, one after another: precise location, notifications, background location ("Allow all the time"), the device location (GPS) switch, and unrestricted battery use. If a permission is already granted the screen is skipped. If the system will not show a pop-up again, the app offers an **Open settings** button. Students must allow the required permissions, and faculty can continue without them.

### Release notes for the release manager
- Bump to `versionCode 4`, `versionName "1.3"` (already done in this repo).
- Publish the Firebase rules from `docs/firebase-rules-update.md` before sharing the APK.
- Test the locked-screen shake on at least two different phone brands before sending the APK to the group.

---

Maintained by the JNTU-GV Outing team.
