import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encrypt, deriveKey, generateSalt } from '../utils/crypto'
import { BlockchainService } from './BlockchainService'
import { Block } from '~/models/Block'

function makeKey(password = '123456') {
    return deriveKey(password, generateSalt())
}

describe('BlockchainService', () => {
    const data = 'the quick brown fox jumps over the lazy dog'
    const session = { username: 'alice', key: makeKey() }

    beforeEach(() => Block.truncate())
    afterEach(() => Block.truncate())

    describe('#addBlock', () => {
        it('should add a new block', () => {
            const block = BlockchainService.addBlock(session, data)

            assert.ok(block)
            assert.equal(block.owner, session.username)
        })

        it('should link subsequent block to previous hash', () => {
            const b1 = BlockchainService.addBlock(session, data)
            const b2 = BlockchainService.addBlock(session, data)

            assert.ok(b1)
            assert.ok(b2)
            assert.notEqual(b1.hash, b2.hash)
            assert.equal(b2.hashPrevious, b1.hash)
        })
    })

    describe('#validateChain', () => {
        it('should detect valid chain', () => {
            BlockchainService.addBlock(session, data)
            BlockchainService.addBlock({ username: 'bob', key: makeKey('bob') }, data)

            const result = BlockchainService.validateChain()

            assert.equal(result.valid, true)
        })

        it('should detect tampered previous hash', () => {
            const firstBlock = BlockchainService.addBlock(session, data)

            assert.ok(firstBlock)

            const newBlock = Block.create({
                owner: session.username,
                encryptedData: encrypt(session.key, data),
                hashPrevious: firstBlock.hashPrevious, // Tampered previous hash
            })

            const result = BlockchainService.validateChain(newBlock)

            assert.equal(result.valid, false)
        })
    })

    describe('#decryptBlock', () => {
        it('should decrypt own block', () => {
            const block = BlockchainService.addBlock(session, data)

            assert.ok(block)

            const decryptedBlockResult = BlockchainService.decryptBlockData(block, session.key)

            assert.ok(decryptedBlockResult.valid)
            assert.equal(decryptedBlockResult.data, data)
        })

        it("should fail on other user's block", () => {
            const aliceSession = session
            const bobSession = { username: 'bob', key: makeKey('bob') }

            const block = BlockchainService.addBlock(aliceSession, data)

            assert.ok(block)

            const result = BlockchainService.decryptBlockData(block, bobSession.key)

            assert.equal(result.valid, false)
        })
    })
})
