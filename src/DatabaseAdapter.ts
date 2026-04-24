import path from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

export class DatabaseAdapter {
    /** Indentation space to make the JSON text easier to read. */
    private static readonly INDENT_SPACE = 4
    private static readonly DB_DIR = path.resolve(process.cwd(), process.env.BASE_DIR || 'db')
    private static readonly readCache = new Map<string, any[]>()

    public static save<T>(data: T, fileName: string) {
        const path = this.getFilePath(fileName)
        const storedData = this.load(fileName)

        storedData.push(data)

        this.writeFileSafe(path, storedData)
        this.clearCache(fileName)
    }

    public static load<T>(fileName: string): T[] {
        if (this.readCache.has(fileName))
            return this.readCache.get(fileName)!

        const path = this.getFilePath(fileName)

        if (!existsSync(path))
            this.writeFileSafe(path, [])

        return JSON.parse(readFileSync(path, 'utf8'))
    }

    public static truncate(fileName: string) {
        this.writeFileSafe(this.getFilePath(fileName), [])

        this.clearCache(fileName)
    }

    private static getFilePath(fileName: string) {
        return path.resolve(this.DB_DIR, fileName)
    }

    private static clearCache(fileName: string) {
        this.readCache.delete(fileName)
    }

    private static writeFileSafe(path: string, data: any) {
        if (!existsSync(this.DB_DIR))
            mkdirSync(this.DB_DIR)

        writeFileSync(path, JSON.stringify(data, null, this.INDENT_SPACE))
    }
}