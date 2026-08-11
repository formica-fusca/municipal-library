import type { DomainEvent, FixedClock } from '@local/ddd-core'
import type { EventLog, InMemoryEventBus } from '@local/event-bus'

import type { InMemoryTitleRepository, RegisterTitle } from '@local/library-catalog'
import type {
  AcquireCopy,
  InMemoryBookStockRepository,
  ShelfOperations,
} from '@local/library-inventory'
import type { InMemoryMemberRepository, MembershipDesk } from '@local/library-membership'
import type {
  BorrowBook,
  HoldAllocationPolicy,
  HoldDesk,
  InMemoryHoldQueueRepository,
  InMemoryLoanRepository,
  OverdueSweep,
  ReturnBook,
} from '@local/library-lending'
import type { InMemoryStockItemRepository, ShopCounter } from '@local/bookshop-inventory'

/**
 * Everything one assembled library exposes.
 *
 * Deliberately wide: the repositories are here alongside the use cases, because
 * both apps need to *look* at state as well as change it — a scenario prints a
 * shelf, the playground renders one. Narrowing this to the use cases alone
 * would push every app into keeping its own copy of the state it just changed.
 */
export interface Library {
  readonly clock: FixedClock
  readonly bus: InMemoryEventBus
  readonly log: EventLog
  /** Member-facing messages produced by subscribers — a tiny read side. */
  readonly notifications: string[]

  readonly titles: InMemoryTitleRepository
  readonly stocks: InMemoryBookStockRepository
  readonly members: InMemoryMemberRepository
  readonly loans: InMemoryLoanRepository
  readonly queues: InMemoryHoldQueueRepository
  readonly shopStock: InMemoryStockItemRepository

  readonly registerTitle: RegisterTitle
  readonly acquireCopy: AcquireCopy
  readonly shelf: ShelfOperations
  readonly membershipDesk: MembershipDesk
  readonly borrowBook: BorrowBook
  readonly returnBook: ReturnBook
  readonly holdDesk: HoldDesk
  readonly overdueSweep: OverdueSweep
  readonly shop: ShopCounter
}

export interface LibraryOptions {
  readonly startAt?: Date
  readonly allocationPolicy?: HoldAllocationPolicy

  /**
   * Called for every event the bus dispatches.
   *
   * This was a `traceEvents: boolean` that printed ANSI escape codes to
   * `console`, which was a terminal assumption sitting inside pure
   * composition — invisible until something else tried to consume this file.
   * As a callback, the scenarios pass a dim-grey console printer and the
   * browser playground appends a row to a table, and neither medium's
   * vocabulary leaks in here.
   */
  readonly onEvent?: (event: DomainEvent) => void
}
