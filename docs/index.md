# Commons Hub API Reference

Base URL: `https://api.commonshub.brussels/v1`

All responses are JSON. Errors return `{ "error": "message" }` with appropriate HTTP status codes.

---

## Authentication

The API is identity-provider agnostic. It doesn't know or care about Discord, Telegram, or any specific platform. Instead, it trusts **registered apps** to vouch for their users.

### How it works

1. An **app** (Discord bot, CLI, agent) registers with the API and receives credentials
2. The app authenticates its users however it wants (Discord OAuth, device code, etc.)
3. The app calls the API on behalf of the user

Every authenticated request includes:

```
Authorization: Bearer <appSecret>
X-User-Id: <userId>
```

The API trusts the app to have verified the user's identity. The `userId` is an API-level identifier (not a Discord ID or platform-specific ID).

### User identity

Users are created when they first interact through any approved app. The app provides:
- A unique user ID (the app can use its own platform ID, e.g. Discord user ID)
- Display name and username

The API maintains a unified user record across all apps.

---

## Apps

### `POST /v1/apps`

Register a new app. **Admin only** (requires master API key).

**Request:**
```json
{
  "name": "ElinorBot"
}
```

**Response:**
```json
{
  "appId": "app_abc123",
  "appSecret": "chb_sk_live_x7k9...",
  "name": "ElinorBot",
  "createdAt": "2026-03-18T16:00:00Z"
}
```

⚠️ The `appSecret` is shown **once**. Store it securely. The API only stores a hash.

### `GET /v1/apps`

List registered apps. Admin only.

**Response:**
```json
{
  "apps": [
    {
      "appId": "app_abc123",
      "name": "ElinorBot",
      "createdAt": "2026-03-18T16:00:00Z",
      "lastUsedAt": "2026-03-18T16:30:00Z"
    }
  ]
}
```

### `DELETE /v1/apps/:appId`

Revoke an app. Admin only. All requests using this app's secret will immediately return 401.

---

## Device Authorization Flow (CLI)

The CLI authenticates users directly against the API — no Discord needed.

**Prerequisite:** User must already have an API account (created via any app, e.g. Discord bot).

1. CLI calls `POST /v1/auth/device` with its app credentials → gets `deviceCode` + `userCode` (6 digits)
2. CLI displays: "Open https://api.commonshub.brussels/auth/verify and enter code: 482901"
3. User opens the URL, logs in (email, existing session, etc.), enters the code
4. CLI polls `GET /v1/auth/device/:deviceCode` until status is `"approved"`
5. API returns a user-scoped token the CLI uses for subsequent requests

```bash
$ chb login
Open https://api.commonshub.brussels/auth/verify and enter code: 482901
Waiting for authorization... ✓
Logged in as Xavier Damman (@xdamman)
```

### `POST /v1/auth/device`

Start a device authorization flow.

**Request:**
```
Authorization: Bearer <appSecret>
```

**Response:**
```json
{
  "deviceCode": "dev_abc123",
  "userCode": "482901",
  "verifyUrl": "https://api.commonshub.brussels/auth/verify",
  "expiresIn": 900
}
```

### `GET /v1/auth/device/:deviceCode`

Poll for authorization status.

**Response (pending):**
```json
{ "status": "pending" }
```

**Response (approved):**
```json
{
  "status": "approved",
  "userId": "u_849888126",
  "token": "chb_ut_...",
  "displayName": "Xavier Damman"
}
```

### `POST /v1/auth/verify`

Verify a device code. Called from the browser after user logs in.

**Request:**
```json
{
  "userCode": "482901"
}
```

Device codes:
- 6 digits, numeric
- Expire after 15 minutes
- Single use
- Rate limited: max 5 attempts per code

---

## Rooms

### `GET /v1/rooms`

List all bookable rooms.

**Response:**
```json
{
  "rooms": [
    {
      "id": "ostrom",
      "name": "Ostrom Room",
      "calendarId": "c_72861d...@group.calendar.google.com",
      "capacity": 12,
      "amenities": ["projector", "whiteboard"]
    }
  ]
}
```

### `GET /v1/rooms/:roomId/availability`

Get room availability for a date range.

**Query params:**
- `date` — single date (YYYY-MM-DD), defaults to today
- `from` / `to` — date range (YYYY-MM-DD)

**Response:**
```json
{
  "room": "ostrom",
  "date": "2026-03-19",
  "events": [
    {
      "id": "abc123",
      "title": "Board Meeting",
      "start": "2026-03-19T10:00:00+01:00",
      "end": "2026-03-19T12:00:00+01:00",
      "bookedBy": "xdamman"
    }
  ],
  "availableSlots": [
    { "start": "08:00", "end": "10:00" },
    { "start": "12:00", "end": "22:00" }
  ]
}
```

### `POST /v1/rooms/:roomId/book`

Book a room.

**Request:**
```json
{
  "title": "Team Standup",
  "date": "2026-03-19",
  "start": "14:00",
  "end": "15:00",
  "description": "Weekly sync"
}
```

**Response:**
```json
{
  "eventId": "abc123",
  "title": "Team Standup",
  "room": "ostrom",
  "start": "2026-03-19T14:00:00+01:00",
  "end": "2026-03-19T15:00:00+01:00"
}
```

