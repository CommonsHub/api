# Commons Hub API

API for Commons Hub Brussels — book rooms, sign up for shifts, manage rewards.

**Base URL:** `https://api.commonshub.brussels/v1`

## What is this?

A shared backend that powers:
- **Discord bot** (ElinorBot) — room booking, shift signups, token rewards
- **CLI tool** (`chb`) — quick commands from your terminal
- **OpenClaw agents** — AI-powered automation

The API is the single source of truth. Clients are thin frontends.

## Endpoints

### Rooms

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rooms` | List all rooms |
| `GET` | `/rooms/:roomId/availability` | Get availability for a room |
| `POST` | `/rooms/:roomId/book` | Book a room |
| `DELETE` | `/rooms/:roomId/book/:eventId` | Cancel a booking |

### Shifts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/shifts` | List shifts (with signups) for a date range |
| `GET` | `/shifts/:date` | Get shift slots for a specific date |
| `POST` | `/shifts/:date/:slotIndex/signup` | Sign up for a shift |
| `DELETE` | `/shifts/:date/:slotIndex/signup` | Cancel a shift signup |
| `POST` | `/shifts/:date/:slotIndex/reward` | Mint token rewards for a shift |

### Users

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users/me` | Get current user profile |
| `PUT` | `/users/me` | Update profile (email, wallet address) |
| `GET` | `/users/:userId` | Get a user's public profile |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/discord` | Authenticate via Discord OAuth2 |
| `POST` | `/auth/device` | Start device auth flow (for CLI) |
| `GET` | `/auth/device/:code` | Check device auth status |
| `POST` | `/auth/verify` | Verify a 6-digit code (device flow) |

## Authentication

Three auth methods depending on the client:

1. **Discord bot** — signs requests with a shared secret. The bot vouches for the user's identity (Discord user ID is trusted).
2. **CLI** — device authorization flow. User runs `chb login`, gets a 6-digit code, opens a webpage, enters the code to link their CLI session to their Discord account.
3. **API key** — for server-to-server calls (OpenClaw agents, admin scripts).

All authenticated requests include an `Authorization` header:
```
Authorization: Bearer <token>
```

## Quick start

```bash
# Install dependencies
bun install

# Configure
cp .env.example .env
# Edit .env with your credentials

# Run
bun run dev

# Run tests
bun test
```

## Docs

- [API Reference](/docs) — full endpoint documentation
- [Technical Specs](/docs/specs) — stack, dependencies, architecture
- [Tests](/docs/tests) — testing strategy and coverage

Live docs: `https://api.commonshub.brussels/docs`

Append `.md` to any docs URL to get the raw markdown.

## License

MIT
