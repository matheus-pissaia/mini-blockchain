# Mini Blockchain — Documentação Técnica

## 1. Visão geral do projeto

Mini blockchain multi-usuário em linha de comando que permite a cada usuário registrar transações cifradas em uma cadeia única e compartilhada. Implementado em **TypeScript** sobre **Node.js 24**, usando exclusivamente primitivas criptográficas de bibliotecas auditadas (`node:crypto` e `otplib`).

### Garantias de segurança

| Propriedade               | Mecanismo                                                                     |
| ------------------------- | ----------------------------------------------------------------------------- |
| Confidencialidade         | AES-256-GCM com IV aleatório por bloco                                        |
| Integridade do bloco      | Tag de autenticação AES-GCM (128 bits)                                        |
| Integridade da cadeia     | `hashPrevious` + recomputação do `sha256` do conteúdo a cada validação        |
| Autenticação              | Senha (verificada via scrypt) + TOTP de 6 dígitos (RFC 6238)                  |
| Não-vazamento de chave    | Chave nunca é persistida; existe somente em memória durante a sessão          |
| Isolamento entre usuários | Cada usuário possui sua própria chave; blocos de terceiros não decifram       |

### Estrutura de pastas

```
src/
├── index.ts                    # Entry point
├── menu.ts                     # CLI interativo (registrar, logar, adicionar, listar)
├── DatabaseAdapter.ts          # Persistência em arquivos JSON
├── models/
│   ├── BaseModel.ts            # ORM-lite (findOne / all / create / save / truncate)
│   ├── User.ts                 # { username, salt, verifier, totp(cifrado) }
│   └── Block.ts                # { owner, iv, tag, ciphertext, hash, hashPrevious, timestamp, height }
├── services/
│   ├── AuthService.ts          # registerUser / login → Session
│   └── BlockchainService.ts    # addBlock / validateChain / tryDecryptBlockData
└── utils/
    └── crypto.ts               # generateSalt / deriveKey / encrypt / decrypt / sha256hex
```

### Fluxo de uso

1. **Registro** — usuário escolhe `username` e `password`. O sistema gera um sal aleatório, deriva a chave via scrypt, gera um segredo TOTP, exibe um QR code para o app autenticador e armazena `{ username, salt, verifier, totp_cifrado }`.
2. **Login** — usuário fornece `username`, `password` e o código TOTP atual. O sistema re-deriva a chave, verifica a senha pelo `verifier`, decifra o segredo TOTP, valida o código de 6 dígitos e retorna uma `Session` em memória.
3. **Adicionar bloco** — usuário autenticado fornece dados arbitrários. O sistema cifra com AES-GCM usando a chave da sessão, encadeia o bloco via `hashPrevious` e persiste após validação completa da cadeia.
4. **Ler cadeia** — qualquer usuário autenticado pode listar todos os blocos; vê em claro apenas os próprios (os demais aparecem como `[encrypted]`). A integridade da cadeia inteira é verificada a cada leitura.

---

## 2. TOTP (Time-based One-Time Password)

### O que é

TOTP é o segundo fator de autenticação definido pela [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238). Produz um código numérico curto de 6 dígitos que muda a cada 30 segundos, derivado de um segredo compartilhado entre o servidor e o app autenticador do usuário (Google Authenticator, Authy, 1Password, etc.).

A fórmula é:

```
TOTP(secret, t) = truncate(HMAC-SHA1(secret, floor(t / 30)))
```

onde `t` é o tempo Unix em segundos. Como tanto o app quanto o servidor conhecem `secret` e têm o mesmo relógio aproximado, ambos calculam o mesmo código no mesmo intervalo de 30 segundos.

### Como é usado neste projeto

