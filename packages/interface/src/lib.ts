import {
  Ability,
  Block as UCANBlock,
  ByteView,
  Capabilities,
  Capability,
  DID,
  Fact,
  Link as UCANLink,
  MultihashHasher,
  MultihashDigest,
  MultibaseDecoder,
  MultibaseEncoder,
  Phantom,
  Resource,
  Signature,
} from '@ipld/dag-ucan'
import { Link, Block as IPLDBlock } from 'multiformats'
import * as UCAN from '@ipld/dag-ucan'
import {
  CanIssue,
  Match,
  InvalidAudience,
  Unauthorized,
  UnavailableProof,
  ParsedCapability,
  CapabilityParser,
} from './capability.js'
import type * as Transport from './transport.js'
import type { Tuple, Block } from './transport.js'
export * from './capability.js'
export * from './transport.js'
export type {
  Transport,
  Phantom,
  Tuple,
  DID,
  Signature,
  ByteView,
  Capabilities,
  Capability,
  Fact,
  UCANBlock,
  UCANLink,
  Link,
  Link as IPLDLink,
  IPLDBlock,
  Block,
  Ability,
  Resource,
  MultihashDigest,
  MultihashHasher,
  MultibaseDecoder,
  MultibaseEncoder,
}
export * as UCAN from '@ipld/dag-ucan'

/**
 * Proof can either be a link to a delegated UCAN or a materialized `Delegation`
 * view.
 */
export type Proof<C extends Capabilities = Capabilities> =
  | UCANLink<C>
  | Delegation<C>

export interface Principal<ID extends DID = DID> {
  did(): ID
}

export interface UCANOptions {
  audience: Principal
  lifetimeInSeconds?: number
  expiration?: number
  notBefore?: number

  nonce?: string

  facts?: Fact[]
  proofs?: Proof[]
}

export interface DelegationOptions<C extends Capabilities> extends UCANOptions {
  issuer: Signer
  audience: Principal
  capabilities: C
  proofs?: Proof[]
}

export interface Delegation<C extends Capabilities = Capabilities> {
  readonly root: UCANBlock<C>
  /**
   * Map of all the IPLD blocks that where included with this delegation DAG.
   * Usually this would be blocks corresponding to proofs, however it may
   * also contain other blocks e.g. things that `capabilities` or `facts` may
   * link.
   * It is not guaranteed to include all the blocks of this DAG, as it represents
   * a partial DAG of the delegation desired for transporting.
   *
   * Also note that map may contain blocks that are not part of this
   * delegation DAG. That is because `Delegation` is usually constructed as
   * view / selection over the CAR which may contain bunch of other blocks.
   */
  readonly blocks: Map<string, Block>

  readonly cid: UCANLink<C>
  readonly bytes: ByteView<UCAN.UCAN<C>>
  readonly data: UCAN.View<C>

  asCID: UCANLink<C>

  export(): IterableIterator<Block>

  issuer: UCAN.Principal
  audience: UCAN.Principal
  capabilities: C
  expiration?: number
  notBefore?: number

  nonce?: string

  facts: Fact[]
  proofs: Proof[]
  iterate(): IterableIterator<Delegation>
}

export interface Invocation<C extends Capability = Capability>
  extends Delegation<[C]> {}

export interface InvocationOptions<C extends Capability = Capability>
  extends UCANOptions {
  issuer: Signer
  capability: C
}

export interface IssuedInvocation<C extends Capability = Capability>
  extends DelegationOptions<[C]> {
  readonly issuer: Signer
  readonly audience: Principal
  readonly capabilities: [C]

  readonly proofs: Proof[]
}

export type ServiceInvocation<
  C extends Capability = Capability,
  S = InvocationService<C>
> = IssuedInvocation<C> & ServiceInvocations<S>

export type InferInvocation<T extends ServiceInvocation> =
  T extends ServiceInvocation<infer C> ? Invocation<C> : never

export type InferInvocations<T> = T extends []
  ? []
  : T extends [ServiceInvocation<infer C>, ...infer Rest]
  ? [Invocation<C>, ...InferInvocations<Rest>]
  : T extends Array<IssuedInvocation<infer U>>
  ? Invocation<U>[]
  : never

export interface ServiceMethod<
  I extends Capability,
  O,
  X extends { error: true }
> {
  (input: Invocation<I>, context: InvocationContext): Await<
    Result<O, X | InvocationError>
  >
}

export type InvocationError =
  | HandlerNotFound
  | HandlerExecutionError
  | InvalidAudience
  | Unauthorized

