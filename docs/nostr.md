# Nostr Integration

Every CommonsHub user gets a Nostr identity. Actions become signed Nostr events, published to a community relay and optionally fanned out to public relays.

Users never manage their own keys — the API handles key generation, custody, and signing.

## Architecture

```
User action (web UI / Discord / CLI)
    │
    ▼
CommonsHub API
    ├── looks up user's nsec (decrypt from DB)
    ├── builds + signs Nostr event
    ├── publishes to relay.commonshub.brussels
    └── optionally publishes to public relays
    
relay.commonshub.brussels
    ├── stores all community events
    ├── accepts SUB from any Nostr client
    └── write-restricted (API only, or API + verified members)
```

Two separate concerns:
1. **Key custody + signing** → the API's job
2. **Event storage + distribution** → the relay's job

## Key Management

### Keypair Lifecycle

- **Generated** at user creation (or on first Nostr-relevant action)
- **Stored** encrypted in the database (see [Encryption](#encryption) below)
- **Used** by the API to sign events on behalf of the user
- **Never exposed** to the user by default

### Encryption

nsecs are encrypted at rest using **envelope encryption**:

```
NSEC_MASTER_KEY (env var, never in DB)
    │
    ├── encrypts ──► per-user DEK (Data Encryption Key)
    │                    │
    │                    └── encrypts ──► user's nsec
    │
    └── stored in DB: encrypted_dek + encrypted_nsec + iv + auth_tag
```

**Why envelope encryption?**
- **Key rotation**: changing the master key means re-encrypting DEKs only, not every nsec
- **Isolation**: each user gets a unique DEK — compromising one doesn't expose others

**Implementation:**
- **Algorithm**: AES-256-GCM (authenticated encryption, Node/Bun `crypto` module)
- **Master key**: 32-byte random key, stored as `NSEC_MASTER_KEY` env var (Coolify secrets)
- **Per-user DEK**: 32-byte random key, generated at user creation, encrypted with master key
- **IV**: 96-bit (12 bytes), unique per encryption operation

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encrypt(plaintext: string, key: Buffer): { encrypted: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv, tag };
}

function decrypt(data: { encrypted: Buffer; iv: Buffer; tag: Buffer }, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, data.iv);
  decipher.setAuthTag(data.tag);
  return Buffer.concat([decipher.update(data.encrypted), decipher.final()]).toString('utf8');
}
```

### Key Rotation

When rotating the master key:
1. Decrypt all DEKs with old master key
2. Re-encrypt all DEKs with new master key
3. nsecs are untouched (still encrypted by their DEK)

### Key Export (Future)

Users may optionally export their nsec to "go sovereign" — use their Nostr identity from any native client. This is an escape hatch that builds trust, but once exported the API loses exclusive signing control.

Not implemented in v1.

## Data Model

### User record (additions)

```jsonl
{
  "id": "u_849888126",
  "username": "xdamman",
  "nostr": {
    "npub": "npub1abc...",
    "encrypted_dek": "<base64>",
    "dek_iv": "<base64>",
    "dek_tag": "<base64>",
    "encrypted_nsec": "<base64>",
    "nsec_iv": "<base64>",
    "nsec_tag": "<base64>",
    "created_at": "2026-03-18T17:00:00Z"
  }
}
```

The `npub` is public and can be shared freely. Everything else in the `nostr` object is sensitive.

## Event Types

### Standard Nostr Kinds

| Action | Kind | NIP | Notes |
|--------|------|-----|-------|
| User profile update | `0` | NIP-01 | name, about, picture |
| Post / announcement | `1` | NIP-01 | Community announcements |
| Room booking | `31923` | NIP-52 | Calendar event |
| Shift signup | `31923` | NIP-52 | Calendar event |

### App-Specific Data (NIP-78)

For CommonsHub-specific actions that don't map to standard kinds:

| Action | Kind | `d` tag |
|--------|------|---------|
| Shift reward minted | `30078` | `chb:reward` |
| Community membership | `30078` | `chb:membership` |

## Relay

### Self-hosted relay: `relay.commonshub.brussels`

Separate service (separate repo: `commonshub/relay`). Recommended implementations:
- [strfry](https://github.com/hoytech/strfry) — C++, high performance, good filtering
- [pyramid](https://github.com/fiatjaf/pyramid) — Go, simpler, already familiar

### Access policy

Reads and writes go over the same websocket connection, so firewall-level IP restrictions won't work — they'd block subscribers too.

The relay itself enforces write policy:

- **Reads (REQ/SUB)**: open to everyone — anyone can subscribe to community events
- **Writes (EVENT)**: relay checks the event's pubkey against an allowlist

```
relay.commonshub.brussels
├── REQ/SUB: open to all
├── EVENT: pubkey must be in allowlist
│   ├── Phase 1: only community npubs (API is the sole signer)
│   └── Phase 2: + users with exported keys publishing directly
└── Admin API (IP-restricted to API server):
    ├── POST   /admin/allow   { npub }
    ├── DELETE  /admin/allow   { npub }
    └── GET    /admin/allow
