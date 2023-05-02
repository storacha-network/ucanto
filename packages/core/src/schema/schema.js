import * as Schema from './type.js'
import { ok, Failure } from '../result.js'
import {
  create as createLink,
  parse as parseLink,
  createLegacy,
  isLink,
  parse,
  base32,
} from '../link.js'
export * from './type.js'
import * as CBOR from '../cbor.js'
import { sha256 } from 'multiformats/hashes/sha2'

export { ok }
/**
 * @abstract
 * @template [T=unknown]
 * @template [I=unknown]
 * @template [Settings=void]
 * @extends {Schema.Base<T, I, Settings>}
 * @implements {Schema.Schema<T, I>}
 */
export class API {
  /**
   * @param {Settings} settings
   */
  constructor(settings) {
    /** @protected */
    this.settings = settings

    this.codec = CBOR
    this.hasher = sha256
  }

  toString() {
    return `new ${this.constructor.name}()`
  }
  /**
   * @abstract
   * @param {I} input
   * @param {Settings} settings
   * @returns {Schema.ReadResult<T>}
   */
  /* c8 ignore next 3 */
  readWith(input, settings) {
    throw new Error(`Abstract method readWith must be implemented by subclass`)
  }
  /**
   * @param {I} input
   * @returns {Schema.ReadResult<T>}
   */
  read(input) {
    return this.readWith(input, this.settings)
  }

  /**
   * @param {unknown} value
   * @returns {value is T}
   */
  is(value) {
    return !this.read(/** @type {I} */ (value))?.error
  }

  /**
   * @param {unknown} value
   * @return {T}
   */
  from(value) {
    const result = this.read(/** @type {I} */ (value))
    if (result.error) {
      throw result.error
    } else {
      return result.ok
    }
  }

  /**
   * @returns {Schema.Schema<T|undefined, I>}
   */
  optional() {
    return optional(this)
  }

  /**
   * @returns {Schema.Schema<T|null, I>}
   */
  nullable() {
    return nullable(this)
  }

  /**
   * @returns {Schema.Schema<T[], I>}
   */
  array() {
    return array(this)
  }
  /**
   * @template U
   * @param {Schema.Reader<U, I>} schema
   * @returns {Schema.Schema<T | U, I>}
   */

  or(schema) {
    return or(this, schema)
  }

  /**
   * @template U
   * @param {Schema.Reader<U, I>} schema
   * @returns {Schema.Schema<T & U, I>}
   */
  and(schema) {
    return and(this, schema)
  }

  /**
   * @template {T} U
   * @param {Schema.Reader<U, T>} schema
   * @returns {Schema.Schema<U, I>}
   */
  refine(schema) {
    return refine(this, schema)
  }

  /**
   * @template {string} Kind
   * @param {Kind} [kind]
   * @returns {Schema.Schema<Schema.Branded<T, Kind>, I>}
   */
  brand(kind) {
    return /** @type {Schema.Schema<Schema.Branded<T, Kind>, I>} */ (this)
  }

  /**
   * @param {Schema.NotUndefined<T>} value
   * @returns {Schema.DefaultSchema<Schema.NotUndefined<T>, I>}
   */
  default(value) {
    // ⚠️ this.from will throw if wrong default is provided
    const fallback = this.from(value)
    // we also check that fallback is not undefined because that is the point
    // of having a fallback
    if (fallback === undefined) {
      throw new Error(`Value of type undefined is not a valid default`)
    }

    const schema = new Default({
      reader: /** @type {Schema.Reader<T, I>} */ (this),
      value: /** @type {Schema.NotUndefined<T>} */ (fallback),
    })

    return /** @type {Schema.DefaultSchema<Schema.NotUndefined<T>, I>} */ (
      schema
    )
  }

  /**
   * @template {number} [Code=number]
   * @template {number} [Alg=number]
   * @template {1|0} [Version=0|1]
   * @param {{
   * codec?: Schema.BlockCodec<Code, unknown>
   * hasher?: Schema.MultihashHasher<Alg>
   * version?: Version
   * }} options
   * @returns {Schema.LinkSchema<T, Code, Alg, Version>}
   */
  link({ codec, hasher, version } = {}) {
    return link({
      ...(codec ? { code: codec.code } : {}),
      ...(hasher ? { multihash: { code: hasher.code } } : {}),
      ...(version ? { version } : {}),
      schema: this,
    })
  }

  /**
   * @param {I} input
   * @returns {Schema.Result<Schema.IPLDViewBuilder<Schema.IPLDView<T>>, Schema.Error>}
   */
  toIPLDBuilder(input) {
    const result = this.read(input)
    if (result.error) {
      return result
    } else {
      const data = result.ok
      const builder = new IPLDViewBuilder({
        data,
        schema: this,
      })
      return { ok: builder }
    }
  }

  /**
   * @param {object} source
   * @param {Schema.Link} source.link
   * @param {Schema.BlockStore} source.store
   * @returns {ReturnType<this['createIPLDView']>}
   */
  toIPLDView({ link, store }) {
    const block = store.get(`${link}`)
    if (!block) {
      return /** @type {*} */ ({ error: new Error(`Missing block ${link}`) })
    } else {
      return /** @type {*} */ (this.createIPLDView({ root: block, store }))
    }
  }

  /**
   * @param {object} source
   * @param {Schema.Block<unknown>} source.root
   * @param {Schema.BlockStore} source.store
   * @returns {Schema.Result<Schema.IPLDView<T>, Schema.Error>}
   */
  createIPLDView({ root, store }) {
    const input = /** @type {I} */ (this.codec.decode(root.bytes))
    const result = this.read(input)
    if (result.error) {
      return result
    } else {
      const view = new IPLDView({
        root: { ...root, data: result.ok },
        store,
        schema: this,
      })
      return { ok: view }
    }
  }
}

/**
 * @template [I=unknown]
 * @extends {API<never, I>}
 * @implements {Schema.Schema<never, I>}
 */