**Errors:**
- `409 Conflict` — room is already booked for that time
- `400 Bad Request` — invalid time range, room doesn't exist

### `DELETE /v1/rooms/:roomId/book/:eventId`

Cancel a room booking. Only the person who booked it (or an admin) can cancel.

**Response:**
```json
{ "ok": true }
```

---

## Shifts

### `GET /v1/shifts`

List shifts for a date range.

**Query params:**
- `date` — single date (YYYY-MM-DD), defaults to today
- `from` / `to` — date range
- `userId` — filter by user (show only shifts a user is signed up for)

**Response:**
```json
{
  "date": "2026-03-19",
  "slots": [
    {
      "index": 0,
      "start": "08:30",
      "end": "11:30",
      "maxSignups": 3,
      "signups": [
        {
          "userId": "u_849888126",
          "username": "xdamman",
          "displayName": "Xavier Damman",
          "signedUpAt": "18/03/2026 14:15"
        }
      ],
      "roomEvents": [
        {
          "title": "Yoga Class",
          "room": "Ostrom",
          "start": "2026-03-19T10:00:00+01:00",
          "end": "2026-03-19T12:00:00+01:00"
        }
      ],
      "spotsLeft": 2
    }
  ]
}
```

### `GET /v1/shifts/:date`

Same as above but for a single date.

### `POST /v1/shifts/:date/:slotIndex/signup`

Sign up for a shift.

**Request:**
```json
{
  "email": "xavier@example.com"
}
```

Email is optional. If provided, the user receives a Google Calendar invite.

**Response:**
```json
{
  "ok": true,
  "slot": { "start": "08:30", "end": "11:30" },
  "date": "2026-03-19",
  "spotsLeft": 1
}
```

**Errors:**
- `409 Conflict` — already signed up for this slot
- `422 Unprocessable` — slot is full

### `DELETE /v1/shifts/:date/:slotIndex/signup`

Cancel a shift signup.

**Response:**
```json
{ "ok": true }
```

### `POST /v1/shifts/:date/:slotIndex/reward`

Mint token rewards for shift participants. Requires minter role.

**Request:**
```json
{
  "participants": ["u_849888126", "u_123456789"],
  "amountPerUser": 3,
  "token": "CHT"
}
```

**Response:**
```json
{
  "results": [
    {
      "userId": "u_849888126",
      "username": "xdamman",
      "amount": 3,
      "txHash": "0xabc...",
      "success": true
    }
  ]
}
```

---

## Users

### `GET /v1/users/me`

Get the authenticated user's profile.

**Response:**
```json
{
  "userId": "u_849888126",
  "username": "xdamman",
  "displayName": "Xavier Damman",
  "email": "xavier@example.com",
  "walletAddress": "0x1234...",
  "roles": ["minter", "admin"]
}
```

### `PUT /v1/users/me`

Update the authenticated user's profile.

**Request:**
```json
{
  "email": "new@example.com",
  "walletAddress": "0x5678..."
}
```

### `GET /v1/users/:userId`

Get a user's public profile (username, displayName, roles). No email or wallet.

---

## Prepared Actions

Any app (ElinorBot, agent) can prepare an action for a user to confirm. This lets an AI agent set everything up, then the user just clicks "Confirm".

### `POST /v1/actions/prepare`

Prepare an action for a user to confirm.

**Request:**
```json
{
  "action": "shift_signup",
  "userId": "u_849888126",
  "params": {
    "date": "2026-03-19",
    "slotIndex": 0
  },
  "expiresIn": 3600
}
```

**Response:**
```json
{
  "actionId": "act_abc123",
  "confirmUrl": "https://api.commonshub.brussels/v1/actions/act_abc123/confirm",
  "expiresAt": "2026-03-19T17:00:00Z"
}
```

The calling app (e.g. Discord bot) shows a single "✅ Confirm" button that triggers execution.

### `GET /v1/actions/:actionId`

Get action details (for showing the confirmation UI).

**Response:**
```json
{
  "actionId": "act_abc123",
  "action": "shift_signup",
  "params": { "date": "2026-03-19", "slotIndex": 0 },
  "userId": "u_849888126",
  "status": "pending",
  "expiresAt": "2026-03-19T17:00:00Z"
}
```

### `POST /v1/actions/:actionId/execute`

Execute a prepared action. Must be called by (or on behalf of) the target user.

**Response:**
```json
{
  "ok": true,
  "result": {
    "slot": { "start": "08:30", "end": "11:30" },
    "date": "2026-03-19",
    "spotsLeft": 1
  }
}
```

**Errors:**
- `403` — wrong user
- `410 Gone` — expired or already executed

---

## Error Format

All errors follow this format:

```json
{
  "error": "slot_full",
  "message": "This shift slot is full (3/3 spots taken)",
  "status": 422
}
```

Standard error codes:
- `400` — bad request (missing params, invalid format)
- `401` — not authenticated (missing/invalid app credentials)
- `403` — not authorized (wrong user, missing role)
- `404` — resource not found
- `409` — conflict (already booked, already signed up)
- `410` — gone (expired action)
- `422` — unprocessable (slot full, invalid state)
- `429` — rate limited
- `500` — server error
