import { DomainError } from '@local/ddd-core'

/**
 * "There is no copy on the shelf right now."
 *
 * Deliberately **not** an `InvariantViolation`. Nothing is broken and no rule
 * has been circumvented — the library is simply in a legitimate state where it
 * cannot say yes. This is a normal business outcome with a normal business
 * answer: place a hold.
 *
 * Conflating the two is a common and expensive mistake. An invariant violation
 * means the model has a bug and somebody should be paged; a refusal means the
 * user should see a message. Giving them the same type guarantees that one day
 * they will be handled the same way.
 */
export class NoCopyAvailable extends DomainError {
  readonly titleId: string

  constructor(titleId: string) {
    super(`no copy of title ${titleId} is currently on the shelf`)
    this.titleId = titleId
  }
}

export class CopyNotInStock extends DomainError {
  constructor(copyId: string, titleId: string) {
    super(`copy ${copyId} does not belong to the stock of title ${titleId}`)
  }
}

export class DuplicateCopy extends DomainError {
  constructor(copyId: string) {
    super(`copy ${copyId} is already in stock — barcodes are unique`)
  }
}
