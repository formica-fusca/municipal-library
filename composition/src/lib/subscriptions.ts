import { MemberId, TitleId } from '@local/shared-kernel'
import type { InMemoryEventBus } from '@local/event-bus'

import { TitleBecameAvailable } from '@local/library-inventory'
import type { MembershipDesk } from '@local/library-membership'
import {
  HoldAllocated,
  HoldExpired,
  LoanBecameOverdue,
  LoanClosed,
  LoanOpened,
} from '@local/library-lending'
import type { HoldDesk } from '@local/library-lending'

export interface SubscriptionTargets {
  readonly bus: InMemoryEventBus
  readonly membershipDesk: MembershipDesk
  readonly holdDesk: HoldDesk
  /** Appended to, not replaced — the same array `Library` hands back. */
  readonly notifications: string[]
}

/**
 * Every cross-context link that is not an adapter.
 *
 * Read them as sentences: *"when a loan is opened, membership notes it."*
 * Neither side knows the other exists; both know the event. That is the whole
 * mechanism, and the reason this list is worth keeping in one place — it is the
 * complete set of things that happen behind the back of the code that caused
 * them, and a reader who wants to know "what else fires when I return a book?"
 * has exactly one file to check.
 */
export function subscribe({
  bus,
  membershipDesk,
  holdDesk,
  notifications,
}: SubscriptionTargets): void {
  bus.on(LoanOpened, async (event) => {
    await membershipDesk.recordLoanTaken(MemberId.of(event.memberId))
  })

  bus.on(LoanClosed, async (event) => {
    await membershipDesk.recordLoanReturned(MemberId.of(event.memberId))
  })

  /**
   * The link that makes the hold queue work.
   *
   * Inventory raised this because *its own* state changed. It has no idea a
   * queue exists. Adding a second reaction — print a slip for the hold shelf,
   * email the member — means adding a subscriber here and changing nothing in
   * Inventory. That is the property the bus is bought for.
   */
  bus.on(TitleBecameAvailable, async (event) => {
    await holdDesk.allocateOnAvailability(TitleId.of(event.titleId))
  })

  // A read side: messages the member would actually receive.
  bus.on(HoldAllocated, (event) => {
    notifications.push(
      `${event.memberId}: your copy is on the hold shelf — collect by ${event.collectBy.slice(0, 16).replace('T', ' ')}`,
    )
  })

  bus.on(HoldExpired, (event) => {
    notifications.push(`${event.memberId}: your hold lapsed and passed to the next member`)
  })

  bus.on(LoanBecameOverdue, (event) => {
    notifications.push(`${event.memberId}: loan ${event.loanId} is ${event.daysLate} day(s) overdue`)
  })
}