class Never extends API {
  toString() {
    return 'never()'
  }
  /**
   * @param {I} input
   * @returns {Schema.ReadResult<never>}
   */
  read(input) {
    return typeError({ expect: 'never', actual: input })
  }
}

/**
 * @template [I=unknown]
 * @returns {Schema.Schema<never, I>}
 */
export const never = () => new Never()

/**
 * @template [I=unknown]
 * @extends API<unknown, I, void>
 * @implements {Schema.Schema<unknown, I>}
 */
class Unknown extends API {
  /**
   * @param {I} input
   */
  read(input) {
    return /** @type {Schema.ReadResult<unknown>}*/ ({ ok: input })
  }
  toString() {
    return 'unknown()'
  }
}

/**
 * @template [I=unknown]
 * @returns {Schema.Schema<unknown, I>}
 */
export const unknown = () => new Unknown()

/**
 * @template {unknown} T
 * @implements {Schema.IPLDViewBuilder<Schema.IPLDView<T>>}
 */
class IPLDViewBuilder {
  /**
   * @param {object} input
   * @param {T} input.data
   * @param {Schema.Schema<T>} input.schema
   */
  constructor({ data, schema }) {
    this.data = data
    this.schema = schema
  }

  /**
   * @param {Schema.BuildOptions} [options]
   * @returns {Promise<Schema.IPLDView<T>>}
   */
  async buildIPLDView({
    encoder = this.schema.codec,
    hasher = this.schema.hasher,
  } = {}) {
    const { data } = this
    const bytes = encoder.encode(data)
    const digest = await hasher.digest(bytes)
    /** @type {Schema.Link<T>} */
    const cid = createLink(encoder.code, digest)
    return new IPLDView({ root: { bytes, data, cid }, schema: this.schema })
  }
}

/**
 * @template {unknown} T
 * @implements {Schema.IPLDView<T>}
 * @implements {Schema.IPLDViewBuilder<Schema.IPLDView<T>>}
 */
class IPLDView {
  /**
   * @param {object} input
   * @param {Required<Schema.Block>} input.root
   * @param {Schema.Schema<T>} input.schema
   * @param {Schema.BlockStore} [input.store]
   */
  constructor({ root, store = new Map(), schema }) {
    this.root = root
    this.store = store
    this.schema = schema
  }

  /**
   * @template T
   * @param {object} input
   * @param {Required<Schema.Block>} input.root
   * @param {Schema.Schema<T>} input.schema
   * @param {Schema.BlockStore} [input.store]
   */
  static create(input) {
    return new this(input)
  }

  /**
   * @returns {Schema.Link<T>}
   */
  link() {
    return this.root.cid
  }
  /**
   * @returns {IterableIterator<Schema.Block>}
   */
  *iterateIPLDBlocks() {
    yield this.root
  }

  /**
   * @returns {Schema.IPLDView<T>}
   */
  buildIPLDView() {
    return this
  }
}

/**
 * @template O
 * @template [I=unknown]
 * @extends {API<null|O, I, Schema.Reader<O, I>>}
 * @implements {Schema.Schema<null|O, I>}
 */
class Nullable extends API {
  /**
   * @param {I} input
   * @param {Schema.Reader<O, I>} reader
   */
  readWith(input, reader) {
    const result = reader.read(input)
    if (result.error) {
      return input === null
        ? { ok: null }
        : {
            error: new UnionError({
              causes: [
                result.error,
                typeError({ expect: 'null', actual: input }).error,
              ],
            }),
          }
    } else {
      return result
    }
  }
  toString() {
    return `${this.settings}.nullable()`
  }
}

/**
 * @template O
 * @template [I=unknown]
 * @param {Schema.Reader<O, I>} schema
 * @returns {Schema.Schema<O|null, I>}
 */
export const nullable = schema => new Nullable(schema)

/**
 * @template O
 * @template [I=unknown]
 * @extends {API<O|undefined, I, Schema.Reader<O, I>>}
 * @implements {Schema.Schema<O|undefined, I>}
 */
class Optional extends API {
  optional() {
    return this
  }
  /**
   * @param {I} input
   * @param {Schema.Reader<O, I>} reader
   * @returns {Schema.ReadResult<O|undefined>}
   */
  readWith(input, reader) {
    const result = reader.read(input)
    return result.error && input === undefined ? { ok: undefined } : result
  }
  toString() {
    return `${this.settings}.optional()`
  }
}

/**
 * @template {unknown} O
 * @template [I=unknown]
 * @extends {API<O, I, {reader:Schema.Reader<O, I>, value:O & Schema.NotUndefined<O>}>}
 * @implements {Schema.DefaultSchema<O, I>}
 */
class Default extends API {
  /**
   * @returns {Schema.DefaultSchema<O & Schema.NotUndefined<O>, I>}
   */
  optional() {
    // Short circuit here as we there is no point in wrapping this in optional.
    return /** @type {Schema.DefaultSchema<O & Schema.NotUndefined<O>, I>} */ (
      this
    )
  }
  /**
   * @param {I} input
   * @param {object} options
   * @param {Schema.Reader<O|undefined, I>} options.reader
   * @param {O} options.value
   * @returns {Schema.ReadResult<O>}
   */
  readWith(input, { reader, value }) {
    if (input === undefined) {
      return /** @type {Schema.ReadResult<O>} */ ({ ok: value })
    } else {
      const result = reader.read(input)

      return result.error
        ? result
        : result.ok !== undefined
        ? // We just checked that result.ok is not undefined but still needs
          // reassurance
          /** @type {Schema.ReadResult<O>} */ (result)
        : { ok: value }
    }
  }
  toString() {
    return `${this.settings.reader}.default(${JSON.stringify(
      this.settings.value
    )})`
  }

  get value() {
    return this.settings.value
  }
}

/**
 * @template O
 * @template [I=unknown]
 * @param {Schema.Reader<O, I>} schema
 * @returns {Schema.Schema<O|undefined, I>}
 */
