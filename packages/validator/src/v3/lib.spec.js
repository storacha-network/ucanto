import test from "ava"
import { capability } from "./lib.js"
import * as API from "./api.js"
import { EscalatedCapability, Failure, UnknownCapability } from "../error.js"
import { the } from "../util.js"

/**
 * @param {unknown} value
 * @returns {any}
 */
const like = value =>
  Array.isArray(value) ? { ...value, length: value.length } : value

/**
 * @param {string} href
 * @param {string} [protocol="*"]
 * @returns {API.Result<URL, Failure>}
 */
const parseURI = (href, protocol = "*") => {
  try {
    const url = new URL(href)
    if (protocol != "*" && url.protocol !== protocol) {
      return new Failure(`Expected ${protocol} URI instead got ${url.href}`)
    } else {
      return url
    }
  } catch (error) {
    return new Failure(/** @type {Error} */ (error).message)
  }
}

test.only("capability selects matches", assert => {
  const read = capability({
    can: "file/read",
    with: href => parseURI(href, "file:"),
    derives: (claimed, delegated) => {
      if (claimed.with.pathname.startsWith(delegated.with.pathname)) {
        return true
      } else {
        return new Failure(
          `'${claimed.with.href}' is not contained in '${delegated.with.href}'`
        )
      }
    },
  })

  const v1 = [
    ...read.select([
      { can: "file/read", with: "space://zAlice" },
      { can: "file/write", with: "file:///home/zAlice/" },
      { can: "file/read", with: "file:///home/zAlice/photos" },
      { can: "file/read+write", with: "file:///home/zAlice" },
    ]),
  ]

  assert.like(
    v1,
    like([
      {
        error: {
          name: "InvalidClaim",
          // capability: { can: "file/read", with: "space://zAlice" },
          context: {
            can: "file/read",
          },
          causes: like([
            {
              name: "MalformedCapability",
              capability: { can: "file/read", with: "space://zAlice" },
              cause: {
                message: "Expected file: URI instead got space://zAlice",
              },
            },
          ]),
        },
      },
      {
        error: {
          name: "InvalidClaim",
          context: {
            can: "file/read",
          },
          causes: like([
            {
              name: "UnknownCapability",
              capability: { can: "file/write", with: "file:///home/zAlice/" },
            },
          ]),
        },
      },
      {
        value: {
          can: "file/read",
          with: new URL("file:///home/zAlice/photos"),
        },
      },
      {
        error: {
          name: "InvalidClaim",
          context: {
            can: "file/read",
          },
          causes: like([
            {
              name: "UnknownCapability",
              capability: {
                can: "file/read+write",
                with: "file:///home/zAlice",
              },
            },
          ]),
        },
      },
    ])
  )

  const match = v1[2]
  const v2 = match.error
    ? []
    : [
        ...match.select([
          { can: "file/read+write", with: "file:///home/zAlice" },
          { can: "file/read", with: "file:///home/zAlice/" },
          { can: "file/read", with: "file:///home/zAlice/photos/public" },
          { can: "file/read", with: "file:///home/zBob" },
        ]),
      ]

  assert.like(
    v2,
    like([
      {
        error: {
          name: "InvalidClaim",
          context: {
            value: {
              can: "file/read",
              with: { href: "file:///home/zAlice/photos" },
              caveats: {},
            },
          },
          causes: like([
            {
              name: "UnknownCapability",
              capability: {
                can: "file/read+write",
                with: "file:///home/zAlice",
              },
            },
          ]),
        },
      },
      {
        value: {
          can: "file/read",
          with: { href: "file:///home/zAlice/" },
        },
      },
      {
        error: {
          name: "InvalidClaim",
          context: {
            value: {
              can: "file/read",
              with: { href: "file:///home/zAlice/photos" },
              caveats: {},
            },
          },
          causes: like([
            {
              name: "EscalatedCapability",
              claimed: {
                can: "file/read",
                with: { href: "file:///home/zAlice/photos" },
              },
              delegated: {
                can: "file/read",
                with: { href: "file:///home/zAlice/photos/public" },
              },
              cause: {
                message: `'file:///home/zAlice/photos' is not contained in 'file:///home/zAlice/photos/public'`,
              },
            },
          ]),
        },
      },
      {
        error: {
          name: "InvalidClaim",
          context: {
            value: {
              can: "file/read",
              with: { href: "file:///home/zAlice/photos" },
              caveats: {},
            },
          },
          causes: like([
            {
              name: "EscalatedCapability",
              claimed: {
                can: "file/read",
                with: { href: "file:///home/zAlice/photos" },
              },
              delegated: {
                can: "file/read",
                with: { href: "file:///home/zBob" },
              },
              cause: {
                message: `'file:///home/zAlice/photos' is not contained in 'file:///home/zBob'`,
              },
            },
          ]),
        },
      },
    ])
  )
})

