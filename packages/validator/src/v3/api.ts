export * from "../api.js"
import * as API from "../api.js"

import type { Capability as Source, InvalidCapability } from "../api.js"
export type {
  Capability as Source,
  Ability,
  Resource,
  Problem,
} from "../api.js"

export interface Match<T = unknown, M extends Match = Match<unknown, any>>
  extends Selector<M> {
  value: T
  value2?: T
}

export interface Matcher<M extends Match> {
  match(capability: Source): MatchResult<M>
  match2(capability: Source): Match2Result<M>
}

export interface Selector<M extends Match> {
  select(capabilities: Source[]): IterableIterator<MatchResult<M>>
  select2(capabilities: Source[]): Select<M>
}

export interface Select<M extends Match> {
  matches: M[]
  errors: API.DelegationError[]
  unknown: API.Capability[]
}

export interface GroupSelector<M extends Match[] = Match[]>
  extends Selector<Amplify<M>> {}

export interface MatchSelector<M extends Match>
  extends Matcher<M>,
    Selector<M> {}

export interface DirectMatch<T> extends Match<T, DirectMatch<T>> {}

export interface WithParser<I, O, X extends { error: Error }> {
  (input: I): API.Result<O, X>
}

export interface Parser<I, O, X extends { error: Error }> {
  (input: I): API.Result<O, X>
}

export interface Caveats
  extends Record<string, Parser<unknown, unknown, API.Problem>> {}

export interface Descriptor<T extends ParsedCapability, M extends Match> {
  can: T["can"]
  with: Parser<string, T["with"], API.Problem>
  caveats?: InferCaveatsDescriptor<T>
  derives: Derives<T, M["value"]>
}

export type MatchError = API.DelegationError
export type MatchResult<M extends Match> = API.Result<M, MatchError>

export type Match2Result<M extends Match> = API.Result<
  M,
  API.InvalidCapability | API.DelegationError
>

export interface Config<
  Ability extends API.Ability,
  Constraints extends Caveats,
  M extends Match
> extends Descriptor<ParsedCapability<Ability, Constraints>, M> {}

export type InferCaveatsDescriptor<T extends ParsedCapability> = {
  [Key in keyof T["caveats"]]: T["caveats"][Key] extends infer U
    ? Parser<unknown, T["caveats"][Key], API.Problem>
    : never
}

export interface DerivedMatch<T, M extends Match>
  extends Match<T, M | DerivedMatch<T, M>> {}

export interface DeriveSelector<M extends Match, T> {
  to: MatchSelector<DirectMatch<T>>
  derives: Derives<T, M["value"]>
}

export interface Derives<T, U> {
  (self: T, from: U): API.Result<true, API.Problem>
}

export interface View<M extends Match> extends Matcher<M>, Selector<M> {
  /**
   * Defined a derived capability which can be delegated from `this` capability.
   * For example if you define `"account/validate"` capability and derive
   * `"account/register"` capability from it when validating claimed
   * `"account/register"` capability it could be proved with either
   * "account/register" delegation or "account/validate" delegation.
   *
   * ```js
   * // capability issued by account verification service on email validation
   * const verify = capability({
   *   can: "account/verify",
   *   with: URI({ protocol: "mailto:" })
   *   derives: ({ with: url }, from) =>
   *     url.href.startsWith(from.with.href) ||
   *     new Failure(`${url.href} is not contained in ${from.with.href}`)
   * })
   *
   * // derive registration capability from email verification
   * const register = validate.derive({
   *   to: capability({
   *     can: "account/register",
   *     with: URI({ protocol: "mailto:" }),
   *     derives: ({ with: url }, from) =>
   *       url.href.startsWith(from.with.href) ||
   *       new Failure(`${url.href} is not contained in ${from.with.href}`)
   *   }),
   *   derives: (registered, verified) =>
   *     registered.with.href === verified.with.href ||
   *     new Failure(`Registration email ${registered.pathname} does not match verified email ${verified.with.pathname}`)
   * })
   * ```
   */
  derive<T extends ParsedCapability>(
    options: DeriveSelector<M, T>
  ): Capability<DerivedMatch<T, M>>
}

