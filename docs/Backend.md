Backend — Part 3

1. Purpose

Part 3 adds the backend to the project.

Part 1 proved that the simulated tracker can send data through BLE.

Part 2 proved that the Student App on Phone B can receive that BLE data.

Part 3 now sends the received student data from the Student App to an online backend.

Part 3 flow

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

The backend will receive and store the latest data from the Student App.

---

2. What Part 3 Does

The backend should:

1. Receive student tracker data from the Student App.
2. Identify the student.
3. Store the latest location.
4. Store battery percentage.
5. Store SOS status.
6. Store the time when the data was received.
7. Return the latest student data when requested.

Part 3 does not calculate the 15 km boundary yet.

The Student App only forwards the coordinates it receives.

---

3. Data Coming From Part 2

Part 2 already receives this exact BLE JSON:

{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}

Do not change this JSON format.

The Student App should forward the same information to the backend.

The backend can additionally add a server-side timestamp.

---

4. Recommended Backend Stack

Use:

- Node.js
- Express.js
- MongoDB Atlas

This keeps the backend simple and suitable for a prototype.

Responsibilities

Node.js
   ↓
Express API
   ↓
MongoDB Atlas

Node.js runs the backend.

Express creates the API endpoints.

MongoDB stores student data.

---

5. Backend Folder

Create the backend separately from the Student App.

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

Do not manually create "node_modules".

Run npm installation commands and npm will create it automatically.

---

6. Backend Installation

Open the terminal inside:

backend/

Initialize the Node.js project:

npm init -y

Install the required packages:

npm install express mongoose cors dotenv

Install a development tool:

npm install --save-dev nodemon

---

7. Environment Variables

Create:

backend/.env

Example:

PORT=5000
MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING

Do not put the actual MongoDB password directly into source code.

Add ".env" to ".gitignore".

Example:

node_modules/
.env

---

8. Database Structure

Create a student record containing:

studentId
latitude
longitude
sos
battery
lastUpdated

Example:

{
  "studentId": "ST001",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "sos": false,
  "battery": 87,
  "lastUpdated": "server-generated-time"
}

The backend should use "ST001" as the student ID.

"STUDENT_001" remains the BLE device name.

These are different identifiers:

BLE Device Name:
STUDENT_001

Student ID:
ST001

---

9. API Endpoints

Part 3 needs only a small number of APIs.

API 1 — Send Student Data

POST /api/students/update

The Student App sends:

{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}

The backend validates the data and stores the latest values.

---

10. Backend Validation

Before storing the data, check:

Student ID

Must exist.

Example:

ST001

Latitude

Must be a valid number.

Example:

18.1065

Longitude

Must be a valid number.

Example:

83.3955

Battery

Must be between:

0–100

SOS

Must be:

true

or

false

Invalid data should be rejected instead of being stored.

---

11. API Response

After successfully receiving the data, the backend can return:

{
  "success": true,
  "message": "Student data updated",
  "studentId": "ST001"
}

If invalid:

{
  "success": false,
  "message": "Invalid student data"
}

---

12. API 2 — Get Latest Student Data

Create:

GET /api/students/ST001

The backend returns:

{
  "studentId": "ST001",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "sos": false,
  "battery": 87,
  "lastUpdated": "server-generated-time"
}

This API will later be used by the Faculty App.

---

13. API 3 — Get All Students

Create:

GET /api/students

Example response:

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

This becomes useful when multiple students are added later.

---

14. Student App Integration

Part 2 currently receives data through BLE.

For example:

{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}

After successfully decoding the BLE data, the Student App sends it to:

POST /api/students/update

The complete flow becomes:

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

---

15. Important Separation

BLE and Internet have different jobs.

Bluetooth

Used only for:

Phone A → Phone B

It transfers tracker data locally.

Internet

Used only for:

Phone B → Backend

It uploads the received data.

Therefore:

Phone A
   │
   │ Bluetooth
   ▼
