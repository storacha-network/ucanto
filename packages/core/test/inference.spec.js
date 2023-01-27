import * as Voucher from './capabilities/voucher.js'
import { test, assert } from './test.js'
import { alice, bob, mallory, service as w3 } from './fixtures.js'
import { capability, Schema } from '../src/lib.js'
import * as API from '@ucanto/interface'

const { URI, Link, DID } = Schema

test('execute capability', () =>
  /**
   * @param {API.ConnectionView<Voucher.Service>} connection
   */
  async connection => {
    const claim = Voucher.Claim.invoke({
      issuer: alice,
      audience: w3,
      with: alice.did(),
      nb: {
        identity: URI.from(`mailto:${alice.did}@web.mail`),
        product: Link.parse('bafkqaaa'),
        service: w3.did(),
      },
    })

    const proof = Voucher.Redeem.invoke({
      issuer: alice,
      audience: w3,
      with: alice.did(),
      nb: {
        product: 'test',
        identity: 'whatever',
        account: alice.did(),
      },
    })

    const redeem = Voucher.Redeem.invoke({
      issuer: alice,
      audience: w3,
      with: alice.did(),
      nb: {
        product: 'test',
        identity: proof.capabilities[0].nb.identity,
        account: alice.did(),
      },
    })

    const r1 = await redeem.execute(connection)
    if (!r1.error) {
      r1.product.toLowerCase()
    }

    const r2 = await claim.execute(connection)
    if (!r2.error) {
      r2.service.toUpperCase()
    }
  })

test('can access fields on the proof', () =>
  /**
   * @param {API.Delegation<[Voucher.VoucherRedeem]>} proof
   */
  proof => {
    const redeem = Voucher.Redeem.invoke({
      issuer: alice,
      audience: w3,
      with: alice.did(),
      nb: {
        product: proof.capabilities[0].nb.product,
        identity: proof.capabilities[0].nb.identity,
        account: proof.capabilities[0].nb.account,
      },
      proofs: [proof],
    })
  })

test('use InferInvokedCapability', () =>
  /**
   * @param {API.ConnectionView<Voucher.Service>} connection
   * @param {API.InferInvokedCapability<typeof Voucher.Redeem>} capability
   */
  async (connection, capability) => {
    const redeem = Voucher.Redeem.invoke({
      issuer: alice,
      audience: w3,
      with: capability.with,
      nb: {
        product: capability.nb.product,
        identity: capability.nb.identity,
        account: capability.nb.account,
      },
    })

    const result = await redeem.execute(connection)
    if (!result.error) {
      result.product.toLocaleLowerCase()
    }
  })

test('infers nb fields optional', () => {
  capability({
    can: 'test/nb',
    with: DID.match({ method: 'key' }),
    nb: {
      msg: URI.match({ protocol: 'data:' }),
    },
    derives: (claim, proof) => {
      /** @type {string} */
      // @ts-expect-error - may be undefined
      const _1 = claim.nb.msg

      /** @type {API.URI<"data:">|undefined} */
      const _2 = claim.nb.msg

      /** @type {string} */
      // @ts-expect-error - may be undefined
      const _3 = proof.nb.msg

      /** @type {API.URI<"data:">|undefined} */
      const _4 = proof.nb.msg

      return true
    },
  })
})

test('infers nb fields in derived capability', () => {
  capability({
    can: 'test/base',
    with: DID.match({ method: 'key' }),
    nb: {
      msg: URI.match({ protocol: 'data:' }),
    },
  }).derive({
    to: capability({
      can: 'test/derived',
      with: DID.match({ method: 'key' }),
      nb: {
        bar: URI.match({ protocol: 'data:' }),
      },
    }),
    derives: (claim, proof) => {
      /** @type {string} */
      // @ts-expect-error - may be undefined
      const _1 = claim.nb.bar

      /** @type {API.URI<"data:">|undefined} */
      const _2 = claim.nb.bar

      /** @type {string} */
      // @ts-expect-error - may be undefined
      const _3 = proof.nb.msg

      /** @type {API.URI<"data:">|undefined} */
      const _4 = proof.nb.msg

      return true
    },
  })
})

test('infers nb fields in derived capability', () => {
  const A = capability({
    can: 'test/a',
    with: DID.match({ method: 'key' }),
    nb: {
      a: URI.match({ protocol: 'data:' }),
    },
  })

  const B = capability({
    can: 'test/b',
    with: DID.match({ method: 'key' }),
    nb: {
      b: URI.match({ protocol: 'data:' }),
    },
  })

  A.and(B).derive({
    to: capability({
      can: 'test/c',
      with: DID.match({ method: 'key' }),
      nb: {
        c: URI.match({ protocol: 'data:' }),
      },
    }),
    derives: (claim, [a, b]) => {
      /** @type {string} */
      // @ts-expect-error - may be undefined
      const _1 = claim.nb.c

      /** @type {API.URI<"data:">|undefined} */
      const _2 = claim.nb.c

      /** @type {string} */
      // @ts-expect-error - may be undefined
      const _3 = a.nb.a

      /** @type {API.URI<"data:">|undefined} */
      const _4 = a.nb.a

      /** @type {string} */
      // @ts-expect-error - may be undefined
      const _5 = b.nb.b

      /** @type {API.URI<"data:">|undefined} */
      const _6 = b.nb.b

      return true
    },
  })

  test('infers nb fields in derived capability', async () => {
    const A = capability({
      can: 'test/a',
      with: DID.match({ method: 'key' }),
      nb: {
        a: URI.match({ protocol: 'data:' }),
      },
    })

    const a = await A.delegate({
      issuer: alice,
      with: alice.did(),
      audience: w3,
    })

    /** @type {string} */
    // @ts-expect-error - may be undefined
    const _1 = a.capabilities[0].nb.a

    /** @type {string|undefined} */
    const _2 = a.capabilities[0].nb.a

    const i = A.invoke({
      issuer: alice,
      with: alice.did(),
      audience: w3,
      nb: {
        a: 'data:',
      },
    })

    /** @type {string} */
    const _3 = i.capabilities[0].nb.a
  })
})