test.only("derived capability chain", assert => {
  const verify = capability({
    can: "account/verify",
    with: href => parseURI(href, "mailto:"),
    derives: (claimed, delegated) => {
      if (claimed.with.href.startsWith(delegated.with.href)) {
        return true
      } else {
        return new Failure(
          `'${claimed.with.href}' is not contained in '${delegated.with.href}'`
        )
      }
    },
  })

  const register = verify.derive({
    to: capability({
      can: "account/register",
      with: href => parseURI(href, "mailto:"),
      derives: (claimed, delegated) => {
        /** @type {"account/register"} */
        const c1 = claimed.can
        /** @type {"account/register"} */
        const c2 = delegated.can

        return (
          claimed.with.href === delegated.with.href ||
          new Failure(`'${claimed.with.href}' != '${delegated.with.href}'`)
        )
      },
    }),
    derives: (claimed, delegated) => {
      /** @type {"account/register"} */
      const c1 = claimed.can
      /** @type {"account/verify"} */
      const c2 = delegated.can

      return (
        claimed.with.href === delegated.with.href ||
        new Failure(`'${claimed.with.href}' != '${delegated.with.href}'`)
      )
    },
  })

  const regs = [
    ...register.select([
      {
        can: "account/register",
        with: "mailto:zAlice@web.mail",
      },
    ]),
  ]

  assert.like(
    regs,
    like([
      {
        value: {
          can: "account/register",
          with: {
            href: "mailto:zAlice@web.mail",
          },
        },
      },
    ]),
    "selects registration capability"
  )

  assert.like(
    [
      ...register.select([
        {
          can: "account/register",
          with: "did:key:zAlice",
        },
      ]),
    ],
    like([
      {
        error: {
          name: "InvalidClaim",
          context: {
            can: "account/register",
          },
          causes: like([
            {
              name: "MalformedCapability",
              capability: {
                can: "account/register",
                with: "did:key:zAlice",
              },
              cause: {
                message: `Expected mailto: URI instead got did:key:zAlice`,
              },
            },
          ]),
        },
      },
    ])
  )

  const [reg] = regs
  if (reg.error) {
    return assert.fail("Expect to be a match")
  }

  console.log([
    ...reg.select([
      {
        can: "account/verify",
        with: "mailto:zAlice@web.mail",
      },
    ]),
  ])

  assert.like(
    [
      ...reg.select([
        {
          can: "account/verify",
          with: "mailto:zAlice@web.mail",
        },
      ]),
    ],
    like([
      {
        value: {
          can: "account/verify",
          with: {
            href: "mailto:zAlice@web.mail",
          },
        },
      },
    ]),
    "matches verification"
  )

  assert.like(
    [
      ...reg.select([
        {
          can: "account/verify",
          with: "mailto:bob@web.mail",
        },
      ]),
    ],
    like([
      {
        error: {
          name: "InvalidClaim",
          context: {
            can: "account/register",
          },
          causes: like([
            {
              name: "EscalatedCapability",
              claimed: {
                can: "account/register",
                with: { href: "mailto:zAlice@web.mail" },
              },
              delegated: {
                can: "account/verify",
                with: { href: "mailto:bob@web.mail" },
              },
              cause: {
                message: `mailto:zAlice@web.mail != mailto:bob@web.mail`,
              },
            },
          ]),
        },
      },
    ]),
    "does not match on different email"
  )

  return

  assert.like(
    reg.select([
      {
        can: "account/register",
        with: "mailto:zAlice@web.mail",
      },
    ]),
    {
      ...[
        {
          value: {
            can: "account/register",
            with: new URL("mailto:zAlice@web.mail"),
          },
        },
      ],
      length: 1,
    },
    "normal delegation also works"
  )

  const registration = {
    can: the("account/register"),
    with: the("mailto:zAlice@web.mail"),
  }
  const verification = {
    can: the("account/verify"),
    with: the("mailto:zAlice@web.mail"),
  }

  assert.like(
    register
      .select([registration])[0]
      .select([registration])[0]
      .select([registration])[0]
      .select([registration])[0]
      .select([verification])[0]
      .select([verification]),
    {
      length: 1,
    },
    "derived capability is recursive"
  )

  assert.deepEqual(
    register
      .select([registration])[0]
      .select([verification])[0]
      .select([registration]),
    [],
    "deriviation is works one way"
  )
})

