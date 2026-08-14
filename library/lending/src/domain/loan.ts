import { AggregateRoot, InvariantViolation } from '@local/ddd-core'
import { addDays, daysBetween, type CopyId, type MemberId, type TitleId } from '@local/shared-kernel'
import { LoanAlreadyClosed } from './errors.js'
import { LoanBecameOverdue, LoanClosed, LoanOpened } from './events.js'
import type { LoanId } from './identities.js'

/** How long a volume may be kept. A library policy, stated once. */
export const LOAN_PERIOD_DAYS = 21

export interface LoanSnapshot {
  readonly loanId: string
  readonly memberId: string
  readonly titleId: string
  readonly copyId: string
  readonly openedAt: string
  readonly dueAt: string
  readonly returnedAt: string | null
  readonly isOpen: boolean
}

/**
 * One volume, in one member's hands, for a bounded period.
 *
 * ## Why this is its own aggregate rather than a child of `Member`
 *
 * The tempting design is `Member` holding a list of `Loan`s, so that "at most
 * 8 loans" becomes an invariant enforced in one place. It is the wrong call,
 * for two reasons:
 *
 * - **Contention.** Every borrow, return and renewal in the library would have
 *   to load and lock the member's entire loan history. Two librarians serving
 *   the same regular reader would serialise behind each other.
 * - **Lifetimes.** Loans are closed and archived; members persist for decades.
 *   An aggregate that only ever grows is an aggregate you will eventually have
 *   to split under duress.
 *
 * The rule is not lost — it moved. It is checked at decision time by
 * `Member.eligibilityToBorrow()`, and the counter is reconciled by an event
 * handler. See `docs/04-invariants.md`.
 *
 * ## Note the ids, not the objects
 *
 * A `Loan` holds `MemberId`, `TitleId` and `CopyId` — never a `Member`, a
 * `Title`, or a `Copy`. Referencing another aggregate by identity is the rule
 * that keeps boundaries real: if a `Loan` held a live `Member`, "just check the
 * member's standing while we're here" would be one dot away, and the two
 * aggregates would be welded together within a sprint.
 */
export class Loan extends AggregateRoot<LoanId> {
  readonly #memberId: MemberId
  readonly #titleId: TitleId
  readonly #copyId: CopyId
  readonly #openedAt: Date
  readonly #dueAt: Date
  #returnedAt: Date | undefined
  #overdueAnnounced: boolean

  private constructor(params: {
    loanId: LoanId
    memberId: MemberId
    titleId: TitleId
    copyId: CopyId
    openedAt: Date
    dueAt: Date
    returnedAt: Date | undefined
    overdueAnnounced: boolean
  }) {
    super(params.loanId)
    this.#memberId = params.memberId
    this.#titleId = params.titleId
    this.#copyId = params.copyId
    this.#openedAt = params.openedAt
    this.#dueAt = params.dueAt
    this.#returnedAt = params.returnedAt
    this.#overdueAnnounced = params.overdueAnnounced
  }

  static open(params: {
    loanId: LoanId
    memberId: MemberId
    titleId: TitleId
    copyId: CopyId
    at: Date
    periodDays?: number
  }): Loan {
    const dueAt = addDays(params.at, params.periodDays ?? LOAN_PERIOD_DAYS)

    const loan = new Loan({
      loanId: params.loanId,
      memberId: params.memberId,
      titleId: params.titleId,
      copyId: params.copyId,
      openedAt: params.at,
      dueAt,
      returnedAt: undefined,
      overdueAnnounced: false,
    })

    loan.assertInvariants()
    loan.record(
      new LoanOpened({
        loanId: params.loanId,
        memberId: params.memberId,
        titleId: params.titleId,
        copyId: params.copyId,
        dueAt,
        occurredAt: params.at,
      }),
    )

    return loan
  }

  static rehydrate(params: {
    loanId: LoanId
    memberId: MemberId
    titleId: TitleId
    copyId: CopyId
    openedAt: Date
    dueAt: Date
    returnedAt: Date | undefined
    overdueAnnounced: boolean
  }): Loan {
    return new Loan(params)
  }

  close(at: Date): void {
    if (this.#returnedAt !== undefined) {
      throw new LoanAlreadyClosed(this.id.value)
    }

    this.#returnedAt = at
    this.assertInvariants()

    this.record(
      new LoanClosed({
        loanId: this.id,
        memberId: this.#memberId,
        titleId: this.#titleId,
        copyId: this.#copyId,
        daysLate: this.daysLateAt(at),
        occurredAt: at,
      }),
    )
  }

  /**
   * Announce, once, that this loan has passed its due date.
   *
   * Being overdue is *derived* — you can compute it from `dueAt` and the
   * current time, and it needs no stored flag. What does need storing is
   * whether the library has already said so, because a member should be told
   * once, not once per nightly sweep. `#overdueAnnounced` records the
   * announcement, not the condition; keeping those two ideas distinct is what
   * stops the model drifting out of step with the calendar.
   */
  announceOverdue(now: Date): void {
    if (this.#returnedAt !== undefined) return
    if (!this.isOverdueAt(now)) return
    if (this.#overdueAnnounced) return

    this.#overdueAnnounced = true
    this.record(
      new LoanBecameOverdue({
        loanId: this.id,
        memberId: this.#memberId,
        daysLate: this.daysLateAt(now),
        occurredAt: now,
      }),
    )
  }

  isOverdueAt(now: Date): boolean {
    if (this.#returnedAt !== undefined) return false
    return now.getTime() > this.#dueAt.getTime()
  }

  daysLateAt(when: Date): number {
    const late = Math.floor(daysBetween(this.#dueAt, when))
    return late > 0 ? late : 0
  }

  get isOpen(): boolean {
    return this.#returnedAt === undefined
  }

  get memberId(): MemberId {
    return this.#memberId
  }

  get titleId(): TitleId {
    return this.#titleId
  }

  get copyId(): CopyId {
    return this.#copyId
  }

  get dueAt(): Date {
    return new Date(this.#dueAt)
  }

  snapshot(): LoanSnapshot {
    return {
      loanId: this.id.value,
      memberId: this.#memberId.value,
      titleId: this.#titleId.value,
      copyId: this.#copyId.value,
      openedAt: this.#openedAt.toISOString(),
      dueAt: this.#dueAt.toISOString(),
      returnedAt: this.#returnedAt?.toISOString() ?? null,
      isOpen: this.isOpen,
    }
  }

  override assertInvariants(): void {
    if (this.#dueAt.getTime() <= this.#openedAt.getTime()) {
      throw new InvariantViolation(
        'a loan falls due after it was opened',
        `loan ${this.id.value} is due ${this.#dueAt.toISOString()} but opened ${this.#openedAt.toISOString()}`,
      )
    }

    if (this.#returnedAt !== undefined && this.#returnedAt.getTime() < this.#openedAt.getTime()) {
      throw new InvariantViolation(
        'a volume is not returned before it was borrowed',
        `loan ${this.id.value} was returned ${this.#returnedAt.toISOString()}`,
      )
    }
  }
}