export const optional = schema => new Optional(schema)

/**
 * @template O
 * @template [I=unknown]
 * @extends {API<O[], I, Schema.Reader<O, I>>}
 * @implements {Schema.ArraySchema<O, I>}
 */
class ArrayOf extends API {
  /**
   * @param {I} input
   * @param {Schema.Reader<O, I>} schema
   */
  readWith(input, schema) {
    if (!Array.isArray(input)) {
      return typeError({ expect: 'array', actual: input })
    }
    /** @type {O[]} */
    const results = []
    for (const [index, value] of input.entries()) {
      const result = schema.read(value)
      if (result.error) {
        return memberError({ at: index, cause: result.error })
      } else {
        results.push(result.ok)
      }
    }
    return { ok: results }
  }
  get element() {
    return this.settings
  }
  toString() {
    return `array(${this.element})`
  }
}

/**
 * @template O
 * @template [I=unknown]
 * @param {Schema.Reader<O, I>} schema
 * @returns {Schema.ArraySchema<O, I>}
 */
export const array = schema => new ArrayOf(schema)

/**
 * @template {Schema.Reader<unknown, I>} T
 * @template {[T, ...T[]]} U
 * @template [I=unknown]
 * @extends {API<Schema.InferTuple<U>, I, U>}
 * @implements {Schema.Schema<Schema.InferTuple<U>, I>}
 */
class Tuple extends API {
  /**
   * @param {I} input
   * @param {U} shape
   * @returns {Schema.ReadResult<Schema.InferTuple<U>>}
   */
  readWith(input, shape) {
    if (!Array.isArray(input)) {
      return typeError({ expect: 'array', actual: input })
    }
    if (input.length !== this.shape.length) {
      return error(`Array must contain exactly ${this.shape.length} elements`)
    }

    const results = []
    for (const [index, reader] of shape.entries()) {
      const result = reader.read(input[index])
      if (result.error) {
        return memberError({ at: index, cause: result.error })
      } else {
        results[index] = result.ok
      }
    }

    return { ok: /** @type {Schema.InferTuple<U>} */ (results) }
  }

  /** @type {U} */
  get shape() {
    return this.settings
  }

  toString() {
    return `tuple([${this.shape.map(reader => reader.toString()).join(', ')}])`
  }
}

/**
 * @template {Schema.Reader<unknown, I>} T
 * @template {[T, ...T[]]} U
 * @template [I=unknown]
 * @param {U} shape
 * @returns {Schema.Schema<Schema.InferTuple<U>, I>}
 */
export const tuple = shape => new Tuple(shape)

/**
 * @template V
 * @template {string} K
 * @template [I=unknown]
 * @extends {API<Schema.Dictionary<K, V>, I, { key: Schema.Reader<K, string>, value: Schema.Reader<V, I> }>}
 * @implements {Schema.DictionarySchema<V, K, I>}
 */
class Dictionary extends API {
  /**
   * @param {I} input
   * @param {object} schema
   * @param {Schema.Reader<K, string>} schema.key
   * @param {Schema.Reader<V, I>} schema.value
   */
  readWith(input, { key, value }) {
    if (typeof input != 'object' || input === null || Array.isArray(input)) {
      return typeError({
        expect: 'dictionary',
        actual: input,
      })
    }

    const dict = /** @type {Schema.Dictionary<K, V>} */ ({})

    for (const [k, v] of Object.entries(input)) {
      const keyResult = key.read(k)
      if (keyResult.error) {
        return memberError({ at: k, cause: keyResult.error })
      }

      const valueResult = value.read(v)
      if (valueResult.error) {
        return memberError({ at: k, cause: valueResult.error })
      }

      // skip undefined because they mess up CBOR and are generally useless.
      if (valueResult.ok !== undefined) {
        dict[keyResult.ok] = valueResult.ok
      }
    }

    return { ok: dict }
  }
  get key() {
    return this.settings.key
  }
  get value() {
    return this.settings.value
  }

  partial() {
    const { key, value } = this.settings
    return new Dictionary({
      key,
      value: optional(value),
    })
  }
  toString() {
    return `dictionary(${this.settings})`
  }
}

/**
 * @template {string} K
 * @template {unknown} V
 * @template [I=unknown]
 * @param {object} shape
 * @param {Schema.Reader<V, I>} shape.value
 * @param {Schema.Reader<K, string>} [shape.key]
 * @returns {Schema.DictionarySchema<V, K, I>}
 */
export const dictionary = ({ value, key }) =>
  new Dictionary({
    value,
    key: key || /** @type {Schema.Reader<K, string>} */ (string()),
  })

/**
 * @template {[unknown, ...unknown[]]} T
 * @template [I=unknown]
 * @extends {API<T[number], I, {type: string, variants:Set<T[number]>}>}
 * @implements {Schema.Schema<T[number], I>}
 */
class Enum extends API {
  /**
   * @param {I} input
   * @param {{type:string, variants:Set<T[number]>}} settings
   * @returns {Schema.ReadResult<T[number]>}
   */
  readWith(input, { variants, type }) {
    if (variants.has(input)) {
      return /** @type {Schema.ReadResult<T[number]>} */ ({ ok: input })
    } else {
      return typeError({ expect: type, actual: input })
    }
  }
  toString() {
    return this.settings.type
  }
}

/**
 * @template {string} T
 * @template {[T, ...T[]]} U
 * @template [I=unknown]
 * @param {U} variants
 * @returns {Schema.Schema<U[number], I>}
 */
const createEnum = variants =>
  new Enum({
    type: variants.join('|'),
    variants: new Set(variants),
  })
export { createEnum as enum }

/**
 * @template {Schema.Reader<unknown, I>} T
 * @template {[T, ...T[]]} U
 * @template [I=unknown]
 * @extends {API<Schema.InferUnion<U>, I, U>}
 * @implements {Schema.Schema<Schema.InferUnion<U>, I>}
 */
