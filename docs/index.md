# Commons Hub API Reference

Base URL: `https://api.commonshub.brussels/v1`

All responses are JSON. Errors return `{ "error": "message" }` with appropriate HTTP status codes.

---

## Authentication

### Discord Bot Authentication

The Discord bot signs requests with a shared secret (`X-Bot-Signature` header). The request body includes the Discord user ID, which the API trusts because the bot has already verified the user's identity through Discord.

```
POST /v1/shifts/2026-03-19/0/signup
X-Bot-Signature: sha256=<hmac of request body>
Content-Type: application/json

{
  "userId": "849888126",
  "email": "xavier@example.com"
}
```

### Device Authorization Flow (CLI)

For the `chb` CLI tool. Similar to how `gh auth login` works:

1. CLI calls `POST /v1/auth/device` → gets a `deviceCode` and `userCode` (6 digits)
2. CLI displays: "Open https://api.commonshub.brussels/auth/verify and enter code: 482901"
3. User opens the URL in their browser, logs in with Discord OAuth2, enters the 6-digit code
4. CLI polls `GET /v1/auth/device/:deviceCode` until status is `"approved"`
5. API returns a long-lived bearer token tied to the user's Discord identity
6. CLI stores the token locally (`~/.config/chb/token`)

```bash
$ chb login
Open https://api.commonshub.brussels/auth/verify and enter code: 482901
Waiting for authorization... ✓
Logged in as Xavier Damman (@xdamman)
```

### API Key Authentication

For server-to-server calls. API keys are generated in the admin interface or via CLI.

```
Authorization: Bearer chb_sk_live_abc123...
```

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
          "userId": "849888126",
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

Same as above but for a single date. Shorthand for `GET /v1/shifts?date=2026-03-19`.

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

Mint token rewards for shift participants. Requires `CHT-minter` role.

**Request:**
```json
{
  "participants": ["849888126", "123456789"],
  "amountPerUser": 3,
  "token": "CHT"
}
```

**Response:**
```json
{
  "results": [
    {
      "userId": "849888126",
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
  "userId": "849888126",
  "username": "xdamman",
  "displayName": "Xavier Damman",
  "email": "xavier@example.com",
  "walletAddress": "0x1234...",
  "roles": ["CHT-minter", "shifts-master"]
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

## Prepared Actions (for Discord bot integration)

ElinorBot (or any agent) can prepare an action and generate a confirmation link that drops the Discord user directly into the final "confirm" step.

### `POST /v1/actions/prepare`

Prepare an action for a user to confirm.

**Request:**
```json
{
  "action": "shift_signup",
  "params": {
    "date": "2026-03-19",
    "slotIndex": 0,
    "userId": "849888126"
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

The Discord bot can then show a single "✅ Confirm" button that calls `POST /v1/actions/:actionId/execute`. The action is pre-validated — the user just confirms.

### `GET /v1/actions/:actionId`

Get action details (for showing the confirmation UI).

### `POST /v1/actions/:actionId/execute`

Execute a prepared action. Must be called by the same user the action was prepared for.

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
- `401` — not authenticated
- `403` — not authorized (wrong role, not your booking)
- `404` — resource not found
- `409` — conflict (already booked, already signed up)
- `422` — unprocessable (slot full, invalid state)
- `500` — server error