export interface Capability<M extends Match = Match> extends View<M> {
  /**
   * Defines capability that is either `this` or the the given `other`. This
   * allows you to compose multiple capabilities into one so that you could
   * validate any of one of them without having to maintain list of supported
   * capabilities. It is especially useful when dealiving with derived
   * capability chains when you might derive capability from either one or the
   * other.
   */
  or<W extends Match>(other: MatchSelector<W>): Capability<M | W>

  /**
   * Combines this capability and the other into a capability group. This allows
   * you to define right amplifications e.g `file/read+write` could be derived
   * from `file/read` and `file/write`.
   * @example
   * ```js
   * const read = capability({
   *   can: "file/read",
   *   with: URI({ protocol: "file:" }),
   *   derives: (claimed, delegated) =>
   *   claimed.with.pathname.startsWith(delegated.with.pathname) ||
   *   new Failure(`'${claimed.with.href}' is not contained in '${delegated.with.href}'`)
   * })
   *
   * const write = capability({
   *   can: "file/write",
   *   with: URI({ protocol: "file:" }),
   *   derives: (claimed, delegated) =>
   *     claimed.with.pathname.startsWith(delegated.with.pathname) ||
   *     new Failure(`'${claimed.with.href}' is not contained in '${delegated.with.href}'`)
   * })
   *
   * const readwrite = read.and(write).derive({
   *   to: capability({
   *     can: "file/read+write",
   *     with: URI({ protocol: "file:" }),
   *     derives: (claimed, delegated) =>
   *       claimed.with.pathname.startsWith(delegated.with.pathname) ||
   *       new Failure(`'${claimed.with.href}' is not contained in '${delegated.with.href}'`)
   *     }),
   *   derives: (claimed, [read, write]) => {
   *     if (!claimed.with.pathname.startsWith(read.with.pathname)) {
   *       return new Failure(`'${claimed.with.href}' is not contained in '${read.with.href}'`)
   *     } else if (!claimed.with.pathname.startsWith(write.with.pathname)) {
   *       return new Failure(`'${claimed.with.href}' is not contained in '${write.with.href}'`)
   *     } else {
   *       return true
   *     }
   *   }
   * })
   *```
   */
  and<W extends Match>(other: MatchSelector<W>): CapabilityGroup<[M, W]>
}

export interface CapabilityGroup<M extends Match[] = Match[]>
  extends View<Amplify<M>> {
  /**
   * Creates new capability group containing capabilities from this group and
   * provedid `other` capability. This method complements `and` method on
   * `Capability` to allow chaining e.g. `read.and(write).and(modify)`.
   */
  and<W extends Match>(other: MatchSelector<W>): CapabilityGroup<[...M, W]>
}

export type Derive<M extends Match, W extends Match> = W extends Match<
  infer T,
  infer N
>
  ? MatchSelector<Match<T, N | M>>
  : never

export interface Amplify<Members extends Match[]>
  extends Match<InferValue<Members>, Amplify<InferMatch<Members>>> {}

export type InferMembers<Selectors extends unknown[]> = Selectors extends [
  MatchSelector<infer Match>,
  ...infer Rest
]
  ? [Match, ...InferMembers<Rest>]
  : Selectors extends []
  ? []
  : never

export type InferValue<Members extends unknown[]> = Members extends []
  ? []
  : Members extends [Match<infer T>, ...infer Rest]
  ? [T, ...InferValue<Rest>]
  : never

export type InferMatch<Members extends unknown[]> = Members extends []
  ? []
  : Members extends [Match<unknown, infer M>, ...infer Rest]
  ? [M, ...InferMatch<Rest>]
  : never

export interface ParsedCapability<
  Can extends API.Ability = API.Ability,
  C extends Caveats = Caveats
> {
  can: Can
  with: URL
  caveats: InferCaveats<C>
}

export type InferCaveats<C> = {
  [Key in keyof C]: C[Key] extends Parser<unknown, infer T, API.Problem>
    ? T
    : never
}
