import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { generateSync } from 'otplib'
import { AuthService } from './AuthService'
import { User } from '~/models/User'

describe('AuthService', () => {
    const ALICE = { username: 'alice', password: 'password123' }

    describe('#registerUser', () => {
        beforeEach(() => User.truncate())
        afterEach(() => User.truncate())

        it('adds user to registry', () => {
            AuthService.registerUser(ALICE.username, ALICE.password)

            assert.ok(User.findOne('username', ALICE.username))
        })

        it('stores salt, verifier, and encrypted totp', () => {
            AuthService.registerUser(ALICE.username, ALICE.password)

            const user = User.findOne('username', ALICE.username)

            assert.ok(user)
            assert.ok(user.salt)
            assert.ok(user.verifier)
            assert.ok(user.totp.iv)
            assert.ok(user.totp.ciphertext)
            assert.ok(user.totp.tag)
        })

        it('throws on duplicate username', () => {
            AuthService.registerUser(ALICE.username, ALICE.password)

            assert.throws(() => AuthService.registerUser(ALICE.username, 'other'), /already taken/i)
        })

        it('different users get different salts', () => {
            AuthService.registerUser(ALICE.username, ALICE.password)
            AuthService.registerUser('bob', ALICE.password)

            const alice = User.findOne('username', ALICE.username)
            const bob = User.findOne('username', 'bob')

            assert.ok(alice)
            assert.ok(bob)
            assert.notEqual(alice.salt, bob.salt)
        })
    })

    describe('#login', () => {
        let totpSecret: string

        beforeEach(() => {
            User.truncate()

            totpSecret = AuthService.registerUser(ALICE.username, ALICE.password).secret
        })

        afterEach(() => User.truncate())

        it('succeeds with correct password and valid TOTP', () => {
            const session = AuthService.login(
                ALICE.username,
                ALICE.password,
                generateSync({ secret: totpSecret })
            )

            assert.equal(session.username, ALICE.username)
            assert.ok(session.key instanceof Buffer)
            assert.equal(session.key.length, 32)
        })

        it('fails with wrong password', () => {
            assert.throws(
                () => AuthService.login(
                    ALICE.username,
                    'wrongpass',
                    generateSync({ secret: totpSecret })
                ),
                /password/i
            )
        })

        it('fails with invalid TOTP', () => {
            assert.throws(() => AuthService.login(ALICE.username, ALICE.password, '000000'), /totp/i)
        })

        it('fails with unknown username', () => {
            assert.throws(() => AuthService.login('nobody', '1234', '000000'), /not found/i)
        })

        it('session key is same on repeated login with same credentials', () => {
            const session1 = AuthService.login(
                ALICE.username,
                ALICE.password,
                generateSync({ secret: totpSecret })
            )

            const session2 = AuthService.login(
                ALICE.username,
                ALICE.password,
                generateSync({ secret: totpSecret })
            )

            assert.deepEqual(session1.key, session2.key)
        })
    })
})