class Union extends API {
  /**
   * @param {I} input
   * @param {U} variants
   */
  readWith(input, variants) {
    const causes = []
    for (const reader of variants) {
      const result = reader.read(input)
      if (result.error) {
        causes.push(result.error)
      } else {
        return /** @type {Schema.ReadResult<Schema.InferUnion<U>>} */ (result)
      }
    }
    return { error: new UnionError({ causes }) }
  }

  get variants() {
    return this.settings
  }
  toString() {
    return `union([${this.variants.map(type => type.toString()).join(', ')}])`
  }
}

/**
 * @template {Schema.Reader<unknown, I>} T
 * @template {[T, ...T[]]} U
 * @template [I=unknown]
 * @param {U} variants
 * @returns {Schema.Schema<Schema.InferUnion<U>, I>}
 */
const union = variants => new Union(variants)

/**
 * @template T, U
 * @template [I=unknown]
 * @param {Schema.Reader<T, I>} left
 * @param {Schema.Reader<U, I>} right
 * @returns {Schema.Schema<T|U, I>}
 */
export const or = (left, right) => union([left, right])

/**
 * @template {Schema.Reader<unknown, I>} T
 * @template {[T, ...T[]]} U
 * @template [I=unknown]
 * @extends {API<Schema.InferIntersection<U>, I, U>}
 * @implements {Schema.Schema<Schema.InferIntersection<U>, I>}
 */
class Intersection extends API {
  /**
   * @param {I} input
   * @param {U} schemas
   * @returns {Schema.ReadResult<Schema.InferIntersection<U>>}
   */
  readWith(input, schemas) {
    const causes = []
    for (const schema of schemas) {
      const result = schema.read(input)
      if (result.error) {
        causes.push(result.error)
      }
    }

    return causes.length > 0
      ? { error: new IntersectionError({ causes }) }
      : /** @type {Schema.ReadResult<Schema.InferIntersection<U>>} */ ({
          ok: input,
        })
  }
  toString() {
    return `intersection([${this.settings
      .map(type => type.toString())
      .join(',')}])`
  }
}

/**
 * @template {Schema.Reader<unknown, I>} T
 * @template {[T, ...T[]]} U
 * @template [I=unknown]
 * @param {U} variants
 * @returns {Schema.Schema<Schema.InferIntersection<U>, I>}
 */
export const intersection = variants => new Intersection(variants)

/**
 * @template T, U
 * @template [I=unknown]
 * @param {Schema.Reader<T, I>} left
 * @param {Schema.Reader<U, I>} right
 * @returns {Schema.Schema<T & U, I>}
 */
export const and = (left, right) => intersection([left, right])

/**
 * @template [I=unknown]
 * @extends {API<boolean, I>}
 */
class Boolean extends API {
  /**
   * @param {I} input
   */
  readWith(input) {
    switch (input) {
      case true:
      case false:
        return { ok: /** @type {boolean} */ (input) }
      default:
        return typeError({
          expect: 'boolean',
          actual: input,
        })
    }
  }

  toString() {
    return `boolean()`
  }
}

/** @type {Schema.Schema<boolean, unknown>} */
const anyBoolean = new Boolean()

export const boolean = () => anyBoolean

/**
 * @template {number} [O=number]
 * @template [I=unknown]
 * @template [Settings=void]
 * @extends {API<O, I, Settings>}
 * @implements {Schema.NumberSchema<O, I>}
 */
class UnknownNumber extends API {
  /**
   * @param {number} n
   */
  greaterThan(n) {
    return this.refine(greaterThan(n))
  }
  /**
   * @param {number} n
   */
  lessThan(n) {
    return this.refine(lessThan(n))
  }

  /**
   * @template {O} U
   * @param {Schema.Reader<U, O>} schema
   * @returns {Schema.NumberSchema<U, I>}
   */
  refine(schema) {
    return new RefinedNumber({ base: this, schema })
  }
}

/**
 * @template [I=unknown]
 * @extends {UnknownNumber<number, I>}
 * @implements {Schema.NumberSchema<number, I>}
 */
class AnyNumber extends UnknownNumber {
  /**
   * @param {I} input
   * @returns {Schema.ReadResult<number>}
   */
  readWith(input) {
    return typeof input === 'number'
      ? { ok: input }
      : typeError({ expect: 'number', actual: input })
  }
  toString() {
    return `number()`
  }
}

/** @type {Schema.NumberSchema<number, unknown>} */
const anyNumber = new AnyNumber()
export const number = () => anyNumber

/**
 * @template {number} [T=number]
 * @template {T} [O=T]
 * @template [I=unknown]
 * @extends {UnknownNumber<O, I, {base:Schema.Reader<T, I>, schema:Schema.Reader<O, T>}>}
 * @implements {Schema.NumberSchema<O, I>}
 */
class RefinedNumber extends UnknownNumber {
  /**
   * @param {I} input
   * @param {{base:Schema.Reader<T, I>, schema:Schema.Reader<O, T>}} settings
   * @returns {Schema.ReadResult<O>}
   */
  readWith(input, { base, schema }) {
    const result = base.read(input)
    return result.error ? result : schema.read(result.ok)
  }
  toString() {
    return `${this.settings.base}.refine(${this.settings.schema})`
  }
}

/**
 * @template {number} T
 * @extends {API<T, T, number>}
 */
class LessThan extends API {
  /**
   * @param {T} input
   * @param {number} number
   * @returns {Schema.ReadResult<T>}
   */
  readWith(input, number) {
    if (input < number) {
      return { ok: input }
    } else {
      return error(`Expected ${input} < ${number}`)
    }
  }
  toString() {
    return `lessThan(${this.settings})`
  }
}

/**
 * @template {number} T
 * @param {number} n
 * @returns {Schema.Reader<T, T>}
 */
export const lessThan = n => new LessThan(n)

/**
 * @template {number} T
 * @extends {API<T, T, number>}
 */
