import * as API from "@ucanto/interface"

/**
 * @template T
 * @param {object} options
 * @param {typeof fetch} [options.fetch]
 * @param {URL} options.url
 * @param {string} [options.method]
 * @returns {API.Channel<T>}
 */
export const open = ({ url, method = "POST", fetch = globalThis.fetch }) => {
  if (typeof fetch === "undefined") {
    throw new TypeError(
      `ucanto HTTP transport got undefined \`fetch\`. Try passing in a \`fetch\` implementation explicitly.`
    )
  }
  return new Channel({ url, method, fetch })
}
class Channel {
  /**
   * @param {object} options
   * @param {URL} options.url
   * @param {typeof fetch} options.fetch
   * @param {string} [options.method]
   */
  constructor({ url, fetch, method }) {
    this.fetch = fetch
    this.method = method
    this.url = url
  }
  /**
   * @param {API.HTTPRequest} request
   * @returns {Promise<API.HTTPResponse>}
   */
  async request({ headers, body }) {
    const response = await this.fetch(this.url.href, {
      headers,
      body,
    })

    const buffer = response.ok
      ? await response.arrayBuffer()
      : HTTPError.throw("HTTP Request failed", response)

    return {
      headers: Object.fromEntries(response.headers.entries()),
      body: new Uint8Array(buffer),
    }
  }
}

/**
 * @typedef {{
 * status?: number
 * statusText?: string
 * url?: string
 * }} Options
 */
class HTTPError extends Error {
  /**
   * @param {string} message
   * @param {Options} options
   * @returns {never}
   */
  static throw(message, options) {
    throw new this(message, options)
  }
  /**
   * @param {string} message
   * @param {Options} options
   */
  constructor(message, { url, status = 500, statusText = "Server error" }) {
    super(message)
    this.url = url
    this.status = status
    this.statusText = statusText
  }
}
