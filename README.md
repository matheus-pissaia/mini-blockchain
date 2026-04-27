# Mini Blockchain

A multi-user mini blockchain where each user can securely register encrypted transactions. Built as a practical exercise in applied cryptography, covering TOTP-based 2FA, symmetric key derivation, authenticated block encryption, and blockchain integrity chaining.

---

## Requirements

- **Node.js** 24.x (or higher)

## Install dependencies

```bash
npm ci
```

## Run commands

| Command             | Description                 |
| ------------------- | --------------------------- |
| `npm start`         | Start the interactive CLI   |
| `npm test`          | Run all test suites         |
| `npm run typecheck` | Type-check without emitting |

---

## How it works

### Architecture overview

```
src/
├── services/         # Core application logic
│   ├── AuthService.ts        # User registration and login
│   ├── BlockchainService.ts  # Block creation and chain validation
│   └── crypto.ts             # (see utils/)
└── utils/
    └── crypto.ts     # Cryptographic primitives (KDF, encrypt, decrypt, hash)
```

**`services/`** contains the two main domain services:

- `AuthService` — handles user registration (generates a salt, derives a key via scrypt, encrypts the TOTP secret with that key, and stores a SHA-256 verifier of the key) and login (re-derives the key, verifies the password via the stored verifier, decrypts the TOTP secret, and validates the one-time code). On success it returns a `Session` carrying the derived key in memory.

- `BlockchainService` — handles block creation (encrypts the payload with the session key, links to the previous block's hash, validates the chain before persisting) and chain validation (walks every block in order and asserts each `hash_prev` matches the hash of its predecessor).

**`utils/`** exposes the raw cryptographic building blocks used by both services: salt generation, key derivation, AES-GCM encrypt/decrypt, and SHA-256 hashing.

---

### TOTP (Time-based One-Time Password)

TOTP produces a short-lived numeric code derived from a shared secret and the current time. At registration, a random secret is generated for the user and a URI is returned so the user can scan a QR code in any authenticator app (e.g. Google Authenticator). At login, the app computes `HMAC-SHA1(secret, floor(unix_time / 30))` and the server does the same — if the results match within a small time window the user is authenticated. The secret itself is never stored in plaintext: it is encrypted with the user's derived key before being written to disk.

### Symmetric key derivation (scrypt)

Raw passwords are never stored or used as keys directly. Instead, `scrypt(password, salt, keyLen=32)` stretches the password into a 256-bit key. A unique random 32-byte salt is generated per user at registration and stored alongside the user record (salts are not secret — their purpose is to make pre-computed rainbow-table attacks infeasible). The same `(password, salt)` pair always yields the same key, so the key can be re-derived at login without storing it anywhere.

### Block cipher — AES-256-GCM

Each block's payload is encrypted with **AES-256-GCM**, an authenticated encryption scheme. It provides both confidentiality (the ciphertext reveals nothing about the plaintext) and integrity (the 128-bit authentication tag detects any tampering with the ciphertext). A fresh random 12-byte IV is generated per encryption call, so encrypting the same plaintext twice produces different ciphertexts. The stored blob is `{ iv, ciphertext, tag }` — all in hex. Decryption rejects any blob whose tag does not match, catching both corruption and deliberate modification.

### Blockchain chaining

Each block stores `hash_prev`, the SHA-256 hash of the previous block's content. The very first block (genesis) uses a fixed 64-zero string as `hash_prev`. Because every block commits to the hash of its predecessor, altering any block invalidates the `hash_prev` of every subsequent block — the entire suffix of the chain becomes detectable as tampered. `BlockchainService.validateChain` enforces this by walking the full ordered list and asserting each `hash_prev` equals the computed hash of the block before it.
