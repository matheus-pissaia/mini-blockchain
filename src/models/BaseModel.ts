import { DatabaseAdapter } from '../DatabaseAdapter'

/** Interface for defining static methods from the model class */
interface StaticBaseModel<T = BaseModel> {
    new(...args: any): T
    DB_FILENAME: string
    findOne<T extends BaseModel>(this: StaticBaseModel<T>, key: keyof T, value: any): T | undefined
    all<T extends BaseModel>(this: StaticBaseModel<T>): T[]
    create<S extends StaticBaseModel>(this: S, ...args: ConstructorParameters<S>): InstanceType<S>
}

function staticImplements<T>() {
    return <U extends T>(constructor: U) => { constructor };
}

@staticImplements<StaticBaseModel>()
export class BaseModel {
    /** The database file name */
    protected static readonly _DB_FILENAME: string

    public static get DB_FILENAME() {
        if (!this._DB_FILENAME)
            throw new Error('DB_FILENAME is not set!')

        return this._DB_FILENAME
    }

    /**
     * Finds a model by its key and value
     */
    public static findOne<T extends BaseModel>(
        this: StaticBaseModel<T>,
        key: keyof T,
        value: any
    ): T | undefined {
        return this.all().find(model => model[key] === value)
    }

    /**
     * Fetches all models
     */
    public static all<T extends BaseModel>(this: StaticBaseModel<T>): T[] {
        return DatabaseAdapter.load(this.DB_FILENAME)
    }

    /**
     * Creates a new model and return its instance back without saving it in the database
     */
    public static create<S extends StaticBaseModel>(
        this: S,
        ...args: ConstructorParameters<S>
    ): InstanceType<S> {
        return new this(...args) as InstanceType<S>
    }

    /**
     * Truncates the table
     */
    public static truncate() {
        DatabaseAdapter.truncate(this.DB_FILENAME)
    }

    /**
     * Save the model instance in the database
     */
    public save() {
        const constructor = this.constructor as StaticBaseModel

        DatabaseAdapter.save(this, constructor.DB_FILENAME)
    }
}