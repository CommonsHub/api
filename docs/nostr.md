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

### Write policy

- **API service**: always allowed (publishes on behalf of users)
- **Verified community members**: optionally allowed (if they export their key and use a native client)
- **Everyone else**: read-only

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
NOSTR_PUBLIC_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net

# Feature flag
NOSTR_ENABLED=true  # Enable/disable Nostr event publishing
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
