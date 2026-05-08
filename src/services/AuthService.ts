import { generateSecret, verifySync, generateURI } from 'otplib'
import { generateSalt, deriveKey, decrypt, sha256hex, encrypt } from '~/utils/crypto'
import { User } from '~/models/User'

export interface Session {
    username: string
    key: Buffer
}

export class AuthService {
    public static registerUser(
        username: string,
        password: string
    ): { secret: string; uri: string } {
        if (User.findOne('username', username))
            throw new Error('Username already taken')

        const salt = generateSalt()
        const key = deriveKey(password, salt)
        const secret = generateSecret()

        User.create({
            username,
            salt: salt.toString('hex'),
            totp: encrypt(key, secret),
        }).save()

        return {
            secret,
            uri: generateURI({ label: username, issuer: 'mini-blockchain', secret })
        }
    }

    public static login(
        username: string,
        password: string,
        totpCode: string
    ): Session {
        const user = User.findOne('username', username)

        if (!user)
            throw new Error('User not found')

        const salt = Buffer.from(user.salt, 'hex')
        const key = deriveKey(password, salt)

        if (sha256hex(key) !== user.verifier)
            throw new Error('Invalid password')

        const secret = decrypt(key, user.totp)
        const { valid } = verifySync({ token: totpCode, secret })

        if (!valid)
            throw new Error('Invalid TOTP code')

        return { username, key }
    }
}
