import { createHash } from 'node:crypto'
import { BaseModel } from './BaseModel'
import { EncryptedBlob } from '~/utils/crypto'

export class Block extends BaseModel {
    protected static readonly _DB_FILENAME = 'blocks.json'

    public readonly height: number
    public readonly iv: string
    public readonly tag: string
    public readonly owner: string
    public readonly ciphertext: string
    public readonly hash: string
    public readonly hash_prev: string
    public readonly timestamp: number

    constructor(
        {
            owner,
            hash_prev,
            encryptedData,
        }: {
            owner: string
            hash_prev: string
            encryptedData: EncryptedBlob
        }
    ) {
        super()

        this.owner = owner
        this.hash_prev = hash_prev
        this.iv = encryptedData.iv
        this.tag = encryptedData.tag
        this.ciphertext = encryptedData.ciphertext

        this.height = Block.all().length
        this.timestamp = Date.now()
        this.hash = createHash('sha256').update(JSON.stringify(this)).digest('hex')
    }
}