export interface InvocationContext extends CanIssue {
  id: Principal
  my?: (issuer: DID) => Capability[]
  resolve?: (proof: UCANLink) => Await<Result<Delegation, UnavailableProof>>

  principal: PrincipalParser
}

export type ResolveServiceMethod<
  S extends Record<string, any>,
  Path extends string
> = Path extends `${infer Base}/${infer SubPath}`
  ? ResolveServiceMethod<S[Base], SubPath>
  : S[Path] extends ServiceMethod<infer _C, infer _T, infer _X>
  ? S[Path]
  : never

export type ResolveServiceInvocation<
  S extends Record<string, any>,
  C extends Capability
> = ResolveServiceMethod<S, C['can']> extends ServiceMethod<
  infer C,
  infer _T,
  infer _X
>
  ? IssuedInvocation<C>
  : never

export type InferServiceInvocationReturn<
  C extends Capability,
  S extends Record<string, any>
> = ResolveServiceMethod<S, C['can']> extends ServiceMethod<
  infer _,
  infer T,
  infer X
>
  ? Result<
      T,
      | X
      | HandlerNotFound
      | HandlerExecutionError
      | InvalidAudience
      | Unauthorized
    >
  : never

export type InferServiceInvocations<
  I extends unknown[],
  T extends Record<string, any>
> = I extends []
  ? []
  : I extends [ServiceInvocation<infer C, T>, ...infer Rest]
  ? [InferServiceInvocationReturn<C, T>, ...InferServiceInvocations<Rest, T>]
  : never

export interface IssuedInvocationView<C extends Capability = Capability>
  extends IssuedInvocation<C> {
  delegate(): Promise<Delegation<[C]>>
  execute<T extends InvocationService<C>>(
    service: ConnectionView<T>
  ): Await<InferServiceInvocationReturn<C, T>>
}

export type ServiceInvocations<T> = IssuedInvocation<any> &
  {
    [Key in keyof T]: SubServiceInvocations<T[Key], Key & string>
  }[keyof T]

type SubServiceInvocations<T, Path extends string> = {
  [Key in keyof T]: T[Key] extends ServiceMethod<infer C, infer _R, infer _X>
    ? IssuedInvocation<C>
    : SubServiceInvocations<Path, Key & string>
}[keyof T]

export type InvocationService<
  C extends Capability,
  A extends string = C['can']
> = A extends `${infer Base}/${infer Path}`
  ? { [Key in Base]: InvocationService<C, Path> }
  : {
      [Key in A]: ServiceMethod<C, any, any>
    }

export type ExecuteInvocation<
  C extends Capability,
  T extends Record<string, any>,
  Ability extends string = C['can']
> = Ability extends `${infer Base}/${infer Path}`
  ? ExecuteInvocation<C, T[Base], Path>
  : T[Ability] extends (input: Invocation<C>) => infer Out
  ? Out
  : never

export type Result<T extends unknown, X extends { error: true }> =
  | (T extends null | undefined ? T : never)
  | (T & { error?: never })
  | X

export interface Failure extends Error {
  error: true
}

export interface HandlerNotFound extends RangeError {
  error: true
  capability: Capability
  name: 'HandlerNotFound'
}

export interface HandlerExecutionError extends Failure {
  capability: Capability
  cause: Error
  name: 'HandlerExecutionError'
}

export type API<T> = T[keyof T]

export interface OutpboundTranpsortOptions {
  readonly encoder: Transport.RequestEncoder
  readonly decoder: Transport.ResponseDecoder
}
export interface ConnectionOptions<T extends Record<string, any>>
  extends Transport.EncodeOptions,
    OutpboundTranpsortOptions {
  /**
   * DID of the target service.
   */
  readonly id: Principal
  readonly channel: Transport.Channel<T>
}

export interface Connection<T extends Record<string, any>>
  extends Phantom<T>,
    ConnectionOptions<T> {
  /**
   * DID of the target service.
   */
  readonly id: Principal
  readonly hasher: MultihashHasher
}

export interface ConnectionView<T extends Record<string, any>>
  extends Connection<T> {
  id: Principal
  execute<
    C extends Capability,
    I extends Transport.Tuple<ServiceInvocation<C, T>>
  >(
    ...invocations: I
  ): Await<InferServiceInvocations<I, T>>
}

