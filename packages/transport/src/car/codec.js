import * as API from '@ucanto/interface'
import * as CARWriter from '@ipld/car/buffer-writer'
import { CarReader } from '@ipld/car/reader'
import { base32 } from 'multiformats/bases/base32'
import { UCAN, createLink } from '@ucanto/core'
import { sha256 } from 'multiformats/hashes/sha2'

export const code = 0x0202

/**
 * //TODO remove multiple block interfaces when multiformats 10 is merged
 * @typedef {API.Block<unknown, number, number, 0|1> | CARWriter.Block} Block
 * @typedef {{
 * roots: Block[]
 * blocks: Map<string, Block>
 * }} Model
 */

class Writer {
  /**
   * @param {Block[]} blocks
   * @param {number} byteLength
   */
  constructor(blocks = [], byteLength = 0) {
    this.written = new Set()
    this.blocks = blocks
    this.byteLength = byteLength
  }
  /**
   * @param {Block[]} blocks
   */
  write(...blocks) {
    for (const block of blocks) {
      const id = block.cid.toString(base32)
      if (!this.written.has(id)) {
        this.blocks.push(block)
        this.byteLength += CARWriter.blockLength(
          /** @type {CARWriter.Block} */ (block)
        )
        this.written.add(id)
      }
    }
    return this
  }
  /**
   * @param {Block[]} rootBlocks
   */
  flush(...rootBlocks) {
    const roots = []
    for (const block of rootBlocks.reverse()) {
      const id = block.cid.toString(base32)
      if (!this.written.has(id)) {
        this.blocks.unshift(block)
        this.byteLength += CARWriter.blockLength({
          cid: /** @type {CARWriter.CID} */ (block.cid),
          bytes: block.bytes,
        })
        this.written.add(id)
      }
      roots.push(/** @type {CARWriter.CID} */ (block.cid))
    }

    this.byteLength += CARWriter.headerLength({ roots })

    const buffer = new ArrayBuffer(this.byteLength)
    const writer = CARWriter.createWriter(buffer, { roots })

    for (const block of /** @type {CARWriter.Block[]} */ (this.blocks)) {
      writer.write(block)
    }

    return writer.close()
  }
}

export const createWriter = () => new Writer()

/**
 * @template {Partial<Model>} T
 * @param {T} input
 * @returns {API.ByteView<T>}
 */
export const encode = ({ roots = [], blocks }) => {
  const writer = new Writer()
  if (blocks) {
    writer.write(...blocks.values())
  }
  return writer.flush(...roots)
}

/**
 * @param {API.ByteView<Partial<Model>>} bytes
 * @returns {Promise<Model>}
 */
export const decode = async bytes => {
  const reader = await /** @type {any} */ (CarReader.fromBytes(bytes))
  /** @type {{_header: { roots: CARWriter.CID[] }, _keys: string[], _blocks: UCAN.Block[] }} */
  const { _header, _blocks, _keys } = reader
  const roots = []
  const blocks = new Map()
  const index = _header.roots.map(cid => _keys.indexOf(String(cid)))

  for (const [n, block] of _blocks.entries()) {
    if (index.includes(n)) {
      roots.push(/** @type {Block} */ (block))
    } else {
      blocks.set(block.cid.toString(), block)
    }
  }

  return { roots, blocks }
}

/**
 * @template {Partial<Model>} T
 * @param {API.ByteView<T>} bytes
 * @param {{hasher?: API.MultihashHasher }} options
 */
export const link = async (bytes, { hasher = sha256 } = {}) => {
  return /** @type {API.Link<T, typeof code, typeof hasher.code>} */ (
    createLink(code, await hasher.digest(bytes))
  )
}

/**
 * @template {Partial<Model>} T
 * @param {T} data
 * @param {{hasher?: API.MultihashHasher }} [options]
 * @returns {Promise<API.Block<T, typeof code>>}
 */
export const write = async (data, options) => {
  const bytes = encode(data)
  const cid = await link(bytes, options)

  return { bytes, cid }
}
