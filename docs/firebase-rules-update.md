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
