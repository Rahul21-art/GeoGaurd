# 🎓 Part 4 — Faculty App

## Student Outing Safety Tracker

> **Scope:** This document covers **Part 4 only**.
> Do **NOT** recreate or modify Part 1, Part 2, or Part 3. They are already working.

---

## 📑 Table of Contents

1. [System Overview](#1-system-overview)
2. [Main Purpose](#2-main-purpose)
3. [Architecture Rules](#3-architecture-rules)
4. [Backend Student Data](#4-backend-student-data)
5. [Faculty Dashboard](#5-faculty-dashboard)
6. [Student Cards](#6-student-cards)
7. [Student Status](#7-student-status)
8. [15 km Range](#8-15-km-range)
9. [Out-of-Range Alert](#9-out-of-range-alert)
10. [Call a Particular Student](#10-call-a-particular-student)
11. [SOS Screen Behaviour](#11-sos-screen-behaviour)
12. [Location](#12-location)
13. [Last Updated](#13-last-updated)
14. [Battery](#14-battery)
15. [Search Students](#15-search-students)
16. [Filters](#16-filters)
17. [Alert Priority](#17-alert-priority)
18. [Automatic Data Refresh](#18-automatic-data-refresh)
19. [Dashboard Layout](#19-dashboard-layout)
20. [UI Design](#20-ui-design)
21. [Safety Action Flows](#21-safety-action-flows)
22. [Error Handling](#22-error-handling)
23. [Out of Scope](#23-out-of-scope)
24. [Final Data Flow](#24-final-data-flow)
25. [Expected Final Result](#25-expected-final-result)
26. [Implementation Rules & Order](#26-implementation-rules--order)

---

## 1. System Overview

The project is built in four parts. Parts 1–3 are complete; this document defines Part 4.

| Part | Component | Role |
|------|-----------|------|
| **Part 1** | Phone A — ESP32 BLE Simulator | Simulates the ESP32 device and sends data over BLE |
| **Part 2** | Phone B — Student App | Receives BLE data and sends it to the backend over the Internet/API |
| **Part 3** | Backend | Stores and serves student data, status, and range information |
| **Part 4** | **Faculty App** | **Reads backend data and displays it for faculty** |

```text
PART 1   Phone A — ESP32 BLE Simulator
              │
              │  BLE
              ▼
PART 2   Phone B — Student App
              │
              │  Internet / API
              ▼
PART 3   Backend
              │
              ▼
PART 4   Faculty App
```

The Faculty App **only reads** student data from the existing backend and displays it clearly.

---

## 2. Main Purpose

The Faculty App is the **monitoring dashboard** used by the faculty member during the student outing.

### Faculty can:

- See all registered students
- See each student's current status
- See each student's location coordinates
- See distance from the outing's allowed center/range
- See whether a student is **SAFE** or **OUT OF RANGE**
- See **SOS** status
- See **battery** percentage
- See the **last time data was received**
- Open a student's location on a **map**
- **Call** a particular student directly when necessary
- Clearly identify **emergency situations**

The app is designed **primarily for mobile screens**, since faculty will monitor students using a phone.

---

## 3. Architecture Rules

Keep the existing architecture **exactly as is**.

```text
ESP32 BLE Simulator
        ↓
Phone B Student App
        ↓
Backend
        ↓
Faculty App
```

### ❌ The Faculty App must NOT

- Connect directly to the ESP32
- Connect directly to Bluetooth
- Replace the Student App
- Receive BLE data directly
- Create a second backend
- Recalculate or replace the existing Part 3 data pipeline

### ✅ The Faculty App simply

Consumes the data already stored/provided by the Part 3 backend.

---

## 4. Backend Student Data

The backend already provides student information such as:

```json
{
  "studentId": "ST001",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "sos": false,
  "battery": 87,
  "lastUpdated": "..."
}
```

- The Faculty App **must use the actual backend response**.
- **Do NOT** create fake hardcoded student data for the final implementation.
- For development/testing **only**, mock data may be used temporarily if the backend is unavailable.

---

## 5. Faculty Dashboard

Create a clean, **mobile-first** dashboard.

### Top Section — Student Safety Monitor

| Metric | Example |
|--------|---------|
| Total Students | 25 |
| Safe | 23 |
| Out of Range | 1 |
| SOS | 1 |

These numbers **update automatically** from the backend.

---

## 6. Student Cards

Display each student as an **individual card**.

```text
┌──────────────────────────────┐
│ ST001                        │
│ Student 001                  │
│                              │
│ 🟢 SAFE                      │
│                              │
│ Distance: 8.4 km             │
│ Battery: 87%                 │
│ SOS: OFF                     │
│ Updated: 10 sec ago          │
│                              │
│ [ VIEW LOCATION ]            │
│ [ 📞 CALL STUDENT ]          │
└──────────────────────────────┘
```

The card must **update automatically** when new backend data arrives.

---

## 7. Student Status

Use **three clear states**:

| State | Indicator | Meaning |
|-------|-----------|---------|
| **SAFE** | 🟢 SAFE | Student is inside the configured permitted range |
| **OUT OF RANGE** | 🔴 OUT OF RANGE | Student has crossed the configured permitted distance |
| **SOS** | 🚨 SOS ACTIVE | Student triggered an SOS — **highest visual priority** |

> If SOS is active, make the student card **visually prominent** so faculty notices it immediately.

---

## 8. 15 km Range

The current demonstration range is **15 km**.

The Faculty App must use the **range/status supplied by the existing system**.
**Do not** create a separate, conflicting geofence calculation.

| Backend value | Display |
|---------------|---------|
| `status = SAFE` | SAFE |
| `status = OUT_OF_RANGE` | OUT OF RANGE |

The UI should also show useful context:

```text
Distance: 15.4 km
Allowed:  15 km
```

---

## 9. Out-of-Range Alert

When a student becomes **OUT OF RANGE**, the Faculty App must **immediately** make that student noticeable.

```text
🚨 STUDENT OUT OF RANGE

ST001
Student 001

Distance: 15.4 km
Allowed range: 15 km

[ 📞 CALL STUDENT ]
[ 📍 VIEW LOCATION ]
```

The dashboard counters must also update:

```text
Total: 25
Safe: 24
Out of Range: 1
SOS: 0
```

---

## 10. Call a Particular Student

Add a **CALL STUDENT** option to **every** student card.

```text
ST001
🔴 OUT OF RANGE

[ 📞 CALL STUDENT ]
```

### Call Flow

```text
Faculty taps CALL STUDENT
        ↓
Student's registered phone number
        ↓
Android phone dialer
        ↓
Faculty calls that student
```

### Rules

- Use the device's **native phone dialer**.
- **Do NOT** build a custom VoIP/calling system.
- Use the **student's registered phone number** associated with that student's ID.
- The CALL button must call the **selected student's number**, **not** a common faculty number.

### Example Student Record

```json
{
  "studentId": "ST001",
  "name": "Student 001",
  "phone": "student-phone-number"
}
```

### Button Prominence

| Student State | CALL Button |
|---------------|-------------|
| SAFE | Standard |
| OUT OF RANGE | **Highly visible** |
| SOS | **Even more prominent** |

---

## 11. SOS Screen Behaviour

If `sos = true`, show:

```text
🚨 SOS ALERT

ST001
Student 001

SOS ACTIVE

Location:
18.1065, 83.3955

Battery:
87%

Updated:
5 seconds ago

[ 📞 CALL STUDENT ]
[ 📍 VIEW LOCATION ]
```

> SOS must appear at the **top of the important alerts area**.

---

## 12. Location

Each student has a **📍 VIEW LOCATION** button.

When faculty taps it, open the student's **current coordinates on a map**.

- Use `latitude` and `longitude` **from the backend**.
- **Do not** manually enter coordinates.
- The map must clearly identify the **selected student's current location**.

```text
ST001
Current Location

18.1065
83.3955
```

---

## 13. Last Updated

Every student card must show the **latest backend update time**.

```text
Updated 8 seconds ago
```

or

```text
Last updated: 10:42:18 AM
```

This is important because faculty needs to know whether the displayed location is **recent**.

### Stale Data

If data becomes stale, **clearly indicate it**:

```text
⚠️ DATA NOT UPDATED
Last update: 2 minutes ago
```

> **Do not** falsely display a student as live when the backend has stopped receiving updates.

---

## 14. Battery

Show the battery value **received from the backend**.

```text
🔋 87%
```

Low battery must be **visually noticeable**:

```text
🔋 12% — LOW BATTERY
```

> **Do not** invent battery values.

---

## 15. Search Students

Add a simple search field:

```text
Search student...
```

Faculty can search by:

- **Student ID**
- **Student name**

Example — `Search: ST001` → only the matching student is shown.

---

## 16. Filters

Provide simple filters:

```text
[ ALL ]  [ SAFE ]  [ OUT OF RANGE ]  [ SOS ]
```

This lets faculty immediately see only the students requiring attention.

---

## 17. Alert Priority

| Priority | State |
|:--------:|-------|
| 1 | 🚨 **SOS** |
| 2 | 🔴 **OUT OF RANGE** |
| 3 | 🟢 **SAFE** |

If a student is **both** OUT OF RANGE and SOS:

```text
🚨 SOS ACTIVE
🔴 OUT OF RANGE
```

**SOS takes priority visually.**

---

## 18. Automatic Data Refresh

The Faculty App must **automatically** request/update student information from the backend.

- Faculty should **not** need to refresh the page manually.
- Use the **existing backend/API mechanism from Part 3**.
- The interface updates whenever fresh data becomes available.

### Connection Indicator

Display a small indicator:

```text
● LIVE
```

or

```text
⚠️ CONNECTION LOST
```

---

## 19. Dashboard Layout

Recommended mobile layout:

```text
┌─────────────────────────────┐
│ Student Safety Monitor      │
│ ● LIVE                      │
├─────────────────────────────┤
│                             │
│  25      23      1      1   │
│ TOTAL    SAFE   OUT    SOS  │
│                             │
├─────────────────────────────┤
│ 🔴 ALERT                    │
│                             │
│ ST001                       │
│ Student 001                 │
│ OUT OF RANGE                │
│ 15.4 km / 15 km             │
│                             │
│ [📞 CALL] [📍 LOCATION]     │
├─────────────────────────────┤
│                             │
│ ST002                       │
│ Student 002                 │
│ 🟢 SAFE                     │
│ 7.2 km / 15 km              │
│ 🔋 91%                      │
│ Updated 8 sec ago           │
│                             │
│ [📍 LOCATION] [📞 CALL]     │
└─────────────────────────────┘
```

---

## 20. UI Design

Make the Faculty App look like a **professional safety-monitoring system**.

### Use

- Clean, mobile-first design
- Large status indicators
- Rounded cards
- Clear typography
- Minimal unnecessary elements
- Smooth transitions
- Good spacing
- Responsive layout
- Dark/light compatibility *(if already present in the project)*

> Do **not** make it look like a generic admin template.

### Information Hierarchy

The most important information must be visible **immediately**:

| Question | Answer shown |
|----------|--------------|
| **WHO?** | Student ID & name |
| **WHERE?** | Coordinates / map |
| **SAFE OR NOT?** | Status badge |
| **SOS?** | SOS indicator |
| **BATTERY?** | Battery % |
| **WHEN UPDATED?** | Last updated time |
| **WHAT CAN FACULTY DO?** | Call / View Location |

---

## 21. Safety Action Flows

### Out of Range Detected

```text
Backend
   ↓
Faculty App
   ↓
🔴 OUT OF RANGE
   ↓
Faculty sees Student ID
   ↓
Faculty can:
   ├── 📞 CALL STUDENT
   └── 📍 VIEW LOCATION
```

### SOS Detected

```text
Backend
   ↓
Faculty App
   ↓
🚨 SOS ACTIVE
   ↓
Faculty can:
   ├── 📞 CALL STUDENT
   └── 📍 VIEW LOCATION
```

---

## 22. Error Handling

| Situation | Message / Behaviour |
|-----------|---------------------|
| Backend unavailable | ⚠️ Unable to connect to server |
| Student data is stale | ⚠️ Data may be outdated |
| Location unavailable | 📍 Location unavailable |
| Phone number missing | "Phone number unavailable" — **disable** the CALL button (no errors) |

---

## 23. Out of Scope

For Part 4, do **NOT** add:

- Bluetooth functionality
- ESP32 controls
- GPS hardware controls
- LoRa
- SIM controls
- Hardware configuration
- Another backend
- Complex authentication *(unless already required)*
- Fake tracking logic
- Unnecessary analytics
- Unrelated pages

> Part 4 is the **Faculty Monitoring App** — nothing more.

---

## 24. Final Data Flow

```text
PART 1
Phone A — ESP32 BLE Simulator
        │
        │ BLE
        ▼
PART 2
Phone B — Student App
        │
        │ Internet
        ▼
PART 3
Backend
        │
        │ Student data
        ▼
PART 4
Faculty App
        │
        ├── Student status
        ├── Location
        ├── Distance
        ├── SOS
        ├── Battery
        ├── Last updated
        │
        ├── 📍 View Location
        │
        └── 📞 Call Particular Student
```

---

## 25. Expected Final Result

When faculty opens the website:

```text
Student Safety Monitor

25 Students
23 Safe
1 Out of Range
1 SOS
```

### If ST001 crosses the 15 km range

```text
🔴 OUT OF RANGE

ST001
Student 001

15.4 km / 15 km

[📞 CALL STUDENT]
[📍 VIEW LOCATION]
```

### If ST001 presses SOS

```text
🚨 SOS ACTIVE

ST001
Student 001

[📞 CALL STUDENT]
[📍 VIEW LOCATION]
```

> Faculty should be able to **identify the student and take action within a few seconds**.

---

## 26. Implementation Rules & Order

Build this as **Part 4 only**.

- Do **not** restart the project.
- Do **not** recreate Parts 1–3.
- Do **not** change the existing backend data format unless **absolutely necessary**.
- **First** connect the Faculty App to the existing Part 3 backend.

### Implementation Checklist

- [ ] 1. Student list
- [ ] 2. Live status
- [ ] 3. Distance/status display
- [ ] 4. SOS display
- [ ] 5. Battery
- [ ] 6. Last updated
- [ ] 7. Search / filter
- [ ] 8. Map / location button
- [ ] 9. Student-specific CALL button
- [ ] 10. OUT OF RANGE and SOS visual alerts
- [ ] 11. Mobile responsive UI

> ✅ The final Faculty App must work using the **actual data coming from Part 3**.
