import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateSalt, deriveKey, sha256hex, encrypt, decrypt } from './crypto'

describe('KDF', () => {
    it('same password + same salt → same key', () => {
        const salt = generateSalt()
        const k1 = deriveKey('password', salt)
        const k2 = deriveKey('password', salt)
        assert.deepEqual(k1, k2)
    })

    it('different salt → different key', () => {
        const k1 = deriveKey('password', generateSalt())
        const k2 = deriveKey('password', generateSalt())
        assert.notDeepEqual(k1, k2)
    })

    it('different password → different key', () => {
        const salt = generateSalt()
        const k1 = deriveKey('password1', salt)
        const k2 = deriveKey('password2', salt)
        assert.notDeepEqual(k1, k2)
    })
})

describe('sha256hex', () => {
    it('is deterministic', () => {
        const key = deriveKey('pass', generateSalt())
        assert.equal(sha256hex(key), sha256hex(key))
    })

    it('differs for different inputs', () => {
        const k1 = deriveKey('pass1', generateSalt())
        const k2 = deriveKey('pass2', generateSalt())
        assert.notEqual(sha256hex(k1), sha256hex(k2))
    })
})

describe('AES-GCM encrypt/decrypt', () => {
    it('round-trip recovers plaintext', () => {
        const key = deriveKey('password', generateSalt())
        const blob = encrypt(key, 'hello world')
        assert.equal(decrypt(key, blob), 'hello world')
    })

    it('unique IV per encryption', () => {
        const key = deriveKey('password', generateSalt())
        const b1 = encrypt(key, 'same')
        const b2 = encrypt(key, 'same')
        assert.notEqual(b1.iv, b2.iv)
    })

    it('wrong key throws on decrypt', () => {
        const key1 = deriveKey('password', generateSalt())
        const key2 = deriveKey('other', generateSalt())
        const blob = encrypt(key1, 'secret')
        assert.throws(() => decrypt(key2, blob))
    })

    it('tampered ciphertext throws', () => {
        const key = deriveKey('password', generateSalt())
        const blob = encrypt(key, 'secret')
        const tampered = { ...blob, ciphertext: blob.ciphertext.slice(0, -2) + 'ff' }
        assert.throws(() => decrypt(key, tampered))
    })

    it('tampered tag throws', () => {
        const key = deriveKey('password', generateSalt())
        const blob = encrypt(key, 'secret')
        const tampered = { ...blob, tag: 'a'.repeat(32) }
        assert.throws(() => decrypt(key, tampered))
    })
})
