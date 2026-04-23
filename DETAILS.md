# 1. Context

You must implement a multi-user mini blockchain where each user can securely register transactions.

The system must guarantee:

- **Confidentiality:** each user’s data is individually encrypted with AES-GCM.
- **Strong authentication:** each user must provide password + TOTP to add blocks.
- **Blockchain integrity:** each block depends on the hash of the previous block, forming an immutable chain.
- **Multi-user support:** multiple users can add blocks, but each user can only access their own data.

# 2. Functional Requirements

## 2.1 User Registration and Login

- User registers with:
    - username
    - password
- Password must be derived using PBKDF2 or scrypt.
- TOTP: store the TOTP key for two-factor authentication. The TOTP calculation = HMAC(key, time) should be performed using built-in methods from cryptographic libraries.
- Login requires:
    - correct password
    - valid TOTP
- After login, the system generates a secure session key for encrypting/decrypting the user’s blocks.

## 2.2 Block Registration

- An authenticated user can create a block with arbitrary data (e.g., transaction, identity, message).
- Each block contains:
    - data → encrypted with AES-GCM using the user-derived key or session key
    - unique IV for AES-GCM
    - creation timestamp
    - `hash_prev` → hash of the previous blockchain block
    - owner → user ID (username)
- Each user may only register blocks that belong to themselves.

## 2.3 Blockchain Reading

- A user may list all blocks, but can only decrypt their own data.
- For each block, verify:
    - integrity of `hash_prev`
    - validity of AES-GCM (tampering detection)

## 2.4 Security

- AES-GCM guarantees confidentiality and data integrity.
- Unique IV per block.
- Key derivation with PBKDF2 or scrypt.
- TOTP required to add blocks.
- The system must detect unauthorized access or tampering attempts.

# 3. Extra Features (Optional)

- Allow multiple keys per user for different types of data.
- Allow block expiration or identity data updates.
- Access logs and block tampering attempt logs.
- Automatic chain validation whenever a new block is added.

# 4. Menu Functions and Suggested Test Cases

Scripts or test functions (via a simple text-based menu):

1. registration/login
2. adding blocks from multiple users
3. reading and validating blockchain per user
4. block tampering test for integrity verification

## Authentication

5. Correct login + valid TOTP → success
6. Login with invalid TOTP → failure
7. Login with incorrect password → failure

## Multi-user Blockchain

8. User A adds block → correctly encrypted
9. User B adds block → correctly encrypted
10. User A reads their blockchain → decrypts own blocks, but cannot read User B’s blocks
11. Attempt to modify ciphertext → integrity failure
12. Modify `hash_prev` → chain validation error

## KDF

13. Same password + same salt → same key
14. Different salt → different key

# 5. Important Notes

1. The system must not use keys and IVs stored by the client in global or environment variables during decryption. You must act as if the client and server are located on different machines.
2. PBKDF2 or scrypt must be used to generate keys/IVs.
3. Authenticated encryption must be used for encryption and decryption.
4. Design decisions regarding formats and parameters must be made by you.
5. Fixed keys and IVs hardcoded in the source code are NOT ALLOWED.
6. If stored, parameters must be kept in an encrypted file. Only the salt may be stored unencrypted.
