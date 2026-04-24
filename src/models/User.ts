import { EncryptedBlob } from '~/utils/crypto'
import { BaseModel } from './BaseModel'

export class User extends BaseModel {
    protected static readonly _DB_FILENAME = 'users.json'

    public readonly username: string
    public readonly salt: string
    public readonly verifier: string
    public readonly totp: EncryptedBlob

    constructor({
        username,
        salt,
        verifier,
        totp
    }: {
        username: string
        salt: string
        verifier: string
        totp: EncryptedBlob
    }) {
        super()

        this.username = username
        this.salt = salt
        this.verifier = verifier
        this.totp = totp
    }
}
