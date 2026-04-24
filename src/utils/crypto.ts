import { createHash, scryptSync, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface EncryptedBlob {
    iv: string
    tag: string
    ciphertext: string
}

const SALT_LEN = 32
const KEY_LEN = 32
const IV_LEN = 12

export function generateSalt(): Buffer {
    return randomBytes(SALT_LEN)
}

export function deriveKey(password: string, salt: Buffer): Buffer {
    return scryptSync(password, salt, KEY_LEN)
}

export function sha256hex(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex')
}

export function encrypt(key: Buffer, plaintext: string): EncryptedBlob {
    const iv = randomBytes(IV_LEN)
    const cipher = createCipheriv('aes-256-gcm', key, iv)

    const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ])

    return {
        iv: iv.toString('hex'),
        ciphertext: ciphertext.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
    }
}

export function decrypt(key: Buffer, blob: EncryptedBlob): string {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'hex'))

    decipher.setAuthTag(Buffer.from(blob.tag, 'hex'))

    return Buffer.concat([
        decipher.update(Buffer.from(blob.ciphertext, 'hex')),
        decipher.final(),
    ]).toString('utf8')
}
