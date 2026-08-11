import { DomainEvent } from '@local/ddd-core'
import type { MemberId } from '@local/shared-kernel'

export class MemberEnrolled extends DomainEvent {
  static readonly eventName = 'membership.member-enrolled'
  readonly name = MemberEnrolled.eventName

  readonly memberId: string
  readonly memberName: string
  readonly tier: string

  constructor(params: {
    memberId: MemberId
    memberName: string
    tier: string
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.memberId = params.memberId.value
    this.memberName = params.memberName
    this.tier = params.tier
  }

  payload() {
    return { memberId: this.memberId, memberName: this.memberName, tier: this.tier }
  }
}

export class MemberSuspended extends DomainEvent {
  static readonly eventName = 'membership.member-suspended'
  readonly name = MemberSuspended.eventName

  readonly memberId: string
  readonly reason: string
  readonly until: string

  constructor(params: { memberId: MemberId; reason: string; until: Date; occurredAt: Date }) {
    super(params.occurredAt)
    this.memberId = params.memberId.value
    this.reason = params.reason
    this.until = params.until.toISOString()
  }

  payload() {
    return { memberId: this.memberId, reason: this.reason, until: this.until }
  }
}

export class MemberReinstated extends DomainEvent {
  static readonly eventName = 'membership.member-reinstated'
  readonly name = MemberReinstated.eventName

  readonly memberId: string

  constructor(params: { memberId: MemberId; occurredAt: Date }) {
    super(params.occurredAt)
    this.memberId = params.memberId.value
  }

  payload() {
    return { memberId: this.memberId }
  }
}

/**
 * Raised when the loan counter is pushed past the member's allowance.
 *
 * This event exists *because* the borrowing limit is not an invariant. Two
 * borrow requests can both pass the eligibility check before either has
 * committed, and the second one to arrive here finds the member already at
 * their limit. Nothing is corrupt — the library simply lent one book more than
 * its own policy intended, which is a thing a librarian can sort out, and a
 * far better outcome than a lock across every borrow in the building.
 *
 * Making that overshoot *visible* is the point. Silence would be the bug.
 */
export class BorrowAllowanceExceeded extends DomainEvent {
  static readonly eventName = 'membership.borrow-allowance-exceeded'
  readonly name = BorrowAllowanceExceeded.eventName

  readonly memberId: string
  readonly activeLoans: number
  readonly allowance: number

  constructor(params: {
    memberId: MemberId
    activeLoans: number
    allowance: number
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.memberId = params.memberId.value
    this.activeLoans = params.activeLoans
    this.allowance = params.allowance
  }

  payload() {
    return {
      memberId: this.memberId,
      activeLoans: this.activeLoans,
      allowance: this.allowance,
    }
  }
}
