import type { Clock } from '@local/ddd-core'
import type { UnitOfWork } from '@local/event-bus'
import type { CopyId, MemberId, TitleId } from '@local/shared-kernel'
import type { HoldQueueRepository, LoanRepository } from '../domain/repositories.js'
import { LoanId } from '../domain/identities.js'
import { Loan } from '../domain/loan.js'
import type { BorrowerDirectory, IdentifierFactory, ShelfGateway } from './ports.js'

export type BorrowOutcome =
  | {
      readonly kind: 'lent'
      readonly loanId: LoanId
      readonly copyId: CopyId
      readonly dueAt: Date
    }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'no-copy-available' }

/**
 * A member walks up to the counter and asks for a title.
 *
 * ## Why this returns a union instead of throwing
 *
 * "You are suspended" and "there is no copy today" are not exceptional — they
 * are two of the three normal answers, and the caller has something useful to
 * do with each (explain; offer a hold). Reserving exceptions for genuine faults
 * keeps the distinction meaningful, and stops `catch` blocks from becoming the
 * place business logic goes to hide.
 *
 * ## Three aggregates, one request
 *
 * This use case touches `Member` (via a port), `BookStock` (via a port) and
 * `Loan` (directly). Only the last is *modified* here, and that is not an
 * accident — it is the rule: **change one aggregate per transaction.** The
 * member's loan counter is updated afterwards, by a handler reacting to
 * `LoanOpened`. The stock is changed by Inventory's own transaction, inside the
 * adapter.
 *
 * The consequence is a genuine window in which the loan exists and the member's
 * counter has not caught up. That window is why `Member` raises
 * `BorrowAllowanceExceeded` instead of throwing, and it is the price of not
 * locking three aggregates together. Making the price visible is better than
 * pretending it is not being paid.
 */
export class BorrowBook {
  readonly #loans: LoanRepository
  readonly #holds: HoldQueueRepository
  readonly #borrowers: BorrowerDirectory
  readonly #shelf: ShelfGateway
  readonly #ids: IdentifierFactory
  readonly #unitOfWork: UnitOfWork
  readonly #clock: Clock

  constructor(deps: {
    loans: LoanRepository
    holds: HoldQueueRepository
    borrowers: BorrowerDirectory
    shelf: ShelfGateway
    ids: IdentifierFactory
    unitOfWork: UnitOfWork
    clock: Clock
  }) {
    this.#loans = deps.loans
    this.#holds = deps.holds
    this.#borrowers = deps.borrowers
    this.#shelf = deps.shelf
    this.#ids = deps.ids
    this.#unitOfWork = deps.unitOfWork
    this.#clock = deps.clock
  }

  async execute(command: { memberId: MemberId; titleId: TitleId }): Promise<BorrowOutcome> {
    const verdict = await this.#borrowers.eligibilityToBorrow(command.memberId)
    if (!verdict.allowed) {
      return { kind: 'refused', reason: verdict.reason }
    }

    const reservedForOthers = await this.#copiesSetAsideForOthers(command)
    if (reservedForOthers) {
      return {
        kind: 'refused',
        reason: 'every copy on the shelf is set aside for members ahead of you',
      }
    }

    const copyId = await this.#shelf.lendAnyCopy(command.titleId)
    if (copyId === undefined) {
      return { kind: 'no-copy-available' }
    }

    const loan = Loan.open({
      loanId: LoanId.of(this.#ids.nextLoanId()),
      memberId: command.memberId,
      titleId: command.titleId,
      copyId,
      at: this.#clock.now(),
    })

    await this.#unitOfWork.commit(this.#loans, loan)

    return { kind: 'lent', loanId: loan.id, copyId, dueAt: loan.dueAt }
  }

  /**
   * A walk-in must not take the last copy out from under someone who has been
   * notified it is waiting for them.
   *
   * This is a rule *between* two aggregates (the queue and the stock), so it
   * lives here rather than in either of them — neither can see the other. It is
   * checked, not guaranteed: between this read and the loan being written,
   * another allocation could land. That is acceptable, because the worst case
   * is one disappointed member and a librarian's apology, and the alternative
   * is locking the queue on every borrow in the library.
   *
   * Naming the failure mode out loud is the point. An unnamed race is a bug; a
   * named one is a decision.
   */
  async #copiesSetAsideForOthers(command: {
    memberId: MemberId
    titleId: TitleId
  }): Promise<boolean> {
    const queue = await this.#holds.findById(command.titleId)
    if (queue === undefined || queue.allocatedCount === 0) return false
    if (queue.hasAllocationFor(command.memberId)) return false

    const available = await this.#shelf.availableCount(command.titleId)
    return queue.allocatedCount >= available
  }
}
