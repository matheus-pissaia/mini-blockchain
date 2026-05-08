import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateSalt, deriveKey, encrypt, decrypt } from './crypto'

describe('Crypto utils', () => {
    describe('#deriveKey', () => {
        it('should generate same key for same password and same salt', () => {
            const salt = generateSalt()
            const k1 = deriveKey('password', salt)
            const k2 = deriveKey('password', salt)

            assert.deepEqual(k1, k2)
        })

        it('should generate different keys for different salts', () => {
            const k1 = deriveKey('password', generateSalt())
            const k2 = deriveKey('password', generateSalt())

            assert.notDeepEqual(k1, k2)
        })

        it('should generate different keys for different passwords', () => {
            const salt = generateSalt()
            const k1 = deriveKey('password1', salt)
            const k2 = deriveKey('password2', salt)
            assert.notDeepEqual(k1, k2)
        })
    })

    describe('#encrypt', () => {
        it('should generate unique IVs', () => {
            const key = deriveKey('password', generateSalt())
            const b1 = encrypt(key, 'same')
            const b2 = encrypt(key, 'same')
            assert.notEqual(b1.iv, b2.iv)
        })
    })

    describe('#decrypt', () => {
        it('should decrypt correctly', () => {
            const key = deriveKey('password', generateSalt())
            const blob = encrypt(key, 'hello world')
            const result = decrypt(key, blob)

            assert.ok(result.valid)
            assert.equal(result.data, 'hello world')
        })

        it('should fail on wrong key', () => {
            const key1 = deriveKey('password', generateSalt())
            const key2 = deriveKey('other', generateSalt())
            const result = decrypt(key2, encrypt(key1, 'secret'))

            assert.equal(result.valid, false)
        })

        it('should fail on tampered ciphertext', () => {
            const key = deriveKey('password', generateSalt())
            const blob = encrypt(key, 'secret')
            const tampered = { ...blob, ciphertext: blob.ciphertext.slice(0, -2) + 'ff' }
            const result = decrypt(key, tampered)

            assert.equal(result.valid, false)
        })

        it('should throw on tampered tag', () => {
            const key = deriveKey('password', generateSalt())
            const blob = encrypt(key, 'secret')
            const tampered = { ...blob, tag: 'a'.repeat(32) }
            const result = decrypt(key, tampered)

            assert.equal(result.valid, false)
        })
    })
})
