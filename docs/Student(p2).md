Part 2 — Phone B: Student App

1. Purpose

Phone B is the student's mobile phone.

The Student App on Phone B connects to the BLE simulator running on Phone A.

The purpose of Part 2 is to prove that data can travel:

Phone A
BLE Simulator
      │
      │ Bluetooth BLE
      ▼
Phone B
Student App

The Student App will:

1. Scan for the BLE device.
2. Find "STUDENT_TRACKER_001".
3. Connect to the device.
4. Discover the BLE service.
5. Discover the BLE characteristic.
6. Subscribe to characteristic notifications.
7. Receive tracker data.
8. Decode the received data.
9. Display the latest tracker information.

---

2. BLE Device Information

Phone A is the BLE simulator created in Part 1.

The BLE device name is:

STUDENT_001

For the first test, Phone A sends:

ID: ST001
Latitude: 18.1065
Longitude: 83.3955
SOS: OFF
Battery: 87%

Phone B must receive this information through Bluetooth.

---

3. Part 2 Goal

The complete Part 2 test is:

PHONE A
BLE SIMULATOR
      │
      │ Bluetooth BLE
      ▼
PHONE B
STUDENT APP

Phone B should display:

Student: ST001

Location:
18.1065, 83.3955

Battery:
87%

SOS:
OFF

Bluetooth:
Connected

When this works, Part 2 is complete.

---

4. Important Scope

Part 2 must only deal with Bluetooth communication.

Do NOT implement these yet:

❌ Backend
❌ Database
❌ Faculty App
❌ Internet communication
❌ 15 km boundary
❌ Geofencing
❌ Faculty alerts
❌ Push notifications
❌ GPS hardware
❌ ESP32 hardware
❌ SIM card
❌ GSM

Those belong to later parts.

The only objective is:

BLE Simulator → Student App

---

5. Recommended Technology

Use a mobile application for Phone B.

Recommended stack:

React Native

BLE library:

react-native-ble-plx

The Student App requires native Bluetooth functionality.

Therefore, use a native-capable Android development/build workflow.

Do not make the Student App as a normal browser-only website because reliable BLE scanning, connection and notification handling require native Bluetooth access.

---

6. Project Structure

Keep the Student App separate from the BLE simulator.

Recommended structure:

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

The Student App code belongs inside:

student-app/

Do not manually create "node_modules".

The package manager creates "node_modules" automatically when dependencies are installed.

---

7. BLE Device Identification

The Student App should specifically search for:

STUDENT_TRACKER_001

The application should not automatically connect to unrelated nearby BLE devices.

The intended flow is:

Start Scan
     ↓
BLE Device Found
     ↓
Check Device Name
     ↓
STUDENT_TRACKER_001?
     │
     ├── No → Ignore
     │
     └── Yes
          ↓
       Connect

---

8. BLE Service and Characteristic

The Student App must use the same BLE Service UUID and Characteristic UUID configured in Part 1.

Do not create a different UUID for Part 2.

The configuration must match:

Phone A
BLE Simulator
     │
     ├── Service UUID
     │
     └── Characteristic UUID
              │
              ▼
Phone B
Student App

The characteristic must support:

Notify

The Student App subscribes to notifications from this characteristic.

The actual UUID values must be copied from the working Part 1 implementation.

---

9. BLE Roles

Phone A acts as the BLE peripheral/advertiser.

Phone B acts as the BLE central/scanner.

Therefore:

Phone A
BLE Peripheral
      │
      │ BLE
      ▼
Phone B
BLE Central

Phone B scans for Phone A.

After finding the correct device, Phone B connects to it.

Phone A then sends data using BLE characteristic notifications.

---

10. Student App Startup

When the Student App opens, display a simple screen.

Example:

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

The application should not assume that the device is already connected.

---

11. Bluetooth Permissions

The application must request the Android Bluetooth permissions required for the device's Android version.

For newer Android versions, these include:

BLUETOOTH_SCAN
BLUETOOTH_CONNECT

Depending on Android version and implementation, additional permission handling may be required.

The application should clearly explain the reason for Bluetooth permission.

Example:

Bluetooth permission is required to
find and connect to the student tracker.

Only required permissions should be requested.

---

12. Bluetooth Disabled

If Bluetooth is disabled, show:

Bluetooth is turned off.

Please enable Bluetooth and try again.

The user should then be able to retry the connection.

---

13. Start Scanning

When the user presses:

[ Scan & Connect ]

the application starts a BLE scan.

Flow:

Start Scan
     ↓
BLE Device Discovered
     ↓
Check Device Name
     ↓
STUDENT_TRACKER_001?

If the device is not the required device:

Ignore Device

If the device is the required device:

Stop Scan
     ↓