```

#### Relay implementation

The relay exposes a small admin API for allowlist management, IP-restricted to the API server. Recommended: build the relay with [Khatru](https://github.com/fiatjaf/khatru) (Go) — it gives full control over accept/reject hooks and makes it easy to add an HTTP admin endpoint alongside the websocket.

Alternative: strfry with a [write policy plugin](https://github.com/hoytech/strfry/blob/master/docs/plugins.md), but adding a custom admin API is harder.

### Allowlist Sync

The API is the source of truth for which npubs are allowed to write. The relay's allowlist is a downstream projection of that data.

#### How the API manages the allowlist

```
User created (API)
    │
    ├── generate keypair
    ├── encrypt + store nsec
    ├── store npub in user record
    └── POST relay.commonshub.brussels/admin/allow { "pubkey": "<hex>" }

User deactivated (API)
    │
    └── DELETE relay.commonshub.brussels/admin/allow { "pubkey": "<hex>" }

User exports key (future)
    │
    └── npub stays on allowlist (user can now publish directly)
```

The API calls the relay's admin endpoint synchronously during user lifecycle events. If the relay is down, the API logs the failure and retries — the user's events can still be published (the API publishes on their behalf), but direct publishing won't work until the allowlist is synced.

#### Relay admin API

```
POST   /admin/allow          Add a pubkey to the allowlist
DELETE /admin/allow           Remove a pubkey from the allowlist
GET    /admin/allow           List all allowed pubkeys
POST   /admin/allow/sync     Full sync — replace entire allowlist
```

**Authentication:** shared secret via `Authorization: Bearer <RELAY_ADMIN_SECRET>`, IP-restricted to the API server's IP.

##### `POST /admin/allow`

```json
{ "pubkey": "ab3f..." }
```
→ `201 Created` or `200 OK` (already exists)

##### `DELETE /admin/allow`

```json
{ "pubkey": "ab3f..." }
```
→ `200 OK` or `404 Not Found`

##### `GET /admin/allow`

→ `200 OK`
```json
{
  "pubkeys": ["ab3f...", "cd5e...", "ef78..."],
  "count": 3
}
```

##### `POST /admin/allow/sync`

Full reconciliation — the API sends the complete list, relay replaces its allowlist. Use for recovery, startup, or periodic consistency checks.

```json
{
  "pubkeys": ["ab3f...", "cd5e...", "ef78..."]
}
```
→ `200 OK`
```json
{
  "added": 2,
  "removed": 1,
  "total": 3
}
```

#### Consistency guarantees

The relay's allowlist can drift if the API fails to reach the relay during a user lifecycle event. To handle this:

1. **Retry queue**: failed allowlist updates go into a retry queue (in-memory with JSONL persistence). Retried with exponential backoff.
2. **Periodic full sync**: the API runs `/admin/allow/sync` on a schedule (e.g. every hour) to reconcile any drift.
3. **Startup sync**: on API boot, run a full sync before accepting requests.

This is eventually consistent by design. The relay might briefly allow a deactivated user's pubkey or reject a new user's pubkey, but the window is small and self-healing.

#### Relay-side implementation

The relay stores the allowlist in memory (loaded from a file or embedded DB on startup). On each incoming EVENT:

```go
// Khatru RejectEvent hook
func rejectEvent(ctx context.Context, event *nostr.Event) (bool, string) {
    if !allowlist.Contains(event.PubKey) {
        return true, "pubkey not authorized"
    }
    return false, ""
}
```

The admin HTTP handler updates the in-memory set and persists to disk.

### Fan-out

The API publishes to the community relay first (guaranteed storage), then optionally fans out to public relays for broader visibility:
- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.primal.net`

Fan-out is best-effort. The community relay is the source of truth.

## Configuration

New environment variables:

```bash
# Nostr key encryption
NSEC_MASTER_KEY=<64-char hex string>  # 32 bytes, generate with: openssl rand -hex 32

# Relay
NOSTR_RELAY_URL=wss://relay.commonshub.brussels
NOSTR_RELAY_ADMIN_URL=https://relay.commonshub.brussels/admin
NOSTR_RELAY_ADMIN_SECRET=<shared secret for relay admin API>
NOSTR_PUBLIC_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net

# Feature flag
NOSTR_ENABLED=true  # Enable/disable Nostr event publishing

# Sync
NOSTR_ALLOWLIST_SYNC_INTERVAL=3600  # Full sync every N seconds (default: 1 hour)
```

## Implementation Plan

### Phase 1: Key generation + storage
- Generate keypair at user creation
- Encrypt and store nsec
- Add `npub` to user profile (public)
- Publish kind:0 profile event

### Phase 2: Action → Event publishing
- Room bookings → NIP-52 calendar events
- Shift signups → NIP-52 calendar events
- Rewards → NIP-78 app-specific events
- Announcements → kind:1 notes

### Phase 3: Community relay
- Deploy `relay.commonshub.brussels`
- Write policy enforcement
- Fan-out to public relays

### Phase 4: Key export (optional)
- Allow users to export nsec
- NIP-46 bunker for native client access (if demand exists)

## Security Considerations

- **Master key**: only in Coolify env vars, never in git, never in logs. Losing it = losing all nsecs permanently. Back up separately.
- **Memory**: nsecs are decrypted in memory only for the duration of signing, then discarded
- **Logging**: never log nsecs, DEKs, or any key material. Log npubs only.
- **Account deletion**: zero out encrypted key material in the database. The npub becomes an orphan on relays (no new events will be signed).
