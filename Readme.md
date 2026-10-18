# 🎒 Student Outing Safety Tracker

> A mobile-based student outing safety system that connects an ESP32 tracking device to the student's phone, sends location data through a backend, calculates safety-zone status, and gives faculty real-time monitoring and emergency action capabilities.

---

## 📑 Table of Contents

1. [Overview](#1-overview)
2. [How the Complete System Works](#2-how-the-complete-system-works)
3. [The Real-Life Situation](#3-the-real-life-situation)
4. [The Five Parts](#4-the-five-parts)
5. [How the Five Parts Connect](#5-how-the-five-parts-connect)
6. [Example Scenarios](#6-example-scenarios)
7. [What Each Member Should Focus On](#7-what-each-member-should-focus-on)
8. [Common Student Data](#8-common-student-data)
9. [Important Team Rule](#9-important-team-rule)
10. [Development Order](#10-development-order)
11. [Final Goal](#11-final-goal)
12. [Project Structure](#12-project-structure)

---

## 1. Overview

A simple student safety tracking system designed for **faculty to monitor students during an outing**.

The idea is simple:

1. A student carries an **ESP32-based tracking device**.
2. The ESP32 communicates with the student's phone using **Bluetooth**.
3. The student's phone gets the **location** and sends the required information to the **backend**.
4. The faculty monitors all students from their **own phone**.

If a student goes **outside the permitted safety radius**, the system identifies it and alerts the faculty.
If the student presses the **SOS button**, the faculty can see the emergency status and **contact that particular student**.

---

## 2. How the Complete System Works

The project is **one system divided into 5 connected parts**.

```text
ESP32
  ↓
Student Phone
  ↓
Backend
  ↓
Faculty App
  ↓
Safety & Alerts
```

| Part | Component | Owner |
|:----:|-----------|:-----:|
| **Part 1** | ESP32 Bluetooth Simulator | Member 1 |
| **Part 2** | Student App | Member 2 |
| **Part 3** | Backend | Member 3 |
| **Part 4** | Faculty App | Member 4 |
| **Part 5** | Safety Engine + Alerts | Member 5 |

> These are **not five separate projects**. They are **five parts of one project**.

---

## 3. The Real-Life Situation

Imagine a faculty member takes **25 students** for a Sunday outing.

The faculty wants to know:

- 📍 Where are the students?
- 🟢 Are they still within the permitted area?
- 🔴 Is anyone moving too far away?
- 🚨 Has anyone pressed the SOS button?
- 🕒 When was each student's location last updated?
- 📞 Can the faculty immediately contact the student if there is a problem?

Instead of the faculty manually checking every student, the system **continuously collects the required information and shows it in one place**.

---

## 4. The Five Parts

### Part 1 — ESP32 Bluetooth Simulator

**Responsible:** Member 1

Part 1 represents the student's **physical tracking device**.

For development and demonstration, we use a **website-based ESP32 simulator**. It behaves like an ESP32 Bluetooth device and advertises the student's identity/data through Bluetooth.

```text
Student 001
BLE Device
```

The purpose of Part 1 is mainly to establish the **Bluetooth communication with the Student App**.

```text
ESP32 Simulator
      ↓ BLE
Student Phone
```

**Part 1 does NOT:**

- Manage the faculty dashboard
- Calculate the safety radius
- Call the student
- Manage the main backend
- Replace the Student App

---

### Part 2 — Student App

**Responsible:** Member 2

The Student App runs on the **student's phone**.

- Connects to the ESP32 Bluetooth device from Part 1
- Receives the required information through Bluetooth
- Accesses the student's location through GPS/location services
- Sends the required information to the backend

```text
ESP32
  ↓ Bluetooth
Student Phone
  ↓
GPS + Student Information
  ↓
Backend
```

> The Student App is the **bridge** between the physical tracking device and the online system.

---

### Part 3 — Backend

**Responsible:** Member 3

The backend is the **middle layer** connecting the Student App and Faculty App.

It receives student information from the Student App and makes it available to the rest of the system:

```text
Student ID
Location
Battery
SOS status
Last updated time
Phone number
```

```text
Student App
      ↓
   Backend
      ↓
Faculty App
```

The backend must store/serve information in a **consistent format**, so Parts 4 and 5 can use the **same student data**.

---

### Part 4 — Faculty App

**Responsible:** Member 4

The Faculty App is the **interface used by the faculty member**.

The faculty does not interact with the ESP32 or Bluetooth directly. Instead, the app receives the processed student information from the backend/safety system.

**Safe student:**

```text
Student 001
🟢 SAFE

Distance: 8.4 km
Battery: 87%
Updated: 10 seconds ago
```

**Student outside the permitted area:**

```text
Student 001
🔴 OUT OF RANGE

Distance: 15.4 km
Allowed: 15 km

[📞 CALL STUDENT]
[📍 VIEW LOCATION]
```

> The Faculty App must be **mobile-friendly**, because faculty will use their phone during the outing.

---

### Part 5 — Safety Engine + Alerts

**Responsible:** Member 5

Part 5 is where the system makes the **actual safety decision**.

It receives the student's location and compares it with the outing's permitted safety area.

```text
Allowed Radius = 15 km
```

The system has an **outing center location** and calculates:

```text
Student Location
       ↓
Distance from Outing Center
       ↓
Compare with 15 km
```

| Student Distance | Allowed Radius | Result |
|:----------------:|:--------------:|--------|
| 8.5 km | 15 km | 🟢 **SAFE** (8.5 < 15) |
| 15.6 km | 15 km | 🔴 **OUT OF RANGE** (15.6 > 15) |

Part 5 also handles important events:

```text
SAFE
OUT OF RANGE
SOS
LOCATION UNAVAILABLE
BACK IN SAFE AREA
```

When an important event occurs, the Faculty App shows the appropriate alert.

---

## 5. How the Five Parts Connect

```text
┌──────────────────────┐
│       PART 1         │
│ ESP32 BLE Simulator  │
└──────────┬───────────┘
           │
           │ Bluetooth
           ▼
┌──────────────────────┐
│       PART 2         │
│    Student App       │
│ GPS + BLE + Student  │
└──────────┬───────────┘
           │
           │ Internet
           ▼
┌──────────────────────┐
│       PART 3         │
│       Backend        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│       PART 5         │
│ Safety + Distance    │
│ + Alerts             │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│       PART 4         │
│    Faculty App       │
└──────────────────────┘
```

> **Part 4 and Part 5 work together.**
> **Part 5 decides** what is happening. **Part 4 shows it** to the faculty.

---

## 6. Example Scenarios

### 🟢 Normal Student

Student 001 is inside the permitted area.

```text
GPS Location
     ↓
Backend
     ↓
Part 5 calculates distance
     ↓
8.4 km
     ↓
8.4 < 15
     ↓
🟢 SAFE
     ↓
Faculty App
```

Faculty sees:

```text
Student 001

🟢 SAFE

Distance: 8.4 km
Battery: 87%
```

---

### 🔴 Student Goes Out of Range

Student 001 moves outside the permitted area.

```text
GPS Location
     ↓
Backend
     ↓
Part 5
     ↓
15.4 km
     ↓
15.4 > 15
     ↓
🔴 OUT OF RANGE
     ↓
Faculty App
```

Faculty sees:

```text
🚨 STUDENT OUT OF RANGE

Student 001
Distance: 15.4 km
Allowed: 15 km

[📞 CALL STUDENT]
[📍 VIEW LOCATION]
```

The faculty can immediately call that particular student's registered phone number. The app uses the **phone's normal dialer** rather than building a separate calling system.

---

### 🚨 SOS

If the student presses the SOS button:

```text
SOS Button
     ↓
Student Device
     ↓
Student App
     ↓
Backend
     ↓
Part 5
     ↓
🚨 SOS ACTIVE
     ↓
Faculty App
```

Faculty sees:

```text
🚨 SOS ACTIVE

Student 001

[📞 CALL STUDENT]
[📍 VIEW LOCATION]
```

> SOS is treated as a **high-priority event**.

---

## 7. What Each Member Should Focus On

### Member 1 — Part 1

```text
ESP32 / BLE Simulator
        ↓
Bluetooth communication
```

Make sure the Student App can **detect/connect** to the simulated ESP32.

### Member 2 — Part 2

```text
BLE
GPS
Student information
        ↓
Backend
```

Make sure the phone can **receive the device information** and **send the student's data to the backend**.

### Member 3 — Part 3

```text
Student App
      ↓
Backend
      ↓
Data for Parts 4 & 5
```

Make sure the data is **stored and available consistently**.

### Member 4 — Part 4

```text
Backend/Safety Data
        ↓
Faculty Mobile App
```

Make the faculty interface **clear and easy to use**.

Important actions:

- View student
- View status
- View location
- See alerts
- Call particular student

### Member 5 — Part 5

```text
Student coordinates
        ↓
Distance calculation
        ↓
15 km comparison
        ↓
Safety status
        ↓
Alerts/events
```

This member is responsible for the **actual safety logic**.

---

## 8. Common Student Data

All five parts must agree on the **same basic student identity**.

```text
Student ID: ST001
```

> ⚠️ **Do not use different IDs in different parts.**

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| Part 1 → `student001` | Part 1 → `ST001` |
| Part 2 → `S001` | Part 2 → `ST001` |
| Part 3 → `1` | Part 3 → `ST001` |
| Part 4 → `Rahul` | Part 4 → `ST001` |

The student's **name can be stored separately**.

### Example Common Data

A student record can conceptually contain:

```json
{
  "studentId": "ST001",
  "name": "Student 001",
  "phone": "...",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "battery": 87,
  "sos": false,
  "lastUpdated": "..."
}
```

Part 5 can add calculated information:

```json
{
  "distanceKm": 8.4,
  "safeRadiusKm": 15,
  "status": "SAFE"
}
```

> The exact implementation can differ, but the **meaning of the fields must remain consistent**.

---

## 9. Important Team Rule

> **Do not independently change the architecture.**
> Before changing something that affects another part, **discuss it with the team**.

**Example:** If Member 3 changes `studentId`, then Members 2, 4 and 5 may also need to change their code.

Similarly, if the backend changes the **location format**, every part using that location must be checked.

---

## 10. Development Order

Develop the project in this order:

```text
1. Part 1
   BLE simulator works
        ↓
2. Part 2
   Student App connects to BLE
        ↓
3. Part 3
   Student App sends data to backend
        ↓
4. Part 5
   Distance + safety calculation works
        ↓
5. Part 4
   Faculty sees the complete information
        ↓
6. Final Integration
   Test everything together
```

Individual members can develop their UI and code independently, but **final integration should follow this overall flow**.

---

## 11. Final Goal

At the end, the faculty should be able to open **one mobile-friendly Faculty App** and understand the situation immediately.

```text
STUDENT SAFETY MONITOR

Total Students: 25

🟢 Safe: 23
🔴 Out of Range: 1
🚨 SOS: 1


ST001
🟢 SAFE
8.4 km
Battery: 87%


ST002
🔴 OUT OF RANGE
15.6 km / 15 km

[📞 CALL STUDENT]
[📍 VIEW LOCATION]


ST003
🚨 SOS ACTIVE

[📞 CALL STUDENT]
[📍 VIEW LOCATION]
```

The goal is **not just to display data**. The goal is to create a simple chain:

```text
DETECT
  ↓
UNDERSTAND
  ↓
ALERT
  ↓
ACT
```

The system **detects** the student's location, **understands** whether the student is safe, **alerts** the faculty when something requires attention, and gives the faculty an immediate **action** such as calling the student or viewing their location.

---

## 12. Project Structure

Each part should remain **clearly separated** in the project:

```text
project/
│
├── part1-esp32-ble/
│
├── part2-student-app/
│
├── part3-backend/
│
├── part4-faculty-app/
│
├── part5-safety-engine/
│
└── README.md
```

The `README.md` is the **common document for all five members**.
Each member should read this file **before starting work**, so everyone understands how their part fits into the complete system.
