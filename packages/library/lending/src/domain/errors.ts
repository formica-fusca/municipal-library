import { DomainError } from '@local/ddd-core'

/** The member is not permitted to borrow right now — a refusal, not a fault. */
export class BorrowingRefused extends DomainError {
  readonly reason: string

  constructor(reason: string) {
    super(`borrowing refused — ${reason}`)
    this.reason = reason
  }
}

export class AlreadyInQueue extends DomainError {
  constructor(memberId: string, titleId: string) {
    super(`member ${memberId} is already waiting for title ${titleId}`)
  }
}

export class NotInQueue extends DomainError {
  constructor(memberId: string, titleId: string) {
    super(`member ${memberId} is not waiting for title ${titleId}`)
  }
}

export class HoldNotReadyForCollection extends DomainError {
  constructor(memberId: string, titleId: string) {
    super(`member ${memberId} has no copy of title ${titleId} set aside for collection`)
  }
}

export class LoanAlreadyClosed extends DomainError {
  constructor(loanId: string) {
    super(`loan ${loanId} was already returned`)
  }
}

export class UnknownLoan extends DomainError {
  constructor(loanId: string) {
    super(`no loan ${loanId}`)
  }
}
