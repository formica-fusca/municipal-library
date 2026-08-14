import type { UnitOfWork } from '@local/event-bus'
import type { Clock, MemberId, TitleId } from '@local/shared-kernel'
import { HoldNotReadyForCollection } from '../domain/errors.js'
import type { HoldAllocationPolicy } from '../domain/hold-allocation-policy.js'
import { HoldQueue } from '../domain/hold-queue.js'
import { HoldRequestId, LoanId } from '../domain/identities.js'
import { Loan } from '../domain/loan.js'
import type { HoldQueueRepository, LoanRepository } from '../domain/repositories.js'
import type { IdentifierFactory, ShelfGateway } from './ports.js'

/**
 * Everything the library does with the queue of people waiting for a title.
 *
 * The four operations here map onto four quite different triggers, and it is
 * worth naming them because the difference is the whole reason the model needs
 * an event bus:
 *
 * | Operation                | Triggered by                                |
 * |--------------------------|---------------------------------------------|
 * | `placeHold`              | a member asking                             |
 * | `allocateOnAvailability` | a **domain event** from another context     |
 * | `expireLapsedHolds`      | the **clock**                               |
 * | `collect`                | a member turning up                         |
 *
 * Only the first is a request from a user. The second arrives from Inventory
 * with no idea who is listening; the third is nobody's request at all. A design
 * that can only express "user asks, system answers" has nowhere to put the
 * middle two, and they end up as `if` statements bolted onto whatever request
 * happened to be nearby.
 */
export class HoldDesk {
  readonly #holds: HoldQueueRepository
  readonly #loans: LoanRepository
  readonly #shelf: ShelfGateway
  readonly #ids: IdentifierFactory
  readonly #unitOfWork: UnitOfWork
  readonly #clock: Clock
  readonly #defaultPolicy: HoldAllocationPolicy

  constructor(deps: {
    holds: HoldQueueRepository
    loans: LoanRepository
    shelf: ShelfGateway
    ids: IdentifierFactory
    unitOfWork: UnitOfWork
    clock: Clock
    allocationPolicy: HoldAllocationPolicy
  }) {
    this.#holds = deps.holds
    this.#loans = deps.loans
    this.#shelf = deps.shelf
    this.#ids = deps.ids
    this.#unitOfWork = deps.unitOfWork
    this.#clock = deps.clock
    this.#defaultPolicy = deps.allocationPolicy
  }

  /** @returns the member's position in the queue, counting from 1. */
  async placeHold(command: { titleId: TitleId; memberId: MemberId }): Promise<number> {
    const queue = (await this.#holds.findById(command.titleId)) ?? HoldQueue.open(command.titleId)

    const position = queue.place(
      HoldRequestId.of(this.#ids.nextHoldRequestId()),
      command.memberId,
      this.#clock.now(),
    )

    await this.#unitOfWork.commit(this.#holds, queue)
    return position
  }

  /**
   * A copy of this title is back on the shelf — give it to whoever is next.
   *
   * Wired to Inventory's `TitleBecameAvailable`. Note that Inventory has no
   * idea this exists: it announced a fact about its own state and moved on.
   * Adding a second reaction (email the member, print a slip for the hold
   * shelf) means adding a subscriber, and changing nothing in Inventory.
   *
   * A `policy` may be supplied per call, which is how a policy needing outside
   * knowledge — "who is currently suspended?" — gets it without the domain
   * reaching across a context border.
   */
  async allocateOnAvailability(
    titleId: TitleId,
    policy?: HoldAllocationPolicy,
  ): Promise<MemberId | undefined> {
    const queue = await this.#holds.findById(titleId)
    if (queue === undefined || queue.waitingCount === 0) return undefined

    // Do not promise more copies than are actually on the shelf.
    const available = await this.#shelf.availableCount(titleId)
    if (queue.allocatedCount >= available) return undefined

    const chosen = queue.allocateNext(policy ?? this.#defaultPolicy, this.#clock.now())
    if (chosen === undefined) return undefined

    await this.#unitOfWork.commit(this.#holds, queue)
    return chosen
  }

  /**
   * Sweep every queue for allocations nobody collected.
   *
   * Driven by the clock, not by a request. Each expiry frees a copy, so the
   * sweep immediately offers it to the next member in line — which is why this
   * returns the members who were newly allocated as well as the count expired.
   */
  async expireLapsedHolds(policy?: HoldAllocationPolicy): Promise<{
    expired: number
    reallocatedTo: readonly MemberId[]
  }> {
    const now = this.#clock.now()
    const queues = await this.#holds.findAll()

    let expired = 0
    const reallocatedTo: MemberId[] = []

    for (const queue of queues) {
      const lapsed = queue.expireLapsedAllocations(now)
      if (lapsed === 0) continue

      expired += lapsed
      await this.#unitOfWork.commit(this.#holds, queue)

      const next = await this.allocateOnAvailability(queue.id, policy)
      if (next !== undefined) reallocatedTo.push(next)
    }

    return { expired, reallocatedTo }
  }

  /**
   * The member turns up for the copy set aside for them.
   *
   * Two aggregates change here — the queue and a new loan — plus the stock via
   * the port. The queue is committed first: if the shelf then fails to produce
   * the volume, a librarian is standing in front of the member and can sort it
   * out. The reverse order would mean a lent copy with the member still shown
   * as waiting for it, which nobody would notice.
   */
  async collect(command: {
    titleId: TitleId
    memberId: MemberId
  }): Promise<{ loanId: LoanId; dueAt: Date }> {
    const queue = await this.#holds.findById(command.titleId)
    if (queue === undefined) {
      throw new HoldNotReadyForCollection(command.memberId.value, command.titleId.value)
    }

    queue.collect(command.memberId, this.#clock.now())
    await this.#unitOfWork.commit(this.#holds, queue)

    const copyId = await this.#shelf.lendAnyCopy(command.titleId)
    if (copyId === undefined) {
      throw new HoldNotReadyForCollection(command.memberId.value, command.titleId.value)
    }

    const loan = Loan.open({
      loanId: LoanId.of(this.#ids.nextLoanId()),
      memberId: command.memberId,
      titleId: command.titleId,
      copyId,
      at: this.#clock.now(),
    })

    await this.#unitOfWork.commit(this.#loans, loan)
    return { loanId: loan.id, dueAt: loan.dueAt }
  }

  async cancelHold(command: { titleId: TitleId; memberId: MemberId }): Promise<void> {
    const queue = await this.#holds.findById(command.titleId)
    if (queue === undefined) return

    queue.cancel(command.memberId, this.#clock.now())
    await this.#unitOfWork.commit(this.#holds, queue)
  }

  async queueFor(titleId: TitleId): Promise<HoldQueue | undefined> {
    return this.#holds.findById(titleId)
  }
}