Connect

---

14. Scanning Status

Display the current state.

Possible states:

Scanning...

Device Found

Connecting...

Connected

Disconnected

Device Not Found

Bluetooth Permission Required

This makes the application easier to test and demonstrate.

---

15. Device Found

When the application finds:

STUDENT_TRACKER_001

display:

Device Found

STUDENT_TRACKER_001

Connecting...

After finding the correct device, stop scanning before connecting.

---

16. Connect to BLE Device

After finding the correct device:

Connect
   ↓
Discover Services
   ↓
Discover Characteristics
   ↓
Find Required Characteristic
   ↓
Subscribe to Notifications

The app should not assume that services and characteristics are immediately available.

They must be discovered after the connection is established.

---

17. Service Discovery

After connecting:

Connected
    ↓
Discover All Services
    ↓
Discover All Characteristics

The app then searches for the Service UUID configured in Part 1.

After finding the correct service, it searches for the configured characteristic.

---

18. Characteristic Notifications

The characteristic supports:

Notify

The Student App subscribes to notifications.

The communication becomes:

Phone A
BLE Simulator
      │
      │ Notification
      ▼
Phone B
Student App

Whenever Phone A sends updated information, Phone B receives the notification automatically.

The Student App does not need to repeatedly request the data.

---

19. Received Data

The first test data is:

ID: ST001
Latitude: 18.1065
Longitude: 83.3955
SOS: OFF
Battery: 87%

The Student App receives the data as BLE bytes.

The application must decode those bytes into readable text.

Conceptually:

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

The decoding method must match the encoding used by Part 1.

Do not use a different encoding without changing both sides.

---

20. Preferred Data Format

For the actual implementation, JSON is recommended because it is easier to parse reliably.

Recommended BLE message:

{
  "id": "ST001",
  "latitude": 18.1065,
  "longitude": 83.3955,
  "sos": false,
  "battery": 87
}

The Student App can then parse the message:

BLE notification
       ↓
JSON string
       ↓
JSON.parse()
       ↓
Student data object

Result:

id
latitude
longitude
sos
battery

If Part 1 currently sends the original text format, Part 2 must initially support the exact format currently being transmitted.

Both sides must use the same data format.

---

21. Student Data Structure

The Student App should maintain one current data object:

StudentData

id
latitude
longitude
sos
battery

Example:

id = ST001
latitude = 18.1065
longitude = 83.3955
sos = false
battery = 87

At this stage, do not add unnecessary backend fields.

---

22. Student App UI

The first version should be simple and easy to understand.

Recommended screen:

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

The main purpose is to prove that the Bluetooth data is being received correctly.

---

23. Connection Button

Before connecting:

[ Scan & Connect ]

During scanning:

[ Scanning... ]

After successful connection:

🟢 Connected

After connection, the user can have:

[ Disconnect ]

If disconnected:

[ Reconnect ]

---

24. Updating the Data

Whenever a new BLE notification arrives:

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

No manual refresh should be required.

Example:

Initial:

Battery: 87%
SOS: OFF

Phone A sends:

Battery: 86%
SOS: OFF

Phone B automatically changes to:

Battery: 86%
SOS: OFF

---

25. SOS Update

The Student App should display the latest SOS value received from the BLE device.

Example:

SOS: OFF

If Phone A sends:

SOS: ON

Phone B should immediately display:

SOS: ON

Do not send an alert to faculty yet.

The faculty alert system belongs to a later part.

---

26. Battery Update

The Student App should display the latest battery value.

Example:

Battery: 87%

If the next notification contains:

Battery: 86%

the UI should automatically update.

The app should treat battery as a percentage:

0–100

---

27. Location Update

The Student App should display:

Latitude: 18.1065
Longitude: 83.3955

or:

18.1065, 83.3955

If a new location arrives, replace the old location immediately.

The Student App does not calculate the 15 km boundary yet.

---

28. Data Validation

Before displaying received data, validate the values.

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

Must normally be between:

0 and 100

SOS

Must resolve to:

true / false

or:

ON / OFF

Invalid data should not crash the application.

---

29. Error Handling

Bluetooth disabled

Display:

Bluetooth is turned off.

Please enable Bluetooth and try again.

---

Permission denied

Display:

Bluetooth permission is required
to connect to the student tracker.

---

Device not found

If the device is not discovered:

STUDENT_TRACKER_001 not found.

Make sure the BLE simulator is running
on Phone A and try again.

---

Connection failed

Display:

Unable to connect to
STUDENT_TRACKER_001.

Please try again.

---

Device disconnected

Display:

🔴 Disconnected

Provide:

[ Reconnect ]

---

Invalid data

Display:

Invalid tracker data received.

The application must remain running.

---

