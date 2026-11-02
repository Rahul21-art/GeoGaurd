# Firebase rules update for version 1.2 (per-student range)

Version 1.2 stores a custom range for a student at `studentRadius/{uid}` (a number in km).
Only faculty may write it. A student may read their own value, and faculty may read all.

Open **Firebase console → Realtime Database → Rules**, and add this block **inside the top-level `"rules"` object**, next to the existing `"telemetry"`, `"users"` and `"admins"` entries. Do not remove anything else, then click **Publish**.

```json
"studentRadius": {
  ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
  "$uid": {
    ".read": "auth != null && auth.uid === $uid",
    ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
    ".validate": "newData.isNumber() && newData.val() >= 0.5 && newData.val() <= 200"
  }
}
```

(Setting a value to `null` is how "Reset to default" works, and `null` is always allowed by `.validate`.)

## Shake SOS note

The native shake service writes two fields directly over HTTPS as the signed-in student:

- `telemetry/{uid}/sos` (true or false)
- `telemetry/{uid}/updatedAt` (server timestamp)

These are the same fields the app already writes, so existing rules for the student's own telemetry should allow them. If an SOS from a locked phone never appears on the faculty screen, check that your rules allow a student to write those two child paths.


---

# Firebase rules update for version 1.4 (SOS push alerts and return deadline)

Version 1.4 lets the faculty phone check for active SOS every 10 seconds even when the app is closed.
It asks Firebase for "students whose `sos` is true". Firebase needs an index for that.

In **Firebase console → Realtime Database → Rules**, find the existing `"telemetry"` block and add one line
at its top level (next to `".read"` and `".write"`, not inside `"$uid"`):

```json
"telemetry": {
  ".indexOn": ["sos"],
  ...keep everything that is already here...
}
```

Click **Publish**. Without this line the alerts still work, but the phone downloads all student locations
every 10 seconds instead of only the SOS ones, which uses more mobile data and battery.

The new settings (hostel location, return time, allowed distance) are saved in `config/safety` by the
Settings screen. If your rules for `config/safety` only allow specific child names, add these:
`hostelLatitude`, `hostelLongitude`, `returnDeadline`, `returnDistanceKm`, `returnAlertsEnabled`.


---

# Firebase rules update for version 1.6 (call-back messages)

Messages from faculty are stored at `inbox/{studentUid}/{messageId}`. Faculty can write and read all of them.
A student can read only their own inbox, and can only write the `seenAt` field of their own messages (the
"Got it" receipt).

Open **Firebase console → Realtime Database → Rules**, add this block **inside the top-level `"rules"` object**
(next to `"telemetry"`, `"users"`, `"studentRadius"`), then click **Publish**:

```json
"inbox": {
  ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
  "$uid": {
    ".read": "auth != null && auth.uid === $uid",
    "$msgId": {
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
      ".validate": "newData.hasChildren(['text', 'createdAt'])",
      "text": { ".validate": "newData.isString() && newData.val().length <= 200" },
      "fromName": { ".validate": "newData.isString() && newData.val().length <= 60" },
      "batch": { ".validate": "newData.isString() && newData.val().length <= 40" },
      "createdAt": { ".validate": "newData.isNumber()" },
      "seenAt": {
        ".write": "auth != null && auth.uid === $uid",
        ".validate": "newData.isNumber()"
      },
      "$other": { ".validate": false }
    }
  }
}
```

Without this block, faculty cannot send messages (the app shows "Could not send").


---

# Firebase rules update for version 1.7 (live map path)

Each student's phone saves one location point per minute at `trail/{studentUid}/{minuteNumber}` and deletes
points older than 3 hours. Faculty can read every path. A student can write only their own path.

Open **Firebase console → Realtime Database → Rules**, add this block **inside the top-level `"rules"` object**,
then click **Publish**:

```json
"trail": {
  "$uid": {
    ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
    ".write": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).val() === true)",
    "$minute": {
      ".validate": "newData.hasChildren(['la', 'lo'])",
      "la": { ".validate": "newData.isNumber() && newData.val() >= -90 && newData.val() <= 90" },
      "lo": { ".validate": "newData.isNumber() && newData.val() >= -180 && newData.val() <= 180" },
      "$other": { ".validate": false }
    }
  }
}
```

Without it the map still shows every student's pin (it uses the normal live data), but no path is drawn.