export interface InboundTransportOptions {
  /**
   * Request decoder which is will be used by a server to decode HTTP Request
   * into an invocation `Batch` that will be executed using a `service`.
   */
  readonly decoder: Transport.RequestDecoder
  /**
   * Response encoder which will be used to encode batch of invocation results
   * into an HTTP response that will be send back to the client that initiated
   * request.
   */
  readonly encoder: Transport.ResponseEncoder
}

export interface ValidatorOptions {
  /**
   * Takes principal parser that can be used to turn a `UCAN.Principal`
   * into `Ucanto.Principal`.
   */
  readonly principal?: PrincipalParser

  readonly canIssue?: CanIssue['canIssue']
  readonly my?: InvocationContext['my']
  readonly resolve?: InvocationContext['resolve']
}

export interface ServerOptions
  extends InboundTransportOptions,
    ValidatorOptions {
  /**
   * Service DID which will be used to verify that received invocation
   * audience matches it.
   */
  readonly id: Principal
}

export interface Server<T> extends ServerOptions {
  /**
   * Actual service providing capability handlers.
   */
  readonly service: T

  readonly catch?: (err: HandlerExecutionError) => void
}

export interface ServerView<T extends Record<string, any>>
  extends Server<T>,
    Transport.Channel<T> {
  context: InvocationContext
  catch: (err: HandlerExecutionError) => void
}

export type Service = Record<
  string,
  (input: Invocation<any>) => Promise<Result<any, any>>
>

export type Await<T> = T | PromiseLike<T> | Promise<T>

export type Protocol<Scheme extends string = string> = `${Scheme}:`

export type URI<P extends Protocol = Protocol> = `${P}${string}` &
  // ⚠️ Without phantom type TS does not seem to retain `P` type
  // resulting in `${string}${string}` instead.
  Phantom<{
    protocol: P
  }>

export interface PrincipalParser {
  parse(did: UCAN.DID): Verifier
}

/**
 * Integer corresponding to the byteprefix of the VarSig. It is used to tag
 * signature with a registered multicodec code making it self describing.
 * @see https://github.com/ucan-wg/ucan-ipld/#25-signature
 */
export type SigAlg = number

/**
 * Represents component that can create a signer from it's archive. Usually
 * signer module would provide `from` function and therefor be an implementation
 * of this interface.
 *
 * Library also provides utility functions for combining multiple
 * SignerImporters into one.
 *
 * @template ID - DID that can be imported, which may be a type union.
 * @template Alg - Multicodec code corresponding to signature algorithm.
 */
export interface SignerImporter<
  ID extends DID = DID,
  Alg extends SigAlg = SigAlg
> {
  from(archive: SignerArchive<ID, Alg>): Signer<ID, Alg>
}

/**
 * Principal that can issue UCANs (and sign payloads). While it's primary role
 * is to sign payloads it also extends `Verifier` interface so it could be used
 * to verifying signed payloads as well.
 */
export interface Signer<ID extends DID = DID, Alg extends SigAlg = SigAlg>
  extends Principal<ID>,
    Verifier<ID, Alg> {
  /**
   * Integer corresponding to the byteprefix of the {@link VarSig}. It is used
   * to tag [signature] so it can self describe what algorithm was used.
   *
   * [signature]:https://github.com/ucan-wg/ucan-ipld/#25-signature
   */
  signatureCode: Alg

  /**
   * Name of the signature algorithm. It is a human readable equivalent of
   * the {@link signatureCode}, however it is also used as last segment in
   * [Nonstandard Signatures], which is used as an `alg` field of JWT header
   * when UCANs are serialized to JWT.
   *
   * [Nonstandard Signatures]:https://github.com/ucan-wg/ucan-ipld/#251-nonstandard-signatures
   */
  signatureAlgorithm: string

  /**
   * The `signer` field is a self reference (usually a getter). It's sole
   * purpose is to allow splitting signer and verifier through destructuring.
   *
   * @expample
   * ```js
   * import * as Principal from "@ucanto/principal"
   *
   * const { signer, verifier } = Principal.from(archive)
   * ```
   */
  signer: Signer<ID, Alg>

  /**
   * The `verifier` field just like the `signer` exists to allow splitting
   * them apart through destructuring.
   */
  verifier: Verifier<ID, Alg>

  /**
   * @template T - Source data before it was byte encoding into payload.
   *
   * Takes byte encoded payload and produces a verifiable signature.
   */
  sign<T>(payload: ByteView<T>): Await<Signature<T, Alg>>

  /**
   * Returns archive of this signer which will have keys byte encoded when
   * underlying keys are extractable or in {@link CryptoKey} form otherwise.
   *
   * This allows a storing non extractable archives into indexedDB and storing
   * extractable archives on disk ofter serializing them using IPLD code.
   *
   * This aligns with a best practice that in browsers unextratable keys should
   * be used and extractable keys in node.
   *
   * @example
   * ```ts
   * import * as CBOR from '@ipld/dag-cbor'
   *
   * const save = async (signer: Signer) => {
   *   const archive = signer.toArchive()
   *   if (globalThis.indexedDB) {
   *     await IDB_OBJECT_STORE.add(archive)
   *   } else {
   *     await fs.writeFile(KEY_PATH, CBOR.encode(archive))
   *   }
   * }
   * ```
   */
  toArchive(): SignerArchive<ID, Alg>

  /**
   * Wraps key of this signer into a signer with a different DID. This is
   * primarily used to wrap {@link SignerKey} into a {@link Signer} that has
   * {@link did} of different method.
   *
   * @example
   *
   * ```ts
   * import { ed25519 } from "@ucanto/principal"
   *
   * const demo = async () => {
   *   const key = await ed25519.generate()
   *   key.did() // 'did:key:z6Mkqa4oY9Z5Pf5tUcjLHLUsDjKwMC95HGXdE1j22jkbhz6r'
   *   const gozala = key.withDID('did:web:gozala.io')
   *   gozala.did() // 'did:web:gozala.io'
   * }
   * ```
   * [did:key]:https://w3c-ccg.github.io/did-method-key/
   */
  withDID<ID extends DID>(id: ID): Signer<ID, Alg>
}

