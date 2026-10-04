Student Outing Safety Tracker

A simple student safety tracking system designed for faculty to monitor students during an outing.

The idea is simple:

A student carries an ESP32-based tracking device. The ESP32 communicates with the student's phone using Bluetooth. The student's phone gets the location and sends the required information to the backend. The faculty can then monitor all students from their own phone.

If a student goes outside the permitted safety radius, the system identifies it and alerts the faculty. If the student presses the SOS button, the faculty can also see the emergency status and contact that particular student.

---

How the Complete System Works

Think of the project as one system divided into 5 connected parts.

ESP32
  ↓
Student Phone
  ↓
Backend
  ↓
Faculty App
  ↓
Safety & Alerts

Each member works on one part.

The five parts are:

Part 1 → ESP32 Bluetooth Simulator
Part 2 → Student App
Part 3 → Backend
Part 4 → Faculty App
Part 5 → Safety Engine + Alerts

These are not five separate projects.

They are five parts of one project.

---

The Real-Life Situation

Imagine a faculty member takes 25 students for a Sunday outing.

The faculty wants to know:

- Where are the students?
- Are they still within the permitted area?
- Is anyone moving too far away?
- Has anyone pressed the SOS button?
- When was each student's location last updated?
- Can the faculty immediately contact the student if there is a problem?

Instead of the faculty manually checking every student, our system continuously collects the required information and shows it in one place.

---

Part 1 — ESP32 Bluetooth Simulator

Responsible Member: Member 1

Part 1 represents the student's physical tracking device.

For development and demonstration, we use a website-based ESP32 simulator.

The simulator behaves like an ESP32 Bluetooth device and advertises the student's identity/data through Bluetooth.

Example:

Student 001
BLE Device

The purpose of Part 1 is mainly to establish the Bluetooth communication with the Student App.

Part 1 does:

ESP32 Simulator
      ↓ BLE
Student Phone

Part 1 does NOT:

- Manage the faculty dashboard
- Calculate the safety radius
- Call the student
- Manage the main backend
- Replace the Student App

---

Part 2 — Student App

Responsible Member: Member 2

The Student App runs on the student's phone.

It connects to the ESP32 Bluetooth device from Part 1.

The phone receives the required information through Bluetooth and also has access to the student's location through GPS/location services.

The Student App then sends the required information to the backend.

Conceptually:

ESP32
  ↓ Bluetooth
Student Phone
  ↓
GPS + Student Information
  ↓
Backend

The Student App is the bridge between the physical tracking device and the online system.

---

Part 3 — Backend

Responsible Member: Member 3

The backend is the middle layer connecting the Student App and Faculty App.

It receives student information from the Student App and makes that information available to the rest of the system.

For example:

Student ID
Location
Battery
SOS status
Last updated time
Phone number

The backend should store/serve the information in a consistent format.

The basic flow is:

Student App
      ↓
    Backend
      ↓
Faculty App

The backend should be designed so that Parts 4 and 5 can use the same student data.

---

Part 4 — Faculty App

Responsible Member: Member 4

The Faculty App is the interface used by the faculty member.

The faculty does not need to interact with the ESP32 or Bluetooth directly.

Instead, the Faculty App receives the processed student information from the backend/safety system.

The faculty can see:

Student 001
🟢 SAFE

Distance: 8.4 km
Battery: 87%
Updated: 10 seconds ago

If a student is outside the permitted area:

Student 001
🔴 OUT OF RANGE

Distance: 15.4 km
Allowed: 15 km

[📞 CALL STUDENT]
[📍 VIEW LOCATION]

The Faculty App should be mobile-friendly because the faculty will use their phone during the outing.

---

Part 5 — Safety Engine + Alerts

Responsible Member: Member 5

Part 5 is where the system makes the actual safety decision.

It receives the student's location and compares it with the outing's permitted safety area.

For our current project:

Allowed Radius = 15 km

The system has an outing center location.

It calculates:

Student Location
       ↓
Distance from Outing Center
       ↓
Compare with 15 km

For example:

Student distance = 8.5 km
Allowed radius = 15 km

8.5 < 15

🟢 SAFE

If:

Student distance = 15.6 km
Allowed radius = 15 km

15.6 > 15

🔴 OUT OF RANGE

Part 5 also handles important events such as:

SAFE
OUT OF RANGE
SOS
LOCATION UNAVAILABLE
BACK IN SAFE AREA

When an important event occurs, the Faculty App can show the appropriate alert.

---

How the Five Parts Connect

The complete system looks like this:

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

The important thing is that Part 4 and Part 5 work together.

Part 5 decides what is happening.

Part 4 shows it to the faculty.

---

Example: Normal Student

Suppose Student 001 is inside the permitted area.

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

Faculty sees:

Student 001

🟢 SAFE

Distance: 8.4 km
Battery: 87%

---

Example: Student Goes Out of Range

Student 001 moves outside the permitted area.

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

Faculty sees:

🚨 STUDENT OUT OF RANGE

Student 001
Distance: 15.4 km
Allowed: 15 km

[📞 CALL STUDENT]
[📍 VIEW LOCATION]

The faculty can immediately call that particular student's registered phone number.

The app uses the phone's normal dialer rather than building a separate calling system.

---

Example: SOS

If the student presses the SOS button:

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

The faculty sees:

🚨 SOS ACTIVE

Student 001

[📞 CALL STUDENT]
[📍 VIEW LOCATION]

SOS is treated as a high-priority event.

---

What Each Member Should Focus On

Member 1 — Part 1

Focus only on:

ESP32 / BLE Simulator
        ↓
Bluetooth communication

Make sure the Student App can detect/connect to the simulated ESP32.

---

Member 2 — Part 2

Focus on:

BLE
GPS
Student information
        ↓
Backend

Make sure the phone can receive the required device information and send the student's data to the backend.

---

Member 3 — Part 3

Focus on:

Student App
      ↓
Backend
      ↓
Data for Parts 4 & 5

Make sure the data is stored and available consistently.

---

Member 4 — Part 4

Focus on:

Backend/Safety Data
        ↓
Faculty Mobile App

Make the faculty interface clear and easy to use.

Important actions:

View student
View status
View location
See alerts
Call particular student

---

Member 5 — Part 5

Focus on:

Student coordinates
        ↓
Distance calculation
        ↓
15 km comparison
        ↓
Safety status
        ↓
Alerts/events

This member is responsible for the actual safety logic.

---

Common Student Data

All five parts should agree on the same basic student identity.

Example:

Student ID: ST001

Do not use different IDs in different parts.

For example, avoid:

Part 1 → student001
Part 2 → S001
Part 3 → 1
Part 4 → Rahul

Use one consistent identifier:

ST001

The student's name can be stored separately.

---

Example Common Data

A student record can conceptually contain:

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

Part 5 can add calculated information:

{
  "distanceKm": 8.4,
  "safeRadiusKm": 15,
  "status": "SAFE"
}

The exact implementation can differ, but the meaning of the fields should remain consistent.

---

Important Team Rule

Do not independently change the architecture.

Before changing something that affects another part, discuss it with the team.

For example:

If Member 3 changes:

studentId

Member 2, Member 4 and Member 5 may also need to change their code.

Similarly, if the backend changes the location format, every part using that location must be checked.

---

Development Order

The project should be developed in this order:

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

Individual members can develop their UI and code independently, but final integration should follow this overall flow.

---

Final Goal

At the end, the faculty should be able to open one mobile-friendly Faculty App and understand the situation immediately.

For example:

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

The goal is not just to display data.

The goal is to create a simple chain:

DETECT
  ↓
UNDERSTAND
  ↓
ALERT
  ↓
ACT

The system detects the student's location, understands whether the student is safe, alerts the faculty when something requires attention, and gives the faculty an immediate action such as calling the student or viewing their location.

---

One-Line Project Summary

«A mobile-based student outing safety system that connects an ESP32 tracking device to the student's phone, sends location data through a backend, calculates safety-zone status, and gives faculty real-time monitoring and emergency action capabilities.»

---

Project Structure

Each part should remain clearly separated in the project:

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

The "README.md" is the common document for all five members.

Each member should read this file before starting work so everyone understands how their part fits into the complete system.