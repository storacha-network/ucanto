import * as API from "./api.js"
import * as Storage from "./services/storage.js"
import * as Accounts from "./services/account.js"
import { the } from "./services/util.js"

/**
 * @typedef {{
 * can: "store/add"
 * with: API.DID
 * link: API.Link
 * }} Add
 *
 * @typedef {{
 * status: "done"
 * with: API.DID
 * link: API.Link
 * }} Added
 *
 * @typedef {{
 * status: "upload"
 * with: API.DID
 * link: API.Link
 * url: string
 * }} Upload
 *
 * @typedef {{
 * can: "store/remove"
 * with: API.DID
 * link: API.Link
 * }} Remove
 */

/**
 * @typedef {{
 * accounts: API.AccessProvider
 * storage: API.StorageProvider
 * }} Model
 */

class StorageService {
  /**
   * @param {Partial<Model>} [config]
   */
  constructor({
    accounts = Accounts.create(),
    storage = Storage.create({ accounts }),
  } = {}) {
    /** @private */
    this.storage = storage
  }
  /**
   * @param {API.Invocation<Add>} ucan
   * @returns {Promise<API.Result<Added|Upload, API.UnknownDIDError|API.QuotaViolationError>>}
   */
  async add(ucan) {
    const [capability] = ucan.capabilities
    // const auth = await Auth.access(capability, /** @type {any} */ (ucan))
    // if (auth.ok) {
    const result = await this.storage.add(
      capability.with,
      capability.link,
      /** @type {any} */ (ucan).cid
    )
    if (!result.error) {
      if (result.status === "in-s3") {
        return {
          with: capability.with,
          link: capability.link,
          status: the("done"),
        }
      } else {
        return {
          with: capability.with,
          link: capability.link,
          status: the("upload"),
          url: "http://localhost:9090/",
        }
      }
    } else {
      return result
    }
  }
  /**
   * @param {API.Invocation<Remove>} ucan
   * @returns {Promise<API.Result<Remove, API.UnknownDIDError|API.DoesNotHasError>>}
   */
  async remove(ucan) {
    const [capability] = ucan.capabilities
    // const access = await Auth.access(capability, /** @type {any} */ (ucan))
    // if (access.ok) {
    const remove = await this.storage.remove(
      capability.with,
      capability.link,
      /** @type {any} */ (ucan).link
    )
    if (remove?.error) {
      return remove
    } else {
      return capability
    }
  }
}

class AccessService {
  /**
   * @param {Partial<Model>} [config]
   */
  constructor({ accounts = Accounts.create() } = {}) {
    this.accounts = accounts
  }
  /**
   * @typedef {{
   * can: "access/identify"
   * with: API.DID
   * }} Identify
   * @param {API.Invocation<Identify>} ucan
   * @returns {Promise<API.Result<null, API.UnknownDIDError>>}
   */
  async identify(ucan) {
    const [capability] = ucan.capabilities
    // const access = await Auth.access(capability, /** @type {any} */ (ucan))
    // if (access.ok) {
    if (capability.with.startsWith("did:email:")) {
      return this.accounts.register(
        ucan.issuer.did(),
        capability.with,
        /** @type {any} */ (ucan).cid
      )
    } else {
      return this.accounts.link(
        ucan.issuer.did(),
        capability.with,
        /** @type {any} */ (ucan).link
      )
    }
    // } else {
    //   return access
    // }
  }
}

class Main {
  /**
   * @param {Partial<Model>} [config]
   */
  constructor({ accounts = Accounts.create(), ...config } = {}) {
    this.access = new AccessService({ accounts })
    this.store = new StorageService({ ...config, accounts })
  }
}

/**
 * @typedef {Main} Service
 * @param {Partial<Model>} [config]
 * @returns {Service}
 */
export const create = config => new Main(config)

export { Storage, Accounts }
