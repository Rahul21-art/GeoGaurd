# 🛡️ Part 5 — Safety Engine, Distance Calculation & Alerts

## Student Outing Safety Tracker

> **Scope:** This document covers **Part 5 only**.
> Do **NOT** recreate Parts 1–4. They are already established.

---

## 📑 Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Main Responsibility](#2-main-responsibility)
3. [Safety Radius](#3-safety-radius)
4. [Safety Center](#4-safety-center)
5. [Distance Calculation (Haversine)](#5-distance-calculation-haversine)
6. [Safety Decision](#6-safety-decision)
7. [Boundary Rule](#7-boundary-rule)
8. [Backend Safety Result](#8-backend-safety-result)
9. [Faculty App Integration](#9-faculty-app-integration)
10. [Out-of-Range Alert](#10-out-of-range-alert)
11. [Avoid Repeated Alerts](#11-avoid-repeated-alerts)
12. [Re-entry Detection](#12-re-entry-detection)
13. [Hysteresis / GPS Noise Protection](#13-hysteresis--gps-noise-protection)
14. [GPS Accuracy Check](#14-gps-accuracy-check)
15. [Missing GPS](#15-missing-gps)
16. [SOS Detection](#16-sos-detection)
17. [Alert Priority](#17-alert-priority)
18. [Student Safety State](#18-student-safety-state)
19. [Event System](#19-event-system)
20. [Call Student Integration](#20-call-student-integration)
21. [Notifications / Alerts](#21-notifications--alerts)
22. [Alert History](#22-alert-history)
23. [Multiple Students](#23-multiple-students)
24. [Demo Configuration](#24-demo-configuration)
25. [Testing Mode](#25-testing-mode)
26. [Testing Scenarios](#26-testing-scenarios)
27. [Final Part 5 Architecture](#27-final-part-5-architecture)
28. [Complete Final Flow](#28-complete-final-flow)
29. [Implementation Order](#29-implementation-order)
30. [Most Important Rule](#30-most-important-rule)

---

## 1. Architecture Overview

Parts 1–4 are already built. Part 5 adds the **decision-making layer**.

| Part | Component | Role |
|------|-----------|------|
| **Part 1** | ESP32 BLE Simulator | Simulates the tracking device over BLE |
| **Part 2** | Student App | Receives BLE data, sends GPS/SOS/battery to backend |
| **Part 3** | Backend | Stores and serves student data |
| **Part 4** | Faculty App | Monitoring dashboard for faculty |
| **Part 5** | **Safety Engine + Distance + Alerts** | **Calculates safety status and triggers alerts** |

```text
PART 1   ESP32 BLE Simulator
              ↓ BLE
PART 2   Student App
              ↓
PART 3   Backend
              ↓
PART 4   Faculty App
              ↓
PART 5   Safety Engine + Distance + Alerts
```

Part 5 is responsible for the **actual safety decision-making**. It must:

- Calculate the student's distance from the permitted outing area
- Determine whether the student is **SAFE** or **OUT OF RANGE**
- Detect **SOS** conditions
- Trigger the appropriate **alerts**

---

## 2. Main Responsibility

Part 5 must answer one question:

> **"Is this student currently inside the permitted safety radius?"**

For every student location received from Part 3:

```text
Student GPS coordinates
        ↓
Distance calculation
        ↓
Compare with allowed radius
        ↓
SAFE or OUT OF RANGE
        ↓
Update Faculty App
        ↓
Trigger alert when necessary
```

---

## 3. Safety Radius

For the current project/demo:

```text
Allowed Radius = 15 km
```

The radius must **NOT** be hardcoded in multiple places. Create **one configurable value**:

```text
SAFE_RADIUS_KM = 15
```

It should be easy to change later (e.g. `10 km`, `15 km`, `20 km`) **without rewriting the safety logic**.

---

## 4. Safety Center

The system needs a **fixed outing center point**.

```text
CENTER_LATITUDE
CENTER_LONGITUDE
```

Example:

```text
Center:
  Latitude:  18.xxxxxx
  Longitude: 83.xxxxxx
```

> ⚠️ **Do NOT** use the student's current location as the center.
> The center represents the **approved outing area / reference point**.

---

## 5. Distance Calculation (Haversine)

Inputs:

| Student | Outing Center |
|---------|---------------|
| `studentLatitude` | `centerLatitude` |
| `studentLongitude` | `centerLongitude` |

Use the **Haversine formula**, because latitude/longitude represent positions on a sphere (Earth).

```text
a = sin²(Δlat / 2) + cos(lat1) × cos(lat2) × sin²(Δlon / 2)

c = 2 × atan2(√a, √(1 − a))

distance = R × c
```

Where:

```text
R = 6371 km
```

The result is stored/displayed in **kilometres**.

---

## 6. Safety Decision

```text
IF distance <= SAFE_RADIUS_KM
    status = SAFE

IF distance > SAFE_RADIUS_KM
    status = OUT_OF_RANGE
```

| Example | Distance | Radius | Comparison | Result |
|---------|:--------:|:------:|:----------:|--------|
| 1 | 8.5 km | 15 km | 8.5 ≤ 15 | 🟢 **SAFE** |
| 2 | 15.7 km | 15 km | 15.7 > 15 | 🔴 **OUT OF RANGE** |

---

## 7. Boundary Rule

If:

```text
distance = 15.0 km
```

the student is still considered **🟢 SAFE**.

Only when `distance > 15 km` does the student become **🔴 OUT OF RANGE**.

---

## 8. Backend Safety Result

Part 5 generates a safety result similar to the following.

### 🔴 Student outside the radius

```json
{
  "studentId": "ST001",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "distanceKm": 15.4,
  "safeRadiusKm": 15,
  "status": "OUT_OF_RANGE",
  "sos": false,
  "lastUpdated": "..."
}
```

### 🟢 Student inside the radius

```json
{
  "studentId": "ST001",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "distanceKm": 8.4,
  "safeRadiusKm": 15,
  "status": "SAFE",
  "sos": false,
  "lastUpdated": "..."
}
```

> The **existing Part 3 schema must be preserved** wherever possible.

---

## 9. Faculty App Integration

**Part 4 must NOT independently calculate a different safety result.**
Part 5 provides the calculated result.

### 🟢 Safe student

```text
Part 3: Student GPS
   ↓
Part 5: Distance calculation
   ↓
8.4 km  →  ≤ 15 km  →  SAFE
   ↓
Part 4 Faculty App
   ↓
🟢 SAFE
```

### 🔴 Out-of-range student

```text
Part 3: Student GPS
   ↓
Part 5: Distance calculation
   ↓
15.4 km  →  > 15 km  →  OUT OF RANGE
   ↓
Part 4 Faculty App
   ↓
🔴 OUT OF RANGE
```

---

## 10. Out-of-Range Alert

When the status changes from `SAFE` → `OUT_OF_RANGE`, generate an alert.

```text
🚨 STUDENT OUT OF RANGE

Student: ST001
Distance: 15.4 km
Allowed: 15 km

[📞 CALL STUDENT]
[📍 VIEW LOCATION]
```

The Faculty App receives the alert/status from the existing system.

---

## 11. Avoid Repeated Alerts

Do **NOT** send an alert every few seconds while the student remains outside the radius.

```text
15.1 km → 15.3 km → 15.6 km → 15.8 km → 16.0 km
```

This is still **the same OUT_OF_RANGE event**.

Generate the main alert **only on the transition**:

```text
SAFE → OUT_OF_RANGE
```

— **not continuously**.

---

## 12. Re-entry Detection

The system must also detect when the student **returns inside** the radius.

```text
15.8 km  →  🔴 OUT OF RANGE
     ↓  student moves back
14.7 km  →  🟢 SAFE
```

Generate a **recovery event**:

```text
🟢 STUDENT BACK IN SAFE AREA

Student: ST001
Distance: 14.7 km
```

This lets faculty know the situation has been resolved.

---

## 13. Hysteresis / GPS Noise Protection

GPS fluctuates slightly around the boundary:

```text
14.99 km → 15.02 km → 14.98 km → 15.01 km
```

Without protection the status would flip repeatedly:

```text
SAFE → OUT → SAFE → OUT
```

**Avoid this** by using a small GPS tolerance (hysteresis).

| Transition | Recommended Threshold |
|------------|-----------------------|
| → **OUT_OF_RANGE** | distance **> 15.0 km** |
| → **SAFE** (return) | distance **≤ 14.8 km** |

```text
15.0 km +      → OUT OF RANGE
14.8 km or less → SAFE
```

> The exact tolerance must be **configurable**.

---

## 14. GPS Accuracy Check

Do **not** make a safety decision from obviously invalid GPS data.

If the Student App provides GPS `accuracy`, use it.

| Accuracy | Handling |
|----------|----------|
| e.g. **8 m** | Usable |
| Extremely poor | Show **⚠️ LOW LOCATION ACCURACY** instead of presenting the distance as perfectly reliable |

> The system must **retain the last valid state** until a sufficiently usable location is received.

---

## 15. Missing GPS

If the Student App stops providing coordinates:

```text
latitude  = unavailable
longitude = unavailable
```

- **Do NOT** calculate distance.
- Show **⚠️ LOCATION UNAVAILABLE**.
- The Faculty App also shows:
  - Last known location
  - Last updated time

> ❗ **Do not** automatically label the student OUT OF RANGE just because GPS temporarily disappeared.

---

## 16. SOS Detection

Part 5 also processes the SOS value.

If `sos = true`, generate:

```text
🚨 SOS ACTIVE
```

SOS has **higher priority** than normal range status.

Valid combined states:

```text
🚨 SOS ACTIVE
🔴 OUT OF RANGE
```

```text
🚨 SOS ACTIVE
🟢 SAFE LOCATION
```

> SOS and range status are **two separate safety conditions**.

---

## 17. Alert Priority

| Priority | Condition |
|:--------:|-----------|
| 1 | 🚨 **SOS** |
| 2 | 🔴 **OUT OF RANGE** |
| 3 | ⚠️ **LOCATION / GPS PROBLEM** |
| 4 | 🟢 **SAFE** |

The most serious condition must be visible **first**.

---

## 18. Student Safety State

Each student has a calculated state. Possible values:

```text
SAFE
OUT_OF_RANGE
SOS
LOCATION_UNAVAILABLE
```

Example:

```json
{
  "studentId": "ST001",
  "status": "OUT_OF_RANGE",
  "distanceKm": 15.4,
  "safeRadiusKm": 15,
  "sos": false
}
```

---

## 19. Event System

Create clear events so the Faculty App can react to important changes.

| Event | Triggered When |
|-------|----------------|
| `STUDENT_OUT_OF_RANGE` | Student crosses the safe radius |
| `STUDENT_BACK_IN_RANGE` | Student returns inside the safe radius |
| `STUDENT_SOS` | Student activates SOS |
| `LOCATION_UNAVAILABLE` | GPS stops being provided |
| `LOCATION_RESTORED` | GPS becomes available again |

### Out of range

```json
{
  "event": "STUDENT_OUT_OF_RANGE",
  "studentId": "ST001",
  "distanceKm": 15.4
}
```

### Re-entry

```json
{
  "event": "STUDENT_BACK_IN_RANGE",
  "studentId": "ST001",
  "distanceKm": 14.6
}
```

### SOS

```json
{
  "event": "STUDENT_SOS",
  "studentId": "ST001"
}
```

---

## 20. Call Student Integration

**Part 5 does NOT make the phone call itself.**

Part 5 determines *"Student is OUT OF RANGE"* and passes that to Part 4.
Part 4 provides **[📞 CALL STUDENT]**. When faculty taps it, the Faculty App opens the phone's **native dialer** using that student's registered phone number.

```text
Part 5
    ↓
OUT_OF_RANGE
    ↓
Part 4 Faculty App
    ↓
🔴 OUT OF RANGE
    ↓
[📞 CALL STUDENT]
    ↓
Native phone dialer
```

---

## 21. Notifications / Alerts

The first implementation should **prioritize alerts inside the Faculty App**.

When a new critical event occurs:

```text
🚨 New Alert

ST001 has crossed the safe radius.

Distance: 15.4 km
Allowed: 15 km
```

- If the existing backend supports **push notifications**, integrate them **without changing the architecture**.
- Do **not** introduce a complicated notification service unless required.

---

## 22. Alert History

Maintain a simple event history.

```text
ALERT HISTORY

10:42 AM
🔴 ST001 went out of range
Distance: 15.4 km

10:47 AM
🟢 ST001 returned to safe area
Distance: 14.6 km

10:51 AM
🚨 ST004 activated SOS
```

This helps faculty understand what happened during the outing.

---

## 23. Multiple Students

The safety engine processes **every active student independently**.

| Student | Distance | Result |
|---------|:--------:|--------|
| ST001 | 8.2 km | 🟢 SAFE |
| ST002 | 15.7 km | 🔴 OUT OF RANGE |
| ST003 | 6.4 km | 🟢 SAFE |
| ST004 | — | 🚨 SOS ACTIVE |

> **Do not** calculate one global student distance.
> Each student gets an **independent safety state**.

---

## 24. Demo Configuration

For the demonstration, make the safety center and radius **configurable**.

```text
Safety Center
  Latitude:  18.xxxxxx
  Longitude: 83.xxxxxx

Safe Radius
  15 km
```

- Provide a configuration mechanism for the **project administrator / developer**.
- **Do not** require faculty to configure this during normal monitoring.

---

## 25. Testing Mode

Add a development/testing mechanism so the full system can be demonstrated **without physically travelling 15 km**.

```text
TEST STUDENT

Current simulated distance: 14.5 km

[ MOVE OUT OF RANGE ]
        ↓
15.5 km
🔴 OUT OF RANGE

[ RETURN TO SAFE AREA ]
        ↓
14.5 km
🟢 SAFE
```

> ⚠️ This is for **development/demo mode only**.
> Production mode must use **actual GPS coordinates from Part 2**.

---

## 26. Testing Scenarios

Test **at least** these cases:

| # | Scenario | Input | Expected Result |
|:-:|----------|-------|-----------------|
| 1 | Safe | Distance = 5 km | 🟢 `SAFE` |
| 2 | Near boundary | Distance = 14.9 km | 🟢 `SAFE` |
| 3 | Boundary | Distance = 15.0 km | 🟢 `SAFE` |
| 4 | Out of range | Distance = 15.1 km | 🔴 `OUT_OF_RANGE` |
| 5 | Far away | Distance = 20 km | 🔴 `OUT_OF_RANGE` |
| 6 | Return | 15.5 km → 14.6 km | 🔴 `OUT_OF_RANGE` → 🟢 `SAFE` |
| 7 | SOS | `sos = true` | 🚨 `SOS ACTIVE` |
| 8 | GPS missing | GPS unavailable | ⚠️ `LOCATION_UNAVAILABLE` |

---

## 27. Final Part 5 Architecture

```text
                 PART 3
                 Backend
                    │
             Student GPS Data
                    │
                    ▼
             ┌───────────────┐
             │    PART 5     │
             │ Safety Engine │
             └───────────────┘
                    │
          ┌─────────┼─────────┐
          │         │         │
          ▼         ▼         ▼
      Distance     SOS      GPS State
      Calculate   Check      Check
          │         │         │
          └─────────┼─────────┘
                    ▼
             Safety Decision
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
      SAFE                 OUT OF RANGE
        │                       │
        │                       ▼
        │                    🚨 ALERT
        │                       │
        └───────────┬───────────┘
                    ▼
             PART 4 FACULTY APP
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     📍 Location         📞 Call Student
```

---

## 28. Complete Final Flow

```text
Student wears/uses tracking device
            ↓
ESP32 sends BLE data
            ↓
Student Phone
            ↓
GPS determines student's position
            ↓
Student App sends location to Backend
            ↓
Part 5 receives current coordinates
            ↓
Calculate distance from outing center
            ↓
Compare distance with 15 km radius
            ↓
       ┌───────────────┐
       │               │
       ▼               ▼
   ≤ 15 km           > 15 km
       │               │
       ▼               ▼
    🟢 SAFE       🔴 OUT OF RANGE
                       │
                       ▼
                    🚨 ALERT
                       │
                       ▼
                  Faculty App
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
       📍 View Location     📞 Call Student
```

---

## 29. Implementation Order

Implement Part 5 **in this exact order**:

- [ ] **Step 1** — Create the safety configuration
  ```text
  CENTER_LATITUDE
  CENTER_LONGITUDE
  SAFE_RADIUS_KM = 15
  ```
- [ ] **Step 2** — Create the Haversine distance calculation
- [ ] **Step 3** — Connect it to the actual student GPS data from Part 3
- [ ] **Step 4** — Calculate every student's current distance
- [ ] **Step 5** — Determine `SAFE` / `OUT_OF_RANGE`
- [ ] **Step 6** — Add GPS validity handling
- [ ] **Step 7** — Add SOS detection
- [ ] **Step 8** — Add transition detection
  ```text
  SAFE → OUT_OF_RANGE
  OUT_OF_RANGE → SAFE
  ```
- [ ] **Step 9** — Create alert events
- [ ] **Step 10** — Send the calculated status/events to Part 4
- [ ] **Step 11** — Test with simulated locations
- [ ] **Step 12** — Test the complete real GPS flow

---

## 30. Most Important Rule

> **Part 5 is the decision-making layer. Part 4 only displays the result.**

```text
"Student is 15.6 km from the outing center."
        ↓
"Allowed radius is 15 km."
        ↓
"15.6 > 15"
        ↓
"Student is OUT OF RANGE."
        ↓
"Generate OUT_OF_RANGE event."
        ↓
"Faculty App should alert faculty."
```

This keeps the architecture clean and prevents the Faculty App and Backend from making **different safety decisions**.
