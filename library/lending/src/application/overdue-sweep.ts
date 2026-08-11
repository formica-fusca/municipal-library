import type { Clock } from '@local/ddd-core'
import type { UnitOfWork } from '@local/event-bus'
import type { LoanRepository } from '../domain/repositories.js'

/**
 * The nightly job that notices which loans have fallen due.
 *
 * A worked example of a *time-driven* use case. Nobody asked for it; the
 * calendar did. `Loan.announceOverdue()` is idempotent by design, so running
 * this twice in one night produces one `LoanBecameOverdue` per loan — which
 * matters, because the subscriber on the other end sends an email.
 *
 * Idempotence is not a nicety in event-driven systems. Any process that can be
 * retried will be retried, usually at the least convenient moment.
 */
export class OverdueSweep {
  readonly #loans: LoanRepository
  readonly #unitOfWork: UnitOfWork
  readonly #clock: Clock

  constructor(deps: { loans: LoanRepository; unitOfWork: UnitOfWork; clock: Clock }) {
    this.#loans = deps.loans
    this.#unitOfWork = deps.unitOfWork
    this.#clock = deps.clock
  }

  /** @returns how many loans were newly announced as overdue. */
  async run(): Promise<number> {
    const now = this.#clock.now()
    const open = await this.#loans.findAllOpen()
    let announced = 0

    for (const loan of open) {
      loan.announceOverdue(now)
      if (!loan.hasPendingEvents) continue

      await this.#unitOfWork.commit(this.#loans, loan)
      announced += 1
    }

    return announced
  }
}
