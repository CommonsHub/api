# Technical Specs

## Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Runtime | **Bun** | Fast, built-in TypeScript, built-in test runner, built-in SQLite |
| Language | **TypeScript** | Type safety without build step (Bun runs it natively) |
| HTTP | **Hono** | Lightweight, fast, middleware-friendly, works everywhere |
| Data | **JSONL files** | Simple, human-readable, append-only, easy to debug. SQLite as upgrade path if needed |
| Calendar | **Google Calendar API** (googleapis) | Existing integration, service account auth |
| Blockchain | **viem** | ERC20 minting for shift rewards (CHT token) |
| Nostr | **nostr-tools** | Event creation, signing, relay publishing |
| Docs | **Markdown → HTML** | Serve `/docs` as rendered HTML, `.md` extension for raw markdown |

## Project Structure

```
src/
├── index.ts              # Entry point, Hono app setup
├── routes/
│   ├── rooms.ts          # Room booking endpoints
│   ├── shifts.ts         # Shift signup endpoints
│   ├── users.ts          # User profile endpoints
│   ├── auth.ts           # Device auth flow, app management
│   ├── actions.ts        # Prepared action system
│   └── docs.ts           # Docs serving (markdown → HTML)
├── services/
│   ├── calendar.ts       # Google Calendar operations
│   ├── shifts.ts         # Shift business logic
│   ├── rooms.ts          # Room booking business logic
│   ├── rewards.ts        # Token minting
│   ├── users.ts          # User store
│   └── apps.ts           # App registration and auth
├── middleware/
│   ├── auth.ts           # App auth middleware
│   └── logging.ts        # Request logging
├── lib/
│   ├── google-calendar.ts  # Google Calendar client
│   ├── blockchain.ts       # viem client, minting
│   ├── nostr.ts            # Nostr key management, signing, publishing
│   ├── crypto.ts           # Envelope encryption (AES-256-GCM)
│   └── config.ts           # Environment config
└── data/                  # Runtime data (gitignored)
    ├── users.jsonl
    ├── apps.jsonl         # Registered apps (hashed secrets)
    ├── device-codes.jsonl # Pending device auth codes
    └── actions.jsonl      # Prepared actions
```

## Data Storage

### Why JSONL files (not a database)

- **Debuggable**: `cat data/users.jsonl | jq .` — instant insight
- **Append-only**: No corruption risk from partial writes
- **Portable**: Copy files to move data, no dump/restore
- **Simple**: No connection pooling, no migrations, no ORM
- **Good enough**: We're managing a single coworking space, not millions of users

### Upgrade path

If JSONL becomes a bottleneck (>10k records, need complex queries):
- Bun has built-in SQLite (`bun:sqlite`) — zero dependencies
- Migrate with a one-time script that reads JSONL and inserts into SQLite
- Keep the same service interfaces — only the storage layer changes

### File format

Each file is append-only JSONL. One JSON object per line.

```jsonl
{"id":"u_1","username":"xdamman","displayName":"Xavier Damman","email":"x@example.com","createdAt":"2026-03-18T15:00:00Z"}
{"id":"u_1","username":"xdamman","displayName":"Xavier Damman","email":"new@example.com","updatedAt":"2026-03-18T16:00:00Z"}
```

Updates are appended. On startup, the file is read and the latest entry per ID wins. Periodic compaction removes stale entries.

## Authentication Architecture

The API is **identity-provider agnostic**. It doesn't know about Discord, Telegram, or any platform.

### Apps

Apps are external clients that connect to the API. Each app:
- Registers once and receives an `appId` + `appSecret`
- Authenticates requests with `Authorization: Bearer <appSecret>`
- Vouches for its users via `X-User-Id` header
- The API trusts the app to have verified the user's identity

```
App registers:
  POST /v1/apps { name: "ElinorBot" }
  → { appId: "app_abc", appSecret: "chb_sk_live_..." }  (secret shown once)

App makes requests:
  Authorization: Bearer chb_sk_live_...
  X-User-Id: u_849888126
```

The `appSecret` is stored as a SHA-256 hash in `data/apps.jsonl`. The plaintext is never stored.

### User identity

Users are platform-agnostic. A user created via the Discord bot and a user created via CLI are the same entity if linked. Apps provide user metadata (display name, username) on first interaction.

### Device flow (CLI)

For headless clients that can't open a browser inline:

```
CLI                    API                    Browser
 |                      |                      |
 |-- POST /auth/device->|                      |
 |   (with app creds)   |                      |
 |<-- deviceCode,       |                      |
 |    userCode: 482901  |                      |
 |                      |                      |
 | "Enter 482901 at     |                      |
 |  api.../auth/verify" |                      |
 |                      |                      |
 |                      |<-- User opens URL ---|
 |                      |<-- Enters code ------|
 |                      |--- Links to user --->|
 |                      |                      |
 |-- GET /auth/device/  |                      |
 |   :deviceCode ------>|                      |
 |<-- token, userId ----|                      |
```

The user must already have an API account (created via any app). The device flow links a CLI session to that existing account.

### Admin access

A master API key (set via `ADMIN_API_KEY` env var) grants admin access for:
- Registering/revoking apps
- Managing users
- Any endpoint without user context

## External Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `hono` | ^4.x | HTTP framework |
| `googleapis` | ^144.x | Google Calendar API |
| `viem` | ^2.x | Ethereum interactions (ERC20 minting) |
| `nostr-tools` | ^2.x | Nostr event creation, signing, relay communication |
| `marked` | ^15.x | Markdown → HTML for docs |

Five production dependencies.

## Configuration

All config via environment variables:

```bash
# Server
PORT=3000
BASE_URL=https://api.commonshub.brussels

# Admin
ADMIN_API_KEY=chb_admin_...   # Master key for app registration etc.

# Google Calendar
GOOGLE_ACCOUNT_KEY_FILEPATH=./google-account-key.json
GOOGLE_CALENDAR_IMPERSONATE_USER=commonshub@opencollective.com

# Blockchain
RPC_URL=https://...
MINTER_PRIVATE_KEY=0x...

# Nostr
NSEC_MASTER_KEY=...           # 32 bytes hex, for encrypting user nsecs
NOSTR_RELAY_URL=wss://relay.commonshub.brussels
NOSTR_ENABLED=true

# Data
DATA_DIR=./data
```

## Deployment

- **Runtime**: Bun (single binary, no node_modules in production)
- **Container**: Dockerfile with `oven/bun:1` base
- **Hosting**: Coolify on existing VPS (91.99.139.62)
- **Domain**: `api.commonshub.brussels` → Coolify reverse proxy
- **SSL**: Managed by Coolify (Let's Encrypt)

## Assumptions

1. **Single tenant**: This API serves one Commons Hub (Brussels). Multi-tenancy is not a goal.
2. **Low traffic**: <100 requests/minute. No need for caching layers, queues, or horizontal scaling.
3. **Google Calendar is the source of truth** for room bookings and shift events. The API reads/writes to Google Calendar directly.
4. **Platform agnostic**: Users can come from Discord, CLI, web, agents — the API doesn't care. Apps vouch for their users.
5. **Token minting is slow** (~5-15 seconds per transaction). Reward endpoints should respond immediately and process minting asynchronously, returning tx hashes via polling or webhook.
6. **The API and its clients are independent**. The Discord bot calls the API, but the API never calls the bot.
