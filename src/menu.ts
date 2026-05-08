import { select, input, password } from '@inquirer/prompts'
import qrcode from 'qrcode-terminal'
import { AuthService, Session } from './services/AuthService'
import { BlockchainService } from './services/BlockchainService'
import { Block } from './models/Block'

async function promptRegister(): Promise<void> {
    const username = await input({ message: 'Username:' })
    const pass = await password({ message: 'Password:' })

    try {
        const { secret, uri } = AuthService.registerUser(username, pass)

        console.log('\nRegistration successful!')
        console.log('Scan this QR code with your authenticator app:\n')

        qrcode.generate(uri, { small: true })

        console.log(`\nOr enter the secret manually: ${secret}`)
        console.log(`URI: ${uri}\n`)
    } catch (err: unknown) {
        console.error('Error:', (err as Error).message)
    }
}

async function promptLogin(): Promise<Session | null> {
    const username = await input({ message: 'Username:' })
    const pass = await password({ message: 'Password:' })
    const code = await input({ message: 'TOTP code:' })

    try {
        return AuthService.login(username, pass, code)
    } catch (err) {
        console.error('Login failed:', (err as Error).message)
        return null
    }
}

async function promptAddBlock(session: Session): Promise<void> {
    const data = await input({ message: 'Block data:' })

    const newBlock = BlockchainService.addBlock(session, data)

    if (newBlock)
        console.log(`\nBlock #${newBlock.height} added.\n`)
}

function showMyBlocks(session: Session): void {
    const myBlocks = Block.all().filter(b => b.owner === session.username)

    if (myBlocks.length === 0) {
        console.log('\nYou have no blocks yet.\n')
        return
    }

    console.log(`\nYour blocks (${myBlocks.length}):\n`)

    for (const block of myBlocks) {
        const result = BlockchainService.decryptBlockData(block, session.key)
        const data = result.valid ? result.data : '[decryption failed]'
        console.log(`  #${block.height} | ${new Date(block.timestamp).toISOString()} | ${data}`)
    }

    console.log()
}

function showFullChain(session: Session): void {
    const allBlocks = Block.all()
    const { valid, error } = BlockchainService.validateChain()

    console.log(`\nChain integrity: ${valid ? 'VALID' : `INVALID — ${error}`}`)
    console.log(`Total blocks: ${allBlocks.length}\n`)

    for (const block of allBlocks) {
        const isOwn = block.owner === session.username
        const result = BlockchainService.decryptBlockData(block, session.key)

        const data = isOwn
            ? (result.valid ? result.data : '[decryption failed]')
            : '[encrypted]'

        const marker = isOwn ? '(yours)' : `(${block.owner})`
        console.log(`  #${block.height} ${marker} | ${new Date(block.timestamp).toISOString()} | ${data}`)
    }
    console.log()
}

async function sessionMenu(session: Session): Promise<void> {
    while (true) {
        const action = await select({
            message: `Logged in as ${session.username}`,
            choices: [
                { name: 'Add block', value: 'add' },
                { name: 'View my blocks', value: 'mine' },
                { name: 'View full chain', value: 'chain' },
                { name: 'Logout', value: 'logout' },
            ],
        })

        if (action === 'add') await promptAddBlock(session)
        else if (action === 'mine') showMyBlocks(session)
        else if (action === 'chain') showFullChain(session)
        else break
    }
}

export async function mainMenu(): Promise<void> {
    while (true) {
        const action = await select({
            message: 'Mini Blockchain',
            choices: [
                { name: 'Register', value: 'register' },
                { name: 'Login', value: 'login' },
                { name: 'Exit', value: 'exit' },
            ],
        })

        if (action === 'register') await promptRegister()
        else if (action === 'login') {
            const session = await promptLogin()
            if (session) await sessionMenu(session)
        } else break
    }
}
