import type { UnitOfWork } from '@local/event-bus'
import type { Clock, CopyId } from '@local/shared-kernel'
import { UnknownLoan } from '../domain/errors.js'
import type { LoanRepository } from '../domain/repositories.js'
import type { ShelfGateway } from './ports.js'

/**
 * A volume comes back over the counter.
 *
 * ## The ordering, and the gap it leaves
 *
 * The copy is shelved *first*, then the loan is closed. That order is chosen
 * deliberately: the volume physically being back is the fact that actually
 * happened, and recording facts in the order they occurred is the only ordering
 * that stays defensible when something fails halfway.
 *
 * There is still a window. If the process dies between the two, the copy is on
 * the shelf and the loan is still open — the member is billed for a book the
 * library has. The honest fixes are a **transactional outbox** (make the second
 * step a consequence of the first, replayable until it succeeds) or a
 * **compensating action** (a reconciliation sweep that closes loans for copies
 * that are demonstrably back). Both are out of scope for an in-memory
 * showcase; pretending the window does not exist would not be.
 *
 * ## What happens next, without this file knowing
 *
 * Shelving the copy makes Inventory raise `TitleBecameAvailable`, which wakes
 * the hold queue and may allocate the copy to whoever is next. Closing the loan
 * raises `LoanClosed`, which decrements the member's counter. Neither
 * consequence is written here, and that is the point: this use case does one
 * thing, and the library's reactions to it are wired in the composition root.
 */
export class ReturnBook {
  readonly #loans: LoanRepository
  readonly #shelf: ShelfGateway
  readonly #unitOfWork: UnitOfWork
  readonly #clock: Clock

  constructor(deps: {
    loans: LoanRepository
    shelf: ShelfGateway
    unitOfWork: UnitOfWork
    clock: Clock
  }) {
    this.#loans = deps.loans
    this.#shelf = deps.shelf
    this.#unitOfWork = deps.unitOfWork
    this.#clock = deps.clock
  }

  async execute(command: { copyId: CopyId }): Promise<void> {
    const loan = await this.#loans.findOpenLoanForCopy(command.copyId)
    if (loan === undefined) {
      throw new UnknownLoan(`open loan for copy ${command.copyId.value}`)
    }

    await this.#shelf.acceptReturn(loan.titleId, loan.copyId)

    loan.close(this.#clock.now())
    await this.#unitOfWork.commit(this.#loans, loan)
  }
}
