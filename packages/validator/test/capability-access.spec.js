import { test, assert, matchError } from './test.js'
import { access, claim, DID } from '../src/lib.js'
import { capability, fail, URI, Link, Schema } from '../src/lib.js'
import { ed25519, Verifier } from '@ucanto/principal'
import * as Client from '@ucanto/client'
import * as Core from '@ucanto/core'

import { alice, bob, mallory, service } from './fixtures.js'
const w3 = service.withDID('did:web:web3.storage')

const capabilities = {
  store: {
    add: capability({
      can: 'store/add',
      with: DID,
      nb: Schema.struct({
        link: Link,
        size: Schema.integer().optional(),
      }),
      derives: (claim, proof) => {
        if (claim.with !== proof.with) {
          return fail('with field does not match')
        } else if (proof.nb.size != null) {
          if ((claim.nb.size || Infinity) > proof.nb.size) {
            return fail('Escalates size constraint')
          }
        }
        return { ok: {} }
      },
    }),
    list: capability({
      can: 'store/list',
      with: DID,
    }),
  },
  dev: {
    ping: capability({
      can: 'dev/ping',
      with: DID,
      nb: Schema.struct({
        message: Schema.string(),
      }),
    }),
  },
}

test('validates with patterns', async () => {
  const proof = await Core.delegate({
    issuer: alice,
    audience: bob,
    capabilities: [
      {
        with: 'ucan:*',
        can: '*',
      },
    ],
  })

  const ping = capabilities.dev.ping.invoke({
    issuer: bob,
    audience: w3,
    with: alice.did(),
    nb: {
      message: 'hello',
    },
    proofs: [proof],
  })

  const result = await access(await ping.delegate(), {
    authority: w3,
    capability: capabilities.dev.ping,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  assert.equal(result.error, undefined)
})

test('validates with patterns in chain', async () => {
  const top = await Core.delegate({
    issuer: alice,
    audience: bob,
    capabilities: [
      {
        with: alice.did(),
        can: 'store/add',
      },
    ],
  })

  const proof = await Core.delegate({
    issuer: bob,
    audience: mallory,
    capabilities: [
      {
        with: 'ucan:*',
        can: '*',
      },
    ],
    proofs: [top],
  })

  const r1 = await access(
    await Client.delegate({
      issuer: mallory,
      audience: w3,
      capabilities: [
        {
          with: alice.did(),
          can: 'store/list',
          nb: {
            link: Link.parse('bafkqaaa'),
          },
        },
      ],
      proofs: [proof],
    }),
    {
      authority: w3,
      capability: capabilities.store.add,
      principal: Verifier,
      validateAuthorization: () => ({ ok: {} }),
    }
  )

  matchError(r1, /Encountered unknown capabilities/)

  const r2 = await access(
    await Client.delegate({
      issuer: mallory,
      audience: w3,
      capabilities: [
        {
          with: alice.did(),
          can: 'store/add',
          nb: {
            link: Link.parse('bafkqaaa'),
          },
        },
      ],
      proofs: [proof],
    }),
    {
      authority: w3,
      capability: capabilities.store.add,
      principal: Verifier,
      validateAuthorization: () => ({ ok: {} }),
    }
  )

  assert.equal(r2.error, undefined)
})

test('invalid proof chain', async () => {
  const top = await Core.delegate({
    issuer: alice,
    audience: bob,
    capabilities: [
      {
        with: alice.did(),
        can: 'store/add',
      },
    ],
  })

  const proof = await Core.delegate({
    issuer: bob,
    audience: mallory,
    capabilities: [
      {
        with: 'ucan:*',
        can: '*',
        nb: {
          link: '*',
        },
      },
    ],
    proofs: [top],
  })

  const result = await access(
    await Client.delegate({
      issuer: mallory,
      audience: w3,
      capabilities: [
        {
          with: alice.did(),
          can: 'store/add',
          nb: {
            link: Link.parse('bafkqaaa'),
          },
        },
      ],
      proofs: [proof],
    }),
    {
      authority: w3,
      capability: capabilities.store.add,
      principal: Verifier,
      validateAuthorization: () => ({ ok: {} }),
    }
  )

  matchError(result, /Expected link to be a CID instead of \*/)
})

test('restrictions in chain are respected', async () => {
  const jordan = await ed25519.generate()
  const top = await Core.delegate({
    issuer: alice,
    audience: bob,
    capabilities: [
      {
        with: 'ucan:*',
        can: '*',
      },
    ],
  })

  const middle = await Core.delegate({
    issuer: bob,
    audience: mallory,
    capabilities: [
      {
        with: 'ucan:*',
        can: 'dev/*',
      },
    ],
    proofs: [top],
  })

  const proof = await Core.delegate({
    issuer: mallory,
    audience: jordan,
    capabilities: [
      {
        with: 'ucan:*',
        can: '*',
      },
    ],
    proofs: [middle],
  })

  const boom = await access(
    await Client.delegate({
      issuer: jordan,
      audience: w3,
      capabilities: [
        {
          with: alice.did(),
          can: 'store/add',
          nb: {
            link: Link.parse('bafkqaaa'),
          },
        },
      ],
      proofs: [proof],
    }),
    {
      authority: w3,
      // @ts-expect-error - tries to unify incompatible capabilities
      capability: capabilities.store.add.or(capabilities.dev.ping),
      principal: Verifier,
    }
  )

  matchError(boom, /Unauthorized/, 'should only allow dev/* capabilities')

  const ping = capabilities.dev.ping.invoke({
    issuer: jordan,
    audience: w3,
    with: alice.did(),
    nb: {
      message: 'hello',
    },
    proofs: [proof],
  })

  const result = await access(await ping.delegate(), {
    authority: w3,
    // @ts-expect-error - tries to unify incompatible capabilities
    capability: capabilities.store.add.or(capabilities.dev.ping),
    principal: Verifier,
  })

  assert.equal(result.error, undefined, 'should allow dev/* capabilities')
})

test('unknown caveats do not apply', async () => {
  const proof = await Core.delegate({
    issuer: alice,
    audience: bob,
    capabilities: [
      {
        with: 'ucan:*',
        can: '*',
        nb: {
          message: 'hello',
        },
      },
    ],
  })

  const badPing = capabilities.dev.ping.invoke({
    issuer: bob,
    audience: w3,
    with: alice.did(),
    nb: {
      message: 'hello world',
    },
    proofs: [proof],
  })

  const boom = await access(await badPing.delegate(), {
    authority: w3,
    capability: capabilities.dev.ping,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  matchError(boom, /Constraint violation: message/, 'message caveat applies')

  const add = capabilities.store.add.invoke({
    issuer: bob,
    audience: w3,
    with: alice.did(),
    nb: {
      link: Link.parse('bafkqaaa'),
    },
    proofs: [proof],
  })

  const result = await access(await add.delegate(), {
    authority: w3,
    capability: capabilities.store.add,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  assert.equal(result.error, undefined, 'message caveat does not apply')
})

test('with pattern requires delimiter', async () => {
  const proof = await Core.delegate({
    issuer: alice,
    audience: bob,
    capabilities: [
      {
        with: 'did:key:z6*',
        can: '*',
      },
    ],
  })

  const ping = capabilities.dev.ping.invoke({
    issuer: bob,
    audience: w3,
    with: alice.did(),
    nb: {
      message: 'hello',
    },
    proofs: [proof],
  })

  const result = await access(await ping.delegate(), {
    authority: w3,
    capability: capabilities.dev.ping,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  matchError(result, /capability not found/)
})

test('can pattern requires delimiter', async () => {
  const proof = await Core.delegate({
    issuer: alice,
    audience: bob,
    capabilities: [
      {
        with: 'ucan:*',
        can: 'dev/p*',
      },
    ],
  })

  const ping = capabilities.dev.ping.invoke({
    issuer: bob,
    audience: w3,
    with: alice.did(),
    nb: {
      message: 'hello',
    },
    proofs: [proof],
  })

  const result = await access(await ping.delegate(), {
    authority: w3,
    capability: capabilities.dev.ping,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  matchError(
    result,
    /capability not found/,
    'can without delimiter is not allowed'
  )
})

test('patterns do not escalate', async () => {
  const top = await capabilities.store.add.delegate({
    issuer: alice,
    audience: bob,
    with: alice.did(),
    nb: {
      size: 200,
    },
  })

  const proof = await Client.delegate({
    issuer: bob,
    audience: mallory,
    capabilities: [
      {
        with: alice.did(),
        can: 'store/*',
      },
    ],
    proofs: [top],
  })

  const escalate = capabilities.store.add.invoke({
    issuer: mallory,
    audience: service,
    with: alice.did(),
    nb: {
      link: Link.parse('bafkqaaa'),
      size: 500,
    },
    proofs: [proof],
  })

  const error = await access(await escalate.delegate(), {
    authority: w3,
    capability: capabilities.store.add,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  matchError(error, /Escalates size constraint/)

  const implicitEscalate = capabilities.store.add.invoke({
    issuer: mallory,
    audience: service,
    with: alice.did(),
    nb: {
      link: Link.parse('bafkqaaa'),
    },
    proofs: [proof],
  })
  const stillError = await access(await implicitEscalate.delegate(), {
    authority: w3,
    capability: capabilities.store.add,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  matchError(stillError, /Escalates size constraint/)

  const add = capabilities.store.add.invoke({
    issuer: mallory,
    audience: service,
    with: alice.did(),
    nb: {
      link: Link.parse('bafkqaaa'),
      size: 100,
    },
    proofs: [proof],
  })

  const ok = await access(await add.delegate(), {
    authority: w3,
    capability: capabilities.store.add,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  assert.equal(ok.error, undefined)
})

test('without nb', async () => {
  const proof = await Client.delegate({
    issuer: alice,
    audience: bob,
    capabilities: [
      {
        can: 'store/*',
        with: alice.did(),
        nb: {
          size: 200,
        },
      },
    ],
  })

  const add = capabilities.store.add.invoke({
    issuer: bob,
    audience: service,
    with: alice.did(),
    nb: {
      link: Link.parse('bafkqaaa'),
      size: 100,
    },
    proofs: [proof],
  })

  const addOk = await access(await add.delegate(), {
    authority: w3,
    capability: capabilities.store.add,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  assert.equal(addOk.error, undefined)

  const addEscalate = capabilities.store.add.invoke({
    issuer: bob,
    audience: service,
    with: alice.did(),
    nb: {
      link: Link.parse('bafkqaaa'),
      size: 201,
    },
    proofs: [proof],
  })

  const addEscalateError = await access(await addEscalate.delegate(), {
    authority: w3,
    capability: capabilities.store.add,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })
  matchError(addEscalateError, /Escalates size constraint/)

  const list = capabilities.store.list.invoke({
    issuer: bob,
    audience: service,
    with: alice.did(),
    proofs: [proof],
  })

  const listOk = await access(await list.delegate(), {
    authority: w3,
    capability: capabilities.store.list,
    principal: Verifier,
    validateAuthorization: () => ({ ok: {} }),
  })

  assert.equal(listOk.error, undefined)
})
