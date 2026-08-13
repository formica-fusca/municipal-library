import {
  AggregateRoot,
  InvariantViolation,
  type Entity,
  type Identifier,
} from '@local/ddd-core'
import { addHours, daysBetween, type MemberId, type TitleId } from '@local/shared-kernel'
import { AlreadyInQueue, HoldNotReadyForCollection, NotInQueue } from './errors.js'
import { HoldAllocated, HoldPlaced } from './events.js'
import type { HoldAllocationPolicy, HoldCandidate } from './hold-allocation-policy.js'
import { HoldRequest, type HoldRequestSnapshot } from './hold-request.js'
import type { HoldRequestId } from './identities.js'

/** How long a set-aside copy waits on the hold shelf before the next member gets it. */
export const COLLECTION_WINDOW_HOURS = 48

export interface HoldQueueSnapshot {
  readonly titleId: string
  readonly waiting: number
  readonly allocated: number
  readonly requests: readonly HoldRequestSnapshot[]
}

/**
 * Everyone waiting for a given title, in the order they asked.
 *
 * # Why the queue is the aggregate, and not each request
 *
 * The rules the library actually cares about are all *about the queue as a
 * whole*:
 *
 * - a member may not hold two places in the same queue;
 * - a returned copy goes to exactly one waiting member;
 * - position is determined by request time.
 *
 * Not one of those can be checked by looking at a single request. If each
 * `HoldRequest` were its own aggregate root, two concurrent returns could each
 * allocate the same copy to a different member, and both would save
 * successfully — each one correct in isolation, the pair of them wrong.
 *
 * Ordering is itself an invariant here, which is worth noticing: invariants are
 * not only about numbers matching. "These things are in this order" is just as
 * much a rule the boundary exists to protect.
 *
 * # Aggregate id
 *
 * The queue is identified by `TitleId` — the same id as the `BookStock` in
 * another context. That is not a mistake or a shortcut: a shared identity
 * across contexts is the normal way two models talk about the same real-world
 * thing while keeping entirely separate state and behaviour. Inventory knows
 * how many volumes exist; Lending knows who is waiting; neither knows the
 * other's fields.
 */
export class HoldQueue extends AggregateRoot<TitleId> {
  readonly #requests: HoldRequest[] = []

  private constructor(titleId: TitleId) {
    super(titleId)
  }

  static open(titleId: TitleId): HoldQueue {
    return new HoldQueue(titleId)
  }

  static rehydrate(titleId: TitleId, requests: readonly HoldRequest[]): HoldQueue {
    const queue = new HoldQueue(titleId)
    queue.#requests.push(...requests)
    queue.assertInvariants()
    return queue
  }

  protected override childEntities(): readonly Entity<Identifier>[] {
    return this.#requests
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  /** @returns the member's position in the queue, counting from 1. */
  place(holdRequestId: HoldRequestId, memberId: MemberId, at: Date): number {
    if (this.#activeRequestFor(memberId) !== undefined) {
      throw new AlreadyInQueue(memberId.value, this.id.value)
    }

    this.#requests.push(
      HoldRequest.place({ holdRequestId, titleId: this.id, memberId, at }),
    )

    const position = this.positionOf(memberId) ?? this.#requests.length

    this.record(new HoldPlaced({ titleId: this.id, memberId, position, occurredAt: at }))
    this.assertInvariants()

    return position
  }

  /**
   * A copy is free — decide whose it is.
   *
   * The root records `HoldAllocated` because the fact being stated is "you were
   * chosen ahead of the others", and only the queue can see the others.
   *
   * Returns `undefined` when nobody is waiting, or when the policy declines to
   * choose anyone. "Nobody wants it" is an ordinary outcome, not an error.
   */
  allocateNext(policy: HoldAllocationPolicy, at: Date): MemberId | undefined {
    const candidates: HoldCandidate[] = this.#requests
      .filter((request) => request.isWaiting)
      .map((request) => ({
        holdRequestId: request.id,
        memberId: request.memberId,
        requestedAt: request.requestedAt,
        daysWaiting: Math.max(0, Math.floor(daysBetween(request.requestedAt, at))),
      }))

    if (candidates.length === 0) return undefined

    const chosen = policy.chooseNext(candidates, at)
    if (chosen === undefined) return undefined

    const request = this.#requests.find((candidate) => candidate.id.equals(chosen.holdRequestId))
    if (request === undefined) {
      throw new InvariantViolation(
        'an allocation policy chooses from the queue it was given',
        `policy "${policy.description}" returned hold ${chosen.holdRequestId.value}, which is not in this queue`,
      )
    }

    const collectBy = addHours(at, COLLECTION_WINDOW_HOURS)
    request.allocate(collectBy)

    this.record(
      new HoldAllocated({
        titleId: this.id,
        memberId: request.memberId,
        holdRequestId: request.id,
        collectBy,
        occurredAt: at,
      }),
    )

    this.assertInvariants()
    return request.memberId
  }

