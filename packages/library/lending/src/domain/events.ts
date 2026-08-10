import { DomainEvent } from '@local/ddd-core'
import type { CopyId, MemberId, TitleId } from '@local/shared-kernel'
import type { HoldRequestId, LoanId } from './identities.js'

/*
 * ── Loan events ─────────────────────────────────────────────────────────────
 */

/**
 * The fact the whole library reacts to.
 *
 * Membership listens in order to increment its loan counter — which is why
 * that counter is *eventually* consistent, and why the borrowing limit is a
 * policy rather than an invariant. See `Member`'s class comment.
 */
export class LoanOpened extends DomainEvent {
  static readonly eventName = 'lending.loan-opened'
  readonly name = LoanOpened.eventName

  readonly loanId: string
  readonly memberId: string
  readonly titleId: string
  readonly copyId: string
  readonly dueAt: string

  constructor(params: {
    loanId: LoanId
    memberId: MemberId
    titleId: TitleId
    copyId: CopyId
    dueAt: Date
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.loanId = params.loanId.value
    this.memberId = params.memberId.value
    this.titleId = params.titleId.value
    this.copyId = params.copyId.value
    this.dueAt = params.dueAt.toISOString().slice(0, 10)
  }

  payload() {
    return {
      loanId: this.loanId,
      memberId: this.memberId,
      titleId: this.titleId,
      copyId: this.copyId,
      dueAt: this.dueAt,
    }
  }
}

export class LoanClosed extends DomainEvent {
  static readonly eventName = 'lending.loan-closed'
  readonly name = LoanClosed.eventName

  readonly loanId: string
  readonly memberId: string
  readonly titleId: string
  readonly copyId: string
  readonly daysLate: number

  constructor(params: {
    loanId: LoanId
    memberId: MemberId
    titleId: TitleId
    copyId: CopyId
    daysLate: number
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.loanId = params.loanId.value
    this.memberId = params.memberId.value
    this.titleId = params.titleId.value
    this.copyId = params.copyId.value
    this.daysLate = params.daysLate
  }

  payload() {
    return {
      loanId: this.loanId,
      memberId: this.memberId,
      titleId: this.titleId,
      copyId: this.copyId,
      daysLate: this.daysLate,
    }
  }
}

export class LoanBecameOverdue extends DomainEvent {
  static readonly eventName = 'lending.loan-became-overdue'
  readonly name = LoanBecameOverdue.eventName

  readonly loanId: string
  readonly memberId: string
  readonly daysLate: number

  constructor(params: {
    loanId: LoanId
    memberId: MemberId
    daysLate: number
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.loanId = params.loanId.value
    this.memberId = params.memberId.value
    this.daysLate = params.daysLate
  }

  payload() {
    return { loanId: this.loanId, memberId: this.memberId, daysLate: this.daysLate }
  }
}

/*
 * ── Hold queue events ───────────────────────────────────────────────────────
 *
 * Note which object records which. `HoldAllocated` is recorded by the ROOT,
 * because deciding whose turn it is requires seeing the entire queue.
 * `HoldExpired`, `HoldCancelled` and `HoldFulfilled` are recorded by the CHILD
 * `HoldRequest`, because each is a fact about one member's own request that the
 * request itself is best placed to state.
 */

export class HoldPlaced extends DomainEvent {
  static readonly eventName = 'lending.hold-placed'
  readonly name = HoldPlaced.eventName

  readonly titleId: string
  readonly memberId: string
  readonly position: number

  constructor(params: {
    titleId: TitleId
    memberId: MemberId
    position: number
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.memberId = params.memberId.value
    this.position = params.position
  }

  payload() {
    return { titleId: this.titleId, memberId: this.memberId, position: this.position }
  }
}

export class HoldAllocated extends DomainEvent {
  static readonly eventName = 'lending.hold-allocated'
  readonly name = HoldAllocated.eventName

  readonly titleId: string
  readonly memberId: string
  readonly holdRequestId: string
  readonly collectBy: string

  constructor(params: {
    titleId: TitleId
    memberId: MemberId
    holdRequestId: HoldRequestId
    collectBy: Date
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.memberId = params.memberId.value
    this.holdRequestId = params.holdRequestId.value
    this.collectBy = params.collectBy.toISOString()
  }

  payload() {
    return {
      titleId: this.titleId,
      memberId: this.memberId,
      holdRequestId: this.holdRequestId,
      collectBy: this.collectBy,
    }
  }
}

export class HoldExpired extends DomainEvent {
  static readonly eventName = 'lending.hold-expired'
  readonly name = HoldExpired.eventName

  readonly titleId: string
  readonly memberId: string
  readonly holdRequestId: string

  constructor(params: {
    titleId: TitleId
    memberId: MemberId
    holdRequestId: HoldRequestId
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.memberId = params.memberId.value
    this.holdRequestId = params.holdRequestId.value
  }

  payload() {
    return {
      titleId: this.titleId,
      memberId: this.memberId,
      holdRequestId: this.holdRequestId,
    }
  }
}

export class HoldCancelled extends DomainEvent {
  static readonly eventName = 'lending.hold-cancelled'
  readonly name = HoldCancelled.eventName

  readonly titleId: string
  readonly memberId: string

  constructor(params: { titleId: TitleId; memberId: MemberId; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.memberId = params.memberId.value
  }

  payload() {
    return { titleId: this.titleId, memberId: this.memberId }
  }
}

export class HoldFulfilled extends DomainEvent {
  static readonly eventName = 'lending.hold-fulfilled'
  readonly name = HoldFulfilled.eventName

  readonly titleId: string
  readonly memberId: string

  constructor(params: { titleId: TitleId; memberId: MemberId; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.memberId = params.memberId.value
  }

  payload() {
    return { titleId: this.titleId, memberId: this.memberId }
  }
}
