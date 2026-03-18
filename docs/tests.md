# Testing Strategy

## Test Runner

Bun's built-in test runner (`bun test`). No Jest, no Vitest — zero config.

## Test Structure

```
tests/
├── unit/
│   ├── services/
│   │   ├── shifts.test.ts     # Shift signup/cancel/reward logic
│   │   ├── rooms.test.ts      # Room booking/availability logic
│   │   ├── users.test.ts      # User store operations
│   │   └── rewards.test.ts    # Token amount calculations
│   ├── middleware/
│   │   └── auth.test.ts       # Signature verification, token validation
│   └── lib/
│       └── config.test.ts     # Config parsing, defaults
├── integration/
│   ├── rooms.test.ts          # Room endpoints end-to-end
│   ├── shifts.test.ts         # Shift endpoints end-to-end
│   ├── auth.test.ts           # Auth flows end-to-end
│   └── actions.test.ts        # Prepared action flow
└── fixtures/
    ├── users.jsonl            # Sample user data
    ├── google-events.json     # Mocked Google Calendar responses
    └── shifts-settings.json   # Test shifts config
```

## Test Categories

### Unit Tests

Test business logic in isolation. Mock all external dependencies (Google Calendar, blockchain).

**What to test:**
- Shift signup rules: capacity limits, duplicate prevention, cancellation
- Room booking: conflict detection, availability calculation
- Reward calculation: hours × rate, participant filtering (exclude declined)
- Auth: HMAC signature verification, token generation/validation, device code lifecycle
- Audit trail: correct format (`DD/MM/YYYY HH:MM: DisplayName <@username> action`)
- User store: CRUD, reverse lookup by email, JSONL append/read
- Prepared actions: creation, expiry, execution, authorization

**Example:**
```typescript
import { describe, it, expect } from "bun:test";
import { calculateShiftReward } from "../src/services/shifts";

describe("calculateShiftReward", () => {
  it("calculates reward based on duration and rate", () => {
    expect(calculateShiftReward("08:30", "11:30", 1)).toBe(3); // 3h × 1 CHT
  });
  
  it("handles half-hour slots", () => {
    expect(calculateShiftReward("08:30", "10:00", 1)).toBe(1.5);
  });
});
```

### Integration Tests

Test full HTTP request → response cycles against a real (but isolated) API instance. Use a temporary data directory per test suite.

**What to test:**
- `POST /v1/shifts/:date/:slot/signup` → creates event, returns 200
- `POST /v1/shifts/:date/:slot/signup` (duplicate) → returns 409
- `POST /v1/shifts/:date/:slot/signup` (full) → returns 422
- `DELETE /v1/shifts/:date/:slot/signup` → cancels, returns 200
- `POST /v1/rooms/:roomId/book` → creates event, returns 200
- `POST /v1/rooms/:roomId/book` (conflict) → returns 409
- `GET /v1/rooms/:roomId/availability` → correct available slots
- Auth: no bearer → 401, invalid secret → 401, valid secret → 200
- App lifecycle: register → use → revoke → rejected
- Device flow: create code → verify → poll → get token
- Prepared actions: prepare → get details → execute → verify completed

**Mocking strategy:**
- Google Calendar: mock at the HTTP level (intercept googleapis calls)
- Blockchain: mock the RPC provider (no real transactions in tests)
- Time: mock `Date.now()` for deterministic timestamps

**Example:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";

describe("POST /v1/shifts/:date/:slot/signup", () => {
  it("creates a signup and returns 200", async () => {
    const res = await app.request("/v1/shifts/2026-03-19/0/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Signature": signRequest({ userId: "123" }),
        "X-Bot-Timestamp": String(Date.now() / 1000),
      },
      body: JSON.stringify({ userId: "123", email: "test@example.com" }),
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.spotsLeft).toBe(2);
  });

  it("returns 409 for duplicate signup", async () => {
    // ... signup once, then try again
    const res = await app.request("/v1/shifts/2026-03-19/0/signup", { ... });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_signed_up");
  });
});
```

## Critical Test Scenarios

These must always pass. If any fails, deployment should be blocked.

### Shifts
- [ ] Signup succeeds when slot has capacity
- [ ] Signup fails when slot is full (422)
- [ ] Signup fails when user already signed up (409)
- [ ] Cancel succeeds for signed-up user
- [ ] Cancel fails for user not signed up (404)
- [ ] Reward minting requires CHT-minter role (403 without)
- [ ] Reward excludes declined attendees
- [ ] Audit trail appends correctly (never overwrites)
- [ ] Audit trail uses correct format: `DD/MM/YYYY HH:MM: Name <@user> action`

### Rooms
- [ ] Booking succeeds when room is available
- [ ] Booking fails on time conflict (409)
- [ ] Cancel succeeds for booking owner
- [ ] Cancel fails for non-owner (403)
- [ ] Availability correctly shows free slots around existing bookings

### Apps & Auth
- [ ] App registration returns appId + appSecret (admin only)
- [ ] App secret is shown once, stored as hash
- [ ] Valid app secret authenticates requests
- [ ] Invalid/revoked app secret returns 401
- [ ] Revoked app is immediately rejected
- [ ] X-User-Id is required for user-scoped endpoints
- [ ] Admin API key grants admin access
- [ ] Device code creation returns 6-digit code
- [ ] Device code expires after 15 minutes
- [ ] Device code is single-use
- [ ] Rate limit: max 5 attempts per device code

### Prepared Actions
- [ ] Prepare returns actionId and confirmUrl
- [ ] Action can only be executed by the target user
- [ ] Action expires after TTL
- [ ] Action is single-use (can't execute twice)

### Data Integrity
- [ ] JSONL files handle concurrent appends correctly
- [ ] Startup loads latest entry per ID (handles updates)
- [ ] Malformed JSONL lines are skipped without crashing
- [ ] Empty data directory works (cold start)

## Running Tests

```bash
# All tests
bun test

# Unit only
bun test tests/unit

# Integration only
bun test tests/integration

# Specific file
bun test tests/unit/services/shifts.test.ts

# Watch mode
bun test --watch
```

## CI

Tests run on every push via GitHub Actions:

```yaml
- uses: oven-sh/setup-bun@v2
- run: bun install
- run: bun test
```

No external services needed in CI — everything is mocked.