A biblioteca [`otplib`](https://www.npmjs.com/package/otplib) provê as primitivas. Manualmente o sistema **não implementa HMAC** — toda operação criptográfica é delegada à biblioteca.

#### No registro (`AuthService.ts:11-33`)

```ts
const salt = generateSalt()
const key = deriveKey(password, salt)
const secret = generateSecret()            // base32 aleatório (otplib)

User.create({
    username,
    salt: salt.toString('hex'),
    verifier: sha256hex(key),
    totp: encrypt(key, secret),            // segredo TOTP é armazenado CIFRADO
}).save()

return {
    secret,
    uri: generateURI({ label: username, issuer: 'mini-blockchain', secret })
}
```

O URI retornado é exibido como QR code (via `qrcode-terminal`) para o usuário escanear no app autenticador. **O segredo TOTP em claro só existe transitoriamente** — é apresentado uma única vez no registro e nunca mais sai do disco em forma legível, já que está cifrado com a chave derivada da senha.

#### No login (`AuthService.ts:35-58`)

```ts
const salt = Buffer.from(user.salt, 'hex')
const key = deriveKey(password, salt)

if (sha256hex(key) !== user.verifier)
    throw new Error('Invalid password')

const secret = decrypt(key, user.totp)     // só decifra se a senha estiver correta
const { valid } = verifySync({ token: totpCode, secret })

if (!valid)
    throw new Error('Invalid TOTP code')

return { username, key }                   // sessão emitida após AMBOS os fatores
```

A ordem importa: a senha precisa estar correta para sequer decifrar o segredo TOTP. Uma senha errada faz a verificação parar no `verifier`, sem dar pistas sobre o segredo TOTP. Em seguida, o código TOTP precisa bater dentro da janela tolerada pela biblioteca (±1 step = ±30s no padrão `otplib`).

### Por que armazenar o segredo TOTP cifrado

Se o banco de usuários vazar e o segredo TOTP estiver em claro, um atacante consegue gerar códigos válidos para sempre, anulando o segundo fator. Cifrando o segredo TOTP com uma chave derivada da senha, mesmo um dump completo do banco não dá acesso ao TOTP sem antes quebrar a senha por força bruta (e o scrypt torna isso extremamente caro).

---

## 3. Derivação de chave simétrica (scrypt)

### Por que não usar a senha diretamente

Senhas têm baixa entropia, comprimento variável e raramente atingem os 256 bits que o AES-256 precisa. Usar a senha como chave também viabiliza ataques de **rainbow table**: o atacante pré-computa hashes de senhas comuns e procura colisões no banco.

A solução é uma **Key Derivation Function (KDF)**, que transforma a senha em uma chave de tamanho fixo de forma:

- **Determinística** — mesma senha + mesmo sal → mesma chave (necessário para re-derivar a chave no login).
- **Custosa** — exige memória e CPU significativas, inviabilizando força bruta em larga escala.
- **Salgada** — um sal aleatório por usuário garante que duas pessoas com a mesma senha tenham chaves diferentes.

### scrypt

Foi escolhido o **scrypt** ([RFC 7914](https://datatracker.ietf.org/doc/html/rfc7914)) sobre PBKDF2 por sua resistência adicional a ataques com hardware especializado (GPU/ASIC). Diferente do PBKDF2 — que só consome CPU — o scrypt exige um bloco grande de memória durante a derivação, tornando paralelização massiva inviável.

### Implementação (`utils/crypto.ts`)

```ts
const SALT_LEN = 32        // 256 bits de aleatoriedade
const KEY_LEN  = 32        // chave AES-256

export function generateSalt(): Buffer {
    return randomBytes(SALT_LEN)
}

export function deriveKey(password: string, salt: Buffer): Buffer {
    return scryptSync(password, salt, KEY_LEN)
}
```

Parâmetros do Node.js (defaults): `N = 16384, r = 8, p = 1`. Estes são os valores recomendados pelo módulo `node:crypto` e cumprem o requisito do trabalho. Em produção real, valores como `N = 2^17` ou mais seriam preferíveis.

### Onde a chave é (e não é) armazenada

| Local                  | O que existe                                                  |
| ---------------------- | ------------------------------------------------------------- |
| Disco (`users.json`)   | Apenas `salt` (em claro) e `verifier = sha256(key)`           |
| Disco (`blocks.json`)  | Apenas dados cifrados — IV, tag, ciphertext                   |
| Memória de processo    | `Session.key` enquanto o usuário está logado                  |
| **Nunca**              | A chave **nunca** é serializada, logada ou enviada à rede     |

O `verifier` é um teste simples: ao logar, re-derivamos a chave a partir da senha + sal e comparamos `sha256(key)` com o `verifier` salvo. Como derivar a chave passa pelo scrypt (lento), cada tentativa de senha custa muito ao atacante.

### Testes (`utils/crypto.test.ts`)

```ts
it('should generate same key for same password and same salt', () => {
    const salt = generateSalt()
    assert.deepEqual(deriveKey('password', salt), deriveKey('password', salt))
})

it('should generate different keys for different salts', () => {
    assert.notDeepEqual(
        deriveKey('password', generateSalt()),
        deriveKey('password', generateSalt())
    )
})
```

---

## 4. Criptografia por bloco e encadeamento

### Cifra autenticada — AES-256-GCM

Cada bloco tem seus dados cifrados com **AES-256 em modo GCM (Galois/Counter Mode)**, uma cifra autenticada que oferece:

- **Confidencialidade** — o `ciphertext` não revela nada sobre o `plaintext` para quem não tem a chave.
- **Integridade** — uma tag de autenticação de 128 bits acompanha o ciphertext; qualquer alteração no ciphertext, IV ou tag faz o `decrypt` lançar exceção (não retorna dado corrompido silenciosamente).

Implementação (`utils/crypto.ts:25-50`):

```ts
const IV_LEN = 12          // 96 bits (recomendado para GCM)

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
        decipher.final(),               // lança se a tag não bater
    ]).toString('utf8')
}
```

### Por que IV aleatório por bloco

A segurança do AES-GCM **depende criticamente** de o par `(chave, IV)` nunca se repetir. Se um IV for reutilizado com a mesma chave, um atacante consegue:

1. XOR de dois ciphertexts revela o XOR dos plaintexts (catastrófico).
2. Recuperar a chave de autenticação H, permitindo forjar mensagens.

Para impedir isso, **um IV aleatório de 12 bytes é gerado a cada chamada de `encrypt()`**. Com 96 bits de aleatoriedade, a chance de colisão (paradoxo do aniversário) só fica relevante após cerca de 2^48 cifragens — muito além do uso prático. O IV não é segredo; é armazenado em claro junto com o ciphertext (é o que permite decifrar depois).

Verificado em teste:

```ts
it('should generate unique IVs', () => {
    const key = deriveKey('password', generateSalt())
    const b1 = encrypt(key, 'same')
    const b2 = encrypt(key, 'same')
    assert.notEqual(b1.iv, b2.iv)
})
```

### Isolamento entre usuários

Cada usuário cifra seus blocos com **sua própria chave**, derivada de **sua senha + seu sal**. Se Alice tenta decifrar um bloco do Bob com sua própria chave, o `decipher.final()` lança porque a tag GCM não bate. O menu trata isso silenciosamente exibindo `[encrypted]` para blocos de terceiros (`menu.ts:74-78`).

### Encadeamento da blockchain

Cada bloco armazena `hashPrevious` — o SHA-256 do conteúdo do bloco anterior. O primeiro bloco (genesis) usa uma string fixa de 64 zeros como `hashPrevious`.

```ts
// Block.ts — campos serializados no hash:
// owner, hashPrevious, iv, tag, ciphertext, height, timestamp

this.hash = createHash('sha256').update(JSON.stringify(this)).digest('hex')
```

Como `hash[i]` cobre todo o conteúdo do bloco `i` e `hashPrevious[i+1] === hash[i]`, **qualquer alteração em um bloco invalida o `hashPrevious` de todos os blocos subsequentes**. A cadeia inteira se torna detectavelmente adulterada.

### Validação da cadeia (`BlockchainService.ts:35-55`)

```ts
public static validateChain(newBlock?: Block): { valid: boolean; error?: string } {
    const blocks = newBlock ? [...Block.all(), newBlock] : Block.all()

    let expectedPrev = this.GENESIS_BLOCK_PREV_HASH

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]

        if (block.hashPrevious !== expectedPrev)
            return { valid: false, error: `Block ${i}: hashPrevious mismatch` }

        const { hash, ...content } = block
        const computedHash = createHash('sha256').update(JSON.stringify(content)).digest('hex')

        if (computedHash !== hash)
            return { valid: false, error: `Block ${i}: hash mismatch (tampered content)` }

        expectedPrev = hash
    }

    return { valid: true }
}
```

Para cada bloco da cadeia, **duas verificações**:

1. `hashPrevious` aponta para o hash do bloco anterior (ou para o genesis se for o primeiro).
2. O `hash` armazenado bate com o SHA-256 recomputado do conteúdo atual do bloco.

Essa dupla checagem detecta dois cenários de adulteração:

- **Alteração de `hashPrevious`** — atacante tenta deslocar um bloco para outra posição da cadeia. Detectado pela checagem 1.
- **Alteração do conteúdo do bloco** (qualquer campo: `ciphertext`, `iv`, `tag`, `owner`, `timestamp`) — atacante edita um bloco diretamente no disco. Detectado pela checagem 2, mesmo para blocos de outros usuários (que não poderiam ser detectados via tag GCM por quem não tem a chave).

A validação é executada **antes de cada inserção** de bloco (`BlockchainService.ts:21`) e **a cada listagem da cadeia completa** (`menu.ts:68`).

### Camadas de defesa contra adulteração

```
┌─────────────────────────────────────────────────────────┐
│ Camada 1: validateChain (chain integrity)               │
│   - hashPrevious encadeado                              │
│   - hash recomputado e comparado com o armazenado       │
│   → detecta QUALQUER alteração, mesmo de blocos alheios │
├─────────────────────────────────────────────────────────┤
│ Camada 2: AES-GCM authentication tag                    │
│   - tag de 128 bits cobre IV + ciphertext + chave       │
│   → decifração falha se ciphertext/IV/tag foi alterado  │
├─────────────────────────────────────────────────────────┤
│ Camada 3: isolamento de chave                           │
│   - cada usuário tem sua chave única (scrypt + sal)     │
│   → não há "super-usuário" capaz de ler tudo            │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Resumo das primitivas usadas

| Operação                  | Algoritmo / Lib                            | Parâmetros                      |
| ------------------------- | ------------------------------------------ | ------------------------------- |
| Geração de sal            | `crypto.randomBytes`                       | 32 bytes (256 bits)             |
| Derivação de chave        | `crypto.scryptSync`                        | N=16384, r=8, p=1, keyLen=32    |
| Verificador de senha      | `crypto.createHash('sha256')`              | sobre a chave derivada          |
| Geração de IV             | `crypto.randomBytes`                       | 12 bytes (96 bits, único/bloco) |
| Cifra de bloco            | `crypto.createCipheriv('aes-256-gcm')`     | tag de 128 bits                 |
| Hash de bloco             | `crypto.createHash('sha256')`              | sobre conteúdo serializado JSON |
| Segredo TOTP              | `otplib.generateSecret()`                  | base32, 20 bytes                |
| Validação TOTP            | `otplib.verifySync()`                      | HMAC-SHA1, janela ±1 step       |
| URI para QR code          | `otplib.generateURI()`                     | otpauth://totp/...              |