class GreaterThan extends API {
  /**
   * @param {T} input
   * @param {number} number
   * @returns {Schema.ReadResult<T>}
   */
  readWith(input, number) {
    if (input > number) {
      return { ok: input }
    } else {
      return error(`Expected ${input} > ${number}`)
    }
  }
  toString() {
    return `greaterThan(${this.settings})`
  }
}

/**
 * @template {number} T
 * @param {number} n
 * @returns {Schema.Reader<T, T>}
 */
export const greaterThan = n => new GreaterThan(n)

const Integer = {
  /**
   * @param {number} input
   * @returns {Schema.ReadResult<Schema.Integer>}
   */
  read(input) {
    return Number.isInteger(input)
      ? { ok: /** @type {Schema.Integer} */ (input) }
      : typeError({
          expect: 'integer',
          actual: input,
        })
  },
  toString() {
    return `Integer`
  },
}

const anyInteger = anyNumber.refine(Integer)
export const integer = () => anyInteger

const Float = {
  /**
   * @param {number} number
   * @returns {Schema.ReadResult<Schema.Float>}
   */
  read(number) {
    return Number.isFinite(number)
      ? { ok: /** @type {Schema.Float} */ (number) }
      : typeError({
          expect: 'Float',
          actual: number,
        })
  },
  toString() {
    return 'Float'
  },
}

const anyFloat = anyNumber.refine(Float)
export const float = () => anyFloat

/**
 * @template {string} [O=string]
 * @template [I=unknown]
 * @template [Settings=void]
 * @extends {API<O, I, Settings>}
 */
class UnknownString extends API {
  /**
   * @template {O|unknown} U
   * @param {Schema.Reader<U, O>} schema
   * @returns {Schema.StringSchema<O & U, I>}
   */
  refine(schema) {
    const other = /** @type {Schema.Reader<U, O>} */ (schema)
    const rest = new RefinedString({
      base: this,
      schema: other,
    })

    return /** @type {Schema.StringSchema<O & U, I>} */ (rest)
  }
  /**
   * @template {string} Prefix
   * @param {Prefix} prefix
   */
  startsWith(prefix) {
    return this.refine(startsWith(prefix))
  }
  /**
   * @template {string} Suffix
   * @param {Suffix} suffix
   */
  endsWith(suffix) {
    return this.refine(endsWith(suffix))
  }
  toString() {
    return `string()`
  }
}

/**
 * @template O
 * @template {string} [T=string]
 * @template [I=unknown]
 * @extends {UnknownString<T & O, I, {base:Schema.Reader<T, I>, schema:Schema.Reader<O, T>}>}
 * @implements {Schema.StringSchema<O & T, I>}
 */
class RefinedString extends UnknownString {
  /**
   * @param {I} input
   * @param {{base:Schema.Reader<T, I>, schema:Schema.Reader<O, T>}} settings
   * @returns {Schema.ReadResult<T & O>}
   */
  readWith(input, { base, schema }) {
    const result = base.read(input)
    return result.error
      ? result
      : /** @type {Schema.ReadResult<T & O>} */ (schema.read(result.ok))
  }
  toString() {
    return `${this.settings.base}.refine(${this.settings.schema})`
  }
}

/**
 * @template [I=unknown]
 * @extends {UnknownString<string, I>}
 * @implements {Schema.StringSchema<string, I>}
 */
class AnyString extends UnknownString {
  /**
   * @param {I} input
   * @returns {Schema.ReadResult<string>}
   */
  readWith(input) {
    return typeof input === 'string'
      ? { ok: input }
      : typeError({ expect: 'string', actual: input })
  }
}

/** @type {Schema.StringSchema<string, unknown>} */
const anyString = new AnyString()
export const string = () => anyString

/**
 * @template {string} Prefix
 * @template {string} Body
 * @extends {API<Body & `${Prefix}${Body}`, Body, Prefix>}
 * @implements {Schema.Schema<Body & `${Prefix}${Body}`, Body>}
 */
class StartsWith extends API {
  /**
   * @param {Body} input
   * @param {Prefix} prefix
   */
  readWith(input, prefix) {
    const result = input.startsWith(prefix)
      ? /** @type {Schema.ReadResult<Body & `${Prefix}${Body}`>} */ ({
          ok: input,
        })
      : error(`Expect string to start with "${prefix}" instead got "${input}"`)

    return result
  }
  get prefix() {
    return this.settings
  }
  toString() {
    return `startsWith("${this.prefix}")`
  }
}

/**
 * @template {string} Prefix
 * @template {string} Body
 * @param {Prefix} prefix
 * @returns {Schema.Schema<`${Prefix}${string}`, string>}
 */
export const startsWith = prefix => new StartsWith(prefix)

/**
 * @template {string} Suffix
 * @template {string} Body
 * @extends {API<Body & `${Body}${Suffix}`, Body, Suffix>}
 */
class EndsWith extends API {
  /**
   * @param {Body} input
   * @param {Suffix} suffix
   */
  readWith(input, suffix) {
    return input.endsWith(suffix)
      ? /** @type {Schema.ReadResult<Body & `${Body}${Suffix}`>} */ ({
          ok: input,
        })
      : error(`Expect string to end with "${suffix}" instead got "${input}"`)
  }
  get suffix() {
    return this.settings
  }
  toString() {
    return `endsWith("${this.suffix}")`
  }
}

/**
 * @template {string} Suffix
 * @param {Suffix} suffix
 * @returns {Schema.Schema<`${string}${Suffix}`, string>}
 */
export const endsWith = suffix => new EndsWith(suffix)

/**
 * @template T
 * @template {T} U
 * @template [I=unknown]
 * @extends {API<U, I, { base: Schema.Reader<T, I>, schema: Schema.Reader<U, T> }>}
 * @implements {Schema.Schema<U, I>}
 */

class Refine extends API {
  /**
   * @param {I} input
   * @param {{ base: Schema.Reader<T, I>, schema: Schema.Reader<U, T> }} settings
   */
  readWith(input, { base, schema }) {
    const result = base.read(input)
    return result.error ? result : schema.read(result.ok)
  }
  toString() {
    return `${this.settings.base}.refine(${this.settings.schema})`
  }
}

