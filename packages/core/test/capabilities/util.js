import * as API from '@ucanto/interface'
import { Failure } from '../../src/lib.js'

/**
 * @template {API.ParsedCapability<"store/add"|"store/remove", API.URI<'did:'>, {link?: API.Link<unknown, number, number, 0|1>}>} T
 * @param {T} claimed
 * @param {T} delegated
 * @returns {API.Result<true, API.Failure>}
 */
export const equalLink = (claimed, delegated) => {
  if (claimed.with !== delegated.with) {
    return new Failure(
      `Expected 'with: "${delegated.with}"' instead got '${claimed.with}'`
    )
  } else if (
    delegated.nb.link &&
    `${delegated.nb.link}` !== `${claimed.nb.link}`
  ) {
    return new Failure(
      `Link ${claimed.nb.link ? `${claimed.nb.link}` : ''} violates imposed ${
        delegated.nb.link
      } constraint.`
    )
  } else {
    return true
  }
}

/**
 * Check URI can be delegated
 *
 * @param {string|undefined} child
 * @param {string|undefined} parent
 */
export function canDelegateURI(child, parent) {
  if (parent === undefined) {
    return true
  }

  if (child !== undefined && parent.endsWith('*')) {
    return child.startsWith(parent.slice(0, -1))
      ? true
      : new Failure(`${child} does not match ${parent}`)
  }

  return child === parent
    ? true
    : new Failure(`${child} is different from ${parent}`)
}

/**
 * @param {API.Link<unknown, number, number, 0|1>|undefined} child
 * @param {API.Link<unknown, number, number, 0|1>|undefined} parent
 */
export const canDelegateLink = (child, parent) => {
  // if parent poses no restriction it's can be derived
  if (parent === undefined) {
    return true
  }

  return String(child) === parent.toString()
    ? true
    : new Failure(`${child} is different from ${parent}`)
}
/**
 * Checks that `with` on claimed capability is the same as `with`
 * in delegated capability. Note this will ignore `can` field.
 *
 * @param {API.ParsedCapability} child
 * @param {API.ParsedCapability} parent
 */
export function equalWith(child, parent) {
  return (
    child.with === parent.with ||
    new Failure(
      `Can not derive ${child.can} with ${child.with} from ${parent.with}`
    )
  )
}

/**
 * @param {unknown} child
 * @param {unknown} parent
 * @param {string} constraint
 */

export function equal(child, parent, constraint) {
  if (parent === undefined || parent === '*') {
    return true
  } else if (String(child) === String(parent)) {
    return true
  } else {
    return new Failure(
      `Constrain violation: ${child} violates imposed ${constraint} constraint ${parent}`
    )
  }
}

/**
 * @param {API.Failure | true} value
 */
export function fail(value) {
  return value === true ? undefined : value
}
