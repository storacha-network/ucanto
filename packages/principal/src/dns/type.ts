import {
  Signer as SigningPrincipal,
  SignerImporter,
  PrincipalParser,
  UCAN,
  DID,
  Await,
} from '@ucanto/interface'
export * from '@ucanto/interface'

export interface SigningPrincipalGenerator<Code extends number> {
  generate(): Await<KeySigner<Code>>
}

export interface KeySigner<Code extends number, M extends string = 'key'> {
  signer: SigningPrincipal<M, Code>
  verifier: UCAN.Verifier<M, Code>
}

export interface Signer<Code extends number = number>
  extends SigningPrincipal<'dns', Code>,
    UCAN.Verifier<'dns', Code> {
  readonly signer: Signer<Code>
  readonly verifier: Verifier<Code>

  resolve(): SigningPrincipal<'key', Code>
}

export interface Verifier<Code extends number = number>
  extends UCAN.Verifier<'dns', Code> {
  resolve(): Await<UCAN.Verifier<'key', Code>>
}

export interface VerifierOptions {
  resolve(did: DID<'dns'>): Await<DID<'key'>>
  parser: PrincipalParser
}

export interface SignerOptions {
  importer: SignerImporter
  parser: PrincipalParser
}

export type { SigningPrincipal }