test("capability amplification", assert => {
  const read = capability({
    can: "file/read",
    with: href => parseURI(href, "file:"),
    derives: (claimed, delegated) =>
      claimed.with.pathname.startsWith(delegated.with.pathname),
  })

  const write = capability({
    can: "file/write",
    with: href => parseURI(href, "file:"),
    derives: (claimed, delegated) =>
      claimed.with.pathname.startsWith(delegated.with.pathname),
  })

  const readwrite = read.and(write).derive({
    to: capability({
      can: "file/read+write",
      with: url => parseURI(url, "file:"),
      derives: (claimed, delegated) => {
        return claimed.with.pathname.startsWith(delegated.with.pathname)
      },
    }),
    derives: (claimed, [read, write]) => {
      return (
        claimed.with.pathname.startsWith(read.with.pathname) &&
        claimed.with.pathname.startsWith(write.with.pathname)
      )
    },
  })

  assert.deepEqual(
    readwrite.select([
      { can: "file/read", with: "file:///home/zAlice/" },
      { can: "file/write", with: "file:///home/zAlice/" },
    ]),
    [],
    "expects derived capability read+write"
  )

  const selected = readwrite.select([
    { can: "file/read+write", with: "file:///home/zAlice/public" },
    { can: "file/write", with: "file:///home/zAlice/" },
  ])

  assert.like(
    selected,
    {
      ...[
        {
          value: {
            can: "file/read+write",
            with: new URL("file:///home/zAlice/public"),
          },
        },
      ],
      length: 1,
    },
    "only selected matched"
  )

  const [rw] = selected

  assert.like(
    rw.select([{ can: "file/read+write", with: "file:///home/zAlice/public" }]),
    {
      ...[
        {
          value: {
            can: "file/read+write",
            with: new URL("file:///home/zAlice/public"),
          },
        },
      ],
      length: 1,
    },
    "can derive from matching"
  )

  assert.like(
    rw.select([
      { can: "file/read+write", with: "file:///home/zAlice/public/photos" },
    ]),
    {
      ...[],
      length: 0,
    },
    "can not derive from escalated path"
  )

  assert.like(
    rw.select([{ can: "file/read+write", with: "file:///home/zAlice/" }]),
    {
      ...[
        {
          value: {
            can: "file/read+write",
            with: new URL("file:///home/zAlice/"),
          },
        },
      ],
      length: 1,
    },
    "can derive from greater capabilities"
  )

  const rnw = rw.select([
    { can: "file/read", with: "file:///home/zAlice/" },
    { can: "file/write", with: "file:///home/zAlice/public" },
  ])

  assert.like(rnw, {
    ...[
      {
        value: {
          ...[
            {
              can: "file/read",
              with: new URL("file:///home/zAlice/"),
            },
            {
              can: "file/write",
              with: new URL("file:///home/zAlice/public"),
            },
          ],
          length: 2,
        },
      },
    ],
    length: 1,
  })

  const [reandnwrite] = rnw
  assert.like(
    reandnwrite.select([
      { can: "file/read", with: "file:///home/zAlice/" },
      { can: "file/write", with: "file:///home/zAlice/" },
    ]),
    {
      ...[
        {
          value: {
            ...[
              {
                can: "file/read",
                with: new URL("file:///home/zAlice/"),
              },
              {
                can: "file/write",
                with: new URL("file:///home/zAlice/"),
              },
            ],
            length: 2,
          },
        },
      ],
      length: 1,
    }
  )

  assert.like(
    reandnwrite.select([
      { can: "file/read", with: "file:///home/zAlice/" },
      { can: "file/write", with: "file:///home/zAlice/" },
      { can: "file/read", with: "file:///home/" },
    ]),
    {
      ...[
        {
          value: {
            ...[
              {
                can: "file/read",
                with: { href: "file:///home/zAlice/" },
              },
              {
                can: "file/write",
                with: { href: "file:///home/zAlice/" },
              },
            ],
            length: 2,
          },
        },
        {
          value: {
            ...[
              {
                can: "file/read",
                with: { href: "file:///home/" },
              },
              {
                can: "file/write",
                with: { href: "file:///home/zAlice/" },
              },
            ],
            length: 2,
          },
        },
      ],
      length: 2,
    },
    "selects all combinations"
  )
})

test("capability or combinator", assert => {
  const read = capability({
    can: "file/read",
    with: href => parseURI(href, "file:"),
    derives: (claimed, delegated) =>
      claimed.with.pathname.startsWith(delegated.with.pathname),
  })

  const write = capability({
    can: "file/write",
    with: href => parseURI(href, "file:"),
    derives: (claimed, delegated) =>
      claimed.with.pathname.startsWith(delegated.with.pathname),
  })

  const readwrite = read.or(write)
  const matches = readwrite.select([
    { can: "file/read", with: "file:///home/zAlice/" },
    { can: "file/write", with: "file:///home/zAlice/" },
  ])

  assert.like(matches, {
    ...[
      {
        value: {
          can: "file/read",
          with: { href: "file:///home/zAlice/" },
        },
      },
      {
        value: {
          can: "file/write",
          with: { href: "file:///home/zAlice/" },
        },
      },
    ],
    length: 2,
  })
})