/**
 * @template T
 * @template {T} U
 * @template [I=unknown]
 * @param {Schema.Reader<T, I>} base
 * @param {Schema.Reader<U, T>} schema
 * @returns {Schema.Schema<U, I>}
 */
export const refine = (base, schema) => new Refine({ base, schema })

/**
 * @template {null|boolean|string|number} T
 * @template [I=unknown]
 * @extends {API<T, I, T>}
 * @implements {Schema.LiteralSchema<T, I>}
 */
class Literal extends API {
  /**
   * @param {I} input
   * @param {T} expect
   * @returns {Schema.ReadResult<T>}
   */
  readWith(input, expect) {
    return input !== /** @type {unknown} */ (expect)
      ? { error: new LiteralError({ expect, actual: input }) }
      : { ok: expect }
  }
  get value() {
    return /** @type {Exclude<T, undefined>} */ (this.settings)
  }
  /**
   * @template {Schema.NotUndefined<T>} U
   * @param {U} value
   */
  default(value = /** @type {U} */ (this.value)) {
    return super.default(value)
  }
  toString() {
    return `literal(${displayTypeName(this.value)})`
  }
}

/**
 * @template {null|boolean|string|number} T
 * @template [I=unknown]
 * @param {T} value
 * @returns {Schema.LiteralSchema<T, I>}
 */
export const literal = value => new Literal(value)

/**
 * @template {{[key:string]: Schema.Reader}} U
 * @template [I=unknown]
 * @extends {API<Schema.InferStruct<U>, I, {shape: U}>}
 */
class Struct extends API {
  /**
   * @param {I} input
   * @param {{shape: U}} settings
   * @returns {Schema.ReadResult<Schema.InferStruct<U>>}
   */
  readWith(input, { shape }) {
    if (typeof input != 'object' || input === null || Array.isArray(input)) {
      return typeError({
        expect: 'object',
        actual: input,
      })
    }

    const source = /** @type {{[K in keyof U]: unknown}} */ (input)

    const struct = /** @type {{[K in keyof U]: Schema.Infer<U[K]>}} */ ({})
    const entries =
      /** @type {{[K in keyof U]: [K & string, U[K]]}[keyof U][]} */ (
        Object.entries(shape)
      )

    for (const [at, reader] of entries) {
      const result = reader.read(source[at])
      if (result.error) {
        return memberError({ at, cause: result.error })
      }
      // skip undefined because they mess up CBOR and are generally useless.
      else if (result.ok !== undefined) {
        struct[at] = /** @type {Schema.Infer<U[typeof at]>} */ (result.ok)
      }
    }

    return { ok: struct }
  }

  /**
   * @returns {Schema.MapRepresentation<Partial<Schema.InferStruct<U>>> & Schema.StructSchema}
   */
  partial() {
    const shape = Object.fromEntries(
      Object.entries(this.shape).map(([key, value]) => [key, optional(value)])
    )

    return new Struct({ shape })
  }

  /** @type {U} */
  get shape() {
    // @ts-ignore - We declared `settings` private but we access it here
    return this.settings.shape
  }

  toString() {
    return [
      `struct({ `,
      ...Object.entries(this.shape).map(
        ([key, schema]) => `${key}: ${schema}, `
      ),
      `})`,
    ].join('')
  }

  /**
   * @param {Schema.InferStructSource<U>} data
   */
  create(data) {
    return this.from(data || {})
  }

  /**
   * @template {{[key:string]: Schema.Reader}} E
   * @param {E} extension
   * @returns {Schema.StructSchema<U & E, I>}
   */
  extend(extension) {
    return new Struct({ shape: { ...this.shape, ...extension } })
  }

  /**
   * @param {object} source
   * @param {Schema.Block} source.root
   * @param {Schema.BlockStore} source.store
   * @returns {Schema.Result<Schema.InferStruct<U> & Schema.IPLDView<Schema.InferStruct<U>>, Schema.Error>}
   */
  createIPLDView(source) {
    const data = this.codec.decode(source.root.bytes)

    if (typeof data != 'object' || data === null || Array.isArray(data)) {
      return typeError({
        expect: 'object',
        actual: data,
      })
    }

    let View = this._View || (this._View = IPLDStructView.struct(this.shape))
    const root = { ...source.root, data }

    const view = View.create({ root, store: source.store, schema: this })
    return { ok: view }
  }
}

/**
 * @template {{[key:string]: Schema.Reader}} U
 * @extends {IPLDView<Schema.InferStruct<U>>}
 */
class IPLDStructView extends IPLDView {
  /**
   * @template {{[key:string]: Schema.Reader}} U
   * @param {U} shape
   * @returns {Schema.CreateView<Schema.InferStruct<U>, Schema.InferStruct<U>>}
   */
  static struct(shape) {
    /** @extends {IPLDStructView<U>} */
    class View extends this {
      static shape = shape
    }

    for (const [key, schema] of Object.entries(shape)) {
      Object.defineProperty(View.prototype, key, {
        get() {
          let result = this[`_${key}`]
          if (!result) {
            result = schema.read(this.root.data[key])
            this[`_${key}`] = result
          }

          if (result.ok) {
            return result.ok
          } else {
            throw memberError({ at: key, cause: result.error }).error
          }
        },
      })
    }

    return /** @type {*} */ (View)
  }
}

/**
 * @template {null|boolean|string|number} T
 * @template {{[key:string]: T|Schema.Reader}} U
 * @template {{[K in keyof U]: U[K] extends Schema.Reader ? U[K] : Schema.LiteralSchema<U[K] & T>}} V
 * @template [I=unknown]
 * @param {U} fields
 * @returns {Schema.StructSchema<V, I>}
 */
