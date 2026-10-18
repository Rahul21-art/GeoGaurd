# Part 2 — Phone B: Student App

> Prove that tracker data can travel from the BLE simulator on Phone A to the Student App on Phone B over Bluetooth Low Energy.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Scope](#2-scope)
3. [Technology and Project Structure](#3-technology-and-project-structure)
4. [BLE Design](#4-ble-design)
5. [App Behaviour](#5-app-behaviour)
6. [Data Handling](#6-data-handling)
7. [Error Handling](#7-error-handling)
8. [Testing](#8-testing)
9. [Architecture](#9-architecture)
10. [Definition of Done](#10-definition-of-done)
11. [Transition to Part 3](#11-transition-to-part-3)

---

# 1. Overview

## 1.1 Purpose

Phone B is the student's mobile phone. The **Student App** on Phone B connects to the BLE simulator running on Phone A (built in Part 1).

```
Phone A
BLE Simulator
      │
      │ Bluetooth BLE
      ▼
Phone B
Student App
```

## 1.2 What the Student App Does

1. Scans for the BLE device.
2. Finds `STUDENT_TRACKER_001`.
3. Connects to the device.
4. Discovers the BLE service.
5. Discovers the BLE characteristic.
6. Subscribes to characteristic notifications.
7. Receives tracker data.
8. Decodes the received data.
9. Displays the latest tracker information.

## 1.3 First Test Data

Phone A (device name from Part 1: `STUDENT_001`) sends:

| Field | Value |
|---|---|
| ID | `ST001` |
| Latitude | `18.1065` |
| Longitude | `83.3955` |
| SOS | `OFF` |
| Battery | `87%` |

## 1.4 Goal

Phone B must receive this information through Bluetooth and display:

```
Student: ST001

Location:
18.1065, 83.3955

Battery:
87%

SOS:
OFF

Bluetooth:
Connected
```

When this works, **Part 2 is complete.**

---

# 2. Scope

> [!IMPORTANT]
> Part 2 deals **only** with Bluetooth communication. The sole objective is: **BLE Simulator → Student App**.

Do **not** implement the following yet. They belong to later parts.

| Out of scope | Out of scope |
|---|---|
| ❌ Backend | ❌ Push notifications |
| ❌ Database | ❌ GPS hardware |
| ❌ Faculty App | ❌ ESP32 hardware |
| ❌ Internet communication | ❌ SIM card |
| ❌ 15 km boundary | ❌ GSM |
| ❌ Geofencing | ❌ Faculty alerts |

---

# 3. Technology and Project Structure

## 3.1 Recommended Technology

| Item | Choice |
|---|---|
| Framework | React Native |
| BLE library | `react-native-ble-plx` |
| Platform | Android (native-capable development/build workflow) |

> [!WARNING]
> Do not build the Student App as a normal browser-only website. Reliable BLE scanning, connection and notification handling require native Bluetooth access.

## 3.2 Project Structure

Keep the Student App separate from the BLE simulator.

```
project-root/
│
├── docs/
│   ├── ble-simulator.md
│   └── student-app.md
│
├── ble-simulator/
│   └── ...
│
└── student-app/
    ├── app/
    ├── assets/
    ├── components/
    ├── services/
    ├── package.json
    └── ...
```

The Student App code belongs inside `student-app/`.

> [!NOTE]
> Do not manually create `node_modules`. The package manager creates it automatically when dependencies are installed.

---

# 4. BLE Design

## 4.1 BLE Roles

| Phone | Role |
|---|---|
| Phone A | BLE **Peripheral** / advertiser |
| Phone B | BLE **Central** / scanner |

Phone B scans for Phone A and connects to it after finding the correct device. Phone A then sends data using characteristic notifications.

```
Phone A (BLE Peripheral)
      │
      │ BLE
      ▼
Phone B (BLE Central)
```

## 4.2 Device Identification

The Student App must search specifically for:

```
STUDENT_TRACKER_001
```

It must **not** connect to unrelated nearby BLE devices.

```
Start Scan
     ↓
BLE Device Found
     ↓
Check Device Name
     ↓
STUDENT_TRACKER_001?
     │
     ├── No  → Ignore
     │
     └── Yes → Connect
```

## 4.3 Service and Characteristic

The Student App must use the **same Service UUID and Characteristic UUID configured in Part 1**. Do not create different UUIDs for Part 2. The actual values must be copied from the working Part 1 implementation.

```
Phone A (BLE Simulator)
     │
     ├── Service UUID
     │
     └── Characteristic UUID
              │
              ▼
Phone B (Student App)
```

The characteristic must support **Notify**. The Student App subscribes to notifications from it.

## 4.4 Notifications

```
Phone A (BLE Simulator)
      │
      │ Notification
      ▼
Phone B (Student App)
```

Whenever Phone A sends updated information, Phone B receives it automatically. The app does not need to repeatedly request the data.

---

# 5. App Behaviour

## 5.1 Startup Screen

When the app opens, show a simple screen. The app must not assume the device is already connected.

```
--------------------------------
        STUDENT TRACKER
--------------------------------

Bluetooth Status

Disconnected

Device

Not Connected

--------------------------------

[ Scan & Connect ]

--------------------------------
```

## 5.2 Bluetooth Permissions

The app must request the Android Bluetooth permissions required for the device's Android version. For newer Android versions these include:

- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`

Depending on the Android version and implementation, additional permission handling may be required. The app should clearly explain why permission is needed, and request only the permissions it requires.

```
Bluetooth permission is required to
find and connect to the student tracker.
```

## 5.3 Bluetooth Disabled

If Bluetooth is turned off, show the message below. The user must then be able to retry.

```
Bluetooth is turned off.

Please enable Bluetooth and try again.
```

## 5.4 Scanning

When the user presses **[ Scan & Connect ]**, the app starts a BLE scan.

```
Start Scan
     ↓
BLE Device Discovered
     ↓
Check Device Name
     ↓
STUDENT_TRACKER_001?
     │
     ├── No  → Ignore Device
     │
     └── Yes → Stop Scan → Connect
```

Stop scanning before connecting. When the device is found, display:

```
Device Found

STUDENT_TRACKER_001

Connecting...
```

## 5.5 Status States

Displaying the current state makes the app easier to test and demonstrate.

| State | Meaning |
|---|---|
| `Scanning...` | BLE scan in progress |
| `Device Found` | Target device discovered |
| `Connecting...` | Connection being established |
| `Connected` | Connected to the device |
| `Disconnected` | Connection lost or closed |
| `Device Not Found` | Scan finished without finding the device |
| `Bluetooth Permission Required` | Permission missing or denied |

## 5.6 Connect and Discover

The app must not assume services and characteristics are immediately available. They are discovered **after** the connection is established.

```
Connect
   ↓
Discover All Services
   ↓
Discover All Characteristics
   ↓
Find Service UUID (from Part 1)
   ↓
Find Characteristic UUID (from Part 1)
   ↓
Subscribe to Notifications
```

## 5.7 Connection Button

| Situation | Button / indicator |
|---|---|
| Before connecting | `[ Scan & Connect ]` |
| During scanning | `[ Scanning... ]` |
| After successful connection | `🟢 Connected` and `[ Disconnect ]` |
| After disconnection | `[ Reconnect ]` |

## 5.8 Main Screen (First Version)

The first version should be simple. Its purpose is to prove the Bluetooth data is received correctly.

```
--------------------------------
        STUDENT TRACKER
--------------------------------

BLE DEVICE

STUDENT_TRACKER_001

Status:
🟢 Connected

--------------------------------

STUDENT

ST001

--------------------------------

LOCATION

18.1065, 83.3955

--------------------------------

BATTERY

87%

--------------------------------

SOS

OFF

--------------------------------

[ Disconnect ]

--------------------------------
```

---

# 6. Data Handling

## 6.1 From BLE Bytes to UI

The app receives the data as BLE bytes, which must be decoded into readable text.

```
BLE Data
   ↓
Decode
   ↓
Text
   ↓
Parse
   ↓
Student Data
   ↓
Update UI
```

> [!IMPORTANT]
> The decoding method must match the encoding used by Part 1. Do not use a different encoding without changing both sides.

## 6.2 Preferred Data Format

JSON is recommended because it can be parsed reliably.

```json
{
  "id": "ST001",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "sos": false,
  "battery": 87
}
```

```
BLE notification
       ↓
JSON string
       ↓
JSON.parse()
       ↓
Student data object
```

If Part 1 currently sends a different (text) format, Part 2 must initially support the **exact format currently being transmitted**. Both sides must use the same data format.

## 6.3 Student Data Structure

The app maintains one current data object. Do not add unnecessary backend fields at this stage.

| Field | Example |
|---|---|
| `id` | `ST001` |
| `latitude` | `18.1065` |
| `longitude` | `83.3955` |
| `sos` | `false` |
| `battery` | `87` |

## 6.4 Updating the Data

Every new BLE notification triggers the same pipeline. No manual refresh is required.

```
New Notification
       ↓
Decode
       ↓
Parse
       ↓
Validate
       ↓
Update Student Data
       ↓
Update UI
```

Example: Phone A sends `Battery: 86%`, `SOS: OFF` → Phone B changes automatically from `87%` to `86%`.

## 6.5 Field Behaviour

| Field | Behaviour |
|---|---|
| **Location** | Display as `18.1065, 83.3955`. A new location immediately replaces the old one. No 15 km boundary calculation yet. |
| **Battery** | Display the latest value as a percentage (`0–100`). A new value updates the UI automatically. |
| **SOS** | Display the latest value (`ON` / `OFF`). If Phone A sends `ON`, Phone B shows it immediately. **Do not alert faculty yet.** |

## 6.6 Data Validation

Validate received data before displaying it. Invalid data must **never crash** the application.

| Field | Rule | Example |
|---|---|---|
| Student ID | Must exist | `ST001` |
| Latitude | Must be a valid number | `18.1065` |
| Longitude | Must be a valid number | `83.3955` |
| Battery | Normally between `0` and `100` | `87` |
| SOS | Must resolve to `true` / `false` or `ON` / `OFF` | `false` |

---

# 7. Error Handling

| Error | Message to display |
|---|---|
| **Bluetooth disabled** | `Bluetooth is turned off.` <br> `Please enable Bluetooth and try again.` |
| **Permission denied** | `Bluetooth permission is required to connect to the student tracker.` |
| **Device not found** | `STUDENT_TRACKER_001 not found.` <br> `Make sure the BLE simulator is running on Phone A and try again.` |
| **Connection failed** | `Unable to connect to STUDENT_TRACKER_001.` <br> `Please try again.` |
| **Device disconnected** | `🔴 Disconnected` and a **[ Reconnect ]** button |
| **Invalid data** | `Invalid tracker data received.` The application must remain running. |

## 7.1 No Internet in Part 2

The Student App must **not** send the received data to the internet yet. There is no backend connection in this part.

```
Phone A (BLE Simulator)
      │
      │ Bluetooth
      ▼
Phone B (Student App)
```

---

# 8. Testing

## 8.1 Test Setup

Use **two physical Android phones**.

| Phone | Role |
|---|---|
| **Phone A** | Runs the BLE simulator. Advertises `STUDENT_TRACKER_001` and sends ID `ST001`, Latitude `18.1065`, Longitude `83.3955`, SOS `OFF`, Battery `87%`. |
| **Phone B** | Runs the Student App. Acts as BLE scanner + BLE central + data receiver. |

## 8.2 First Test

| Step | Action | Expected result |
|---|---|---|
| 1 | Open the BLE simulator on Phone A and make sure it is advertising `STUDENT_TRACKER_001` | Advertising |
| 2 | Open the Student App on Phone B | App opens |
| 3 | Give the required Bluetooth permissions | Permissions granted |
| 4 | Press **[ Scan & Connect ]** | Scan starts |
| 5 | — | `Scanning...` |
| 6 | The app finds `STUDENT_TRACKER_001` | Device discovered |
| 7 | — | `Device Found` → `Connecting...` |
| 8 | — | `🟢 Connected` |
| 9 | Phone A sends the first test data | Notification sent |
| 10 | Phone B displays the data | See below |

Expected display on Phone B:

```
Student: ST001

Location:
18.1065, 83.3955

Battery:
87%

SOS:
OFF
```

## 8.3 Success Condition

Part 2 is complete **only when** Phone A → Phone B communication works reliably and the values displayed on Phone B match the values transmitted by Phone A.

```
Phone A sends:                      Phone B displays:

ID: ST001                           Student: ST001
Latitude: 18.1065        ── BLE ──▶ Location: 18.1065, 83.3955
Longitude: 83.3955                  Battery: 87%
SOS: OFF                            SOS: OFF
Battery: 87%
```

## 8.4 Reconnection Test

After the first successful connection:

1. Disconnect the BLE simulator.
2. Confirm that Phone B shows `🔴 Disconnected`.
3. Start the BLE simulator again.
4. Press **[ Reconnect ]**.
5. Confirm that the Student App connects again.

This must work before Part 2 is considered complete.

## 8.5 Live Data Test

After connecting, change the values transmitted by Phone A. The Student App must update automatically.

| Change on Phone A | Expected on Phone B |
|---|---|
| Battery → `86%` | Battery: `86%` |
| SOS → `ON` | SOS: `ON` |
| Location changed | New coordinates displayed |

This proves the BLE notification system works continuously.

---

# 9. Architecture

```
┌──────────────────────────────┐
│           PHONE A            │
│                              │
│       BLE SIMULATOR          │
│                              │
│  Device:                     │
│  STUDENT_TRACKER_001         │
│                              │
│  ID: ST001                   │
│  Latitude: 18.1065           │
│  Longitude: 83.3955          │
│  SOS: OFF                    │
│  Battery: 87%                │
└──────────────┬───────────────┘
               │
               │ Bluetooth BLE
               │ Notifications
               ▼
┌──────────────────────────────┐
│           PHONE B            │
│                              │
│        STUDENT APP           │
│                              │
│  Scan                        │
│     ↓                        │
│  Find Device                 │
│     ↓                        │
│  Connect                     │
│     ↓                        │
│  Discover Service            │
│     ↓                        │
│  Discover Characteristic     │
│     ↓                        │
│  Subscribe to Notify         │
│     ↓                        │
│  Receive Data                │
│     ↓                        │
│  Decode Data                 │
│     ↓                        │
│  Display Data                │
└──────────────────────────────┘
```

---

# 10. Definition of Done

Part 2 is complete when **all** of the following work:

- [ ] Student App runs on Phone B
- [ ] Bluetooth permissions work
- [ ] Bluetooth scanning works
- [ ] `STUDENT_TRACKER_001` is discovered
- [ ] The correct device is selected
- [ ] Connection works
- [ ] BLE services are discovered
- [ ] Correct characteristic is discovered
- [ ] Notification subscription works
- [ ] Phone B receives BLE data
- [ ] BLE data is decoded correctly
- [ ] Student ID is displayed
- [ ] Latitude is displayed
- [ ] Longitude is displayed
- [ ] Battery is displayed
- [ ] SOS status is displayed
- [ ] Data updates automatically
- [ ] Disconnect is detected
- [ ] Reconnection works
- [ ] Invalid data does not crash the app
- [ ] No backend is used yet
- [ ] No 15 km calculation is used yet
- [ ] No faculty alert is used yet

---

# 11. Transition to Part 3

Begin Part 3 **only after** Part 2 works completely.

**Current system (Part 2):**

```
Phone A (BLE Simulator)
      │
      │ Bluetooth
      ▼
Phone B (Student App)
```

**Part 3 adds the internet/backend layer:**

```
Phone A (BLE Simulator)
      │
      │ Bluetooth
      ▼
Phone B (Student App)
      │
      │ Internet
      ▼
Backend
```

The backend will later store:

- Student ID
- Latitude
- Longitude
- SOS
- Battery
- Last Updated Time

> [!CAUTION]
> Part 3 must not be implemented until the Phone A → Phone B BLE communication is working reliably.