/**
 * Principal that issued a UCAN. In usually represents remote principal and is
 * used to verify that certain payloads were signed by it.
 */
export interface Verifier<ID extends DID = DID, Alg extends SigAlg = SigAlg>
  extends Principal<ID> {
  /**
   * @template T - Source data before it was byte encoding into payload.
   *
   * Takes byte encoded payload and verifies that it is signed by corresponding
   * signer.
   */
  verify<T>(payload: ByteView<T>, signature: Signature<T, Alg>): Await<boolean>

  /**
   * Wraps key of this verifire into a verifiier with a different DID. This is
   * primarily used to wrap {@link VerifierKey} into a {@link Verifier} that has
   * {@link did} of different method.
   */
  withDID<ID extends DID>(id: ID): Verifier<ID, Alg>
}

/**
 * Represents [`did:key`] identifier.
 *
 * [`did:key`]:https://w3c-ccg.github.io/did-method-key/
 */
export type DIDKey = DID<'key'>

/**
 * {@link Signer} corresponding to [`did:key`] identified principal.
 *
 * [`did:key`]:https://w3c-ccg.github.io/did-method-key/
 */
export interface SignerKey<Alg extends SigAlg = SigAlg>
  extends Signer<DIDKey, Alg> {}

/**
 * {@link Verifier} corresponding to [`did:key`] identified principal.
 *
 * [`did:key`]:https://w3c-ccg.github.io/did-method-key/
 */
export interface VerifierKey<Alg extends SigAlg = SigAlg>
  extends Verifier<DIDKey, Alg> {}

/**
 * {@link Signer} keys and it's DID that can be used for persist and restore
 * signer across sessions.
 */
export interface SignerArchive<
  ID extends DID = DID,
  Alg extends SigAlg = SigAlg
> {
  /**
   * [DID Subject](https://www.w3.org/TR/did-core/#did-subject) for this
   * signer.
   */
  id: ID

  /**
   * Set of private keys this signer uses keyed by corresponding [did:key][].
   *
   * ⚠️ At the moment signers only support single key use case, however we may
   * change that in the future, which is why data model is forward designed to
   * support multiple keys.
   *
   * [did:key]:https://w3c-ccg.github.io/did-method-key/
   */
  keys: { [Key: DIDKey]: KeyArchive<Alg> }
}

/**
 * Represents a private key which will be in `CryptoKey` format if it is
 * non-extractable or is byte encoded when extractable.
 */
export type KeyArchive<Alg extends SigAlg = SigAlg> =
  | CryptoKey
  | ByteView<SignerKey<Alg> & CryptoKey>

export type InferInvokedCapability<
  C extends CapabilityParser<Match<ParsedCapability>>
> = C extends CapabilityParser<Match<infer T>> ? T : never

export type Intersection<T> = (T extends any ? (i: T) => void : never) extends (
  i: infer I
) => void
  ? I
  : never
