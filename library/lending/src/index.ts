/**
 * The published language of the Lending context.
 *
 * `HoldRequest` is absent for the same reason `Copy` is absent from Inventory:
 * it is a child entity, and letting another package name its type would let
 * that package hold one and mutate the queue behind its root's back. Snapshots
 * are exported instead.
 */
export { BorrowBook } from './application/borrow-book.js'
export type { BorrowOutcome } from './application/borrow-book.js'
export { HoldDesk } from './application/hold-desk.js'
export { OverdueSweep } from './application/overdue-sweep.js'
export type {
  BorrowerDirectory,
  BorrowerVerdict,
  IdentifierFactory,
  ShelfGateway,
} from './application/ports.js'
export { ReturnBook } from './application/return-book.js'
export {
  AlreadyInQueue,
  BorrowingRefused,
  HoldNotReadyForCollection,
  LoanAlreadyClosed,
  NotInQueue,
  UnknownLoan,
} from './domain/errors.js'
export {
  HoldAllocated,
  HoldCancelled,
  HoldExpired,
  HoldFulfilled,
  HoldPlaced,
  LoanBecameOverdue,
  LoanClosed,
  LoanOpened,
} from './domain/events.js'
export {
  SkipIneligibleAllocation,
  StrictFifoAllocation,
} from './domain/hold-allocation-policy.js'
export type { HoldAllocationPolicy, HoldCandidate } from './domain/hold-allocation-policy.js'
export { COLLECTION_WINDOW_HOURS, HoldQueue } from './domain/hold-queue.js'
export type { HoldQueueSnapshot } from './domain/hold-queue.js'
export { HOLD_STATUSES } from './domain/hold-request.js'
export type { HoldRequestSnapshot, HoldStatus } from './domain/hold-request.js'
export { HoldRequestId, LoanId } from './domain/identities.js'
export { LOAN_PERIOD_DAYS, Loan } from './domain/loan.js'
export type { LoanSnapshot } from './domain/loan.js'
export type { HoldQueueRepository, LoanRepository } from './domain/repositories.js'
export {
  InMemoryHoldQueueRepository,
  InMemoryLoanRepository,
} from './infrastructure/in-memory-repositories.js'
