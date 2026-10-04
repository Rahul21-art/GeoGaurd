# Backend — Part 3

> Forward the tracker data received by the Student App to an online backend, and store the latest status of each student.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Contract](#2-data-contract)
3. [Stack and Project Setup](#3-stack-and-project-setup)
4. [Database](#4-database)
5. [API Reference](#5-api-reference)
6. [Student App Integration](#6-student-app-integration)
7. [Data Handling](#7-data-handling)
8. [Testing](#8-testing)
9. [Error Handling](#9-error-handling)
10. [Scope](#10-scope)
11. [Success Condition and Checklist](#11-success-condition-and-checklist)

---

# 1. Overview

## 1.1 Purpose

Part 3 adds the backend to the project.

| Part | What it proved |
|---|---|
| Part 1 | The simulated tracker can send data through BLE |
| Part 2 | The Student App on Phone B can receive that BLE data |
| **Part 3** | The Student App can send the received data to an online backend |

## 1.2 Part 3 Flow

```
Phone A
ESP Simulator Website
       ↓
BLE Simulator
       ↓
Bluetooth / BLE
       ↓
Phone B
Student App
       ↓
Internet
       ↓
Backend API
       ↓
Database
```

## 1.3 What the Backend Does

1. Receives student tracker data from the Student App.
2. Identifies the student.
3. Stores the latest location.
4. Stores the battery percentage.
5. Stores the SOS status.
6. Stores the time when the data was received.
7. Returns the latest student data when requested.

> [!NOTE]
> Part 3 does **not** calculate the 15 km boundary. The Student App only forwards the coordinates it receives.

---

# 2. Data Contract

## 2.1 JSON From Part 2

Part 2 already receives this exact BLE JSON:

```json
{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}
```

> [!IMPORTANT]
> Do not change this JSON format. The Student App forwards the same information to the backend, and the backend adds a server-side timestamp.

## 2.2 Two Different Identifiers

| Identifier | Value | Used for |
|---|---|---|
| BLE device name | `STUDENT_001` | Bluetooth discovery |
| Student ID | `ST001` | Backend and database |

The backend uses `ST001` as the student ID. `STUDENT_001` remains the BLE device name.

---

# 3. Stack and Project Setup

## 3.1 Recommended Stack

Simple and suitable for a prototype:

| Technology | Responsibility |
|---|---|
| Node.js | Runs the backend |
| Express.js | Creates the API endpoints |
| MongoDB Atlas | Stores student data |

```
Node.js
   ↓
Express API
   ↓
MongoDB Atlas
```

## 3.2 Folder Structure

Create the backend separately from the Student App.

```
project-root/
│
├── docs/
│   ├── ble-simulator.md
│   ├── student-app.md
│   └── backend.md
│
├── ble-simulator/
│   └── ...
│
├── student-app/
│   └── ...
│
└── backend/
    ├── src/
    │   ├── server.js
    │   ├── routes/
    │   │   └── studentRoutes.js
    │   └── controllers/
    │       └── studentController.js
    │
    ├── package.json
    ├── .env
    └── .gitignore
```

> [!NOTE]
> Do not manually create `node_modules`. Running the npm install commands creates it automatically.

## 3.3 Installation

Open a terminal inside `backend/` and initialise the Node.js project:

```bash
npm init -y
```

Install the required packages:

```bash
npm install express mongoose cors dotenv
```

Install a development tool:

```bash
npm install --save-dev nodemon
```

## 3.4 Environment Variables

Create `backend/.env`:

```env
PORT=5000
MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
```

> [!WARNING]
> Never put the MongoDB password directly into source code. Add `.env` to `.gitignore` so it is not committed.

`backend/.gitignore`:

```
node_modules/
.env
```

---

# 4. Database

## 4.1 Student Record

Each student has one record containing:

| Field | Description |
|---|---|
| `studentId` | Student identifier, e.g. `ST001` |
| `latitude` | Latest latitude |
| `longitude` | Latest longitude |
| `sos` | Latest SOS state (`true` / `false`) |
| `battery` | Latest battery percentage |
| `lastUpdated` | Server-generated time of the last update |

Example:

```json
{
  "studentId": "ST001",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "sos": false,
  "battery": 87,
  "lastUpdated": "server-generated-time"
}
```

## 4.2 Field Mapping

The BLE/API request and the stored record use different field names:

| Request (BLE JSON) | Database record |
|---|---|
| `id` | `studentId` |
| `lat` | `latitude` |
| `lng` | `longitude` |
| `sos` | `sos` |
| `battery` | `battery` |
| — | `lastUpdated` (added by the server) |

---

# 5. API Reference

Part 3 needs only three endpoints.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/students/update` | Send student data |
| `GET` | `/api/students/:id` | Get latest data for one student |
| `GET` | `/api/students` | Get all students |

## 5.1 API 1 — Send Student Data

```
POST /api/students/update
```

**Request body** (sent by the Student App):

```json
{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}
```

The backend validates the data and stores the latest values.

**Success response:**

```json
{
  "success": true,
  "message": "Student data updated",
  "studentId": "ST001"
}
```

**Invalid data response:**

```json
{
  "success": false,
  "message": "Invalid student data"
}
```

### Validation Rules

Invalid data must be **rejected**, not stored.

| Field | Rule | Example |
|---|---|---|
| Student ID | Must exist | `ST001` |
| Latitude | Must be a valid number | `18.1065` |
| Longitude | Must be a valid number | `83.3955` |
| Battery | Must be between `0` and `100` | `87` |
| SOS | Must be `true` or `false` | `false` |

## 5.2 API 2 — Get Latest Student Data

```
GET /api/students/ST001
```

**Response:**

```json
{
  "studentId": "ST001",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "sos": false,
  "battery": 87,
  "lastUpdated": "server-generated-time"
}
```

This API will later be used by the Faculty App.

## 5.3 API 3 — Get All Students

```
GET /api/students
```

**Response:**

```json
[
  {
    "studentId": "ST001",
    "latitude": 18.1065,
    "longitude": 83.3955,
    "sos": false,
    "battery": 87,
    "lastUpdated": "server-generated-time"
  }
]
```

This becomes useful when more students are added later.

---

# 6. Student App Integration

## 6.1 Flow

Part 2 receives the data through BLE. After successfully decoding it, the Student App sends it to `POST /api/students/update`.

```
BLE Data
   ↓
Student App
   ↓
Decode JSON
   ↓
Validate
   ↓
HTTP POST
   ↓
Backend
   ↓
MongoDB
```

## 6.2 Separation of Bluetooth and Internet

BLE and the Internet have different jobs.

| Connection | Used only for | Transfers |
|---|---|---|
| **Bluetooth** | Phone A → Phone B | Tracker data, locally |
| **Internet** | Phone B → Backend | Uploads the received data |

```
Phone A
   │
   │ Bluetooth
   ▼
Phone B
   │
   │ Internet
   ▼
Backend
```

## 6.3 End-to-End Software Flow

```
ESP Simulator Website
        ↓
BLE Simulator
        ↓
Bluetooth
        ↓
Student App
        ↓
Receive BLE JSON
        ↓
Validate JSON
        ↓
POST /api/students/update
        ↓
Express Backend
        ↓
Validate request
        ↓
MongoDB
        ↓
Store latest student status
```

---

# 7. Data Handling

## 7.1 Updates Replace Old Values

The database always holds the **latest known information**. Suppose Phone A first sends:

```json
{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}
```

Phone B receives and uploads it. Later the location and battery change:

```json
{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": false,
  "battery": 85
}
```

Phone B receives the notification and uploads the new values. The backend updates the record for `ST001`.

## 7.2 SOS

Part 3 **stores** the SOS state:

```json
{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": true,
  "battery": 85
}
```

The backend stores `SOS = true`. It does not implement the faculty alert system yet; it only ensures the SOS state reaches and is stored by the backend.

## 7.3 Battery

The latest value replaces the previous one: `87%` → `75%` → `50%`.

## 7.4 Location

The backend stores latitude and longitude (e.g. `18.1065`, `83.3955`). It does **not** decide whether the student is inside or outside the 15 km area. That logic belongs to the later alert/geofencing stage.

---

# 8. Testing

## 8.1 Test the Backend First (API Tool)

Before connecting the Student App, test the API directly with an API tool.

**Step 1 — Send:**

```
POST /api/students/update
```

```json
{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}
```

**Expected result:**

```json
{
  "success": true,
  "message": "Student data updated",
  "studentId": "ST001"
}
```

**Step 2 — Request:**

```
GET /api/students/ST001
```

The response should contain the same latest data.

> [!IMPORTANT]
> Only after this works should the Student App be connected to the API.

## 8.2 Test Without the Faculty App

Do not build the Faculty App yet. Part 3 is tested using the Student App, the Backend and MongoDB.

```
Phone A
   ↓
BLE
   ↓
Phone B Student App
   ↓
POST API
   ↓
Backend
   ↓
MongoDB
```

Confirm that the database receives: **Student ID, Latitude, Longitude, Battery, SOS, Last Updated.**

---

# 9. Error Handling

The Student App should handle:

- Backend unavailable
- Internet unavailable
- Request failed
- Invalid server response
- Server error

> [!NOTE]
> The BLE connection must **not** be treated as failed just because the Internet or backend is temporarily unavailable. They are separate connections: **BLE connection + Internet connection**.

---

# 10. Scope

Part 3 does **not** include the following. They belong to later parts.

| Out of scope | Out of scope |
|---|---|
| ❌ 15 km geofence | ❌ Email alerts |
| ❌ Distance calculation | ❌ GPS hardware |
| ❌ Faculty dashboard | ❌ ESP32 hardware |
| ❌ Faculty login | ❌ SIM / GSM |
| ❌ Push notifications | ❌ SOS notification system |
| ❌ SMS | ❌ Maps for faculty |
| ❌ Multiple advanced roles | |

---

# 11. Success Condition and Checklist

## 11.1 Success Condition

Part 3 is complete when this works reliably:

```
Phone A
BLE Simulator
      ↓
Bluetooth
      ↓
Phone B
Student App
      ↓
Internet
      ↓
Backend
      ↓
Database
```

and the database contains the latest:

| Field | Example |
|---|---|
| Student ID | `ST001` |
| Latitude | `18.1065` |
| Longitude | `83.3955` |
| Battery | `87%` |
| SOS | `OFF` |
| Last Updated | current server time |

## 11.2 Checklist

### Backend

- [ ] Node.js project created
- [ ] Express installed
- [ ] MongoDB connected
- [ ] Environment variables configured
- [ ] Student data model created
- [ ] `POST /api/students/update` created
- [ ] `GET /api/students/ST001` created
- [ ] `GET /api/students` created
- [ ] Input validation added
- [ ] Error handling added

### Student App

- [ ] BLE still connects to `STUDENT_001`
- [ ] Existing BLE UUIDs unchanged
- [ ] Existing JSON format unchanged
- [ ] Student App receives BLE data
- [ ] Student App sends data to backend
- [ ] Backend response handled

### Database

- [ ] `ST001` record created
- [ ] Location stored
- [ ] Battery stored
- [ ] SOS stored
- [ ] Last update time stored
- [ ] Updated values replace old values

## 11.3 Part 3 Completion

When this works, Part 3 is complete:

```
STUDENT_001
     ↓
BLE
     ↓
Student App
     ↓
Internet
     ↓
Backend
     ↓
Database
```

---

## Next Step

**Part 4 — Faculty App.** It will read the backend data and display each student's current status to the faculty.