Phone B
   │
   │ Internet
   ▼
Backend

---

16. What Happens When BLE Data Changes

Suppose Phone A initially sends:

{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}

Phone B receives it and uploads it.

Later the location changes:

{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": false,
  "battery": 85
}

Phone B receives the notification and uploads the new values.

The backend updates the record for:

ST001

Therefore the database always contains the latest known information.

---

17. SOS Handling in Part 3

Part 3 stores the SOS state.

Example:

{
  "id": "ST001",
  "lat": 18.1100,
  "lng": 83.4000,
  "sos": true,
  "battery": 85
}

The backend stores:

SOS = true

Part 3 does not yet implement the complete faculty alert system.

It only makes sure that the SOS state reaches and is stored by the backend.

---

18. Battery Handling

The backend also stores the battery value.

Example:

Battery: 87%

Later:

Battery: 75%

Later:

Battery: 50%

The latest value replaces the previous value.

---

19. Location Handling

The backend stores:

Latitude
Longitude

For example:

Latitude: 18.1065
Longitude: 83.3955

The backend does not decide whether the student is inside or outside the 15 km area in Part 3.

That logic belongs to the later alert/geofencing stage.

---

20. Testing Without the Faculty App

Do not build the Faculty App yet.

Part 3 can be tested using:

- Student App
- Backend
- MongoDB

Test sequence:

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

Confirm that the database receives:

ST001
Latitude
Longitude
Battery
SOS
Last Updated

---

21. Backend Testing With an API Tool

Before connecting the Student App, test the backend API directly.

Send:

{
  "id": "ST001",
  "lat": 18.1065,
  "lng": 83.3955,
  "sos": false,
  "battery": 87
}

Expected result:

{
  "success": true,
  "message": "Student data updated",
  "studentId": "ST001"
}

Then request:

GET /api/students/ST001

The response should contain the same latest data.

Only after this works should the Student App be connected to the API.

---

22. Error Handling

The Student App should handle:

Backend unavailable

Internet unavailable

Request failed

Invalid server response

Server error

The BLE connection should not be treated as failed just because the Internet/backend is temporarily unavailable.

These are separate connections:

BLE connection
        +
Internet connection

---

23. Recommended Data Flow

The final Part 3 software flow is:

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

---

24. Part 3 Does NOT Include

Do not add these features yet:

- 15 km geofence
- distance calculation
- faculty dashboard
- faculty login
- push notifications
- SMS
- email alerts
- GPS hardware
- ESP32 hardware
- SIM/GSM
- SOS notification system
- maps for faculty
- multiple advanced roles

Those belong to later parts.

---

25. Part 3 Success Condition

Part 3 is complete when this works reliably:

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

And the database contains the latest:

Student ID
Latitude
Longitude
Battery
SOS
Last Updated

For example:

ST001
18.1065
83.3955
87%
SOS OFF
Updated: current server time

---

26. Final Part 3 Checklist

Backend

- [ ] Node.js project created
- [ ] Express installed
- [ ] MongoDB connected
- [ ] Environment variables configured
- [ ] Student data model created
- [ ] POST "/api/students/update" created
- [ ] GET "/api/students/ST001" created
- [ ] GET "/api/students" created
- [ ] Input validation added
- [ ] Error handling added

Student App

- [ ] BLE still connects to "STUDENT_001"
- [ ] Existing BLE UUIDs unchanged
- [ ] Existing JSON format unchanged
- [ ] Student App receives BLE data
- [ ] Student App sends data to backend
- [ ] Backend response handled

Database

- [ ] "ST001" record created
- [ ] Location stored
- [ ] Battery stored
- [ ] SOS stored
- [ ] Last update time stored
- [ ] Updated values replace old values

---

27. Part 3 Completion

When this works:

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

Part 3 is complete.

Only after Part 3 works should we move to:

Part 4 — Faculty App

Part 4 will read the backend data and display the student's current status to the faculty.
