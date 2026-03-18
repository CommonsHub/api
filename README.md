# Commons Hub API

API for Commons Hub Brussels — book rooms, sign up for shifts, manage rewards.

**Base URL:** `https://api.commonshub.brussels/v1`

## What is this?

A shared backend that powers:
- **Discord bot** (ElinorBot) — room booking, shift signups, token rewards
- **CLI tool** (`chb`) — quick commands from your terminal
- **OpenClaw agents** — AI-powered automation

The API is the single source of truth. Clients are thin frontends. The API is identity-provider agnostic — it trusts registered apps to vouch for their users.

## Endpoints

### Apps & Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/apps` | Register an app (admin only) |
| `GET` | `/apps` | List registered apps (admin only) |
| `DELETE` | `/apps/:appId` | Revoke an app (admin only) |
| `POST` | `/auth/device` | Start device auth flow (for CLI) |
| `GET` | `/auth/device/:code` | Poll device auth status |
| `POST` | `/auth/verify` | Verify a 6-digit code |

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
| `GET` | `/shifts` | List shifts for a date range |
| `GET` | `/shifts/:date` | Get shift slots for a specific date |
| `POST` | `/shifts/:date/:slotIndex/signup` | Sign up for a shift |
| `DELETE` | `/shifts/:date/:slotIndex/signup` | Cancel a shift signup |
| `POST` | `/shifts/:date/:slotIndex/reward` | Mint token rewards |

### Users

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users/me` | Get current user profile |
| `PUT` | `/users/me` | Update profile (email, wallet) |
| `GET` | `/users/:userId` | Get a user's public profile |

### Prepared Actions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/actions/prepare` | Prepare an action for user confirmation |
| `GET` | `/actions/:actionId` | Get action details |
| `POST` | `/actions/:actionId/execute` | Execute a prepared action |

## Authentication

Apps register with the API and get credentials. Each request includes:

```
Authorization: Bearer <appSecret>
X-User-Id: <userId>
```

The API trusts the app to vouch for the user's identity. See [docs/index.md](docs/index.md) for details on app registration, device flow, and admin access.

## Quick start

```bash
bun install
cp .env.example .env  # Edit with your credentials
bun run dev
bun test
```

## Docs

- [API Reference](docs/index.md) — full endpoint documentation
- [Technical Specs](docs/specs.md) — stack, dependencies, architecture
- [Tests](docs/tests.md) — testing strategy and coverage

Live docs: `https://api.commonshub.brussels/docs`  
Append `.md` to any docs URL to get the raw markdown.

## License

MIT