export const struct = fields => {
  const shape =
    /** @type {{[K in keyof U]: Schema.Reader<unknown, unknown>}} */ ({})
  /** @type {[keyof U & string, T|Schema.Reader][]} */
  const entries = Object.entries(fields)

  for (const [key, field] of entries) {
    switch (typeof field) {
      case 'number':
      case 'string':
      case 'boolean':
        shape[key] = literal(field)
        break
      case 'object':
        shape[key] = field === null ? literal(null) : field
        break
      default:
        throw new Error(
          `Invalid struct field "${key}", expected schema or literal, instead got ${typeof field}`
        )
    }
  }

  return new Struct({ shape: /** @type {V} */ (shape) })
}

/**
 * @template {unknown} [T=unknown]
 * @template {number} [Code=number]
 * @template {number} [Alg=number]
 * @template {1|0} [Version=0|1]
 * @typedef {{
 * code?:Code,
 * version?:Version
 * multihash?: {code?: Alg, digest?: Uint8Array}
 * schema?: Schema.Schema<T, unknown>
 * }} LinkSettings
 */

/**
 * @template {unknown} T
 * @template {number} Code
 * @template {number} Alg
 * @template {1|0} Version
 * @extends {API<Schema.Link<T, Code, Alg, Version>, unknown, LinkSettings<T, Code, Alg, Version>>}
 * @implements {Schema.LinkSchema<T, Code, Alg, Version>}
 */
class LinkSchema extends API {
  /**
   *
   * @param {unknown} cid
   * @param {LinkSettings<T, Code, Alg, Version>} settings
   * @returns {Schema.ReadResult<Schema.Link<T, Code, Alg, Version>>}
   */
  readWith(cid, { code, multihash = {}, version }) {
    if (cid == null) {
      return error(`Expected link but got ${cid} instead`)
    } else {
      if (!isLink(cid)) {
        return error(`Expected link to be a CID instead of ${cid}`)
      } else {
        if (code != null && cid.code !== code) {
          return error(
            `Expected link to be CID with 0x${code.toString(16)} codec`
          )
        }

        if (multihash.code != null && cid.multihash.code !== multihash.code)
          return error(
            `Expected link to be CID with 0x${multihash.code.toString(
              16
            )} hashing algorithm`
          )

        if (version != null && cid.version !== version) {
          return error(
            `Expected link to be CID version ${version} instead of ${cid.version}`
          )
        }

        const [expectDigest, actualDigest] =
          multihash.digest != null
            ? [
                base32.baseEncode(multihash.digest),
                base32.baseEncode(cid.multihash.digest),
              ]
            : ['', '']

        if (expectDigest !== actualDigest) {
          return error(
            `Expected link with "${expectDigest}" hash digest instead of "${actualDigest}"`
          )
        }

        return {
          ok: /** @type {Schema.Link<T, any, any, any>} */ (cid),
        }
      }
    }
  }

  /**
   * @returns {never}
   */
  link() {
    throw new Error('Can not create link of link')
  }

  /**
   * @template {string} Prefix
   * @param {string} input
   * @param {Schema.MultibaseDecoder<Prefix>} [base]
   */
  parse(input, base) {
    const link = parseLink(input, base)
    return this.from(link)
  }
}

/** @type {Schema.LinkSchema<unknown, number, number, 0|1>}  */
export const Link = new LinkSchema({})

/**
 * @template {number} Code
 * @template {number} Alg
 * @template {1|0} Version
 * @template {unknown} T
 * @param {LinkSettings<T, Code, Alg, Version>} options
 * @returns {Schema.LinkSchema<T, Code, Alg, Version>}
 */
export const link = (options = {}) => new LinkSchema(options)

/**
 * @template {Schema.VariantChoices} U
 * @template [I=unknown]
 * @extends {API<Schema.InferVariant<U>, I, U>}
 * @implements {Schema.VariantSchema<U, I>}
 */
class Variant extends API {
  /**
   * @param {I} input
   * @param {U} variants
   * @returns {Schema.ReadResult<Schema.InferVariant<U>>}
   */
  readWith(input, variants) {
    if (typeof input != 'object' || input === null || Array.isArray(input)) {
      return typeError({
        expect: 'object',
        actual: input,
      })
    }

    const keys = /** @type {Array<keyof input & keyof variants & string>} */ (
      Object.keys(input)
    )

    const [key] = keys.length === 1 ? keys : []
    const reader = key ? variants[key] : undefined

    if (reader) {
      const result = reader.read(input[key])
      return result.error
        ? memberError({ at: key, cause: result.error })
        : { ok: /** @type {Schema.InferVariant<U>} */ ({ [key]: result.ok }) }
    } else if (variants._) {
      const result = variants._.read(input)
      return result.error
        ? result
        : { ok: /** @type {Schema.InferVariant<U>} */ ({ _: result.ok }) }
    } else if (key) {
      return error(
        `Expected an object with one of the these keys: ${Object.keys(variants)
          .sort()
          .join(', ')} instead got object with key ${key}`
      )
    } else {
      return error(
        'Expected an object with a single key instead got object with keys ' +
          keys.sort().join(', ')
      )
    }
  }

  /**
   * @template [E=never]
   * @param {I} input
   * @param {E} [fallback]
   */
  match(input, fallback) {
    const result = this.read(input)
    if (result.error) {
      if (fallback !== undefined) {
        return [null, fallback]
      } else {
        throw result.error
      }
    } else {
      const [key] = Object.keys(result.ok)
      const value = result.ok[key]
      return /** @type {any} */ ([key, value])
    }
  }

  /**
   * @template {Schema.InferVariant<U>} O
   * @param {O} source
   * @returns {O}
   */
  create(source) {
    return /** @type {O} */ (this.from(source))
  }
}