30. No Internet in Part 2

The Student App should not send the received data to the internet yet.

Current architecture:

Phone A
BLE Simulator
      │
      │ Bluetooth
      ▼
Phone B
Student App

There is no backend connection yet.

Part 3 will add:

Phone B
Student App
      │
      │ Internet
      ▼
Backend

---

31. Testing Setup

Use two physical Android phones.

Phone A

Runs the BLE simulator.

It advertises:

STUDENT_TRACKER_001

and sends:

ID: ST001
Latitude: 18.1065
Longitude: 83.3955
SOS: OFF
Battery: 87%

---

Phone B

Runs the Student App.

It acts as:

BLE Scanner
+
BLE Central
+
Data Receiver

---

32. First Test

Step 1

Open the BLE simulator on Phone A.

Make sure the BLE device is advertising:

STUDENT_TRACKER_001

---

Step 2

Open the Student App on Phone B.

---

Step 3

Give the required Bluetooth permissions.

---

Step 4

Press:

[ Scan & Connect ]

---

Step 5

Expected:

Scanning...

---

Step 6

The app finds:

STUDENT_TRACKER_001

---

Step 7

Expected:

Device Found
Connecting...

---

Step 8

Expected:

🟢 Connected

---

Step 9

Phone A sends:

ID: ST001
Latitude: 18.1065
Longitude: 83.3955
SOS: OFF
Battery: 87%

---

Step 10

Phone B displays:

Student: ST001

Location:
18.1065, 83.3955

Battery:
87%

SOS:
OFF

---

33. Part 2 Success Condition

Part 2 is complete only when:

Phone A
BLE Simulator
      │
      │ BLE
      ▼
Phone B
Student App

works reliably.

The values displayed on Phone B must match the values transmitted by Phone A.

Example:

Phone A sends:

ID: ST001
Latitude: 18.1065
Longitude: 83.3955
SOS: OFF
Battery: 87%

          ↓ BLE

Phone B displays:

Student: ST001
Location: 18.1065, 83.3955
Battery: 87%
SOS: OFF

---

34. Reconnection Test

After the first successful connection:

1. Disconnect the BLE simulator.
2. Confirm that Phone B shows:

🔴 Disconnected

3. Start the BLE simulator again.
4. Press:

[ Reconnect ]

5. Confirm that the Student App can connect again.

This must work before Part 2 is considered complete.

---

35. Live Data Test

After connection, change the values being transmitted by Phone A.

For example:

Battery: 86%

The Student App should change automatically:

Battery: 86%

Then change:

SOS: ON

The Student App should display:

SOS: ON

Then change the location.

The Student App should display the new coordinates.

This proves that the BLE notification system is working continuously.

---

36. Part 2 Architecture

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
│  Scan                       │
│     ↓                        │
│  Find Device                │
│     ↓                        │
│  Connect                    │
│     ↓                        │
│  Discover Service           │
│     ↓                        │
│  Discover Characteristic    │
│     ↓                        │
│  Subscribe to Notify        │
│     ↓                        │
│  Receive Data               │
│     ↓                        │
│  Decode Data                │
│     ↓                        │
│  Display Data               │
└──────────────────────────────┘

---

37. Definition of Done

Part 2 is complete when all of the following work:

- [ ] Student App runs on Phone B.
- [ ] Bluetooth permissions work.
- [ ] Bluetooth scanning works.
- [ ] "STUDENT_TRACKER_001" is discovered.
- [ ] The correct device is selected.
- [ ] Connection works.
- [ ] BLE services are discovered.
- [ ] Correct characteristic is discovered.
- [ ] Notification subscription works.
- [ ] Phone B receives BLE data.
- [ ] BLE data is decoded correctly.
- [ ] Student ID is displayed.
- [ ] Latitude is displayed.
- [ ] Longitude is displayed.
- [ ] Battery is displayed.
- [ ] SOS status is displayed.
- [ ] Data updates automatically.
- [ ] Disconnect is detected.
- [ ] Reconnection works.
- [ ] Invalid data does not crash the app.
- [ ] No backend is used yet.
- [ ] No 15 km calculation is used yet.
- [ ] No faculty alert is used yet.

---

38. Transition to Part 3

Only after Part 2 works completely should Part 3 begin.

Current system:

Phone A
BLE Simulator
      │
      │ Bluetooth
      ▼
Phone B
Student App

Part 3 adds the internet/backend layer:

Phone A
BLE Simulator
      │
      │ Bluetooth
      ▼
Phone B
Student App
      │
      │ Internet
      ▼
Backend

The backend will later store:

Student ID
Latitude
Longitude
SOS
Battery
Last Updated Time

Part 3 must not be implemented until the Phone A → Phone B BLE communication is working reliably.
