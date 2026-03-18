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
| Auth | **Discord OAuth2** + **HMAC signatures** + **device flow** | Three client types, three auth methods |
| Docs | **Markdown → HTML** | Serve `/docs` as rendered HTML, `.md` extension for raw markdown |

## Project Structure

```
src/
├── index.ts              # Entry point, Hono app setup
├── routes/
│   ├── rooms.ts          # Room booking endpoints
│   ├── shifts.ts         # Shift signup endpoints
│   ├── users.ts          # User profile endpoints
│   ├── auth.ts           # Auth flows (Discord OAuth, device, API key)
│   ├── actions.ts        # Prepared action system
│   └── docs.ts           # Docs serving (markdown → HTML)
├── services/
│   ├── calendar.ts       # Google Calendar operations
│   ├── shifts.ts         # Shift business logic
│   ├── rooms.ts          # Room booking business logic
│   ├── rewards.ts        # Token minting
│   └── users.ts          # User store
├── middleware/
│   ├── auth.ts           # Auth middleware (bearer, bot signature, API key)
│   └── logging.ts        # Request logging
├── lib/
│   ├── google-calendar.ts  # Google Calendar client
│   ├── blockchain.ts       # viem client, minting
│   └── config.ts           # Environment config
└── data/                  # Runtime data (gitignored)
    ├── users.jsonl
    ├── sessions.jsonl     # Auth sessions
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
{"id":"u_1","discordUserId":"849888126","username":"xdamman","displayName":"Xavier Damman","email":"x@example.com","createdAt":"2026-03-18T15:00:00Z"}
{"id":"u_1","discordUserId":"849888126","username":"xdamman","displayName":"Xavier Damman","email":"new@example.com","updatedAt":"2026-03-18T16:00:00Z"}
```

Updates are appended. On startup, the file is read and the latest entry per ID wins. Periodic compaction removes stale entries.

## Authentication Details

### Discord Bot Signature

The Discord bot (ElinorBot) signs requests using HMAC-SHA256 with a shared secret:

```
signature = HMAC-SHA256(sharedSecret, timestamp + "." + requestBody)
X-Bot-Signature: sha256=<signature>
X-Bot-Timestamp: <unix timestamp>
```

The API verifies:
1. Timestamp is within 5 minutes (prevent replay)
2. Signature matches
3. The `userId` in the body is trusted (bot already verified Discord identity)

### Device Authorization Flow

```
CLI                    API                    Browser
 |                      |                      |
 |-- POST /auth/device->|                      |
 |<-- deviceCode,       |                      |
 |    userCode: 482901  |                      |
 |                      |                      |
 | "Enter 482901 at     |                      |
 |  api.../auth/verify" |                      |
 |                      |                      |
 |                      |<-- User opens URL ---|
 |                      |--- Discord OAuth2 -->|
 |                      |<-- OAuth callback ---|
 |                      |<-- User enters code -|
 |                      |--- Code verified --->|
 |                      |                      |
 |-- GET /auth/device/  |                      |
 |   :deviceCode ------>|                      |
 |<-- token: "chb_..." -|                      |
```

Device codes:
- 6 digits, numeric
- Expire after 15 minutes
- Single use
- Rate limited: max 5 attempts per code

### API Keys

- Format: `chb_sk_live_<random>` (production) or `chb_sk_test_<random>` (dev)
- Stored hashed (SHA-256) in `data/api-keys.jsonl`
- Can be scoped to specific endpoints
- Revocable

## External Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `hono` | ^4.x | HTTP framework |
| `googleapis` | ^144.x | Google Calendar API |
| `viem` | ^2.x | Ethereum interactions (ERC20 minting) |
| `marked` | ^15.x | Markdown → HTML for docs |

That's it. Four production dependencies.

## Configuration

All config via environment variables:

```bash
# Server
PORT=3000
BASE_URL=https://api.commonshub.brussels

# Google Calendar
GOOGLE_ACCOUNT_KEY_FILEPATH=./google-account-key.json
GOOGLE_CALENDAR_IMPERSONATE_USER=commonshub@opencollective.com

# Discord OAuth2
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_BOT_SECRET=...   # Shared secret for bot signature verification

# Blockchain
RPC_URL=https://...
MINTER_PRIVATE_KEY=0x...

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
4. **Discord is the identity provider**. All users are identified by their Discord user ID. No separate user registration.
5. **Token minting is slow** (~5-15 seconds per transaction). Reward endpoints should respond immediately and process minting asynchronously, returning tx hashes via polling or webhook.
6. **The API and Discord bot run independently**. They share the same Google Calendar and blockchain but don't communicate directly. The bot can call the API, but the API doesn't call the bot.