/**
 * Defines a schema for the `Variant` type. It takes an object where
 * keys denote branches of the variant and values are schemas for the values of
 * those branches. The schema will only match objects with a single key and
 * value that matches the schema for that key. If the object has more than one
 * key or the key does not match any of the keys in the schema then the schema
 * will fail.
 *
 * The `_` branch is a special case. If such branch is present then it will be
 * used as a fallback for any object that does not match any of the variant
 * branches. The `_` branch will be used even if the object has more than one
 * key. Unlike other branches the `_` branch will receive the entire object as
 * input and not just the value of the key. Usually the `_` branch can be set
 * to `Schema.unknown` or `Schema.dictionary` to facilitate exhaustive matching.
 *
 * @example
 * ```ts
 * const Shape = Variant({
 *    circle: Schema.struct({ radius: Schema.integer() }),
 *    rectangle: Schema.struct({ width: Schema.integer(), height: Schema.integer() })
 * })
 *
 * const demo = (input:unknown) => {
 *   const [kind, value] = Schema.match(input)
 *   switch (kind) {
 *     case "circle":
 *       return `Circle with radius ${shape.radius}`
 *     case "rectangle":
 *       return `Rectangle with width ${shape.width} and height ${shape.height}`
 *    }
 * }
 *
 * const ExhaustiveShape = Variant({
 *   circle: Schema.struct({ radius: Schema.integer() }),
 *   rectangle: Schema.struct({ width: Schema.integer(), height: Schema.integer() }),
 *  _: Schema.dictionary({ value: Schema.unknown() })
 * })
 *
 * const exhastiveDemo = (input:unknown) => {
 *   const [kind, value] = Schema.match(input)
 *   switch (kind) {
 *     case "circle":
 *       return `Circle with radius ${shape.radius}`
 *     case "rectangle":
 *       return `Rectangle with width ${shape.width} and height ${shape.height}`
 *     case: "_":
 *       return `Unknown shape ${JSON.stringify(value)}`
 *    }
 * }
 * ```
 *
 * @template {Schema.VariantChoices} Choices
 * @template [In=unknown]
 * @param {Choices} variants
 * @returns {Schema.VariantSchema<Choices, In>}
 */
export const variant = variants => new Variant(variants)

/**
 * @param {string} message
 * @returns {{error: Schema.Error}}
 */
export const error = message => ({ error: new SchemaError(message) })

class SchemaError extends Failure {
  get name() {
    return 'SchemaError'
  }
  /* c8 ignore next 3 */
  describe() {
    return this.name
  }
}

class TypeError extends SchemaError {
  /**
   * @param {{expect:string, actual:unknown}} data
   */
  constructor({ expect, actual }) {
    super()
    this.expect = expect
    this.actual = actual
  }
  get name() {
    return 'TypeError'
  }
  describe() {
    return `Expected value of type ${this.expect} instead got ${displayTypeName(
      this.actual
    )}`
  }
}

/**
 * @param {object} data
 * @param {string} data.expect
 * @param {unknown} data.actual
 * @returns {{ error: Schema.Error }}
 */
export const typeError = data => ({ error: new TypeError(data) })

/**
 *
 * @param {unknown} value
 */
const displayTypeName = value => {
  const type = typeof value
  switch (type) {
    case 'boolean':
    case 'string':
      return JSON.stringify(value)
    // if these types we do not want JSON.stringify as it may mess things up
    // eg turn NaN and Infinity to null
    case 'bigint':
      return `${value}n`
    case 'number':
    case 'symbol':
    case 'undefined':
      return String(value)
    case 'object':
      return value === null ? 'null' : Array.isArray(value) ? 'array' : 'object'
    default:
      return type
  }
}

class LiteralError extends SchemaError {
  /**
   * @param {{
   * expect:string|number|boolean|null
   * actual:unknown
   * }} data
   */
  constructor({ expect, actual }) {
    super()
    this.expect = expect
    this.actual = actual
  }
  get name() {
    return 'LiteralError'
  }
  describe() {
    return `Expected literal ${displayTypeName(
      this.expect
    )} instead got ${displayTypeName(this.actual)}`
  }
}

class ElementError extends SchemaError {
  /**
   * @param {{at:number, cause:Schema.Error}} data
   */
  constructor({ at, cause }) {
    super()
    this.at = at
    this.cause = cause
  }
  get name() {
    return 'ElementError'
  }
  describe() {
    return [
      `Array contains invalid element at ${this.at}:`,
      li(this.cause.message),
    ].join('\n')
  }
}

class FieldError extends SchemaError {
  /**
   * @param {{at:string, cause:Schema.Error}} data
   */
  constructor({ at, cause }) {
    super()
    this.at = at
    this.cause = cause
  }
  get name() {
    return 'FieldError'
  }
  describe() {
    return [
      `Object contains invalid field "${this.at}":`,
      li(this.cause.message),
    ].join('\n')
  }
}

/**
 * @param {object} options
 * @param {string|number} options.at
 * @param {Schema.Error} options.cause
 * @returns {{error: Schema.Error}}
 */
export const memberError = ({ at, cause }) =>
  typeof at === 'string'
    ? { error: new FieldError({ at, cause }) }
    : { error: new ElementError({ at, cause }) }

class UnionError extends SchemaError {
  /**
   * @param {{causes: Schema.Error[]}} data
   */
  constructor({ causes }) {
    super()
    this.causes = causes
  }
  get name() {
    return 'UnionError'
  }
  describe() {
    const { causes } = this
    return [
      `Value does not match any type of the union:`,
      ...causes.map(cause => li(cause.message)),
    ].join('\n')
  }
}

class IntersectionError extends SchemaError {
  /**
   * @param {{causes: Schema.Error[]}} data
   */
  constructor({ causes }) {
    super()
    this.causes = causes
  }
  get name() {
    return 'IntersectionError'
  }
  describe() {
    const { causes } = this
    return [
      `Value does not match following types of the intersection:`,
      ...causes.map(cause => li(cause.message)),
    ].join('\n')
  }
}

/**
 * @param {string} message
 */
const indent = (message, indent = '  ') =>
  `${indent}${message.split('\n').join(`\n${indent}`)}`

/**
 * @param {string} message
 */
const li = message => indent(`- ${message}`)
