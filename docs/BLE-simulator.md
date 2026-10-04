# BLE Simulator — Part 1

> Simulate a GPS + ESP32 student tracker end to end, before any hardware exists.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Stage 1 — ESP Simulator Website](#2-stage-1--esp-simulator-website)
3. [Test the ESP Simulator (Before BLE)](#3-test-the-esp-simulator-before-ble)
4. [Stage 2 — BLE Simulator](#4-stage-2--ble-simulator)
5. [Test BLE From the Student Phone](#5-test-ble-from-the-student-phone)
6. [End-to-End Tests](#6-end-to-end-tests)
7. [Final Flow](#7-final-flow)
8. [Completion Checklist](#8-completion-checklist)

---

# 1. Overview

## 1.1 Goal

In Part 1 we first build the **ESP Simulator website**. It behaves like a control panel for a future ESP32 tracker.

Once the website works correctly, its generated tracker data is carried into a **BLE simulator on Phone A**, which transmits it over Bluetooth Low Energy to a student phone.

### Demo flow

```
ESP Simulator Website
        ↓
   Tracker Data
        ↓
BLE Simulator — Phone A
        ↓
  Bluetooth / BLE
        ↓
    Student Phone
```

### Production flow (later)

The BLE simulator will be replaced by real hardware:

```
GPS
 ↓
ESP32
 ↓
Bluetooth / BLE
 ↓
Student Phone
```

## 1.2 Why a Simulator?

The simulator lets us test the complete software flow without waiting for the GPS + ESP32 hardware.

| Simulator action | What it simulates |
|---|---|
| Latitude `18.1065` → `18.1100`, Longitude `83.3955` → `83.4000` | The student moves to a different location |
| SOS `OFF` → `ON` | The student presses the SOS button |
| Battery `87` → `85` | The tracker battery decreases |

## 1.3 Fixed Contract

> [!IMPORTANT]
> The following are **fixed** and must not change. The real ESP32 will use exactly the same values.

| Item | Value |
|---|---|
| BLE Service UUID | `12345678-1234-1234-1234-123456789001` |
| BLE Characteristic UUID | `12345678-1234-1234-1234-123456789002` |
| Characteristic properties | Read, Notify |
| JSON format | `id`, `lat`, `lng`, `sos`, `battery` |

---

# 2. Stage 1 — ESP Simulator Website

## 2.1 What We Are Creating

A website that simulates the data a real ESP32 tracker will eventually send. It is part of this project and is served from the project's **GitHub Pages** site.

## 2.2 Required Controls

| Control | Example value |
|---|---|
| Student ID | `ST001` |
| Latitude | `18.1065` |
| Longitude | `83.3955` |
| Battery | `87` (%) |
| SOS | `OFF` / `ON` |

The page also provides a **Generate Tracker Data** button.

## 2.3 Output

When the button is pressed, the website generates the following JSON and displays it on the page, so it can be checked and later sent to the BLE simulator:

```json
{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}
```

---

# 3. Test the ESP Simulator (Before BLE)

> [!NOTE]
> Do **not** start BLE yet. First make sure the website itself works.

> Numeric values such as `18.1100` may be displayed as `18.11` by JavaScript. This is the same number and is valid.

## 3.1 Normal Data

**Input:** Student ID `ST001` · Latitude `18.1065` · Longitude `83.3955` · Battery `87` · SOS `OFF`

```json
{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}
```

## 3.2 Location Change

**Input:** Latitude `18.1100` · Longitude `83.4000`

```json
{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": false,
  "battery": 87
}
```

## 3.3 SOS

**Input:** SOS `ON`

```json
{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": true,
  "battery": 87
}
```

## 3.4 Battery

**Input:** Battery `85`

```json
{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": true,
  "battery": 85
}
```

Once these four tests pass, move on to BLE.

---

# 4. Stage 2 — BLE Simulator

## 4.1 What We Are Creating

**Phone A** behaves like the future ESP32. It runs a BLE Peripheral / GATT server app that can create custom services and characteristics.

Suggested app: [BLE Advertiser (GATT Simulator) — Google Play](https://play.google.com/store/apps/details?id=mini.iot.bleadvertiser)

## 4.2 Install on Phone A

1. Open the Google Play link above.
2. Install **BLE Advertiser (GATT Simulator)**.
3. Open the application.
4. Allow the required Bluetooth permissions.
5. Make sure Bluetooth is enabled.

## 4.3 Create the Simulated ESP32

Create a BLE peripheral and set the device name:

```
STUDENT_001
```

This represents the tracker assigned to Student 001. Future students can use `STUDENT_002`, `STUDENT_003`, `STUDENT_004`, and so on.

## 4.4 Create the BLE Service

Create **one** custom service with this exact UUID:

```
12345678-1234-1234-1234-123456789001
```

> [!WARNING]
> Do not change this UUID.

## 4.5 Create the BLE Characteristic

Inside the service, create **one** characteristic with this exact UUID:

```
12345678-1234-1234-1234-123456789002
```

Enable:

- ✅ Read
- ✅ Notify

This characteristic carries the tracker JSON.

## 4.6 Put the Simulator Data Into BLE

Initially, the JSON is copied manually:

1. Generate the JSON on the ESP Simulator website.
2. Copy the JSON.
3. Paste it into the BLE simulator's characteristic value.
4. Start BLE advertising.

Phone A is now acting as:

```
ESP32 Tracker
      |
      v
 STUDENT_001
```

## 4.7 Why Copy the Data Manually?

The first goal is to **prove that BLE communication works**. Manual copying is the simplest and safest way to test it:

```
ESP Simulator Website → Generate JSON → Copy JSON → BLE Simulator → BLE → Student Phone
```

Do not automate website → BLE until basic BLE communication works. Afterwards, we can investigate whether the BLE simulator provides an API or another method that lets the website control it automatically.

---

# 5. Test BLE From the Student Phone

## 5.1 Install nRF Connect on Phone B

Phone B uses a BLE testing application: [nRF Connect for Mobile — Nordic Semiconductor](https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-mobile).

## 5.2 Discover and Connect

1. Open nRF Connect and scan for nearby BLE devices.
2. Phone B should find `STUDENT_001`.
3. Connect to it.

## 5.3 Find the Service and Characteristic

1. Find the service `12345678-1234-1234-1234-123456789001` and open it.
2. Inside it, find the characteristic `12345678-1234-1234-1234-123456789002`. This is the tracker-data characteristic.

## 5.4 Test Read

Use the **Read** option on the characteristic. Phone B should receive:

```json
{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}
```

If this works, the basic BLE connection is working.

## 5.5 Test Notify

Enable notifications for the characteristic. The option may be labelled **Notify**, **Enable Notifications**, or **Subscribe**.

After enabling notifications, Phone B automatically receives the changes sent by Phone A.

---

# 6. End-to-End Tests

Each test follows the same loop: **change the value on the website → generate JSON → copy it into the BLE simulator on Phone A → send/update the characteristic with Notify enabled → verify on Phone B.**

## 6.1 Location Update

Change Latitude `18.1065` → `18.1100` and Longitude `83.3955` → `83.4000`.

```json
{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": false,
  "battery": 87
}
```

**Expected on Phone B:** the new location is received automatically.

## 6.2 SOS Update

Change SOS `OFF` → `ON`.

```json
{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": true,
  "battery": 87
}
```

**Expected on Phone B:** `sos = true`.

## 6.3 Battery Update

Change Battery `87` → `85`.

```json
{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": true,
  "battery": 85
}
```

**Expected on Phone B:** the updated battery value.

---

# 7. Final Flow

Once everything works, the complete simulator flow is:

```
┌─────────────────────────┐
│ ESP SIMULATOR WEBSITE   │
│                         │
│ Student ID              │
│ Latitude                │
│ Longitude               │
│ Battery                 │
│ SOS                     │
└────────────┬────────────┘
             │
             │ Generate JSON
             ▼
┌─────────────────────────┐
│ BLE SIMULATOR           │
│ Phone A                 │
│                         │
│ Device: STUDENT_001     │
└────────────┬────────────┘
             │
             │ Bluetooth / BLE
             ▼
┌─────────────────────────┐
│ PHONE B                 │
│ Student App / BLE Test  │
└─────────────────────────┘
```

Later, the BLE simulator is replaced by:

```
GPS → ESP32 → Bluetooth / BLE → Student Phone
```

The BLE Service UUID, Characteristic UUID, and JSON format remain **unchanged**.

---

# 8. Completion Checklist

## ESP Simulator

- [ ] ESP Simulator website created
- [ ] Student ID control works
- [ ] Latitude control works
- [ ] Longitude control works
- [ ] Battery control works
- [ ] SOS control works
- [ ] JSON is generated correctly
- [ ] Location change tested
- [ ] SOS change tested
- [ ] Battery change tested

## BLE Simulator

- [ ] BLE Advertiser / GATT Simulator installed on Phone A
- [ ] Device created as `STUDENT_001`
- [ ] Service created
- [ ] Service UUID configured
- [ ] Characteristic created
- [ ] Characteristic UUID configured
- [ ] Read enabled
- [ ] Notify enabled
- [ ] BLE advertising started

## BLE Test

- [ ] Phone B discovers `STUDENT_001`
- [ ] Phone B connects
- [ ] Service discovered
- [ ] Characteristic discovered
- [ ] JSON read successfully
- [ ] Notifications enabled
- [ ] Location update received
- [ ] SOS update received
- [ ] Battery update received

When all of these work, **Part 1 — BLE Simulator is complete.**

---

## Next Step

**Part 2 — Integrating the BLE communication into the Student App.**