  /**
   * Sweep out allocations nobody came to collect.
   *
   * Each lapsed request records its own `HoldExpired` — see `HoldRequest`. The
   * root records nothing here, because nothing happened *to the queue*; several
   * independent requests each timed out.
   *
   * @returns how many lapsed.
   */
  expireLapsedAllocations(now: Date): number {
    const lapsed = this.#requests.filter((request) => request.hasLapsedAt(now))

    for (const request of lapsed) {
      request.expire(now)
    }

    this.assertInvariants()
    return lapsed.length
  }

  cancel(memberId: MemberId, at: Date): void {
    const request = this.#activeRequestFor(memberId)
    if (request === undefined) throw new NotInQueue(memberId.value, this.id.value)

    request.cancel(at)
    this.assertInvariants()
  }

  /** The member turned up and took the copy that was set aside for them. */
  collect(memberId: MemberId, at: Date): void {
    const request = this.#requests.find(
      (candidate) => candidate.isAllocated && candidate.memberId.equals(memberId),
    )
    if (request === undefined) {
      throw new HoldNotReadyForCollection(memberId.value, this.id.value)
    }

    request.fulfil(at)
    this.assertInvariants()
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  get waitingCount(): number {
    return this.#requests.filter((request) => request.isWaiting).length
  }

  get allocatedCount(): number {
    return this.#requests.filter((request) => request.isAllocated).length
  }

  get isEmpty(): boolean {
    return this.#requests.every((request) => !request.isActive)
  }

  /** 1-based position among active requests, or `undefined` if not queued. */
  positionOf(memberId: MemberId): number | undefined {
    const active = this.#requests.filter((request) => request.isActive)
    const index = active.findIndex((request) => request.memberId.equals(memberId))
    return index === -1 ? undefined : index + 1
  }

  hasAllocationFor(memberId: MemberId): boolean {
    return this.#requests.some(
      (request) => request.isAllocated && request.memberId.equals(memberId),
    )
  }

  snapshot(): HoldQueueSnapshot {
    return {
      titleId: this.id.value,
      waiting: this.waitingCount,
      allocated: this.allocatedCount,
      requests: this.#requests.map((request) => request.snapshot()),
    }
  }

  // ── Invariants ─────────────────────────────────────────────────────────────

  override assertInvariants(): void {
    // 1. One place per member. Two entries would give the same person two
    //    chances at the same copy, which the next member in line would notice.
    const activeMembers = this.#requests
      .filter((request) => request.isActive)
      .map((request) => request.memberId.value)

    if (new Set(activeMembers).size !== activeMembers.length) {
      throw new InvariantViolation(
        'a member holds at most one place in a queue',
        `title ${this.id.value} has duplicate active entries: ${activeMembers.join(', ')}`,
      )
    }

    // 2. A collect-by date exists exactly when a copy is set aside. Storing one
    //    on a Waiting request would mean a deadline for collecting a copy that
    //    is not there.
    for (const request of this.#requests) {
      const hasDeadline = request.collectBy !== undefined
      if (request.isAllocated !== hasDeadline) {
        throw new InvariantViolation(
          'a collect-by date exists exactly for allocated holds',
          `hold ${request.id.value} is ${request.status} but ${
            hasDeadline ? 'has' : 'has no'
          } collect-by date`,
        )
      }
    }

    // 3. Order is part of the meaning. If the entries stopped being sorted by
    //    request time, "third in the queue" would silently start lying.
    for (let index = 1; index < this.#requests.length; index += 1) {
      const previous = this.#requests[index - 1]
      const current = this.#requests[index]
      if (previous === undefined || current === undefined) continue

      if (current.requestedAt.getTime() < previous.requestedAt.getTime()) {
        throw new InvariantViolation(
          'a queue is ordered by request time',
          `hold ${current.id.value} was requested before hold ${previous.id.value} yet sits behind it`,
        )
      }
    }
  }

  #activeRequestFor(memberId: MemberId): HoldRequest | undefined {
    return this.#requests.find(
      (request) => request.isActive && request.memberId.equals(memberId),
    )
  }
}
