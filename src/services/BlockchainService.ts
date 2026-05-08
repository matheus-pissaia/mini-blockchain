import { Block } from '~/models/Block'
import { decrypt, encrypt } from '~/utils/crypto'
import { Session } from './AuthService'

export class BlockchainService {
    public static GENESIS_BLOCK_PREV_HASH = '0'.repeat(64)

    public static get lastBlock(): Block | null {
        const allBlocks = Block.all()

        return allBlocks.length ? allBlocks[allBlocks.length - 1] : null
    }

    public static addBlock(session: Session, data: string) {
        const newBlock = Block.create({
            owner: session.username,
            encryptedData: encrypt(session.key, data),
            hashPrevious: this.lastBlock?.hash || this.GENESIS_BLOCK_PREV_HASH
        })

        const { valid, error } = this.validateChain(newBlock)

        // TODO remove logs from this class
        if (!valid) {
            console.error('Chain validation failed after adding block:', error)
            return
        }

        newBlock.save()

        return newBlock
    }

    public static validateChain(newBlock?: Block): { valid: boolean; error?: string } {
        const blocks = newBlock ? [...Block.all(), newBlock] : Block.all()

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i]
            const expectedPrev = i === 0 ? this.GENESIS_BLOCK_PREV_HASH : blocks[i - 1].hash

            if (block.hashPrevious !== expectedPrev)
                return { valid: false, error: `Block ${i}: hashPrevious mismatch` }
        }

        return { valid: true }
    }

    public static decryptBlockData({ ciphertext, tag, iv }: Block, key: Buffer) {
        return decrypt(key, { iv, ciphertext, tag })
    }
}
